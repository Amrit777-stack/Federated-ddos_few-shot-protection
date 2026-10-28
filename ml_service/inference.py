"""
Inference engine for SENTINEL-FL.
Loads the trained 13-class FedProx G20 model checkpoint and executes
real-time PyTorch inference over scaled 81-feature NetFlow traffic vectors.
"""

import sys
from pathlib import Path
from typing import Dict, List, Union, Any

import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.model import DDoSModel
from src.preprocessing import prepare_data

import json
from sklearn.preprocessing import StandardScaler

# Fixed Class Names matching LabelEncoder(stratify=y, random_state=42)
CLASSES = [
    "BENIGN",
    "DrDoS_DNS",
    "DrDoS_LDAP",
    "DrDoS_MSSQL",
    "DrDoS_NTP",
    "DrDoS_NetBIOS",
    "DrDoS_SNMP",
    "DrDoS_SSDP",
    "DrDoS_UDP",
    "Syn",
    "TFTP",
    "UDP-lag",
    "WebDDoS"
]

CHECKPOINT_PATH = PROJECT_ROOT / "results" / "federated" / "run_010_20_rounds" / "model_G20.pth"
SCALER_CACHE_PATH = Path(__file__).resolve().parent / "scaler_params.json"

class ModelInferenceEngine:
    def __init__(self, checkpoint_path: Path = CHECKPOINT_PATH):
        self.checkpoint_path = checkpoint_path
        self.device = torch.device("cpu")
        self.model = None
        self.scaler = None
        self.feature_names = None
        self._initialize()

    def _initialize(self):
        print(f"[ModelInferenceEngine] Initializing from {self.checkpoint_path}...")
        if not self.checkpoint_path.exists():
            raise FileNotFoundError(f"Checkpoint not found at: {self.checkpoint_path}")

        # 1. Instantiate DDoSModel with 13 output classes
        self.model = DDoSModel(input_size=81, num_classes=13)
        state_dict = torch.load(self.checkpoint_path, map_location=self.device)
        self.model.load_state_dict(state_dict)
        self.model.eval()

        # 2. Load pre-calibrated StandardScaler parameters or fit from baseline
        if SCALER_CACHE_PATH.exists():
            print(f"[ModelInferenceEngine] Loading pre-calibrated scaler from {SCALER_CACHE_PATH}...")
            with open(SCALER_CACHE_PATH, "r") as f:
                s_data = json.load(f)
            self.scaler = StandardScaler()
            self.scaler.mean_ = np.array(s_data["mean"], dtype=np.float64)
            self.scaler.scale_ = np.array(s_data["scale"], dtype=np.float64)
            self.scaler.var_ = np.array(s_data["var"], dtype=np.float64)
            self.scaler.n_features_in_ = len(s_data["mean"])
            self.scaler.feature_names_in_ = np.array(s_data["feature_names"], dtype=object)
            self.feature_names = s_data["feature_names"]
        else:
            print("[ModelInferenceEngine] Calibrating StandardScaler on training split...")
            X_train, _, _, _, encoder, scaler = prepare_data()
            self.scaler = scaler
            self.feature_names = list(X_train.columns)
        
        assert len(self.feature_names) == 81, "Feature count mismatch!"
        print(f"[ModelInferenceEngine] Ready. 81 features, 13 classes. Model in EVAL mode.")

    def get_severity(self, prediction: str, confidence: float) -> str:
        """
        Deterministic Demo SOC severity policy:
        - BENIGN -> NORMAL
        - Malicious high-confidence (>= 0.85) -> CRITICAL
        - Malicious moderate-confidence (>= 0.60) -> HIGH
        - Malicious low-confidence (< 0.60) -> MEDIUM
        """
        if prediction == "BENIGN":
            return "NORMAL"
        if confidence >= 0.85:
            return "CRITICAL"
        if confidence >= 0.60:
            return "HIGH"
        return "MEDIUM"

    def predict(self, features: Union[List[float], Dict[str, float], np.ndarray]) -> Dict[str, Any]:
        """
        Performs genuine PyTorch inference on an 81-feature vector.
        """
        if isinstance(features, dict):
            # Map dictionary by feature names
            ordered_vals = [float(features.get(col, 0.0)) for col in self.feature_names]
            raw_array = np.array(ordered_vals, dtype=np.float32).reshape(1, -1)
        elif isinstance(features, (list, tuple)):
            if len(features) != 81:
                raise ValueError(f"Expected 81 features, got {len(features)}")
            raw_array = np.array(features, dtype=np.float32).reshape(1, -1)
        elif isinstance(features, np.ndarray):
            raw_array = features.astype(np.float32).reshape(1, -1)
            if raw_array.shape[1] != 81:
                raise ValueError(f"Expected 81 features, got {raw_array.shape[1]}")
        else:
            raise TypeError(f"Unsupported features type: {type(features)}")

        # Clean inf/nan
        raw_array = np.nan_to_num(raw_array, nan=0.0, posinf=0.0, neginf=0.0)

        # Scale features with matching column names to eliminate sklearn warnings
        df_for_scaler = pd.DataFrame(raw_array, columns=self.feature_names)
        scaled_array = self.scaler.transform(df_for_scaler)
        x_tensor = torch.tensor(scaled_array, dtype=torch.float32, device=self.device)

        with torch.no_grad():
            logits = self.model(x_tensor)
            probabilities = F.softmax(logits, dim=1).squeeze(0)
            pred_idx = torch.argmax(probabilities).item()
            confidence = float(probabilities[pred_idx].item())

        prediction_name = CLASSES[pred_idx]
        severity = self.get_severity(prediction_name, confidence)

        return {
            "prediction": prediction_name,
            "class_id": pred_idx,
            "confidence": float(round(confidence, 4)),
            "probabilities": {
                CLASSES[i]: float(round(probabilities[i].item(), 4))
                for i in range(len(CLASSES))
            },
            "severity": severity,
            "model": "FedProx-G20",
            "inference_mode": "LIVE_ML_INFERENCE"
        }

# Global singleton
_engine = None

def get_engine() -> ModelInferenceEngine:
    global _engine
    if _engine is None:
        _engine = ModelInferenceEngine()
    return _engine
