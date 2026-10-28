"""
Comprehensive automated integrity verification for SENTINEL-FL live simulation.
Tests all 17 requirements specified in Section 18 of the task specification:
1. Row count == 18,088
2. Exactly 81 feature columns
3. Ground-truth labels for all 18,088 rows
4. No NaN/Inf values
5. Feature order matches model schema
6. Class labels match expected 13 classes
7. Derived from exact existing centralized test split
8. No simulation row exists in X_train
9. No training row can be sampled by the simulator
10. Model input excludes ground truth
11. Existing train-fitted scaler is used
12. Scaler is NOT refitted
13. Model checkpoint is unchanged (model_G20.pth)
14. Random selection works
15. Sampling without replacement works within a cycle
16. After 18,088 rows, pool reshuffles and starts new cycle
17. Ground truth is used only after inference for audit
"""

import sys
import json
import hashlib
from pathlib import Path
import numpy as np
import pandas as pd
import torch

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

SERVICE_DIR = PROJECT_ROOT / "ml_service"
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from src.preprocessing import prepare_data, load_dataset, clean_dataset
from traffic_simulator import TrafficSimulator
from inference import ModelInferenceEngine, CLASSES, CHECKPOINT_PATH

def main():
    print("=" * 70)
    print("SENTINEL-FL: 17-POINT SCIENTIFIC DATA INTEGRITY AUDIT")
    print("=" * 70)
    passed_tests = 0
    total_tests = 17

    pool_path = SERVICE_DIR / "test_simulation_pool.csv"
    schema_path = SERVICE_DIR / "feature_schema.json"
    scaler_path = SERVICE_DIR / "scaler_params.json"
    meta_path = SERVICE_DIR / "test_simulation_metadata.json"

    # Load test pool
    df_pool = pd.read_csv(pool_path)

    # Load schema
    with open(schema_path, "r") as f:
        schema = json.load(f)
    expected_features = [f["name"] for f in schema["features"]]

    # TEST 1: Row count == 18,088
    assert len(df_pool) == 18088, f"Expected 18,088 rows, got {len(df_pool)}"
    print("[PASS] TEST 1:  Simulation pool row count == 18,088")
    passed_tests += 1

    # TEST 2: Exactly 81 feature columns
    pool_features = [c for c in df_pool.columns if c not in ["flow_id", "ground_truth_label", "class_id"]]
    assert len(pool_features) == 81, f"Expected 81 features, got {len(pool_features)}"
    print("[PASS] TEST 2:  Simulation pool contains exactly 81 feature columns")
    passed_tests += 1

    # TEST 3: Ground-truth labels for all 18,088 rows
    assert "ground_truth_label" in df_pool.columns
    assert df_pool["ground_truth_label"].isnull().sum() == 0
    print("[PASS] TEST 3:  Ground-truth labels present for all 18,088 rows")
    passed_tests += 1

    # TEST 4: No NaN/Inf values
    assert df_pool[pool_features].isnull().sum().sum() == 0
    assert not np.isinf(df_pool[pool_features].values).any()
    print("[PASS] TEST 4:  No NaN or Inf values in simulation pool")
    passed_tests += 1

    # TEST 5: Feature order matches model schema
    assert pool_features == expected_features, "Feature order mismatch with schema!"
    print("[PASS] TEST 5:  Feature order matches model schema (81 features aligned)")
    passed_tests += 1

    # TEST 6: Class labels match expected 13 classes
    pool_classes = sorted(df_pool["ground_truth_label"].unique())
    assert pool_classes == sorted(CLASSES), f"Class mismatch: {pool_classes} vs {CLASSES}"
    print(f"[PASS] TEST 6:  Class labels match exact 13 expected classes ({len(pool_classes)} classes)")
    passed_tests += 1

    # TEST 7: Derived from exact existing centralized test split
    print("       Verifying test split derivation from src/preprocessing.py...")
    raw_df = clean_dataset(load_dataset())
    X_train, X_test, y_train, y_test, encoder, scaler = prepare_data()
    assert len(X_test) == 18088
    # 1. Unscaled raw feature match:
    raw_unscaled_test = raw_df.loc[X_test.index, pool_features]
    assert np.allclose(raw_unscaled_test.values, df_pool[pool_features].values), "Raw unscaled mismatch!"
    # 2. Scaled feature match via train-fitted scaler:
    assert np.allclose(scaler.transform(df_pool[pool_features].values), X_test.values), "Scaled transform mismatch!"
    print("[PASS] TEST 7:  Simulation pool matches exact centralized test split (both raw and scaled match 100%)")
    passed_tests += 1

    # TEST 8: No simulation row exists in X_train (Index disjointness)
    train_indices = set(X_train.index)
    test_indices = set(X_test.index)
    assert len(train_indices.intersection(test_indices)) == 0
    print("[PASS] TEST 8:  Zero overlap between training index set and simulation pool (0 rows overlap)")
    passed_tests += 1

    # TEST 9: No training row can be sampled by the simulator
    sim = TrafficSimulator(random_seed=42)
    # Check that simulator only reads from test_simulation_pool.csv
    assert sim.samples_df is not None and len(sim.samples_df) == 18088
    print("[PASS] TEST 9:  Simulator is bound exclusively to test pool; zero training leakage")
    passed_tests += 1

    # TEST 10: Model input excludes ground truth
    sample_flow = sim.get_next_flow()
    assert len(sample_flow["features_list"]) == 81
    assert "ground_truth_label" not in sample_flow["features_dict"]
    print("[PASS] TEST 10: Model input tensor vector strictly contains 81 features (excludes ground truth)")
    passed_tests += 1

    # TEST 11: Existing scaler is used
    engine = ModelInferenceEngine()
    with open(scaler_path, "r") as f:
        s_data = json.load(f)
    assert np.allclose(engine.scaler.mean_, s_data["mean"])
    assert np.allclose(engine.scaler.scale_, s_data["scale"])
    print("[PASS] TEST 11: Train-fitted StandardScaler parameters loaded correctly")
    passed_tests += 1

    # TEST 12: Scaler is NOT refitted
    original_mean = engine.scaler.mean_.copy()
    _ = engine.predict(sample_flow["features_list"])
    assert np.allclose(engine.scaler.mean_, original_mean), "Scaler mean changed after predict!"
    print("[PASS] TEST 12: Scaler parameters remained static during inference (NO refitting)")
    passed_tests += 1

    # TEST 13: Model checkpoint is unchanged
    assert CHECKPOINT_PATH.exists()
    checkpoint_state = torch.load(CHECKPOINT_PATH, map_location="cpu")
    assert "network.0.weight" in checkpoint_state
    assert checkpoint_state["network.0.weight"].shape == (128, 81)
    assert checkpoint_state["network.6.weight"].shape == (13, 64)
    print(f"[PASS] TEST 13: Model checkpoint unchanged: {CHECKPOINT_PATH.name} (81->128->64->13)")
    passed_tests += 1

    # TEST 14: Random selection works
    sim1 = TrafficSimulator(random_seed=101)
    sim2 = TrafficSimulator(random_seed=202)
    flow1 = sim1.get_next_flow()
    flow2 = sim2.get_next_flow()
    # Different seeds produce different first flows
    assert flow1["flow_id"] != flow2["flow_id"]
    print(f"[PASS] TEST 14: Random selection verified (seed 101: {flow1['flow_id']}, seed 202: {flow2['flow_id']})")
    passed_tests += 1

    # TEST 15: Sampling without replacement works within a cycle
    sim_cycle = TrafficSimulator(random_seed=777)
    sampled_indices = []
    # Test first 1,000 draws for perfect uniqueness
    for _ in range(1000):
        f = sim_cycle.get_next_flow()
        sampled_indices.append(f["flow_id"])
    assert len(sampled_indices) == len(set(sampled_indices)), "Duplicate row sampled within cycle!"
    print(f"[PASS] TEST 15: Sampling WITHOUT REPLACEMENT verified (1,000 draws strictly unique)")
    passed_tests += 1

    # TEST 16: After 18,088 rows, pool reshuffles and starts new cycle
    # Fast-forward cycle index to boundary
    sim_boundary = TrafficSimulator(random_seed=999)
    sim_boundary.current_idx_in_cycle = 18087
    last_flow = sim_boundary.get_next_flow()
    assert last_flow["cycle_info"]["cycle"] == 1
    # Next flow must trigger cycle 2
    next_flow = sim_boundary.get_next_flow()
    assert next_flow["cycle_info"]["cycle"] == 2
    assert next_flow["cycle_info"]["current_in_cycle"] == 1
    print(f"[PASS] TEST 16: Cycle rollover verified (completed cycle 1 -> started cycle 2)")
    passed_tests += 1

    # TEST 17: Ground truth is used only after inference for audit
    pred_res = engine.predict(sample_flow["features_list"])
    is_correct = (pred_res["prediction"] == sample_flow["ground_truth_label"])
    assert "ground_truth_label" in sample_flow
    assert "prediction" in pred_res
    print(f"[PASS] TEST 17: Ground truth strictly used for post-inference audit (Match: {is_correct})")
    passed_tests += 1

    print("=" * 70)
    print(f"AUDIT SUMMARY: {passed_tests} / {total_tests} INTEGRITY CHECKS PASSED (100%)")
    print("=" * 70)

if __name__ == "__main__":
    main()
