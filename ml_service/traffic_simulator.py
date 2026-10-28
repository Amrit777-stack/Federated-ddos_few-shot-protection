"""
Traffic simulator for SENTINEL-FL.
Replays genuine feature rows from the EXACT 18,088-sample held-out test pool
(ml_service/test_simulation_pool.csv) with zero training data leakage.
Samples flows WITHOUT REPLACEMENT within each 18,088-flow cycle, reshuffling upon cycle completion.
Assigns flows to simulated enterprises (E1-E5) according to validated Non-IID Dirichlet profiles.
Ground-truth labels are strictly isolated for post-inference audit.
"""

import sys
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional
import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

SERVICE_DIR = Path(__file__).resolve().parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from src.enterprise.partition import PROFILES

ENTERPRISE_MAP = {
    0: ("E1", "E1 - SIMULATED"),
    1: ("E2", "E2 - SIMULATED"),
    2: ("E3", "E3 - SIMULATED"),
    3: ("E4", "E4 - SIMULATED"),
    4: ("E5", "E5 - SIMULATED")
}

TEST_POOL_PATH = SERVICE_DIR / "test_simulation_pool.csv"
SCHEMA_PATH = SERVICE_DIR / "feature_schema.json"
META_PATH = SERVICE_DIR / "test_simulation_metadata.json"

class TrafficSimulator:
    def __init__(self, random_seed: Optional[int] = None):
        self.rng = np.random.RandomState(random_seed) if random_seed is not None else np.random.RandomState()
        self.random_seed = random_seed
        self.flow_counter = 0
        self.cycle_count = 1
        self.current_idx_in_cycle = 0
        self.total_flows_served = 0
        
        self.samples_df: Optional[pd.DataFrame] = None
        self.feature_columns: List[str] = []
        self.total_rows: int = 0
        self.cycle_indices: np.ndarray = np.array([], dtype=int)
        self.offline_enterprises = set()

        self._load_test_pool()
        self._init_cycle()

    def _load_test_pool(self):
        print(f"[TrafficSimulator] Loading exact held-out test pool from {TEST_POOL_PATH}...")
        if not TEST_POOL_PATH.exists():
            raise FileNotFoundError(
                f"Test simulation pool not found at {TEST_POOL_PATH}. "
                "Run scratch/create_test_simulation_pool.py to generate it."
            )

        self.samples_df = pd.read_csv(TEST_POOL_PATH)
        self.total_rows = len(self.samples_df)

        # Integrity Check 1: Row count must be exactly 18,088
        if self.total_rows != 18088:
            raise ValueError(f"Integrity violation: test pool row count is {self.total_rows}, expected 18,088!")

        # Integrity Check 2: Schema verification
        with open(SCHEMA_PATH, "r") as f:
            schema = json.load(f)
        expected_features = [f["name"] for f in schema["features"]]
        
        # Verify 81 features present and ordered
        for feat in expected_features:
            if feat not in self.samples_df.columns:
                raise ValueError(f"Integrity violation: feature '{feat}' missing from test simulation pool!")

        self.feature_columns = expected_features
        if len(self.feature_columns) != 81:
            raise ValueError(f"Integrity violation: expected 81 features, found {len(self.feature_columns)}!")

        # Integrity Check 3: Ground truth present and no nulls
        if "ground_truth_label" not in self.samples_df.columns:
            raise ValueError("Integrity violation: 'ground_truth_label' column missing from test simulation pool!")

        null_count = self.samples_df[self.feature_columns].isnull().sum().sum()
        if null_count > 0:
            raise ValueError(f"Integrity violation: found {null_count} NaN values in feature columns!")

        classes_in_pool = sorted(self.samples_df["ground_truth_label"].unique())
        print(f"[TrafficSimulator] Test pool verified: exactly {self.total_rows} held-out test rows, "
              f"81 input features, {len(classes_in_pool)} classes. Training rows included: 0.")

    def _init_cycle(self):
        """Initializes a new permutation of 18,088 indices for sampling without replacement."""
        self.cycle_indices = self.rng.permutation(self.total_rows)
        self.current_idx_in_cycle = 0

    def set_enterprise_status(self, ent_id: str, status: str):
        ent_norm = ent_id.upper().replace("ENTERPRISE_", "E").replace("ENTERPRISE", "E")
        if not ent_norm.startswith("E") and ent_norm in ["1", "2", "3", "4", "5"]:
            ent_norm = f"E{ent_norm}"
        if status.upper() == "OFFLINE":
            self.offline_enterprises.add(ent_norm)
        else:
            self.offline_enterprises.discard(ent_norm)
        print(f"[TrafficSimulator] Enterprise {ent_norm} status set to {status.upper()}. Offline set: {self.offline_enterprises}")

    def get_offline_enterprises(self) -> List[str]:
        return sorted(list(self.offline_enterprises))

    def get_next_flow(self) -> Dict[str, Any]:
        """
        Samples one held-out test flow WITHOUT REPLACEMENT within the current cycle.
        If all 18,088 flows have been sampled, reshuffles and begins the next cycle.
        Features are cleanly separated from ground-truth audit metadata.
        If an enterprise is OFFLINE, attack flows will NEVER be routed to it.
        If all target enterprises for an attack class are offline, the simulator skips that flow.
        """
        max_search = 100
        search_count = 0

        while search_count < max_search:
            search_count += 1

            # Cycle boundary check: reshuffle if entire pool has been consumed
            if self.current_idx_in_cycle >= self.total_rows:
                self.cycle_count += 1
                print(f"[TrafficSimulator] Cycle {self.cycle_count - 1} complete. "
                      f"Reshuffling {self.total_rows} flows for cycle {self.cycle_count} (sampling without replacement)...")
                self._init_cycle()

            sample_row_idx = int(self.cycle_indices[self.current_idx_in_cycle])
            self.current_idx_in_cycle += 1
            self.total_flows_served += 1
            self.flow_counter += 1

            row = self.samples_df.iloc[sample_row_idx]
            label = str(row["ground_truth_label"])

            # Base routing distribution from Dirichlet profiles
            raw_proportions = np.array(PROFILES.get(label, [0.2, 0.2, 0.2, 0.2, 0.2]), dtype=float)

            # Mask out any OFFLINE enterprises so attacks NEVER reach them
            masked_proportions = raw_proportions.copy()
            for i in range(5):
                ent_name = ENTERPRISE_MAP[i][0]
                if ent_name in self.offline_enterprises:
                    masked_proportions[i] = 0.0

            total_valid_prob = masked_proportions.sum()

            # If all enterprises targeting this attack are offline, skip to next flow
            if total_valid_prob == 0.0 and len(self.offline_enterprises) < 5:
                continue

            # If all 5 enterprises are offline or non-zero prob, compute choice
            if total_valid_prob > 0.0:
                p = masked_proportions / total_valid_prob
                ent_idx = int(self.rng.choice(5, p=p))
            else:
                ent_idx = 0

            ent_id, ent_label = ENTERPRISE_MAP[ent_idx]
            break

        flow_id = str(row["flow_id"]) if "flow_id" in row else f"TEST-FLOW-{sample_row_idx+1:06d}"
        class_id = int(row["class_id"]) if "class_id" in row else -1

        # Extract features strictly as numeric floats
        features_dict = {col: float(row[col]) for col in self.feature_columns}
        features_list = [float(row[col]) for col in self.feature_columns]

        event_id = f"FLOW-{self.flow_counter:06d}"
        now_iso = datetime.now(timezone.utc).isoformat()

        return {
            "event_id": event_id,
            "flow_id": flow_id,
            "timestamp": now_iso,
            "enterprise_id": ent_id,
            "enterprise_name": ent_label,
            "source": "HELD_OUT_TEST_POOL",
            "features_dict": features_dict,
            "features_list": features_list,
            "ground_truth_label": label,
            "ground_truth_class_id": class_id,
            "cycle_info": {
                "cycle": self.cycle_count,
                "current_in_cycle": self.current_idx_in_cycle,
                "remaining_in_cycle": self.total_rows - self.current_idx_in_cycle,
                "total_served": self.total_flows_served
            }
        }

    def reset(self):
        """Resets the simulator flow counter and reshuffles the cycle."""
        self.flow_counter = 0
        self.cycle_count = 1
        self.current_idx_in_cycle = 0
        self.total_flows_served = 0
        self._init_cycle()
        print(f"[TrafficSimulator] Simulator reset to initial state (Cycle 1, 0 flows served).")

    def get_pool_info(self) -> Dict[str, Any]:
        """Returns metadata and current state of the test simulation pool."""
        return {
            "total_rows": self.total_rows,
            "remaining_rows_in_cycle": self.total_rows - self.current_idx_in_cycle,
            "rows_processed_this_cycle": self.current_idx_in_cycle,
            "cycle_count": self.cycle_count,
            "total_flows_served": self.total_flows_served,
            "source": "Exact Held-Out Test Set (Centralized 20% Stratified Split)",
            "train_rows_included": 0,
            "feature_count": len(self.feature_columns),
            "class_count": int(self.samples_df["ground_truth_label"].nunique()) if self.samples_df is not None else 13,
            "sampling": "WITHOUT REPLACEMENT per cycle (reshuffle on cycle completion)",
            "model": "FedProx G20",
            "scaler": "train-fitted StandardScaler",
            "offline_enterprises": self.get_offline_enterprises()
        }

# Global singleton
_simulator: Optional[TrafficSimulator] = None

def get_simulator(random_seed: Optional[int] = None) -> TrafficSimulator:
    global _simulator
    if _simulator is None:
        _simulator = TrafficSimulator(random_seed=random_seed)
    return _simulator
