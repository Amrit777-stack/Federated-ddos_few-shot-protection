"""
Results Compilation Module for Federated DDoS Protection Project.

This module aggregates, verifies, and exports final experimental metrics,
summary tables, and visualization plots from all validated project phases:
1. Centralized baselines (Random Forest & Neural Network)
2. Federated Learning baselines (Vanilla FedAvg & FedProx mu=0.1)
3. FedProx 20-round global convergence history
4. Few-Shot Unseen-Attack adaptation (DrDoS_UDP, DrDoS_SNMP, DrDoS_NetBIOS)

All outputs are saved to:
  results/metrics/  -> CSV summary tables
  results/plots/    -> High-resolution matplotlib comparison figures
  results/logs/     -> Compilation and integrity log

Strict Methodology:
- No retraining, no synthetic data, no re-running expensive experiments.
- Reuses strictly validated metrics from project artifacts.
- Unrecorded metrics are marked unavailable rather than guessed.
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for headless figure generation
import matplotlib.pyplot as plt

# Define directory roots
PROJECT_ROOT = Path(__file__).resolve().parents[1]
RESULTS_DIR = PROJECT_ROOT / "results"
METRICS_DIR = RESULTS_DIR / "metrics"
PLOTS_DIR = RESULTS_DIR / "plots"
LOGS_DIR = RESULTS_DIR / "logs"
FED_DIR = RESULTS_DIR / "federated"
NOTEBOOKS_DIR = PROJECT_ROOT / "notebooks"


def ensure_directories():
    """Ensure output directories exist."""
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


def load_federated_metrics():
    """
    Loads validated federated experiment metrics from results/federated/.
    
    Returns:
        dict: FedAvg and FedProx final metrics and round histories.
    """
    # 1. Vanilla FedAvg (Run 001)
    run_001_file = FED_DIR / "run_001" / "metrics.json"
    with open(run_001_file, "r", encoding="utf-8") as f:
        run_001 = json.load(f)
    
    # 2. FedProx 10-round (Run 006 / Run 008, mu=0.1)
    run_006_file = FED_DIR / "run_006_mu_0.1" / "metrics.json"
    with open(run_006_file, "r", encoding="utf-8") as f:
        run_006 = json.load(f)

    # 3. FedProx 20-round (Run 010, mu=0.1)
    run_010_file = FED_DIR / "run_010_20_rounds" / "metrics.json"
    with open(run_010_file, "r", encoding="utf-8") as f:
        run_010 = json.load(f)

    # 4. FedProx 20-round round history
    history_file = FED_DIR / "run_010_20_rounds" / "round_history.json"
    with open(history_file, "r", encoding="utf-8") as f:
        round_history = json.load(f)

    return {
        "fedavg_10": {
            "accuracy": run_001["final_metrics"]["accuracy"],
            "f1": run_001["final_metrics"]["f1"],
            "precision": run_001["final_metrics"]["precision"],
            "recall": run_001["final_metrics"]["recall"],
            "loss": run_001["final_metrics"]["loss"],
            "rounds": 10,
            "source": str(run_001_file.relative_to(PROJECT_ROOT))
        },
        "fedprox_10": {
            "accuracy": run_006["final_metrics"]["accuracy"],
            "f1": run_006["final_metrics"]["f1"],
            "precision": run_006["final_metrics"]["precision"],
            "recall": run_006["final_metrics"]["recall"],
            "loss": run_006["final_metrics"]["loss"],
            "mu": 0.1,
            "rounds": 10,
            "source": str(run_006_file.relative_to(PROJECT_ROOT))
        },
        "fedprox_20": {
            "accuracy": run_010["final_metrics"]["accuracy"],
            "f1": run_010["final_metrics"]["f1"],
            "precision": run_010["final_metrics"]["precision"],
            "recall": run_010["final_metrics"]["recall"],
            "loss": run_010["final_metrics"]["loss"],
            "mu": 0.1,
            "rounds": 20,
            "source": str(run_010_file.relative_to(PROJECT_ROOT))
        },
        "round_history": round_history
    }


def load_few_shot_cross_attack_records():
    """
    Returns the validated 24 experimental configurations across DrDoS_UDP, DrDoS_SNMP,
    and DrDoS_NetBIOS evaluated on the frozen FedProx G20 backbone.
    
    Sources:
      - notebooks/02_few_shot_unseen_attack.ipynb (Part 3, 4, 5, 6, 7)
    """
    records = [
        # DrDoS_UDP - Prototype
        {"unseen_attack": "DrDoS_UDP", "method": "Prototype", "support_size": 10, "threshold": 0.9826, "accuracy": 0.9407, "precision": 0.9106, "recall": 0.9773, "f1": 0.9428, "fpr": 0.0960, "specificity": 0.9040, "tp": 1466, "tn": 1356, "fp": 144, "fn": 34},
        {"unseen_attack": "DrDoS_UDP", "method": "Prototype", "support_size": 20, "threshold": 0.9856, "accuracy": 0.9220, "precision": 0.9132, "recall": 0.9327, "f1": 0.9228, "fpr": 0.0887, "specificity": 0.9113, "tp": 1399, "tn": 1367, "fp": 133, "fn": 101},
        {"unseen_attack": "DrDoS_UDP", "method": "Prototype", "support_size": 50, "threshold": 0.9856, "accuracy": 0.9177, "precision": 0.9066, "recall": 0.9313, "f1": 0.9188, "fpr": 0.0960, "specificity": 0.9040, "tp": 1397, "tn": 1356, "fp": 144, "fn": 103},
        {"unseen_attack": "DrDoS_UDP", "method": "Prototype", "support_size": 100, "threshold": 0.9853, "accuracy": 0.9277, "precision": 0.9068, "recall": 0.9533, "f1": 0.9295, "fpr": 0.0980, "specificity": 0.9020, "tp": 1430, "tn": 1353, "fp": 147, "fn": 70},
        
        # DrDoS_UDP - 1-NN
        {"unseen_attack": "DrDoS_UDP", "method": "1-NN", "support_size": 10, "threshold": 0.9937, "accuracy": 0.9377, "precision": 0.8910, "recall": 0.9973, "f1": 0.9412, "fpr": 0.1220, "specificity": 0.8780, "tp": 1496, "tn": 1317, "fp": 183, "fn": 4},
        {"unseen_attack": "DrDoS_UDP", "method": "1-NN", "support_size": 20, "threshold": 0.9969, "accuracy": 0.9293, "precision": 0.9030, "recall": 0.9620, "f1": 0.9316, "fpr": 0.1033, "specificity": 0.8967, "tp": 1443, "tn": 1345, "fp": 155, "fn": 57},
        {"unseen_attack": "DrDoS_UDP", "method": "1-NN", "support_size": 50, "threshold": 0.9987, "accuracy": 0.9343, "precision": 0.9147, "recall": 0.9580, "f1": 0.9359, "fpr": 0.0893, "specificity": 0.9107, "tp": 1437, "tn": 1366, "fp": 134, "fn": 63},
        {"unseen_attack": "DrDoS_UDP", "method": "1-NN", "support_size": 100, "threshold": 0.9983, "accuracy": 0.9360, "precision": 0.9072, "recall": 0.9713, "f1": 0.9382, "fpr": 0.0993, "specificity": 0.9007, "tp": 1457, "tn": 1351, "fp": 149, "fn": 43},

        # DrDoS_SNMP - Prototype
        {"unseen_attack": "DrDoS_SNMP", "method": "Prototype", "support_size": 10, "threshold": 0.9905, "accuracy": 0.9720, "precision": 1.0000, "recall": 0.9440, "f1": 0.9712, "fpr": 0.0000, "specificity": 1.0000, "tp": 1416, "tn": 1500, "fp": 0, "fn": 84},
        {"unseen_attack": "DrDoS_SNMP", "method": "Prototype", "support_size": 20, "threshold": 0.9902, "accuracy": 0.9677, "precision": 0.9993, "recall": 0.9360, "f1": 0.9666, "fpr": 0.0007, "specificity": 0.9993, "tp": 1404, "tn": 1499, "fp": 1, "fn": 96},
        {"unseen_attack": "DrDoS_SNMP", "method": "Prototype", "support_size": 50, "threshold": 0.9906, "accuracy": 0.9853, "precision": 1.0000, "recall": 0.9707, "f1": 0.9851, "fpr": 0.0000, "specificity": 1.0000, "tp": 1456, "tn": 1500, "fp": 0, "fn": 44},
        {"unseen_attack": "DrDoS_SNMP", "method": "Prototype", "support_size": 100, "threshold": 0.9895, "accuracy": 0.9740, "precision": 0.9993, "recall": 0.9487, "f1": 0.9733, "fpr": 0.0007, "specificity": 0.9993, "tp": 1423, "tn": 1499, "fp": 1, "fn": 77},

        # DrDoS_SNMP - 1-NN
        {"unseen_attack": "DrDoS_SNMP", "method": "1-NN", "support_size": 10, "threshold": 0.9986, "accuracy": 0.9747, "precision": 1.0000, "recall": 0.9493, "f1": 0.9740, "fpr": 0.0000, "specificity": 1.0000, "tp": 1424, "tn": 1500, "fp": 0, "fn": 76},
        {"unseen_attack": "DrDoS_SNMP", "method": "1-NN", "support_size": 20, "threshold": 0.9996, "accuracy": 0.9843, "precision": 1.0000, "recall": 0.9687, "f1": 0.9841, "fpr": 0.0000, "specificity": 1.0000, "tp": 1453, "tn": 1500, "fp": 0, "fn": 47},
        {"unseen_attack": "DrDoS_SNMP", "method": "1-NN", "support_size": 50, "threshold": 0.9998, "accuracy": 0.9820, "precision": 1.0000, "recall": 0.9640, "f1": 0.9817, "fpr": 0.0000, "specificity": 1.0000, "tp": 1446, "tn": 1500, "fp": 0, "fn": 54},
        {"unseen_attack": "DrDoS_SNMP", "method": "1-NN", "support_size": 100, "threshold": 0.9997, "accuracy": 0.9893, "precision": 1.0000, "recall": 0.9787, "f1": 0.9892, "fpr": 0.0000, "specificity": 1.0000, "tp": 1468, "tn": 1500, "fp": 0, "fn": 32},

        # DrDoS_NetBIOS - Prototype
        {"unseen_attack": "DrDoS_NetBIOS", "method": "Prototype", "support_size": 10, "threshold": 0.9713, "accuracy": 0.8747, "precision": 0.9384, "recall": 0.8020, "f1": 0.8648, "fpr": 0.0527, "specificity": 0.9473, "tp": 1203, "tn": 1421, "fp": 79, "fn": 297},
        {"unseen_attack": "DrDoS_NetBIOS", "method": "Prototype", "support_size": 20, "threshold": 0.9660, "accuracy": 0.8897, "precision": 0.9184, "recall": 0.8553, "f1": 0.8857, "fpr": 0.0760, "specificity": 0.9240, "tp": 1283, "tn": 1386, "fp": 114, "fn": 217},
        {"unseen_attack": "DrDoS_NetBIOS", "method": "Prototype", "support_size": 50, "threshold": 0.9220, "accuracy": 0.8787, "precision": 0.8442, "recall": 0.9287, "f1": 0.8844, "fpr": 0.1713, "specificity": 0.8287, "tp": 1393, "tn": 1243, "fp": 257, "fn": 107},
        {"unseen_attack": "DrDoS_NetBIOS", "method": "Prototype", "support_size": 100, "threshold": 0.9107, "accuracy": 0.8833, "precision": 0.8456, "recall": 0.9380, "f1": 0.8894, "fpr": 0.1713, "specificity": 0.8287, "tp": 1407, "tn": 1243, "fp": 257, "fn": 93},

        # DrDoS_NetBIOS - 1-NN
        {"unseen_attack": "DrDoS_NetBIOS", "method": "1-NN", "support_size": 10, "threshold": 0.9834, "accuracy": 0.8850, "precision": 0.8653, "recall": 0.9120, "f1": 0.8880, "fpr": 0.1420, "specificity": 0.8580, "tp": 1368, "tn": 1287, "fp": 213, "fn": 132},
        {"unseen_attack": "DrDoS_NetBIOS", "method": "1-NN", "support_size": 20, "threshold": 0.9875, "accuracy": 0.8960, "precision": 0.8893, "recall": 0.9047, "f1": 0.8969, "fpr": 0.1127, "specificity": 0.8873, "tp": 1357, "tn": 1331, "fp": 169, "fn": 143},
        {"unseen_attack": "DrDoS_NetBIOS", "method": "1-NN", "support_size": 50, "threshold": 0.9853, "accuracy": 0.9080, "precision": 0.8521, "recall": 0.9873, "f1": 0.9148, "fpr": 0.1713, "specificity": 0.8287, "tp": 1481, "tn": 1243, "fp": 257, "fn": 19},
        {"unseen_attack": "DrDoS_NetBIOS", "method": "1-NN", "support_size": 100, "threshold": 0.9955, "accuracy": 0.8933, "precision": 0.9114, "recall": 0.8713, "f1": 0.8909, "fpr": 0.0847, "specificity": 0.9153, "tp": 1307, "tn": 1373, "fp": 127, "fn": 193},
    ]
    return pd.DataFrame(records)


def export_metrics_tables(fed_metrics, few_shot_df):
    """
    Exports clean, validated CSV comparison tables to results/metrics/.
    """
    # 1. Final Comparison Table
    final_rows = [
        {
            "Approach": "Centralized Random Forest",
            "Accuracy": "87.11%",
            "Weighted F1": "86.96%",
            "Role": "Reference baseline",
            "Notes": "Trained on all 72,351 training samples, evaluated on 18,088 test samples"
        },
        {
            "Approach": "Centralized Neural Network",
            "Accuracy": "75.55%",
            "Weighted F1": "unavailable",
            "Role": "Centralized comparison",
            "Notes": "10 epochs centralized Adam lr=0.001; exact weighted F1 not recorded in separate JSON"
        },
        {
            "Approach": "Vanilla FedAvg",
            "Accuracy": f"{fed_metrics['fedavg_10']['accuracy'] * 100:.2f}%",
            "Weighted F1": f"{fed_metrics['fedavg_10']['f1'] * 100:.2f}%",
            "Role": "Federated baseline",
            "Notes": "10 rounds, 5 enterprise clients, 1 local epoch, non-IID partition"
        },
        {
            "Approach": "FedProx \u03bc=0.1",
            "Accuracy": f"{fed_metrics['fedprox_20']['accuracy'] * 100:.2f}%",
            "Weighted F1": f"{fed_metrics['fedprox_20']['f1'] * 100:.2f}%",
            "Role": "Best federated model",
            "Notes": "20 rounds, 5 enterprise clients, 1 local epoch, \u03bc=0.1 proximal regularization"
        }
    ]
    final_comp_df = pd.DataFrame(final_rows)
    final_csv_path = METRICS_DIR / "final_comparison.csv"
    final_comp_df.to_csv(final_csv_path, index=False)
    print(f"Exported: {final_csv_path}")

    # 2. Few-Shot Cross-Attack Detailed Table
    few_shot_csv_path = METRICS_DIR / "few_shot_cross_attack.csv"
    few_shot_export = few_shot_df[[
        "unseen_attack", "method", "support_size", "threshold",
        "accuracy", "precision", "recall", "f1", "fpr", "specificity",
        "tp", "tn", "fp", "fn"
    ]].copy()
    few_shot_export.to_csv(few_shot_csv_path, index=False)
    print(f"Exported: {few_shot_csv_path}")

    # 3. Few-Shot Summary Averaged Across All 3 Attacks
    avg_summary = few_shot_df.groupby(["method", "support_size"])[
        ["f1", "recall", "fpr", "accuracy", "precision", "specificity"]
    ].mean().reset_index()
    avg_csv_path = METRICS_DIR / "few_shot_summary_by_method.csv"
    avg_summary.to_csv(avg_csv_path, index=False)
    print(f"Exported: {avg_csv_path}")

    # 4. FedProx 20-Round Progress History
    history_df = pd.DataFrame(fed_metrics["round_history"])
    history_csv_path = METRICS_DIR / "fedprox_round_history.csv"
    history_df.to_csv(history_csv_path, index=False)
    print(f"Exported: {history_csv_path}")

    return final_comp_df, few_shot_export, avg_summary, history_df


def generate_plots(fed_metrics, few_shot_df):
    """
    Generates clean comparison plots using matplotlib only.
    """
    plt.rcParams.update({
        "font.sans-serif": "DejaVu Sans",
        "font.family": "sans-serif",
        "figure.titlesize": 12,
        "axes.titlesize": 11,
        "axes.labelsize": 10,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "legend.fontsize": 9,
    })

    # ----------------------------------------------------
    # Plot 1: Centralized vs Federated Accuracy Comparison
    # ----------------------------------------------------
    fig, ax = plt.subplots(figsize=(8, 4.8))
    models = [
        "Centralized\nRandom Forest",
        "Centralized\nNeural Network",
        "Vanilla FedAvg\n(10 Rounds)",
        "FedProx \u03bc=0.1\n(20 Rounds)"
    ]
    acc_values = [
        87.11,
        75.55,
        fed_metrics["fedavg_10"]["accuracy"] * 100,
        fed_metrics["fedprox_20"]["accuracy"] * 100
    ]
    colors = ["#2b5c8f", "#4682b4", "#e07a5f", "#2a9d8f"]
    bars = ax.bar(models, acc_values, color=colors, width=0.55, edgecolor="black", linewidth=0.8)

    ax.set_ylabel("Global Test Accuracy (%)")
    ax.set_title("Centralized vs Federated Global Test Accuracy", fontweight="bold")
    ax.set_ylim(0, 100)
    ax.grid(axis="y", linestyle="--", alpha=0.5)

    for bar in bars:
        h = bar.get_height()
        ax.annotate(f"{h:.2f}%",
                    xy=(bar.get_x() + bar.get_width() / 2, h),
                    xytext=(0, 4), textcoords="offset points",
                    ha="center", va="bottom", fontweight="bold")

    plt.tight_layout()
    p1_path = PLOTS_DIR / "centralized_vs_federated_accuracy.png"
    plt.savefig(p1_path, dpi=300)
    plt.close()
    print(f"Generated: {p1_path}")

    # ----------------------------------------------------
    # Plot 2: Centralized vs Federated Weighted F1 Comparison
    # ----------------------------------------------------
    fig, ax = plt.subplots(figsize=(7, 4.8))
    f1_models = [
        "Centralized\nRandom Forest",
        "Vanilla FedAvg\n(10 Rounds)",
        "FedProx \u03bc=0.1\n(20 Rounds)"
    ]
    f1_values = [
        86.96,
        fed_metrics["fedavg_10"]["f1"] * 100,
        fed_metrics["fedprox_20"]["f1"] * 100
    ]
    f1_colors = ["#2b5c8f", "#e07a5f", "#2a9d8f"]
    bars = ax.bar(f1_models, f1_values, color=f1_colors, width=0.48, edgecolor="black", linewidth=0.8)

    ax.set_ylabel("Weighted F1 Score (%)")
    ax.set_title("Centralized vs Federated Weighted F1 Score", fontweight="bold")
    ax.set_ylim(0, 100)
    ax.grid(axis="y", linestyle="--", alpha=0.5)

    for bar in bars:
        h = bar.get_height()
        ax.annotate(f"{h:.2f}%",
                    xy=(bar.get_x() + bar.get_width() / 2, h),
                    xytext=(0, 4), textcoords="offset points",
                    ha="center", va="bottom", fontweight="bold")

    plt.annotate("* Note: Centralized NN exact weighted F1 was unrecorded in artifacts",
                 xy=(0.03, 0.04), xycoords="axes fraction", fontsize=8, fontstyle="italic", color="#555555")

    plt.tight_layout()
    p2_path = PLOTS_DIR / "centralized_vs_federated_f1.png"
    plt.savefig(p2_path, dpi=300)
    plt.close()
    print(f"Generated: {p2_path}")

    # ----------------------------------------------------
    # Plot 3 & 4: FedAvg vs FedProx (Combined & Individual)
    # ----------------------------------------------------
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.8))
    fl_variants = ["FedAvg (10R)", "FedProx \u03bc=0.1 (10R)", "FedProx \u03bc=0.1 (20R)"]
    fl_accs = [
        fed_metrics["fedavg_10"]["accuracy"] * 100,
        fed_metrics["fedprox_10"]["accuracy"] * 100,
        fed_metrics["fedprox_20"]["accuracy"] * 100
    ]
    fl_f1s = [
        fed_metrics["fedavg_10"]["f1"] * 100,
        fed_metrics["fedprox_10"]["f1"] * 100,
        fed_metrics["fedprox_20"]["f1"] * 100
    ]

    bars1 = ax1.bar(fl_variants, fl_accs, color=["#e07a5f", "#f4a261", "#2a9d8f"], width=0.5, edgecolor="black")
    ax1.set_ylabel("Accuracy (%)")
    ax1.set_title("FedAvg vs FedProx: Test Accuracy", fontweight="bold")
    ax1.set_ylim(40, 80)
    ax1.grid(axis="y", linestyle="--", alpha=0.5)
    for b in bars1:
        h = b.get_height()
        ax1.annotate(f"{h:.2f}%", xy=(b.get_x() + b.get_width()/2, h), xytext=(0, 4),
                     textcoords="offset points", ha="center", va="bottom", fontweight="bold")

    bars2 = ax2.bar(fl_variants, fl_f1s, color=["#e07a5f", "#f4a261", "#2a9d8f"], width=0.5, edgecolor="black")
    ax2.set_ylabel("Weighted F1 Score (%)")
    ax2.set_title("FedAvg vs FedProx: Weighted F1", fontweight="bold")
    ax2.set_ylim(40, 80)
    ax2.grid(axis="y", linestyle="--", alpha=0.5)
    for b in bars2:
        h = b.get_height()
        ax2.annotate(f"{h:.2f}%", xy=(b.get_x() + b.get_width()/2, h), xytext=(0, 4),
                     textcoords="offset points", ha="center", va="bottom", fontweight="bold")

    plt.tight_layout()
    p3_path = PLOTS_DIR / "fedavg_vs_fedprox.png"
    plt.savefig(p3_path, dpi=300)
    plt.close()
    print(f"Generated: {p3_path}")

    # Dedicated Plot 3: FedAvg vs FedProx Accuracy
    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    bars = ax.bar(fl_variants, fl_accs, color=["#e07a5f", "#f4a261", "#2a9d8f"], width=0.48, edgecolor="black")
    ax.set_ylabel("Accuracy (%)")
    ax.set_title("FedAvg vs FedProx: Global Test Accuracy", fontweight="bold")
    ax.set_ylim(40, 80)
    ax.grid(axis="y", linestyle="--", alpha=0.5)
    for b in bars:
        h = b.get_height()
        ax.annotate(f"{h:.2f}%", xy=(b.get_x() + b.get_width()/2, h), xytext=(0, 4),
                    textcoords="offset points", ha="center", va="bottom", fontweight="bold")
    plt.tight_layout()
    p3_acc_path = PLOTS_DIR / "fedavg_vs_fedprox_accuracy.png"
    plt.savefig(p3_acc_path, dpi=300)
    plt.close()

    # Dedicated Plot 4: FedAvg vs FedProx F1
    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    bars = ax.bar(fl_variants, fl_f1s, color=["#e07a5f", "#f4a261", "#2a9d8f"], width=0.48, edgecolor="black")
    ax.set_ylabel("Weighted F1 Score (%)")
    ax.set_title("FedAvg vs FedProx: Weighted F1 Score", fontweight="bold")
    ax.set_ylim(40, 80)
    ax.grid(axis="y", linestyle="--", alpha=0.5)
    for b in bars:
        h = b.get_height()
        ax.annotate(f"{h:.2f}%", xy=(b.get_x() + b.get_width()/2, h), xytext=(0, 4),
                    textcoords="offset points", ha="center", va="bottom", fontweight="bold")
    plt.tight_layout()
    p4_f1_path = PLOTS_DIR / "fedavg_vs_fedprox_f1.png"
    plt.savefig(p4_f1_path, dpi=300)
    plt.close()

    # ----------------------------------------------------
    # Plot 5 & 6: FedProx Round Progress (20 Rounds History)
    # ----------------------------------------------------
    history_df = pd.DataFrame(fed_metrics["round_history"])
    rounds = history_df["round"].values
    hist_acc = history_df["accuracy"].values * 100
    hist_f1 = history_df["f1"].values * 100

    # Combined dual-curve plot
    fig, ax = plt.subplots(figsize=(8.5, 4.8))
    ax.plot(rounds, hist_acc, marker="o", color="#2a9d8f", linewidth=2.2, label="Global Test Accuracy (%)")
    ax.plot(rounds, hist_f1, marker="s", color="#e76f51", linewidth=2.2, linestyle="--", label="Weighted F1 Score (%)")

    ax.set_xlabel("Federated Learning Round")
    ax.set_ylabel("Performance (%)")
    ax.set_title("FedProx (\u03bc=0.1) Convergence Across 20 Rounds", fontweight="bold")
    ax.set_xticks(rounds)
    ax.set_ylim(10, 80)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend(loc="lower right")

    for r_idx in [0, 9, 19]:
        r_num = rounds[r_idx]
        ax.annotate(f"{hist_acc[r_idx]:.1f}%", xy=(r_num, hist_acc[r_idx]),
                    xytext=(-12, 8), textcoords="offset points", fontsize=8.5, color="#2a9d8f", fontweight="bold")
        ax.annotate(f"{hist_f1[r_idx]:.1f}%", xy=(r_num, hist_f1[r_idx]),
                    xytext=(-12, -14), textcoords="offset points", fontsize=8.5, color="#e76f51", fontweight="bold")

    plt.tight_layout()
    p5_path = PLOTS_DIR / "fedprox_round_progress.png"
    plt.savefig(p5_path, dpi=300)
    plt.close()
    print(f"Generated: {p5_path}")

    # Dedicated Plot 5: FedProx Accuracy Across Rounds
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    ax.plot(rounds, hist_acc, marker="o", color="#2a9d8f", linewidth=2.2)
    ax.set_xlabel("FL Round")
    ax.set_ylabel("Global Test Accuracy (%)")
    ax.set_title("FedProx (\u03bc=0.1) Accuracy Progression Across 20 Rounds", fontweight="bold")
    ax.set_xticks(rounds)
    ax.set_ylim(20, 80)
    ax.grid(True, linestyle="--", alpha=0.5)
    for r_idx in [0, 9, 19]:
        r_num = rounds[r_idx]
        ax.annotate(f"{hist_acc[r_idx]:.2f}%", xy=(r_num, hist_acc[r_idx]),
                    xytext=(0, 6), textcoords="offset points", ha="center", fontsize=8.5, fontweight="bold")
    plt.tight_layout()
    p5_acc_path = PLOTS_DIR / "fedprox_accuracy_rounds.png"
    plt.savefig(p5_acc_path, dpi=300)
    plt.close()

    # Dedicated Plot 6: FedProx F1 Across Rounds
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    ax.plot(rounds, hist_f1, marker="s", color="#e76f51", linewidth=2.2, linestyle="--")
    ax.set_xlabel("FL Round")
    ax.set_ylabel("Weighted F1 Score (%)")
    ax.set_title("FedProx (\u03bc=0.1) Weighted F1 Progression Across 20 Rounds", fontweight="bold")
    ax.set_xticks(rounds)
    ax.set_ylim(10, 75)
    ax.grid(True, linestyle="--", alpha=0.5)
    for r_idx in [0, 9, 19]:
        r_num = rounds[r_idx]
        ax.annotate(f"{hist_f1[r_idx]:.2f}%", xy=(r_num, hist_f1[r_idx]),
                    xytext=(0, 6), textcoords="offset points", ha="center", fontsize=8.5, fontweight="bold")
    plt.tight_layout()
    p6_f1_path = PLOTS_DIR / "fedprox_f1_rounds.png"
    plt.savefig(p6_f1_path, dpi=300)
    plt.close()

    # ----------------------------------------------------
    # Plot 7: Few-Shot Cross-Attack F1 Trajectories
    # ----------------------------------------------------
    fig, ax = plt.subplots(figsize=(8.5, 4.8))
    attacks = ["DrDoS_UDP", "DrDoS_SNMP", "DrDoS_NetBIOS"]
    colors_map = {"DrDoS_UDP": "#1f77b4", "DrDoS_SNMP": "#2ca02c", "DrDoS_NetBIOS": "#d62728"}

    for att in attacks:
        sub_df = few_shot_df[few_shot_df["unseen_attack"] == att]
        p_vals = sub_df[sub_df["method"] == "Prototype"].sort_values("support_size")["f1"].values * 100
        k_vals = sub_df[sub_df["method"] == "1-NN"].sort_values("support_size")["f1"].values * 100
        shots = [10, 20, 50, 100]
        ax.plot(shots, p_vals, linestyle="--", marker="o", color=colors_map[att], alpha=0.6, label=f"{att} (Prototype)")
        ax.plot(shots, k_vals, linestyle="-", marker="s", linewidth=2.2, color=colors_map[att], label=f"{att} (1-NN)")

    ax.set_title("Few-Shot Cross-Attack Open-Set F1 Score vs Support Size", fontweight="bold")
    ax.set_xlabel("Support Examples (k)")
    ax.set_ylabel("Open-Set F1 Score (%)")
    ax.set_xticks([10, 20, 50, 100])
    ax.set_ylim(84, 101)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend(loc="lower right", fontsize=8.5)

    plt.tight_layout()
    p5_path = PLOTS_DIR / "few_shot_cross_attack_f1.png"
    plt.savefig(p5_path, dpi=300)
    plt.close()
    print(f"Generated: {p5_path}")

    # ----------------------------------------------------
    # Plot 8: Few-Shot Cross-Attack Recall Trajectories
    # ----------------------------------------------------
    fig, ax = plt.subplots(figsize=(8.5, 4.8))
    for att in attacks:
        sub_df = few_shot_df[few_shot_df["unseen_attack"] == att]
        p_vals = sub_df[sub_df["method"] == "Prototype"].sort_values("support_size")["recall"].values * 100
        k_vals = sub_df[sub_df["method"] == "1-NN"].sort_values("support_size")["recall"].values * 100
        shots = [10, 20, 50, 100]
        ax.plot(shots, p_vals, linestyle="--", marker="o", color=colors_map[att], alpha=0.6, label=f"{att} (Prototype)")
        ax.plot(shots, k_vals, linestyle="-", marker="s", linewidth=2.2, color=colors_map[att], label=f"{att} (1-NN)")

    ax.set_title("Few-Shot Cross-Attack Open-Set Recall vs Support Size", fontweight="bold")
    ax.set_xlabel("Support Examples (k)")
    ax.set_ylabel("Open-Set Recall (%)")
    ax.set_xticks([10, 20, 50, 100])
    ax.set_ylim(78, 102)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend(loc="lower right", fontsize=8.5)

    plt.tight_layout()
    p6_path = PLOTS_DIR / "few_shot_cross_attack_recall.png"
    plt.savefig(p6_path, dpi=300)
    plt.close()
    print(f"Generated: {p6_path}")

    # ----------------------------------------------------
    # Plot 9: Few-Shot Prototype vs 1-NN Comparison Bar Chart
    # ----------------------------------------------------
    avg_metrics = few_shot_df.groupby(["method", "support_size"])["f1"].mean() * 100.0
    shots = [10, 20, 50, 100]
    x = np.arange(len(shots))
    width = 0.35

    proto_f1s = [avg_metrics.loc[("Prototype", k)] for k in shots]
    knn_f1s = [avg_metrics.loc[("1-NN", k)] for k in shots]

    fig, ax = plt.subplots(figsize=(8.5, 4.8))
    rects1 = ax.bar(x - width/2, proto_f1s, width, label="Prototype (Centroid)", color="#1f77b4", alpha=0.85, edgecolor="black")
    rects2 = ax.bar(x + width/2, knn_f1s, width, label="1-NN (Exemplar)", color="#2ca02c", alpha=0.85, edgecolor="black")

    ax.set_ylabel("Mean Open-Set F1 Score (%)")
    ax.set_title("Overall Average F1 Across 3 Unseen Attacks: Prototype vs 1-NN", fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels([f"{k}-shot" for k in shots])
    ax.set_ylim(88, 97)
    ax.grid(axis="y", linestyle="--", alpha=0.5)
    ax.legend(loc="lower right")

    for bar in rects1:
        h = bar.get_height()
        ax.annotate(f"{h:.2f}%", xy=(bar.get_x() + bar.get_width()/2, h), xytext=(0, 4),
                    textcoords="offset points", ha="center", va="bottom", fontsize=8.5)
    for bar in rects2:
        h = bar.get_height()
        ax.annotate(f"{h:.2f}%", xy=(bar.get_x() + bar.get_width()/2, h), xytext=(0, 4),
                    textcoords="offset points", ha="center", va="bottom", fontsize=8.5, fontweight="bold")

    plt.tight_layout()
    p7_path = PLOTS_DIR / "prototype_vs_1nn.png"
    plt.savefig(p7_path, dpi=300)
    plt.close()
    print(f"Generated: {p7_path}")


def write_compilation_log(final_comp_df, few_shot_df, fed_metrics):
    """
    Writes a comprehensive summary log of compilation to results/logs/compilation_summary.log.
    """
    log_file = LOGS_DIR / "compilation_summary.log"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    avg_f1_knn = few_shot_df[few_shot_df["method"] == "1-NN"]["f1"].mean() * 100
    avg_f1_proto = few_shot_df[few_shot_df["method"] == "Prototype"]["f1"].mean() * 100
    best_cfg = few_shot_df.groupby(["method", "support_size"])[["f1", "recall", "fpr"]].mean().reset_index()
    best_cfg_row = best_cfg.loc[best_cfg["f1"].idxmax()]

    with open(log_file, "w", encoding="utf-8") as f:
        f.write("================================================================================\n")
        f.write(f"PROJECT EXPERIMENTAL RESULTS COMPILATION LOG\n")
        f.write(f"Timestamp: {timestamp}\n")
        f.write("================================================================================\n\n")

        f.write("1. FINAL MAIN EXPERIMENTS COMPARISON TABLE:\n")
        f.write(final_comp_df.to_string(index=False))
        f.write("\n\n")

        f.write("2. FEDERATED LEARNING HIGHLIGHTS:\n")
        f.write(f"   Vanilla FedAvg (10 rounds): Accuracy={fed_metrics['fedavg_10']['accuracy']*100:.2f}%, F1={fed_metrics['fedavg_10']['f1']*100:.2f}%\n")
        f.write(f"   FedProx mu=0.1 (10 rounds): Accuracy={fed_metrics['fedprox_10']['accuracy']*100:.2f}%, F1={fed_metrics['fedprox_10']['f1']*100:.2f}%\n")
        f.write(f"   FedProx mu=0.1 (20 rounds): Accuracy={fed_metrics['fedprox_20']['accuracy']*100:.2f}%, F1={fed_metrics['fedprox_20']['f1']*100:.2f}%\n\n")

        f.write("3. FEW-SHOT UNSEEN-ATTACK GENERALIZATION HIGHLIGHTS:\n")
        f.write(f"   Target Unseen Attacks: DrDoS_UDP, DrDoS_SNMP, DrDoS_NetBIOS\n")
        f.write(f"   Overall Average F1 (1-NN):      {avg_f1_knn:.2f}%\n")
        f.write(f"   Overall Average F1 (Prototype): {avg_f1_proto:.2f}%\n")
        f.write(f"   Best Overall Configuration:     {best_cfg_row['method']} {int(best_cfg_row['support_size'])}-shot ")
        f.write(f"(Avg F1: {best_cfg_row['f1']*100:.2f}%, Avg Recall: {best_cfg_row['recall']*100:.2f}%, Avg FPR: {best_cfg_row['fpr']*100:.2f}%)\n\n")

        f.write("4. ARTIFACTS VERIFIED AND COMPILED:\n")
        f.write(f"   - Metrics: {METRICS_DIR / 'final_comparison.csv'}\n")
        f.write(f"   - Metrics: {METRICS_DIR / 'few_shot_cross_attack.csv'}\n")
        f.write(f"   - Metrics: {METRICS_DIR / 'few_shot_summary_by_method.csv'}\n")
        f.write(f"   - Metrics: {METRICS_DIR / 'fedprox_round_history.csv'}\n")
        f.write(f"   - Plots:   {PLOTS_DIR / 'centralized_vs_federated_accuracy.png'}\n")
        f.write(f"   - Plots:   {PLOTS_DIR / 'centralized_vs_federated_f1.png'}\n")
        f.write(f"   - Plots:   {PLOTS_DIR / 'fedavg_vs_fedprox.png'}\n")
        f.write(f"   - Plots:   {PLOTS_DIR / 'fedprox_round_progress.png'}\n")
        f.write(f"   - Plots:   {PLOTS_DIR / 'few_shot_cross_attack_f1.png'}\n")
        f.write(f"   - Plots:   {PLOTS_DIR / 'few_shot_cross_attack_recall.png'}\n")
        f.write(f"   - Plots:   {PLOTS_DIR / 'prototype_vs_1nn.png'}\n")
        f.write("================================================================================\n")

    print(f"Logged compilation summary: {log_file}")


def main():
    """Main execution function."""
    print("==================================================")
    print("STARTING EXPERIMENT RESULTS COMPILATION")
    print("==================================================")
    ensure_directories()

    print("\n1. Loading validated metrics...")
    fed_metrics = load_federated_metrics()
    few_shot_df = load_few_shot_cross_attack_records()
    print("   Federated metrics and Few-Shot records loaded successfully.")

    print("\n2. Exporting structured CSV metrics tables...")
    final_comp_df, few_shot_export, avg_summary, history_df = export_metrics_tables(fed_metrics, few_shot_df)

    print("\n3. Generating high-resolution matplotlib comparison plots...")
    generate_plots(fed_metrics, few_shot_df)

    print("\n4. Writing compilation log...")
    write_compilation_log(final_comp_df, few_shot_df, fed_metrics)

    print("\n==================================================")
    print("RESULTS COMPILATION COMPLETED SUCCESSFULLY")
    print("==================================================")


if __name__ == "__main__":
    main()
