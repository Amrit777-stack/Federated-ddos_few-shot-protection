import copy
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

try:
    from src.model import DDoSModel
    from src.preprocessing import prepare_data, load_dataset, clean_dataset
    from src.enterprise.partition import partition_data, validate_partition
    from src.federated.client import FederatedClient
except (ImportError, ModuleNotFoundError):
    from model import DDoSModel
    from preprocessing import prepare_data, load_dataset, clean_dataset
    from enterprise.partition import partition_data, validate_partition
    from federated.client import FederatedClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def fedavg(
    client_states: List[Dict[str, torch.Tensor]],
    sample_counts: List[int]
) -> Dict[str, torch.Tensor]:
    """
    Performs sample-weighted Federated Averaging (FedAvg).

    Formula:
        G_new = sum_{k=1}^K (n_k / N) * G_k

    where:
        n_k = number of training samples at client k
        N = total samples across all K clients
        G_k = model parameter dictionary from client k
    """
    if len(client_states) != len(sample_counts):
        raise ValueError("Mismatch between number of client states and sample counts.")

    total_samples = sum(sample_counts)
    if total_samples <= 0:
        raise ValueError(f"Total sample count must be positive, got {total_samples}")

    aggregated_state: Dict[str, torch.Tensor] = {}
    reference_state = client_states[0]

    for key in reference_state.keys():
        weighted_sum = None
        for state, n_k in zip(client_states, sample_counts):
            weight = float(n_k) / float(total_samples)
            param = state[key].float()

            if weighted_sum is None:
                weighted_sum = weight * param
            else:
                weighted_sum += weight * param

        aggregated_state[key] = weighted_sum.to(reference_state[key].dtype)

    return aggregated_state


def evaluate_global_model(
    model: nn.Module,
    X_test: Any,
    y_test: Any,
    device: Optional[torch.device] = None
) -> Dict[str, float]:
    """
    Evaluates global model on the untouched test set.
    """
    device = device or torch.device("cpu")
    model.eval()
    model.to(device)

    X_tensor = torch.tensor(np.asarray(X_test), dtype=torch.float32).to(device)
    y_tensor = torch.tensor(np.asarray(y_test), dtype=torch.long).to(device)
    y_true = np.asarray(y_test)

    criterion = nn.CrossEntropyLoss()

    with torch.no_grad():
        output = model(X_tensor)
        loss = criterion(output, y_tensor).item()
        predictions = torch.argmax(output, dim=1).cpu().numpy()

    accuracy = float(accuracy_score(y_true, predictions))
    precision = float(precision_score(y_true, predictions, average="weighted", zero_division=0))
    recall = float(recall_score(y_true, predictions, average="weighted", zero_division=0))
    f1 = float(f1_score(y_true, predictions, average="weighted", zero_division=0))

    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "loss": float(loss)
    }


def get_next_run_dir(base_dir: Path) -> Tuple[Path, str]:
    """
    Finds the next sequential run directory (e.g. run_001, run_002) so
    prior experiments are never overwritten.
    """
    base_dir.mkdir(parents=True, exist_ok=True)
    existing_nums = []
    for item in base_dir.iterdir():
        if item.is_dir() and item.name.startswith("run_"):
            try:
                num = int(item.name.split("_")[1])
                existing_nums.append(num)
            except (IndexError, ValueError):
                continue

    next_num = max(existing_nums) + 1 if existing_nums else 1
    run_name = f"run_{next_num:03d}"
    run_dir = base_dir / run_name
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir, run_name


class FederatedServer:
    """
    Central Federated Learning coordinator orchestrating FedAvg across
    heterogeneous enterprise clients.
    """

    def __init__(
        self,
        rounds: int = 10,
        local_epochs: int = 1,
        learning_rate: float = 0.001,
        batch_size: int = 256,
        mu: float = 0.0,
        algorithm: str = "fedavg",
        results_dir: Optional[Path] = None,
        run_name: Optional[str] = None,
        random_state: int = 42,
        device: Optional[torch.device] = None
    ):
        self.rounds = rounds
        self.local_epochs = local_epochs
        self.learning_rate = learning_rate
        self.batch_size = batch_size
        self.mu = mu
        if algorithm.lower() == "fedprox" and self.mu == 0.0:
            self.mu = 0.01
        self.algorithm = "FedProx" if self.mu > 0.0 else "FedAvg"
        self.random_state = random_state
        self.results_dir = results_dir or (PROJECT_ROOT / "results" / "federated")
        self.run_name = run_name
        self.device = device or torch.device("cpu")

    def run(self) -> Dict[str, Any]:
        """
        Executes the full Federated Learning simulation.
        """
        if self.run_name is not None:
            run_name = self.run_name
            run_dir = self.results_dir / run_name
            run_dir.mkdir(parents=True, exist_ok=True)
        else:
            run_dir, run_name = get_next_run_dir(self.results_dir)

        print("==================================================")
        print("FEDERATED LEARNING EXPERIMENT")
        print("==================================================")
        print()
        print(f"Run: {run_name}")
        print(f"Algorithm: {self.algorithm}")
        if self.mu > 0.0:
            print(f"mu: {self.mu}")
        print("Clients: 5")
        print(f"Rounds: {self.rounds}")
        print(f"Local epochs: {self.local_epochs}")
        print()

        # 1. Load data pipeline
        X_train, X_test, y_train, y_test, encoder, scaler = prepare_data()

        # 2. Reconstruct train_dataset with string labels for partition_data
        dataset = clean_dataset(load_dataset())
        raw_labels = dataset.loc[X_train.index, "Label"]

        train_dataset = X_train.copy()
        train_dataset["Label"] = raw_labels

        enterprises = partition_data(train_dataset, random_state=self.random_state)
        is_valid = validate_partition(train_dataset, enterprises)
        if not is_valid:
            raise RuntimeError("Enterprise data partition validation failed!")

        # 3. Create fresh randomly initialized global model G0
        print("Initializing fresh global model: G0")
        torch.manual_seed(self.random_state)
        np.random.seed(self.random_state)
        global_model = DDoSModel().to(self.device)

        # 4. Prepare clients and local data
        enterprise_keys = [f"enterprise_{i}" for i in range(1, 6)]
        clients = {
            k: FederatedClient(
                client_id=k,
                learning_rate=self.learning_rate,
                batch_size=self.batch_size,
                mu=self.mu,
                device=self.device
            )
            for k in enterprise_keys
        }

        # Cache local datasets for each client
        local_data = {}
        for k in enterprise_keys:
            df = enterprises[k]
            X_loc = df.drop(columns=["Label"])
            y_loc = encoder.transform(df["Label"])
            local_data[k] = (X_loc, y_loc)

        round_history: List[Dict[str, Any]] = []

        # 5. Execute Federated Learning rounds
        for r in range(1, self.rounds + 1):
            print()
            print("--------------------------------------------------")
            print(f"Round {r}")
            print("--------------------------------------------------")

            current_global_state = {
                k: v.detach().cpu().clone()
                for k, v in global_model.state_dict().items()
            }

            client_states: List[Dict[str, torch.Tensor]] = []
            client_counts: List[int] = []

            for idx, k in enumerate(enterprise_keys, start=1):
                X_loc, y_loc = local_data[k]
                client = clients[k]

                # Local training starting from current global state
                updated_state, count, loss = client.train(
                    current_global_state,
                    X_loc,
                    y_loc,
                    epochs=self.local_epochs
                )

                print(f"Enterprise {idx} local samples: {count}")
                client_states.append(updated_state)
                client_counts.append(count)

            # Perform weighted FedAvg aggregation: G_new = sum (n_k / N) * G_k
            new_global_state = fedavg(client_states, client_counts)
            global_model.load_state_dict(new_global_state)

            print()
            print(f"{self.algorithm} completed -> G{r}")

            # Evaluate global model on untouched 18,088-sample test set
            eval_metrics = evaluate_global_model(
                global_model,
                X_test,
                y_test,
                device=self.device
            )

            print(f"Global Test Accuracy: {eval_metrics['accuracy']:.4f}")
            print(f"Global Test F1:       {eval_metrics['f1']:.4f}")

            round_entry = {
                "round": r,
                "accuracy": eval_metrics["accuracy"],
                "precision": eval_metrics["precision"],
                "recall": eval_metrics["recall"],
                "f1": eval_metrics["f1"],
                "loss": eval_metrics["loss"]
            }
            round_history.append(round_entry)

        # 6. Final Evaluation and Artifact Saving
        final_metrics = round_history[-1]

        print()
        print("==================================================")
        print("FINAL RESULT")
        print("==================================================")
        print()
        print(f"G{self.rounds} Accuracy:  {final_metrics['accuracy']:.4f}")
        print(f"G{self.rounds} Precision: {final_metrics['precision']:.4f}")
        print(f"G{self.rounds} Recall:    {final_metrics['recall']:.4f}")
        print(f"G{self.rounds} F1:        {final_metrics['f1']:.4f}")
        print()
        print("Results saved to:")
        print(f"{run_dir.relative_to(PROJECT_ROOT)}/")

        # Save metrics.json
        summary = {
            "run": run_name,
            "algorithm": self.algorithm,
            "clients": len(enterprise_keys),
            "number_of_clients": len(enterprise_keys),
            "rounds": self.rounds,
            "local_epochs": self.local_epochs,
            "learning_rate": self.learning_rate,
            "batch_size": self.batch_size,
            "mu": self.mu,
            "random_seed": self.random_state,
            "final_model": f"model_G{self.rounds}.pth",
            "test_samples": len(X_test),
            "final_metrics": final_metrics
        }
        with open(run_dir / "metrics.json", "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=4)

        # Save round_history.json
        with open(run_dir / "round_history.json", "w", encoding="utf-8") as f:
            json.dump(round_history, f, indent=4)

        # Save final global model
        torch.save(
            global_model.state_dict(),
            run_dir / f"model_G{self.rounds}.pth"
        )

        return {
            "run_dir": run_dir,
            "run_name": run_name,
            "round_history": round_history,
            "final_metrics": final_metrics,
            "global_model": global_model
        }


def run_federated_learning(
    rounds: int = 10,
    local_epochs: int = 1,
    mu: float = 0.0,
    algorithm: str = "fedavg",
    run_name: Optional[str] = None
) -> Dict[str, Any]:
    """Convenience function to run federated learning with specified parameters."""
    server = FederatedServer(
        rounds=rounds,
        local_epochs=local_epochs,
        mu=mu,
        algorithm=algorithm,
        run_name=run_name
    )
    return server.run()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run Federated Learning simulation")
    parser.add_argument("--rounds", type=int, default=10, help="Number of FL rounds (default: 10)")
    parser.add_argument("--local-epochs", type=int, default=1, help="Number of local epochs per round (default: 1)")
    parser.add_argument("--mu", type=float, default=0.0, help="FedProx proximal regularization mu (default: 0.0)")
    parser.add_argument("--algorithm", type=str, default="fedavg", choices=["fedavg", "fedprox"], help="FL algorithm (default: fedavg)")
    parser.add_argument("--run-name", type=str, default=None, help="Explicit run name directory (e.g. run_004_mu_0.001)")
    args = parser.parse_args()
    run_federated_learning(
        rounds=args.rounds,
        local_epochs=args.local_epochs,
        mu=args.mu,
        algorithm=args.algorithm,
        run_name=args.run_name
    )
