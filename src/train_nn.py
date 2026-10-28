import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

try:
    from src.model import DDoSModel
except (ImportError, ModuleNotFoundError):
    from model import DDoSModel


def train_model(X_train, y_train, epochs=10, batch_size=256, learning_rate=0.001, model=None):

    if model is None:
        model = DDoSModel()

    X_tensor = torch.tensor(np.asarray(X_train), dtype=torch.float32)
    y_tensor = torch.tensor(np.asarray(y_train), dtype=torch.long)

    dataset = TensorDataset(X_tensor, y_tensor)
    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True
    )

    criterion = nn.CrossEntropyLoss()

    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=learning_rate
    )

    model.train()

    for epoch in range(epochs):

        total_loss = 0

        for X_batch, y_batch in loader:

            optimizer.zero_grad()

            output = model(X_batch)

            loss = criterion(output, y_batch)

            loss.backward()

            optimizer.step()

            total_loss += loss.item()

        print(
            f"Epoch {epoch + 1}/{epochs} "
            f"Loss: {total_loss / len(loader):.4f}"
        )

    return model