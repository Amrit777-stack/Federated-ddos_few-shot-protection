import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "data" / "processed" / "ddos_sample.csv"


def load_dataset():
    dataset = pd.read_csv(DATA_PATH)
    return dataset


REMOVE_COLUMNS = [
    "Unnamed: 0",
    "Flow ID",
    "Source IP",
    "Destination IP",
    "Timestamp",
    "SimillarHTTP"
]


def clean_dataset(dataset):
    dataset = dataset.copy()
    dataset.columns = dataset.columns.str.strip()

    dataset = dataset.drop(columns=REMOVE_COLUMNS, errors="ignore")

    numeric_columns = dataset.select_dtypes(include=[np.number]).columns

    dataset[numeric_columns] = dataset[numeric_columns].replace(
        [np.inf, -np.inf], np.nan
    )

    dataset[numeric_columns] = dataset[numeric_columns].fillna(0)

    return dataset



def prepare_data(test_size=0.2, random_state=42):

    dataset = load_dataset()
    dataset = clean_dataset(dataset)

    X = dataset.drop(columns=["Label"])
    y = dataset["Label"]

    encoder = LabelEncoder()
    y = encoder.fit_transform(y)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y
    )

    scaler = StandardScaler()

    X_train = pd.DataFrame(
        scaler.fit_transform(X_train),
        columns=X_train.columns,
        index=X_train.index
    )

    X_test = pd.DataFrame(
        scaler.transform(X_test),
        columns=X_test.columns,
        index=X_test.index
    )

    return X_train, X_test, y_train, y_test, encoder, scaler