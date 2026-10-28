import copy
from typing import Any, Dict, Optional, Tuple, Union
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

try:
    from src.model import DDoSModel
except (ImportError, ModuleNotFoundError):
    from model import DDoSModel


class FederatedClient:
    """
    Federated client representing an enterprise network node.
    
    Trains a local copy of DDoSModel on its own non-IID partition
    without transmitting any raw packet data to the central server.
    """

    def __init__(
        self,
        client_id: Optional[str] = None,
        learning_rate: float = 0.001,
        batch_size: int = 256,
        mu: float = 0.0,
        device: Optional[Union[str, torch.device]] = None,
        num_classes: int = 13
    ):
        self.client_id = client_id or "client"
        self.learning_rate = learning_rate
        self.batch_size = batch_size
        self.mu = mu
        self.device = device or torch.device("cpu")
        self.num_classes = num_classes

    def train(
        self,
        global_state_dict: Dict[str, torch.Tensor],
        X_local: Any,
        y_local: Any,
        epochs: int = 1,
        mu: Optional[float] = None
    ) -> Tuple[Dict[str, torch.Tensor], int, float]:
        """
        Train local model starting from the current global model state.

        Supports standard FedAvg (mu=0.0) and FedProx (mu > 0.0) with proximal regularization:
            total_loss = CrossEntropyLoss + (mu / 2) * sum((local_param - global_param)^2)

        Args:
            global_state_dict: Dictionary of global model parameters.
            X_local: Local feature dataset (DataFrame or ndarray, shape (N_k, 81)).
            y_local: Local encoded integer labels (Series, ndarray, or list, shape (N_k,)).
            epochs: Number of local training epochs (default: 1).
            mu: Proximal regularization parameter. If None, defaults to self.mu.

        Returns:
            updated_state_dict: State dict containing locally updated parameters (on CPU).
            sample_count: Number of local training samples (N_k).
            avg_loss: Average training loss across batches during the final local epoch.
        """
        effective_mu = self.mu if mu is None else mu

        # 1. Instantiate local model and initialize with current global state
        out_classes = (
            global_state_dict["network.6.weight"].shape[0]
            if "network.6.weight" in global_state_dict
            else self.num_classes
        )
        local_model = DDoSModel(num_classes=out_classes).to(self.device)
        local_model.load_state_dict(copy.deepcopy(global_state_dict))
        local_model.train()

        # Keep fixed copy of global parameters for FedProx proximal regularization
        fixed_global_params = {}
        if effective_mu > 0.0:
            fixed_global_params = {
                name: param.detach().clone().to(self.device)
                for name, param in local_model.named_parameters()
            }

        # 2. Convert local data to PyTorch tensors safely using np.asarray
        X_tensor = torch.tensor(np.asarray(X_local), dtype=torch.float32)
        y_tensor = torch.tensor(np.asarray(y_local), dtype=torch.long)
        sample_count = len(X_tensor)

        if sample_count == 0:
            raise ValueError(f"Client '{self.client_id}' received an empty local dataset.")

        dataset = TensorDataset(X_tensor, y_tensor)
        loader = DataLoader(
            dataset,
            batch_size=self.batch_size,
            shuffle=True
        )

        # 3. Setup optimizer and loss function
        criterion = nn.CrossEntropyLoss()
        optimizer = torch.optim.Adam(
            local_model.parameters(),
            lr=self.learning_rate
        )

        # 4. Local training loop
        avg_loss = 0.0
        for _ in range(epochs):
            total_loss = 0.0
            for X_batch, y_batch in loader:
                X_batch = X_batch.to(self.device)
                y_batch = y_batch.to(self.device)

                optimizer.zero_grad()
                output = local_model(X_batch)
                loss = criterion(output, y_batch)

                # FedProx proximal regularization: (mu / 2) * sum((w - w_t)^2)
                if effective_mu > 0.0:
                    proximal_term = torch.tensor(0.0, device=self.device)
                    for name, param in local_model.named_parameters():
                        proximal_term = proximal_term + torch.sum((param - fixed_global_params[name]) ** 2)
                    loss = loss + (effective_mu / 2.0) * proximal_term

                loss.backward()
                optimizer.step()

                total_loss += loss.item()

            avg_loss = total_loss / len(loader) if len(loader) > 0 else 0.0

        # 5. Extract updated weights to CPU (never expose raw data)
        updated_state_dict = {
            k: v.detach().cpu().clone()
            for k, v in local_model.state_dict().items()
        }

        return updated_state_dict, sample_count, avg_loss

