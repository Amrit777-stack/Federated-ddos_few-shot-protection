"""
FastAPI application for SENTINEL-FL Live ML Inference.
Exposes endpoints for PyTorch inference and realistic network-flow replay simulation
using the exact 18,088-sample held-out test pool.
"""

import sys
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Dict, List, Any, Optional, Union

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure ml_service and PROJECT_ROOT are on sys.path
SERVICE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SERVICE_DIR.parent
for p in [str(SERVICE_DIR), str(PROJECT_ROOT)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from inference import get_engine, CLASSES
from traffic_simulator import get_simulator

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[FastAPI] Warming up ModelInferenceEngine and TrafficSimulator...", flush=True)
    get_engine()
    get_simulator()
    print("[FastAPI] Ready to accept inference requests from held-out test pool.", flush=True)
    yield

app = FastAPI(
    title="SENTINEL-FL Inference Service",
    description="Live PyTorch inference and held-out test pool replay service for Federated DDoS Defense SOC",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

class PredictRequest(BaseModel):
    features: Union[List[float], Dict[str, float]]

@app.get("/health")
def health():
    engine = get_engine()
    return {
        "status": "online",
        "service": "sentinel-fl-ml-service",
        "model": "FedProx-G20",
        "classes": len(CLASSES),
        "class_list": CLASSES,
        "input_features": 81,
        "device": str(engine.device),
        "environment": "SIMULATED ENTERPRISE ENVIRONMENT",
        "inference_mode": "LIVE_ML_INFERENCE",
        "traffic_source": "EXACT_HELD_OUT_TEST_POOL_18088"
    }

@app.get("/pool-info")
def pool_info():
    """Returns exact status and metadata of the 18,088-row held-out test pool."""
    simulator = get_simulator()
    return simulator.get_pool_info()

class EnterpriseStatusRequest(BaseModel):
    enterprise_id: Optional[str] = None
    status: Optional[str] = None
    offline_enterprises: Optional[List[str]] = None

@app.get("/enterprises/status")
def get_enterprise_statuses():
    simulator = get_simulator()
    return {
        "offline_enterprises": simulator.get_offline_enterprises()
    }

@app.post("/enterprises/status")
def set_enterprise_status_endpoint(req: EnterpriseStatusRequest):
    simulator = get_simulator()
    if req.offline_enterprises is not None:
        simulator.offline_enterprises = set(req.offline_enterprises)
    elif req.enterprise_id and req.status:
        simulator.set_enterprise_status(req.enterprise_id, req.status)
    return {
        "status": "updated",
        "offline_enterprises": simulator.get_offline_enterprises()
    }

@app.post("/reset")
def reset_endpoint():
    """Resets simulator cycle, counters, and flow permutations."""
    simulator = get_simulator()
    simulator.reset()
    return {"status": "reset", "pool_info": simulator.get_pool_info()}

@app.post("/predict")
def predict_endpoint(req: PredictRequest):
    engine = get_engine()
    try:
        result = engine.predict(req.features)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Inference error: {str(e)}")

@app.get("/simulate/next")
def simulate_next_flow():
    """
    Simulates one incoming traffic flow from the 18,088 held-out test pool,
    executes genuine PyTorch inference on features ONLY, and performs
    post-inference audit against ground truth.
    """
    simulator = get_simulator()
    engine = get_engine()

    flow = simulator.get_next_flow()

    # Pass ONLY the 81-feature vector to the model (NO ground truth sent)
    pred_res = engine.predict(flow["features_list"])

    # Extract 5 prominent NetFlow metrics for display
    f_dict = flow["features_dict"]
    key_features = {
        "Flow Duration": f"{f_dict.get('Flow Duration', 0):,.0f} μs",
        "Total Fwd Packets": f"{f_dict.get('Total Fwd Packets', 0):,.0f}",
        "Flow Bytes/s": f"{f_dict.get('Flow Bytes/s', 0):,.1f} B/s",
        "Flow Packets/s": f"{f_dict.get('Flow Packets/s', 0):,.1f} pkts/s",
        "Destination Port": f"{int(f_dict.get('Destination Port', 0))}"
    }

    gt_label = flow["ground_truth_label"]
    predicted_label = pred_res["prediction"]
    is_correct = (predicted_label == gt_label)
    result_str = "CORRECT" if is_correct else "MISCLASSIFIED"

    status = "DETECTED" if predicted_label != "BENIGN" else "NORMAL"

    return {
        "event_id": flow["event_id"],
        "flow_id": flow["flow_id"],
        "timestamp": flow["timestamp"],
        "enterprise_id": flow["enterprise_id"],
        "enterprise_name": flow["enterprise_name"],
        "source": flow["source"],
        "prediction": predicted_label,
        "class_id": pred_res["class_id"],
        "confidence": pred_res["confidence"],
        "probabilities": pred_res["probabilities"],
        "severity": pred_res["severity"],
        "status": status,
        "model": pred_res["model"],
        "inference_mode": pred_res["inference_mode"],
        "key_features": key_features,
        "ground_truth_label": gt_label,
        "ground_truth_class_id": flow["ground_truth_class_id"],
        "ground_truth_evaluation_only": gt_label,
        "correct": is_correct,
        "result": result_str,
        "cycle_info": flow["cycle_info"]
    }

@app.post("/simulate/batch")
def simulate_batch(count: int = 5):
    count = min(max(count, 1), 50)
    events = []
    for _ in range(count):
        events.append(simulate_next_flow())
    return {"count": len(events), "events": events}

# Few-Shot Zero-Day Live Stream Endpoints
FEW_SHOT_POOL_PATH = PROJECT_ROOT / "results" / "few_shot" / "few_shot_live_pool.json"
_few_shot_pools_cache = None

def get_few_shot_pools():
    global _few_shot_pools_cache
    if _few_shot_pools_cache is None and FEW_SHOT_POOL_PATH.exists():
        import json
        with open(FEW_SHOT_POOL_PATH, "r", encoding="utf-8") as f:
            _few_shot_pools_cache = json.load(f)
    return _few_shot_pools_cache or {}

@app.get("/few-shot/stream-info")
def few_shot_stream_info(attack: str = "DrDoS_UDP"):
    pools = get_few_shot_pools()
    # Normalize attack key
    matched_key = None
    for k in pools.keys():
        if k.lower() == attack.lower():
            matched_key = k
            break
    if not matched_key:
        raise HTTPException(status_code=404, detail=f"Attack pool '{attack}' not found")

    p = pools[matched_key]
    return {
        "target": p["target"],
        "total_queries": p["total_queries"],
        "target_queries": p["target_queries"],
        "negative_queries": p["negative_queries"],
        "thresholds": p["thresholds"]
    }

@app.get("/few-shot/next")
def few_shot_next(attack: str = "DrDoS_UDP", method: str = "1-NN", shots: int = 50, index: int = 0):
    pools = get_few_shot_pools()
    matched_key = None
    for k in pools.keys():
        if k.lower() == attack.lower():
            matched_key = k
            break
    if not matched_key:
        raise HTTPException(status_code=404, detail=f"Attack pool '{attack}' not found")

    p = pools[matched_key]
    flows = p["flows"]
    if not flows:
        raise HTTPException(status_code=404, detail="Empty query pool")

    safe_idx = index % len(flows)
    flow = flows[safe_idx]

    config_key = f"{method}_{shots}"
    eval_info = flow["evaluations"].get(config_key)
    if not eval_info:
        # Fallback to first available
        config_key = list(flow["evaluations"].keys())[0]
        eval_info = flow["evaluations"][config_key]

    return {
        "attack": matched_key,
        "method": method,
        "support_size": shots,
        "index": safe_idx + 1,
        "total": len(flows),
        "flow_id": flow["flow_id"],
        "ground_truth_label": flow["label"],
        "is_target_attack": flow["is_target"],
        "latent_norm": flow["latent_norm"],
        "latent_preview": flow["latent_preview"],
        "netflow": flow["netflow"],
        "similarity": eval_info["similarity"],
        "threshold": eval_info["threshold"],
        "is_detected": eval_info["is_detected"],
        "audit_result": eval_info["audit"],
        "confidence_pct": eval_info["confidence_pct"],
        "step_pipeline": {
            "step1_flow": {
                "flow_id": flow["flow_id"],
                "dst_port": flow["netflow"]["destination_port"],
                "duration_ms": flow["netflow"]["flow_duration_ms"],
                "pkts_s": flow["netflow"]["flow_packets_s"],
                "bytes_s": flow["netflow"]["flow_bytes_s"]
            },
            "step2_embedding": {
                "latent_dim": 64,
                "norm": flow["latent_norm"],
                "preview": flow["latent_preview"]
            },
            "step3_similarity": {
                "method": method,
                "support_size": shots,
                "similarity_score": eval_info["similarity"],
                "support_threshold": eval_info["threshold"]
            },
            "step4_detection": {
                "status": "ZERO-DAY ATTACK DETECTED" if eval_info["is_detected"] else "KNOWN / NORMAL TRAFFIC",
                "is_detected": eval_info["is_detected"],
                "audit": eval_info["audit"]
            }
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
