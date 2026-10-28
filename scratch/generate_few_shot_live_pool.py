"""
Generates the live replay query pool for the Few-Shot Zero-Day Lab.
Uses the EXACT 12-attack held-out checkpoints under results/federated/heldout_all12/
and real held-out test samples from data/processed/ddos_sample.csv.
Guarantees:
- Zero leakage: target attack strictly excluded from model training and scaler fitting.
- Exact PyTorch 64-D penultimate latent embeddings.
- Deterministic 1-NN and Prototype similarity scoring vs support sets (10, 20, 50, 100 shots).
- Standard NetFlow feature attributes for SOC telemetry visualization.
"""

import sys
import json
from pathlib import Path
import numpy as np
import pandas as pd
import torch
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.preprocessing import load_dataset, clean_dataset
from src.model import DDoSModel
from src.few_shot.adaptation import (
    extract_penultimate_features,
    create_nested_support_sets,
    compute_prototype,
    score_prototype_similarity,
    score_1nn_similarity,
    compute_prototype_threshold,
    compute_1nn_threshold
)

TARGETS = [
    ("DrDoS_DNS", "heldout_all12/dns"),
    ("DrDoS_LDAP", "heldout_all12/ldap"),
    ("DrDoS_MSSQL", "heldout_all12/mssql"),
    ("DrDoS_NTP", "heldout_all12/ntp"),
    ("DrDoS_NetBIOS", "heldout_all12/netbios"),
    ("DrDoS_SNMP", "heldout_all12/snmp"),
    ("DrDoS_SSDP", "heldout_all12/ssdp"),
    ("DrDoS_UDP", "heldout_all12/udp"),
    ("Syn", "heldout_all12/syn"),
    ("TFTP", "heldout_all12/tftp"),
    ("UDP-lag", "heldout_all12/udp_lag"),
    ("WebDDoS", "heldout_all12/webddos"),
]

def main():
    print("[1/4] Ingesting canonical dataset & creating master 80/20 stratified split...")
    raw_df = load_dataset()
    cleaned_df = clean_dataset(raw_df)

    X_all = cleaned_df.drop(columns=["Label"])
    y_all = cleaned_df["Label"]

    X_train_raw, X_test_raw, y_train_raw, y_test_raw = train_test_split(
        X_all, y_all, test_size=0.2, random_state=42, stratify=y_all
    )
    print(f"      Total dataset: {len(cleaned_df):,} | Test samples: {len(X_test_raw):,}")

    pools = {}

    for idx, (target_name, rel_path) in enumerate(TARGETS, 1):
        print(f"[{idx}/12] Processing held-out query pool for: {target_name}...")
        model_path = PROJECT_ROOT / "results" / "federated" / rel_path / "model_G20.pth"
        assert model_path.exists(), f"Model checkpoint missing: {model_path}"

        # Separate target attack
        mask_train_target = (y_train_raw == target_name)
        mask_test_target = (y_test_raw == target_name)

        fl_train_X_raw = X_train_raw[~mask_train_target].copy()
        support_pool_X_raw = X_train_raw[mask_train_target].copy()

        target_query_X_raw = X_test_raw[mask_test_target].copy()
        neg_test_X_raw = X_test_raw[~mask_test_target].copy()
        neg_test_y_raw = y_test_raw[~mask_test_target].copy()

        # Strict Scaler fitted ONLY on 12-class FL training data
        scaler = StandardScaler()
        scaler.fit(fl_train_X_raw)

        support_pool_X = pd.DataFrame(
            scaler.transform(support_pool_X_raw),
            columns=X_all.columns,
            index=support_pool_X_raw.index
        )
        target_query_X = pd.DataFrame(
            scaler.transform(target_query_X_raw),
            columns=X_all.columns,
            index=target_query_X_raw.index
        )
        neg_test_X = pd.DataFrame(
            scaler.transform(neg_test_X_raw),
            columns=X_all.columns,
            index=neg_test_X_raw.index
        )

        # Load held-out 12-class PyTorch model
        model = DDoSModel(num_classes=12)
        model.load_state_dict(torch.load(model_path, map_location="cpu"))
        model.eval()

        # Support Sets (10, 20, 50, 100)
        support_sets_raw = create_nested_support_sets(support_pool_X, shot_sizes=(10, 20, 50, 100), random_state=42)
        support_embeds = {}
        thresholds = {}
        prototypes = {}

        for k in [10, 20, 50, 100]:
            s_emb = extract_penultimate_features(model, support_sets_raw[k])
            support_embeds[k] = s_emb
            proto = compute_prototype(s_emb)
            prototypes[k] = proto

            t_proto = compute_prototype_threshold(s_emb, prototype=proto, std_multiplier=2.0)
            t_knn = compute_1nn_threshold(s_emb, std_multiplier=2.0)

            thresholds[f"Prototype_{k}"] = float(t_proto["threshold"])
            thresholds[f"1-NN_{k}"] = float(t_knn["threshold"])

        # Balanced evaluation queries (50 target queries + 50 negative queries = 100 flows per attack)
        # For WebDDoS: min(50, len(target_query_X))
        n_pos = min(60, len(target_query_X))
        n_neg = n_pos

        pos_subset_X = target_query_X.iloc[:n_pos]
        pos_subset_raw = target_query_X_raw.iloc[:n_pos]

        # Sample negatives balanced across non-target classes
        non_target_classes = sorted([c for c in cleaned_df["Label"].unique() if c != target_name])
        samples_per_neg = max(1, n_neg // len(non_target_classes))
        neg_dfs_scaled = []
        neg_dfs_raw = []

        for c in non_target_classes:
            c_idx = neg_test_y_raw[neg_test_y_raw == c].index
            sel_idx = c_idx[:samples_per_neg]
            neg_dfs_scaled.append(neg_test_X.loc[sel_idx])
            neg_dfs_raw.append(neg_test_X_raw.loc[sel_idx])

        neg_subset_X = pd.concat(neg_dfs_scaled).iloc[:n_neg]
        neg_subset_raw = pd.concat(neg_dfs_raw).iloc[:n_neg]

        # Combine and interleave
        eval_X_scaled = pd.concat([pos_subset_X, neg_subset_X])
        eval_X_raw = pd.concat([pos_subset_raw, neg_subset_raw])
        eval_y_labels = [target_name] * len(pos_subset_X) + list(neg_test_y_raw.loc[neg_subset_X.index])

        # Deterministic shuffle
        shuff_order = np.random.RandomState(42).permutation(len(eval_X_scaled))
        eval_X_scaled = eval_X_scaled.iloc[shuff_order]
        eval_X_raw = eval_X_raw.iloc[shuff_order]
        eval_y_labels = [eval_y_labels[i] for i in shuff_order]

        # Extract 64-D penultimate embeddings from the genuine PyTorch model
        query_embeds = extract_penultimate_features(model, eval_X_scaled)

        # Build flow objects
        flows = []
        for i in range(len(eval_X_scaled)):
            q_emb = query_embeds[i:i+1] # shape (1, 64)
            q_vec = q_emb.squeeze(0).numpy()
            q_norm = float(np.linalg.norm(q_vec))
            # 8-dim preview for visual telemetry
            latent_preview = [round(float(v), 3) for v in q_vec[:8]]

            raw_row = eval_X_raw.iloc[i]
            label = eval_y_labels[i]
            is_target = (label == target_name)

            # Prominent netflow attributes
            netflow = {
                "destination_port": int(raw_row.get("Destination Port", 80)),
                "flow_duration_ms": round(float(raw_row.get("Flow Duration", 0)) / 1000.0, 2),
                "flow_packets_s": round(float(raw_row.get("Flow Packets/s", 0)), 1),
                "flow_bytes_s": round(float(raw_row.get("Flow Bytes/s", 0)), 1),
                "packet_length_mean": round(float(raw_row.get("Packet Length Mean", 0)), 1)
            }

            # Evaluate each configuration
            evaluations = {}
            for k in [10, 20, 50, 100]:
                s_emb = support_embeds[k]
                proto = prototypes[k]

                # Prototype
                sim_proto = float(score_prototype_similarity(q_emb, proto).item())
                tau_proto = thresholds[f"Prototype_{k}"]
                pred_proto = sim_proto >= tau_proto
                if is_target and pred_proto:
                    audit_proto = "TP"
                elif not is_target and not pred_proto:
                    audit_proto = "TN"
                elif is_target and not pred_proto:
                    audit_proto = "FN"
                else:
                    audit_proto = "FP"

                evaluations[f"Prototype_{k}"] = {
                    "similarity": round(sim_proto, 4),
                    "threshold": round(tau_proto, 4),
                    "is_detected": bool(pred_proto),
                    "audit": audit_proto,
                    "confidence_pct": round(min(max((sim_proto + 1.0) / 2.0 * 100.0, 0.0), 100.0), 1)
                }

                # 1-NN
                sim_knn = float(score_1nn_similarity(q_emb, s_emb).item())
                tau_knn = thresholds[f"1-NN_{k}"]
                pred_knn = sim_knn >= tau_knn
                if is_target and pred_knn:
                    audit_knn = "TP"
                elif not is_target and not pred_knn:
                    audit_knn = "TN"
                elif is_target and not pred_knn:
                    audit_knn = "FN"
                else:
                    audit_knn = "FP"

                evaluations[f"1-NN_{k}"] = {
                    "similarity": round(sim_knn, 4),
                    "threshold": round(tau_knn, 4),
                    "is_detected": bool(pred_knn),
                    "audit": audit_knn,
                    "confidence_pct": round(min(max((sim_knn + 1.0) / 2.0 * 100.0, 0.0), 100.0), 1)
                }

            flows.append({
                "flow_id": f"FS-{target_name.replace('DrDoS_', '')[:4].upper()}-{i+1:04d}",
                "index": i + 1,
                "label": label,
                "is_target": is_target,
                "target_name": target_name,
                "latent_norm": round(q_norm, 3),
                "latent_preview": latent_preview,
                "netflow": netflow,
                "evaluations": evaluations
            })

        pools[target_name] = {
            "target": target_name,
            "total_queries": len(flows),
            "target_queries": sum(1 for f in flows if f["is_target"]),
            "negative_queries": sum(1 for f in flows if not f["is_target"]),
            "thresholds": thresholds,
            "flows": flows
        }

    # Save to results/ and server/data/
    out_dir1 = PROJECT_ROOT / "results" / "few_shot"
    out_dir1.mkdir(parents=True, exist_ok=True)
    out_file1 = out_dir1 / "few_shot_live_pool.json"
    with open(out_file1, "w", encoding="utf-8") as f:
        json.dump(pools, f, indent=2)
    print(f"\n[Done] Saved live query pools to: {out_file1} ({out_file1.stat().st_size / 1024:.1f} KB)")

    out_dir2 = PROJECT_ROOT / "server" / "data"
    out_dir2.mkdir(parents=True, exist_ok=True)
    out_file2 = out_dir2 / "few_shot_live_pool.json"
    with open(out_file2, "w", encoding="utf-8") as f:
        json.dump(pools, f, indent=2)
    print(f"[Done] Copied to server data directory: {out_file2}")

if __name__ == "__main__":
    main()

