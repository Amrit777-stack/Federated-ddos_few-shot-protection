"""
Few-shot adaptation utilities for unseen DDoS attack detection.

This module provides reusable functions for:
1. Extracting 64-dimensional penultimate-layer feature embeddings from DDoSModel.
2. Generating deterministic nested support sets.
3. Computing class prototype centroids.
4. Computing cosine similarities.
5. Scoring queries via Prototype similarity.
6. Scoring queries via 1-Nearest-Support (1-NN) maximum cosine similarity.
7. Deriving decision thresholds strictly from support samples (no query/test leakage).
8. Making open-set binary predictions.
9. Computing standard binary evaluation metrics and per-class false-positive breakdowns.
"""

from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import confusion_matrix


def extract_penultimate_features(
    model: nn.Module,
    X: Union[pd.DataFrame, np.ndarray, torch.Tensor],
    device: Optional[torch.device] = None
) -> torch.Tensor:
    """
    Extracts the 64-dimensional feature representation from the penultimate layer
    (after Linear(128, 64) -> ReLU, prior to the second Dropout and final Linear layer).

    Works directly with the existing DDoSModel architecture without modifying src/model.py.

    Args:
        model: Trained or loaded DDoSModel (nn.Module).
        X: Input feature data (DataFrame, NumPy array, or Torch Tensor).
        device: Torch device (defaults to CPU if not specified).

    Returns:
        torch.Tensor of shape (N, 64) containing penultimate-layer feature embeddings.
    """
    model.eval()
    if isinstance(X, pd.DataFrame):
        X_tensor = torch.tensor(X.to_numpy(), dtype=torch.float32)
    elif isinstance(X, np.ndarray):
        X_tensor = torch.tensor(X, dtype=torch.float32)
    elif isinstance(X, torch.Tensor):
        X_tensor = X.float()
    else:
        raise TypeError(f"Unsupported input type for X: {type(X)}")

    if device is not None:
        X_tensor = X_tensor.to(device)

    # model.network[:5] covers: Linear(81, 128) -> ReLU -> Dropout -> Linear(128, 64) -> ReLU
    with torch.no_grad():
        features = model.network[:5](X_tensor)

    return features.cpu()


def create_nested_support_sets(
    support_pool: pd.DataFrame,
    shot_sizes: Sequence[int] = (10, 20, 50, 100),
    random_state: int = 42
) -> Dict[int, pd.DataFrame]:
    """
    Generates deterministic, nested support subsets from a support pool.

    Strict nested subset containment is guaranteed:
    support_10 ⊂ support_20 ⊂ support_50 ⊂ support_100.

    Args:
        support_pool: DataFrame containing candidate samples for the support pool.
        shot_sizes: Sequence of support sizes to generate (sorted ascending).
        random_state: Random seed for deterministic reproducibility.

    Returns:
        Dict mapping each shot size k -> DataFrame containing k support samples.
    """
    sorted_sizes = sorted(list(shot_sizes))
    max_k = sorted_sizes[-1]
    if len(support_pool) < max_k:
        raise ValueError(
            f"Support pool size ({len(support_pool)}) is smaller than maximum requested shot size ({max_k})."
        )

    # Sample largest required set first, then take prefixes to guarantee strict containment
    base_sample = support_pool.sample(n=max_k, random_state=random_state)
    support_sets = {k: base_sample.iloc[:k] for k in sorted_sizes}

    # Verify nested containment
    for i in range(len(sorted_sizes) - 1):
        k1 = sorted_sizes[i]
        k2 = sorted_sizes[i + 1]
        assert set(support_sets[k1].index).issubset(set(support_sets[k2].index)), (
            f"Nested containment check failed: support_{k1} is not a subset of support_{k2}"
        )

    return support_sets


def compute_prototype(support_embeddings: torch.Tensor) -> torch.Tensor:
    """
    Computes the class prototype as the centroid (mean vector) of support embeddings.

    c_k = (1 / k) * sum_{i=1}^k z_i

    Args:
        support_embeddings: Tensor of shape (k, D) with support embeddings.

    Returns:
        Tensor of shape (D,) representing the mean prototype vector.
    """
    if support_embeddings.dim() != 2:
        raise ValueError(
            f"Expected support_embeddings to have 2 dimensions (k, D), got {support_embeddings.shape}"
        )
    return support_embeddings.mean(dim=0)


def compute_cosine_similarity(
    query_embeddings: torch.Tensor,
    reference_embeddings: torch.Tensor
) -> torch.Tensor:
    """
    Computes cosine similarity between query embeddings and reference embeddings.

    Args:
        query_embeddings: Tensor of shape (N, D).
        reference_embeddings: Tensor of shape (D,) or (1, D) for 1-to-1, or (M, D) for pairwise.

    Returns:
        If reference is (D,) or (1, D): Tensor of shape (N,) containing cosine similarities.
        If reference is (M, D): Tensor of shape (N, M) containing cosine similarity matrix.
    """
    if reference_embeddings.dim() == 1:
        return F.cosine_similarity(query_embeddings, reference_embeddings.unsqueeze(0), dim=1)
    elif reference_embeddings.dim() == 2 and reference_embeddings.shape[0] == 1:
        return F.cosine_similarity(query_embeddings, reference_embeddings, dim=1)
    elif reference_embeddings.dim() == 2:
        q_norm = F.normalize(query_embeddings, p=2, dim=1)
        r_norm = F.normalize(reference_embeddings, p=2, dim=1)
        return torch.mm(q_norm, r_norm.t())
    else:
        raise ValueError(f"Unsupported reference_embeddings shape: {reference_embeddings.shape}")


def score_prototype_similarity(
    query_embeddings: torch.Tensor,
    prototype: torch.Tensor
) -> torch.Tensor:
    """
    Computes cosine similarity of each query embedding to the class prototype.

    Args:
        query_embeddings: Tensor of shape (N, D).
        prototype: Tensor of shape (D,) or (1, D).

    Returns:
        Tensor of shape (N,) containing similarity scores in range [-1.0, 1.0].
    """
    if prototype.dim() == 1:
        proto_vec = prototype.unsqueeze(0)
    else:
        proto_vec = prototype
    return F.cosine_similarity(query_embeddings, proto_vec, dim=1)


def score_1nn_similarity(
    query_embeddings: torch.Tensor,
    support_embeddings: torch.Tensor
) -> torch.Tensor:
    """
    Computes 1-Nearest-Support (1-NN) similarity for each query embedding.
    The score is the maximum cosine similarity to any support exemplar:
        s(z^{query}) = max_{j in {1, ..., k}} cos(z^{query}, z_j^{supp})

    Args:
        query_embeddings: Tensor of shape (N, D).
        support_embeddings: Tensor of shape (k, D).

    Returns:
        Tensor of shape (N,) containing the maximum cosine similarity to any support exemplar.
    """
    q_norm = F.normalize(query_embeddings, p=2, dim=1)
    s_norm = F.normalize(support_embeddings, p=2, dim=1)
    # (N, D) x (D, k) -> (N, k)
    sim_matrix = torch.mm(q_norm, s_norm.t())
    max_sims, _ = torch.max(sim_matrix, dim=1)
    return max_sims


def compute_prototype_threshold(
    support_embeddings: torch.Tensor,
    prototype: Optional[torch.Tensor] = None,
    std_multiplier: float = 2.0
) -> Dict[str, float]:
    """
    Computes decision threshold for prototype classifier derived strictly from support data.

    Formula:
        tau = clip(mu_{support} - std_multiplier * sigma_{support}, -1.0, 1.0)
    where mu_{support} and sigma_{support} are the mean and std dev of cosine similarities
    between individual support vectors and their centroid prototype.

    Args:
        support_embeddings: Tensor of shape (k, D) with support embeddings.
        prototype: Optional precomputed prototype (D,). If None, computed automatically.
        std_multiplier: Multiplier for standard deviation (default: 2.0).

    Returns:
        Dict with keys:
            - 'threshold': float, clipped decision threshold in [-1.0, 1.0].
            - 'mean': float, mean cosine similarity within support set.
            - 'std': float, standard deviation of cosine similarity within support set.
            - 'prototype_norm': float, L2 norm of prototype vector.
    """
    if prototype is None:
        prototype = compute_prototype(support_embeddings)

    s_sims = F.cosine_similarity(support_embeddings, prototype.unsqueeze(0), dim=1)
    s_mean = s_sims.mean().item()
    s_std = s_sims.std().item()
    threshold = float(np.clip(s_mean - std_multiplier * s_std, -1.0, 1.0))
    proto_norm = torch.norm(prototype).item()

    return {
        "threshold": threshold,
        "mean": s_mean,
        "std": s_std,
        "prototype_norm": proto_norm
    }


def compute_1nn_threshold(
    support_embeddings: torch.Tensor,
    std_multiplier: float = 2.0
) -> Dict[str, float]:
    """
    Computes decision threshold for 1-NN classifier using Leave-One-Out (LOO) support similarities.

    For each support exemplar i, we find its highest cosine similarity to the remaining k-1 support exemplars
    (diagonal self-similarities are masked out to prevent self-matching bias):
        loo_max_i = max_{j != i} cos(z_i, z_j)
        tau_{1NN} = clip(mu_{LOO} - std_multiplier * sigma_{LOO}, -1.0, 1.0)

    Args:
        support_embeddings: Tensor of shape (k, D) with support embeddings.
        std_multiplier: Multiplier for standard deviation subtraction (default: 2.0).

    Returns:
        Dict with keys:
            - 'threshold': float, clipped decision threshold in [-1.0, 1.0].
            - 'mean': float, mean LOO nearest-neighbor similarity.
            - 'std': float, standard deviation of LOO nearest-neighbor similarities.
    """
    k = support_embeddings.shape[0]
    s_norm = F.normalize(support_embeddings, p=2, dim=1)
    sim_matrix = torch.mm(s_norm, s_norm.t())

    # Mask diagonal self-similarities
    diag_mask = torch.eye(k, dtype=torch.bool, device=support_embeddings.device)
    sim_matrix_loo = sim_matrix.masked_fill(diag_mask, -1e9)

    loo_max, _ = torch.max(sim_matrix_loo, dim=1)
    loo_mean = loo_max.mean().item()
    loo_std = loo_max.std().item()
    threshold = float(np.clip(loo_mean - std_multiplier * loo_std, -1.0, 1.0))

    return {
        "threshold": threshold,
        "mean": loo_mean,
        "std": loo_std
    }


def compute_support_threshold(
    support_embeddings: torch.Tensor,
    method: str = "1-NN",
    std_multiplier: float = 2.0,
    prototype: Optional[torch.Tensor] = None
) -> Dict[str, float]:
    """
    Unified helper to compute support-only threshold for either 'prototype' or '1-NN'.

    Args:
        support_embeddings: Tensor of shape (k, D).
        method: Method name, either '1-NN' or 'prototype' (case-insensitive).
        std_multiplier: Multiplier for standard deviation (default: 2.0).
        prototype: Optional precomputed prototype (used only if method='prototype').

    Returns:
        Dict containing threshold info.
    """
    m = method.strip().upper()
    if m in ("PROTOTYPE", "PROTO"):
        return compute_prototype_threshold(support_embeddings, prototype=prototype, std_multiplier=std_multiplier)
    elif m in ("1-NN", "1NN", "KNN"):
        return compute_1nn_threshold(support_embeddings, std_multiplier=std_multiplier)
    else:
        raise ValueError(f"Unknown method '{method}'. Supported methods: '1-NN', 'prototype'.")


def predict_from_scores(
    scores: Union[torch.Tensor, np.ndarray],
    threshold: float
) -> np.ndarray:
    """
    Converts continuous similarity scores into binary predictions based on decision threshold:
        y_hat = 1 if score >= threshold else 0

    Args:
        scores: Tensor or NumPy array of similarity scores.
        threshold: Decision threshold.

    Returns:
        NumPy integer array of binary predictions (1 = positive/unseen, 0 = negative).
    """
    if isinstance(scores, torch.Tensor):
        return (scores >= threshold).cpu().numpy().astype(int)
    return (np.asarray(scores) >= threshold).astype(int)


def predict_few_shot(
    query_embeddings: torch.Tensor,
    support_embeddings: torch.Tensor,
    method: str = "1-NN",
    threshold: Optional[float] = None,
    std_multiplier: float = 2.0
) -> Tuple[np.ndarray, torch.Tensor, float]:
    """
    End-to-end few-shot prediction for query embeddings.

    Args:
        query_embeddings: Tensor of shape (N, D).
        support_embeddings: Tensor of shape (k, D).
        method: '1-NN' (primary) or 'prototype' (comparison).
        threshold: Optional preset threshold. If None, computed strictly from support data.
        std_multiplier: Multiplier if threshold needs to be computed.

    Returns:
        Tuple of:
            - binary_predictions: NumPy array of shape (N,) with values in {0, 1}.
            - scores: Tensor of shape (N,) with similarity scores.
            - threshold: float, threshold value applied.
    """
    m = method.strip().upper()
    if m in ("PROTOTYPE", "PROTO"):
        proto = compute_prototype(support_embeddings)
        scores = score_prototype_similarity(query_embeddings, proto)
        if threshold is None:
            t_info = compute_prototype_threshold(support_embeddings, prototype=proto, std_multiplier=std_multiplier)
            threshold = t_info["threshold"]
    elif m in ("1-NN", "1NN", "KNN"):
        scores = score_1nn_similarity(query_embeddings, support_embeddings)
        if threshold is None:
            t_info = compute_1nn_threshold(support_embeddings, std_multiplier=std_multiplier)
            threshold = t_info["threshold"]
    else:
        raise ValueError(f"Unknown method '{method}'. Supported: '1-NN', 'prototype'.")

    preds = predict_from_scores(scores, threshold)
    return preds, scores, threshold


def compute_binary_classification_metrics(
    y_true: Union[np.ndarray, Sequence[int]],
    y_pred: Union[np.ndarray, Sequence[int]]
) -> Dict[str, float]:
    """
    Computes standard open-set binary classification performance metrics.

    Args:
        y_true: Ground truth binary labels (1 = positive unseen class, 0 = negative).
        y_pred: Predicted binary labels (1 = positive unseen class, 0 = negative).

    Returns:
        Dict with keys:
            - TP, TN, FP, FN: integer confusion matrix counts.
            - accuracy, precision, recall, f1: standard classification scores in [0.0, 1.0].
            - false_positive_rate (or fpr): false alarm rate on negative samples.
            - specificity: true negative rate on negative samples.
    """
    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = [int(v) for v in cm.ravel()]
    total = tp + tn + fp + fn

    accuracy = (tp + tn) / float(total) if total > 0 else 0.0
    precision = tp / float(tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / float(tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2.0 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    fpr = fp / float(fp + tn) if (fp + tn) > 0 else 0.0
    specificity = tn / float(tn + fp) if (tn + fp) > 0 else 0.0

    return {
        "TP": tp,
        "TN": tn,
        "FP": fp,
        "FN": fn,
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "false_positive_rate": fpr,
        "fpr": fpr,
        "specificity": specificity
    }


def compute_per_negative_class_breakdown(
    y_true_orig: Sequence[Any],
    y_pred: np.ndarray,
    negative_classes: Sequence[Any]
) -> List[Dict[str, Any]]:
    """
    Computes the false positive count and rate for each individual negative class.

    Args:
        y_true_orig: Original multiclass labels for the evaluation samples.
        y_pred: Predicted binary labels (1 = predicted unseen, 0 = predicted negative).
        negative_classes: List/sequence of negative class names to analyze.

    Returns:
        List of dicts, each containing:
            - 'class': name of class
            - 'total': total samples belonging to this negative class
            - 'fp': count of samples incorrectly flagged as unseen class
            - 'fpr': false positive rate for this specific class (fp / total)
    """
    y_true_arr = np.asarray(y_true_orig)
    breakdown = []
    for c in negative_classes:
        mask = (y_true_arr == c)
        c_total = int(mask.sum())
        if c_total > 0:
            c_fp = int((y_pred[mask] == 1).sum())
            c_fpr = c_fp / float(c_total)
        else:
            c_fp = 0
            c_fpr = 0.0
        breakdown.append({
            "class": c,
            "total": c_total,
            "fp": c_fp,
            "fpr": c_fpr
        })
    return breakdown

