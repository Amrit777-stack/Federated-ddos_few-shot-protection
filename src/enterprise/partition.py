import numpy as np
import pandas as pd


PROFILES = {
    "BENIGN": [0.25, 0.20, 0.20, 0.20, 0.15],
    "DrDoS_DNS": [0.70, 0.30, 0.00, 0.00, 0.00],
    "DrDoS_LDAP": [0.70, 0.30, 0.00, 0.00, 0.00],
    "DrDoS_MSSQL": [0.00, 0.00, 0.70, 0.30, 0.00],
    "DrDoS_NetBIOS": [0.00, 0.00, 0.30, 0.70, 0.00],
    "DrDoS_NTP": [0.00, 0.70, 0.30, 0.00, 0.00],
    "DrDoS_SNMP": [0.00, 0.00, 0.00, 0.70, 0.30],
    "DrDoS_SSDP": [0.00, 0.70, 0.00, 0.00, 0.30],
    "DrDoS_UDP": [0.00, 0.00, 0.70, 0.00, 0.30],
    "Syn": [0.00, 0.00, 0.70, 0.30, 0.00],
    "TFTP": [0.30, 0.00, 0.00, 0.00, 0.70],
    "UDP-lag": [0.00, 0.30, 0.00, 0.00, 0.70],
    "WebDDoS": [0.00, 0.00, 0.00, 0.32, 0.68]
}


def partition_data(train_dataset, random_state=42):
    enterprises = {
        "enterprise_1": [],
        "enterprise_2": [],
        "enterprise_3": [],
        "enterprise_4": [],
        "enterprise_5": []
    }

    for label, proportions in PROFILES.items():
        label_data = train_dataset[
            train_dataset["Label"] == label
        ].copy()

        label_data = label_data.sample(
            frac=1,
            random_state=random_state
        )

        total = len(label_data)

        raw_counts = total * np.array(proportions)
        counts = np.floor(raw_counts).astype(int)

        remainder = total - counts.sum()

        fractions = raw_counts - counts
        order = np.argsort(-fractions)

        for i in order[:remainder]:
            counts[i] += 1

        start = 0

        for i, count in enumerate(counts):
            end = start + count

            selected_data = label_data.iloc[start:end]

            if len(selected_data) > 0:
                enterprises[f"enterprise_{i + 1}"].append(
                    selected_data
                )

            start = end

    for enterprise in enterprises:
        enterprises[enterprise] = pd.concat(
            enterprises[enterprise],
            ignore_index=False
        )

    return enterprises


def validate_partition(train_dataset, enterprises):
    original_count = len(train_dataset)

    all_indices = []

    for data in enterprises.values():
        all_indices.extend(data.index.tolist())

    partitioned_count = len(all_indices)
    unique_count = len(set(all_indices))

    print("Original training samples:", original_count)
    print("Partitioned samples:", partitioned_count)
    print("No overlapping samples:", unique_count == partitioned_count)
    print("All samples assigned:", partitioned_count == original_count)

    return (
        unique_count == partitioned_count
        and partitioned_count == original_count
    )