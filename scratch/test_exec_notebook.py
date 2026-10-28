import io
import sys
import base64
from pathlib import Path
import nbformat as nbf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

PROJECT_ROOT = Path(r"c:\Users\amrit\Documents\Federated-Ddos protection")
NOTEBOOK_PATH = PROJECT_ROOT / "notebooks" / "02_true_heldout_few_shot.ipynb"

with open(NOTEBOOK_PATH, "r", encoding="utf-8") as f:
    nb = nbf.read(f, as_version=4)

print(f"Loaded notebook with {len(nb.cells)} cells.")

