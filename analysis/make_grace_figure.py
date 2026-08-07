#!/usr/bin/env python3
"""Figure 2 (RQ3) from ../data/grace-sweep-results.csv: grace-window sufficiency
under the two field-calibrated connectivity regimes. Writes
../figures/grace-sufficiency.{png,pdf}. Needs matplotlib.
"""
import csv, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, "..", "data", "grace-sweep-results.csv")
OUT = os.path.join(HERE, "..", "figures")
os.makedirs(OUT, exist_ok=True)

rows = list(csv.DictReader(open(CSV)))
def series(scenario, col):
    rs = sorted((r for r in rows if r["scenario"] == scenario), key=lambda r: float(r["graceMin"]))
    return [float(r["graceMin"]) for r in rs], [100 * float(r[col]) for r in rs]

gx, A_bad = series("field_bad", "A_pres")
_,  D_bad = series("field_bad", "D_pres")
_,  A_typ = series("field_typical", "A_pres")

fig, ax = plt.subplots(figsize=(6.2, 4.0))
ax.plot(gx, A_bad, marker="o", color="tab:red", label="Single submission (Baseline A) — bad-uplink tail")
ax.plot(gx, D_bad, marker="s", color="tab:green", label="Delta-sync — bad-uplink tail")
ax.plot(gx, A_typ, marker="^", color="tab:blue", linestyle="--", alpha=0.7,
        label="Single submission — typical connectivity")
ax.axvline(2, color="gray", linestyle=":", linewidth=1)
ax.annotate("≈2 min grace suffices\nfor observed connectivity", xy=(2, 99.6), xytext=(3.4, 93.5),
            arrowprops=dict(arrowstyle="->", color="gray"), fontsize=9, color="dimgray")
ax.set_xlabel("Post-deadline grace window (minutes)")
ax.set_ylabel("Student's answered work preserved (%)")
ax.set_ylim(84, 101); ax.set_xticks([0.5, 1, 2, 3, 5, 10, 15])
ax.set_title("Grace-window sufficiency under measured field connectivity")
ax.legend(fontsize=8, loc="lower right"); ax.grid(True, alpha=0.3)

fig.tight_layout()
for ext in ("pdf", "png"):
    fig.savefig(os.path.join(OUT, f"grace-sufficiency.{ext}"), dpi=200, bbox_inches="tight")
print("wrote", os.path.join(OUT, "grace-sufficiency.pdf"))
