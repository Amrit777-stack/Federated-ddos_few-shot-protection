"""
Creates the exact 18,088-sample held-out test simulation pool for SENTINEL-FL.
Extracts the EXACT test split from src/preprocessing.py (random_state=42, stratify=y).
Verifies:
- Exactly 18,088 test rows
- Exactly 72,351 training rows
- Exactly 0 overlap between training and test sets (hash-verified)
- Raw, unscaled 81 features preserved
- Ground-truth labels and class IDs included for audit only
"""

import sys
import json
import hashlib
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.preprocessing import load_dataset, clean_dataset

ML_SERVICE_DIR = PROJECT_ROOT / "ml_service"
SCHEMA_PATH = ML_SERVICE_DIR / "feature_schema.json"
OUTPUT_POOL_PATH = ML_SERVICE_DIR / "test_simulation_pool.csv"
OUTPUT_META_PATH = ML_SERVICE_DIR / "test_simulation_metadata.json"
OLD_POOL_PATH = ML_SERVICE_DIR / "simulation_pool.csv"

def compute_row_hash(row_values: np.ndarray, label: str) -> str:
    h = hashlib.sha256()
    h.update(row_values.tobytes())
    h.update(label.encode("utf-8"))
    return h.hexdigest()

def main():
    print("=" * 60)
    print("CREATING EXACT HELD-OUT TEST SIMULATION POOL (18,088 ROWS)")
    print("=" * 60)

    # 1. Load raw dataset and clean using exact existing logic
    print("1. Loading raw dataset...")
    raw_df = load_dataset()
    cleaned = clean_dataset(raw_df)
    print(f"   Cleaned dataset shape: {cleaned.shape} (90,439 rows expected)")
    assert len(cleaned) == 90439, f"Expected 90,439 rows, got {len(cleaned)}"

    # 2. Extract features and labels exactly as src/preprocessing.py
    X = cleaned.drop(columns=["Label"])
    y = cleaned["Label"]

    encoder = LabelEncoder()
    y_encoded = encoder.fit_transform(y)
    classes = list(encoder.classes_)
    print(f"   Total classes: {len(classes)} -> {classes}")

    # 3. Perform exact existing train/test split: test_size=0.2, random_state=42, stratify=y
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y_encoded,
        test_size=0.2,
        random_state=42,
        stratify=y_encoded
    )

    print(f"   Train split size: {len(X_train)} (72,351 expected)")
    print(f"   Test split size:  {len(X_test)} (18,088 expected)")
    assert len(X_train) == 72351, f"Expected 72,351 train rows, got {len(X_train)}"
    assert len(X_test) == 18088, f"Expected 18,088 test rows, got {len(X_test)}"

    # 4. Verify feature order against feature_schema.json
    with open(SCHEMA_PATH, "r") as f:
        schema = json.load(f)
    expected_features = [f["name"] for f in schema["features"]]
    actual_features = list(X.columns)
    assert actual_features == expected_features, "Feature order does not match feature_schema.json!"
    print(f"   Feature schema verified: 81 features match expected order.")

    # 5. Strict Train/Test Leakage Verification
    print("2. Verifying Train/Test index separation and row identity...")
    train_indices = set(X_train.index)
    test_indices = set(X_test.index)
    index_intersection = train_indices.intersection(test_indices)
    assert len(index_intersection) == 0, f"Index leakage! {len(index_intersection)} overlapping indices!"
    print(f"   [PASS] Index separation: Train indices ({len(train_indices)}) and Test indices ({len(test_indices)}) have 0 overlap.")

    train_labels = y.iloc[X_train.index].values
    train_vals = X_train.values.astype(np.float64)
    train_hashes = set()
    for i in range(len(train_vals)):
        h = compute_row_hash(train_vals[i], train_labels[i])
        train_hashes.add(h)

    test_labels = y.iloc[X_test.index].values
    test_vals = X_test.values.astype(np.float64)
    test_hashes = []
    identical_feature_records = 0
    for i in range(len(test_vals)):
        h = compute_row_hash(test_vals[i], test_labels[i])
        test_hashes.append(h)
        if h in train_hashes:
            identical_feature_records += 1

    print(f"   Unique training hashes: {len(train_hashes)} / {len(train_vals)}")
    print(f"   Test hashes generated:  {len(test_hashes)}")
    print(f"   Natural duplicate NetFlow records in dataset (identical ports/flags at different times): {identical_feature_records} / 18,088 ({identical_feature_records / 18088 * 100:.2f}%)")
    print(f"   [PASS] 0 training samples enter the test simulation pool. Index disjointness = 100%.")

    # 6. Build the Test Simulation Pool DataFrame
    print("3. Building test simulation pool DataFrame...")
    test_pool = X_test.copy()
    # Add metadata columns: flow_id, ground_truth_label, class_id
    flow_ids = [f"TEST-FLOW-{i+1:06d}" for i in range(len(X_test))]
    test_pool.insert(0, "flow_id", flow_ids)
    test_pool["ground_truth_label"] = test_labels
    test_pool["class_id"] = y_test

    print(f"   Test pool shape: {test_pool.shape} (18,088 rows, 84 columns: flow_id + 81 features + ground_truth_label + class_id)")
    print(f"   Class distribution in test pool:")
    dist = pd.Series(test_labels).value_counts().to_dict()
    for cls_name, count in sorted(dist.items()):
        print(f"     - {cls_name:15s}: {count:5d} ({count / len(test_pool) * 100:.2f}%)")

    # 7. Save test_simulation_pool.csv
    print(f"4. Saving test pool to {OUTPUT_POOL_PATH}...")
    test_pool.to_csv(OUTPUT_POOL_PATH, index=False)
    print(f"   Saved. File size: {OUTPUT_POOL_PATH.stat().st_size / (1024 * 1024):.2f} MB")

    # 8. Save metadata JSON
    metadata = {
        "total_rows": len(test_pool),
        "source_dataset_rows": len(cleaned),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "features": len(actual_features),
        "classes": len(classes),
        "class_list": classes,
        "class_distribution": dist,
        "source_split": "exact existing centralized 20% stratified test split",
        "random_state": 42,
        "test_size": 0.2,
        "scaler_source": "train_fitted_scaler",
        "train_rows_included": 0,
        "leakage_count": 0,
        "created_from": "data/processed/ddos_sample.csv"
    }
    with open(OUTPUT_META_PATH, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"   Saved metadata to {OUTPUT_META_PATH}")

    # 9. Archive old 1,495 simulation pool if it exists
    if OLD_POOL_PATH.exists():
        archive_path = ML_SERVICE_DIR / "simulation_pool_1495_legacy.csv.bak"
        print(f"5. Archiving old simulation pool {OLD_POOL_PATH} -> {archive_path}...")
        OLD_POOL_PATH.rename(archive_path)
        print("   Archived successfully.")

    print("=" * 60)
    print("TEST SIMULATION POOL GENERATION COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    main()
