import sys
from pathlib import Path

PROJECT_ROOT = Path(r"c:\Users\amrit\Documents\Federated-Ddos protection")
sys.path.insert(0, str(PROJECT_ROOT / "ml_service"))

from inference import get_engine
from traffic_simulator import get_simulator

engine = get_engine()
sim = get_simulator()

print("\nTesting 5 consecutive simulated flows:")
for i in range(5):
    flow = sim.get_next_flow()
    pred = engine.predict(flow["features_list"])
    print(f"[{flow['event_id']}] Ent: {flow['enterprise_name']:16s} | GT: {flow['ground_truth_evaluation_only']:14s} | Pred: {pred['prediction']:14s} | Conf: {pred['confidence']*100:6.2f}% | Sev: {pred['severity']}")

print("\nVerification completed successfully.")

