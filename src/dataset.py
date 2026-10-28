import os
import pandas as pd

def create_dataset(data_path, files, target_per_class=1000):
    samples = []

    target_labels = {
        "BENIGN",
        "DrDoS_DNS",
        "DrDoS_LDAP",
        "DrDoS_MSSQL",
        "DrDoS_NetBIOS",
        "DrDoS_NTP",
        "DrDoS_SNMP",
        "DrDoS_SSDP",
        "DrDoS_UDP",
        "Syn",
        "TFTP",
        "UDP-lag",
        "WebDDoS"
    }

    collected = {label: 0 for label in target_labels}

    for file in files:
        path = os.path.join(data_path, file)

        for chunk in pd.read_csv(path, chunksize=100000):
            chunk.columns = chunk.columns.str.strip()

            for label in target_labels:
                if collected[label] < target_per_class:
                    needed = target_per_class - collected[label]

                    selected = chunk[
                        chunk["Label"] == label
                    ].head(needed)

                    if len(selected) > 0:
                        samples.append(selected)
                        collected[label] += len(selected)

            if all(
                count >= target_per_class
                for count in collected.values()
            ):
                break

        print(file, "processed")

        if all(
            count >= target_per_class
            for count in collected.values()
        ):
            break

    dataset = pd.concat(samples, ignore_index=True)

    print("\nCollected samples:")
    print(collected)

    print("\nDataset shape:", dataset.shape)

    return dataset

import numpy as np


def clean_raw_dataset(dataset):
    dataset = dataset.copy()

    dataset.columns = dataset.columns.str.strip()

    dataset = dataset.drop(
        columns=[
            "Unnamed: 0",
            "Flow ID",
            "Source IP",
            "Destination IP",
            "Timestamp",
            "SimillarHTTP"
        ],
        errors="ignore"
    )

    numeric_columns = dataset.select_dtypes(include=np.number).columns

    dataset[numeric_columns] = dataset[numeric_columns].replace(
        [np.inf, -np.inf], np.nan
    )

    dataset[numeric_columns] = dataset[numeric_columns].fillna(0)

    print("Missing values:", dataset.isnull().sum().sum())
    print(
        "Infinite values:",
        np.isinf(
            dataset.select_dtypes(include=np.number)
        ).sum().sum()
    )

    return dataset