import io
import sys
import os
import contextlib
import base64
from pathlib import Path
import nbformat as nbf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

PROJECT_ROOT = Path(r"c:\Users\amrit\Documents\Federated-Ddos protection")
NOTEBOOK_PATH = PROJECT_ROOT / "notebooks" / "02_true_heldout_few_shot.ipynb"

# Add project root to sys.path and set working directory to notebooks/
sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(str(PROJECT_ROOT / "notebooks"))

with open(NOTEBOOK_PATH, "r", encoding="utf-8") as f:
    nb = nbf.read(f, as_version=4)

current_cell_outputs = []

def notebook_display(*args):
    for arg in args:
        if isinstance(arg, (pd.DataFrame, pd.Series)):
            data = {
                "text/plain": str(arg),
                "text/html": arg._repr_html_()
            }
            current_cell_outputs.append(nbf.v4.new_output(
                output_type="display_data",
                data=data,
                metadata={}
            ))
        else:
            print(arg)

exec_namespace = {
    "PROJECT_ROOT": PROJECT_ROOT,
    "display": notebook_display
}

execution_counter = 1

for idx, cell in enumerate(nb.cells):
    if cell.cell_type != "code":
        continue

    print(f"Executing Code Cell {execution_counter} (notebook index {idx})...")
    cell.outputs = []
    current_cell_outputs.clear()
    cell.execution_count = execution_counter

    source = cell.source

    # Capture stdout
    stdout_buf = io.StringIO()
    
    # Track figures before
    figs_before = set(plt.get_fignums())

    try:
        with contextlib.redirect_stdout(stdout_buf):
            # If the last statement is an expression, we want to evaluate and display it
            lines = source.strip().split("\n")
            if lines and not lines[-1].startswith(" ") and not lines[-1].startswith("#") and not lines[-1].startswith("import") and not lines[-1].startswith("from") and not lines[-1].startswith("def") and not lines[-1].startswith("for") and not lines[-1].startswith("while") and not lines[-1].startswith("if") and not lines[-1].startswith("print") and not lines[-1].startswith("assert") and not lines[-1].startswith("display") and "=" not in lines[-1]:
                # Split code into exec part and eval part
                exec_code = "\n".join(lines[:-1])
                eval_code = lines[-1]
                if exec_code:
                    exec(exec_code, exec_namespace)
                res = eval(eval_code, exec_namespace)
            else:
                exec(source, exec_namespace)
                res = None

        stdout_val = stdout_buf.getvalue()
        if stdout_val:
            cell.outputs.append(nbf.v4.new_output(
                output_type="stream",
                name="stdout",
                text=stdout_val
            ))

        # Check if an expression was returned (like a dataframe)
        if res is not None:
            data = {}
            if isinstance(res, (pd.DataFrame, pd.Series)):
                data["text/plain"] = str(res)
                data["text/html"] = res._repr_html_()
            else:
                data["text/plain"] = repr(res)
            cell.outputs.append(nbf.v4.new_output(
                output_type="execute_result",
                execution_count=execution_counter,
                data=data
            ))

        # Add any display() items
        cell.outputs.extend(current_cell_outputs)

        # Check for new matplotlib figures
        figs_after = set(plt.get_fignums())
        new_figs = figs_after - figs_before
        for fnum in new_figs:
            fig = plt.figure(fnum)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=150)
            buf.seek(0)
            img_b64 = base64.b64encode(buf.read()).decode("ascii")
            cell.outputs.append(nbf.v4.new_output(
                output_type="display_data",
                data={
                    "image/png": img_b64,
                    "text/plain": f"<Figure size {fig.get_size_inches()[0]*100}x{fig.get_size_inches()[1]*100} with {len(fig.axes)} Axes>"
                }
            ))
            plt.close(fig)

    except Exception as e:
        print(f"Error in cell {execution_counter}: {e}")
        import traceback
        tb_str = traceback.format_exc()
        cell.outputs.append(nbf.v4.new_output(
            output_type="error",
            ename=type(e).__name__,
            evalue=str(e),
            traceback=tb_str.split("\n")
        ))
        raise

    execution_counter += 1

with open(NOTEBOOK_PATH, "w", encoding="utf-8") as f:
    nbf.write(nb, f)

print(f"\nAll {execution_counter-1} code cells successfully executed and saved to {NOTEBOOK_PATH}!")
