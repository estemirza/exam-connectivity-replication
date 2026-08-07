#!/usr/bin/env python3
"""Figure 1 (RQ1) from the public CSVs: per-session downtime distribution and the
round-trip-time distribution. Reads ../data/{sessions,heartbeats}.csv, writes
../figures/connectivity-distribution.{png,pdf}. Needs matplotlib.
"""
import csv, os, statistics as st
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(HERE, "..", "figures")
os.makedirs(OUT, exist_ok=True)

sessions = list(csv.DictReader(open(os.path.join(DATA, "sessions.csv"))))
hbs = list(csv.DictReader(open(os.path.join(DATA, "heartbeats.csv"))))

per_sess_down = sorted(float(s["downtime_pct"]) for s in sessions)
rtt = sorted(float(h["rtt_ms"]) for h in hbs if h["rtt_ms"] != "")
med_rtt = st.median(rtt)
print("sessions=%d rtt_samples=%d median_rtt=%.0f worst_downtime=%.1f" %
      (len(sessions), len(rtt), med_rtt, per_sess_down[-1]))

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9.2, 3.8))

clip = 20
bins = list(range(0, clip + 1, 1))
shown = [min(v, clip) for v in per_sess_down]
counts, _, _ = ax1.hist(shown, bins=bins, color="tab:blue", edgecolor="white", alpha=0.85)
n_tail = sum(1 for v in per_sess_down if v > clip)
ax1.annotate(f"{n_tail} sessions > {clip}%\n(worst {per_sess_down[-1]:.0f}%)",
             xy=(clip, 2), xytext=(clip - 9, max(counts) * 0.55),
             fontsize=8, color="dimgray", arrowprops=dict(arrowstyle="->", color="gray"))
ax1.set_xlabel("Per-session downtime (%)"); ax1.set_ylabel("Number of sessions")
ax1.set_title("(a) Most sessions lost almost no time")
ax1.set_xticks([0, 5, 10, 15, 20]); ax1.set_xticklabels(["0", "5", "10", "15", "20+"])
ax1.grid(True, axis="y", alpha=0.3)

ys = [(i + 1) / len(rtt) * 100 for i in range(len(rtt))]
ax2.plot(rtt, ys, color="tab:green")
ax2.axvline(med_rtt, color="gray", linestyle=":", linewidth=1)
ax2.annotate(f"median {med_rtt:.0f} ms", xy=(med_rtt, 50), xytext=(med_rtt * 1.4, 32),
             fontsize=8, color="dimgray", arrowprops=dict(arrowstyle="->", color="gray"))
ax2.set_xscale("log")
ax2.set_xlabel("Round-trip time (ms, log scale)"); ax2.set_ylabel("Cumulative % of heartbeats")
ax2.set_title("(b) Latency was low for most heartbeats")
ax2.set_ylim(0, 101); ax2.grid(True, which="both", alpha=0.3)

fig.tight_layout()
for ext in ("pdf", "png"):
    fig.savefig(os.path.join(OUT, f"connectivity-distribution.{ext}"), dpi=200, bbox_inches="tight")
print("wrote", os.path.join(OUT, "connectivity-distribution.pdf"))
