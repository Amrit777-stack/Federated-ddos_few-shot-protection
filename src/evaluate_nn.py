import numpy as np
import torch
from sklearn.metrics import accuracy_score, classification_report


def evaluate_nn(model, X_test, y_test):

    model.eval()

    X_tensor = torch.tensor(
        np.asarray(X_test),
        dtype=torch.float32
    )

    with torch.no_grad():

        output = model(X_tensor)

        predictions = torch.argmax(
            output,
            dim=1
        ).cpu().numpy()

    y_true = np.asarray(y_test)
    accuracy = accuracy_score(
        y_true,
        predictions
    )


    print("Accuracy:", accuracy)

    print(
        classification_report(
            y_true,
            predictions,
            zero_division=0
        )
    )

    return accuracy