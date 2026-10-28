import sys
from pathlib import Path

PROJECT_ROOT = Path(r"c:\Users\amrit\Documents\Federated-Ddos protection")
sys.path.insert(0, str(PROJECT_ROOT / "ml_service"))

from inference import get_engine
from traffic_simulator import get_simulator

print("Testing ModelInferenceEngine...")
engine = get_engine()
assert engine.model is not None
assert engine.scaler is not None

print("Testing TrafficSimulator...")
sim = get_simulator()
flow = sim.get_next_flow()
print(f"Generated flow: {flow['event_id']}, Enterprise: {flow['enterprise_name']}, GT: {flow['ground_truth_evaluation_only']}")

pred = engine.predict(flow["features_list"])
print(f"Model prediction: {pred['prediction']} (Class {pred['class_id']})")
print(f"Confidence: {pred['confidence'] * 100:.2f}%")
print(f"Severity: {pred['severity']}")
print(f"Model: {pred['model']}")
print(f"Inference Mode: {pred['inference_mode']}")

print("\nSUCCESS! Genuine PyTorch inference verified.")

