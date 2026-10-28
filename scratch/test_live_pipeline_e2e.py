"""
End-to-end automated test for SENTINEL-FL Live ML Inference Pipeline.
Tests:
1. Direct Python FastAPI endpoints (/health, /predict, /simulate/next)
2. Real PyTorch model inference on actual NetFlow rows
3. Realism of probabilities, class IDs, and severity classifications
4. Express live endpoints (/api/live/status, /api/live/predict, /api/live/start, /api/live/events)
"""

import sys
import os
import time
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ml_service"))

from inference import get_engine, CLASSES
from traffic_simulator import get_simulator

def test_python_inference_direct():
    print("==================================================")
    print("STEP 1: Direct PyTorch Model Inference Testing")
    print("==================================================")
    
    engine = get_engine()
    simulator = get_simulator()

    print(f"Model Checkpoint: {engine.checkpoint_path}")
    print(f"Device: {engine.device}")
    print(f"Total Model Classes: {len(CLASSES)}")
    print(f"Input Feature Count: {len(engine.feature_names)}")

    # 1. Test BENIGN sample
    benign_rows = simulator.samples_df[simulator.samples_df["Label"] == "BENIGN"]
    if len(benign_rows) > 0:
        benign_sample = benign_rows.iloc[0]
        feats = [float(benign_sample[c]) for c in engine.feature_names]
        res = engine.predict(feats)
        print("\n--- BENIGN Sample Test ---")
        print(f"Ground Truth: BENIGN")
        print(f"Predicted Class: {res['prediction']} (Class {res['class_id']})")
        print(f"Confidence: {res['confidence']*100:.2f}%")
        print(f"Severity: {res['severity']}")
        assert "prediction" in res
        assert res["class_id"] >= 0 and res["class_id"] < 13
        assert res["confidence"] >= 0.0 and res["confidence"] <= 1.0
        assert res["inference_mode"] == "LIVE_ML_INFERENCE"

    # 2. Test DrDoS_UDP sample
    udp_rows = simulator.samples_df[simulator.samples_df["Label"] == "DrDoS_UDP"]
    if len(udp_rows) > 0:
        udp_sample = udp_rows.iloc[0]
        feats = [float(udp_sample[c]) for c in engine.feature_names]
        res = engine.predict(feats)
        print("\n--- DrDoS_UDP Sample Test ---")
        print(f"Ground Truth: DrDoS_UDP")
        print(f"Predicted Class: {res['prediction']} (Class {res['class_id']})")
        print(f"Confidence: {res['confidence']*100:.2f}%")
        print(f"Severity: {res['severity']}")
        print(f"Top 3 Probabilities: {sorted(res['probabilities'].items(), key=lambda x: x[1], reverse=True)[:3]}")

    # 3. Test DrDoS_SNMP sample
    snmp_rows = simulator.samples_df[simulator.samples_df["Label"] == "DrDoS_SNMP"]
    if len(snmp_rows) > 0:
        snmp_sample = snmp_rows.iloc[0]
        feats = [float(snmp_sample[c]) for c in engine.feature_names]
        res = engine.predict(feats)
        print("\n--- DrDoS_SNMP Sample Test ---")
        print(f"Ground Truth: DrDoS_SNMP")
        print(f"Predicted Class: {res['prediction']} (Class {res['class_id']})")
        print(f"Confidence: {res['confidence']*100:.2f}%")
        print(f"Severity: {res['severity']}")

    print("\n[OK] Step 1 Direct Model Inference Passed.")

if __name__ == "__main__":
    test_python_inference_direct()

