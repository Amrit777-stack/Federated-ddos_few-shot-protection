# SENTINEL-FL: Live ML Inference Service

This service provides real-time PyTorch model inference and realistic network-flow replay simulation for the SENTINEL-FL SOC Dashboard.

> **Operational Scope & Context:**  
> The live SOC mode replays network-flow records from the CICDDoS2019-derived experimental dataset through the trained PyTorch model to simulate real-time detection within a simulated enterprise environment. It does not monitor a real enterprise network or execute actual firewall reconfigurations.

---

## 1. Model & Checkpoint Specifications

- **Model Architecture:** `DDoSModel` (Multilayer Perceptron defined in `src/model.py`)
  - Input Layer: `Linear(81, 128)` -> `ReLU` -> `Dropout(0.2)`
  - Hidden Layer: `Linear(128, 64)` -> `ReLU` -> `Dropout(0.2)`
  - Output Layer: `Linear(64, 13)`
- **Trained Checkpoint Used:** `results/federated/run_010_20_rounds/model_G20.pth`
  - Global federated backbone trained using **FedProx** ($\mu = 0.1$) across 5 non-IID enterprise clients for 20 rounds.
- **Evaluation Mode:** The model runs in `torch.no_grad()` evaluation mode on CPU.

---

## 2. Input Features & Preprocessing Pipeline

- **Feature Count:** Exactly **81 network flow features** (e.g. `Flow Duration`, `Total Fwd Packets`, `Flow Bytes/s`, `Fwd Packet Length Mean`, `Destination Port`).
- **Feature Normalization:** Standardized using `StandardScaler` calibrated strictly on the training partition (`random_state=42`).
- **Feature Schema:** Documented in [`feature_schema.json`](./feature_schema.json).

---

## 3. Label Encoding & Output Classes

Predictions are mapped directly to the project's canonical 13-class mapping:

| Class ID | Attack Label | Description |
|---|---|---|
| 0 | `BENIGN` | Normal background network traffic |
| 1 | `DrDoS_DNS` | DNS amplification reflection flood |
| 2 | `DrDoS_LDAP` | LDAP connectionless reflection flood |
| 3 | `DrDoS_MSSQL` | Microsoft SQL Server reflection flood |
| 4 | `DrDoS_NTP` | NTP monlist amplification flood |
| 5 | `DrDoS_NetBIOS` | NetBIOS name service reflection flood |
| 6 | `DrDoS_SNMP` | SNMP reflection amplification flood |
| 7 | `DrDoS_SSDP` | Simple Service Discovery Protocol reflection |
| 8 | `DrDoS_UDP` | UDP volumetric reflection flood |
| 9 | `Syn` | TCP SYN half-open connection flood |
| 10 | `TFTP` | Trivial File Transfer Protocol reflection |
| 11 | `UDP-lag` | UDP lag/burst game/media disruption flood |
| 12 | `WebDDoS` | Layer 7 HTTP/Web resource exhaustion flood |

---

## 4. API Endpoints

### `GET /health`
Returns service status, model checkpoint, and class count:
```json
{
  "status": "online",
  "service": "sentinel-fl-ml-service",
  "model": "FedProx-G20",
  "classes": 13,
  "input_features": 81,
  "environment": "SIMULATED ENTERPRISE ENVIRONMENT",
  "inference_mode": "LIVE_ML_INFERENCE"
}
```

### `POST /predict`
Performs genuine PyTorch inference on an 81-feature vector:
```json
{
  "features": [53, 49210, 17, 1204892, ...]
}
```
**Response:**
```json
{
  "prediction": "DrDoS_UDP",
  "class_id": 8,
  "confidence": 0.9682,
  "probabilities": { ... },
  "severity": "CRITICAL",
  "model": "FedProx-G20",
  "inference_mode": "LIVE_ML_INFERENCE"
}
```

### `GET /simulate/next`
Replays a genuine dataset row from `data/processed/ddos_sample.csv`, routes it according to the enterprise's non-IID Dirichlet profile, and executes real PyTorch inference.

---

## 5. Traffic Simulator & Enterprise Non-IID Routing

- Real network flows are sampled from `data/processed/ddos_sample.csv`.
- Each flow is dynamically routed to one of the 5 simulated enterprises (`E1`, `E2`, `E3`, `E4`, `E5`) based on the Non-IID profile matrix defined in `src/enterprise/partition.py`.
- The ground-truth label is preserved **only for evaluation/audit** and is never passed to the model.

---

## 6. How to Start

From the project root:
```bash
# Using the project's virtual environment:
.\venv\Scripts\python.exe ml_service/app.py
```
Service runs on: `http://127.0.0.1:8000`

