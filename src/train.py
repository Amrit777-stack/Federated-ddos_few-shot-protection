from sklearn.ensemble import RandomForestClassifier

from src.preprocessing import prepare_data


def create_random_forest():
    model = RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        n_jobs=-1
    )

    return model


def train_random_forest(X_train, y_train):
    model = create_random_forest()

    model.fit(X_train, y_train)

    return model


def train_baseline():
    X_train, X_test, y_train, y_test = prepare_data()

    model = train_random_forest(X_train, y_train)

    return model, X_test, y_test