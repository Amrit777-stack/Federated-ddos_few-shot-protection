"""
Few-shot adaptation module for unseen DDoS attack classification.
"""

from src.few_shot.adaptation import (
    extract_penultimate_features,
    create_nested_support_sets,
    compute_prototype,
    compute_cosine_similarity,
    score_prototype_similarity,
    score_1nn_similarity,
    compute_prototype_threshold,
    compute_1nn_threshold,
    compute_support_threshold,
    predict_from_scores,
    predict_few_shot,
    compute_binary_classification_metrics,
    compute_per_negative_class_breakdown,
)

__all__ = [
    "extract_penultimate_features",
    "create_nested_support_sets",
    "compute_prototype",
    "compute_cosine_similarity",
    "score_prototype_similarity",
    "score_1nn_similarity",
    "compute_prototype_threshold",
    "compute_1nn_threshold",
    "compute_support_threshold",
    "predict_from_scores",
    "predict_few_shot",
    "compute_binary_classification_metrics",
    "compute_per_negative_class_breakdown",
]

