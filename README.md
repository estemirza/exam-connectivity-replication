# Exam-day network connectivity in an under-connected school — data & code

> **Anonymized replication package for double-blind peer review.** Author,
> institution, platform name, and repository host are withheld. Author details, a
> public URL, and a DOI will be added after acceptance.

Replication package for the paper *“How Reliable Is the Network During an Online
Exam in an Under-Connected School? A Field Measurement and Its Design
Implications.”*

It contains (a) a **de-identified dataset** of network telemetry logged during a
real online mathematics-certification exam at a junior-secondary school in eastern
Indonesia (6 August 2026, ~86 students, 157 exam sessions), and (b) the
**analysis and simulation code** that turns that data into every number and figure
in the paper.

Everything in the paper can be regenerated from the files here — no access to the
raw platform export is needed.

---

## What the dataset is (and is not)

The dataset is **network metadata only**. Each 15-second heartbeat records whether
the network was reachable and its round-trip time; each real submission records
its size in bytes and whether it succeeded; each session carries a coarse,
non-identifying network label (autonomous system number and an opaque uplink id).

It contains **no** student names, no student numbers, no answers, no IP addresses,
and no wall-clock timestamps. The server-side salted uplink hash from the raw
export is **not** published — it is replaced with opaque sequential ids
(`uplink_01`, `uplink_02`, …) so uplinks can still be grouped without any way to
recover an address. Heartbeat times are stored as seconds-from-session-start, not
clock time. See [`data/DATA_DICTIONARY.md`](data/DATA_DICTIONARY.md) and the
Ethics note below.

---

## Reproduce the results

Requirements: Python 3.9+ with `matplotlib` (see `requirements.txt`), and Node.js
18+ for the simulation (no npm dependencies).

```bash
# 1. Connectivity numbers (RQ1) and submission outcomes (RQ2), from the CSVs
python3 analysis/reproduce.py
#    -> prints the headline statistics; writes data/telemetry-calibration.json
#    -> compare against data/EXPECTED_OUTPUT.txt

# 2. Figure 1 — connectivity distributions
python3 analysis/make_connectivity_figure.py     # -> figures/connectivity-distribution.{png,pdf}

# 3. Simulation (RQ2/RQ3): grace-window sufficiency, calibrated to the field data
node simulation/run-grace-sweep.js               # -> results/grace-sweep-results.csv
python3 analysis/make_grace_figure.py            # -> figures/grace-sufficiency.{png,pdf}

# 4. Full cost comparison across designs (Table 1)
node simulation/run-experiment.js                # -> results/simulation-results.csv + summary.md
```

`analysis/reproduce.py` should print an overall downtime of **1.9%**, a median
RTT of **124 ms**, a median outage of **15 s**, the school-Wi-Fi vs cellular split
(**83 / 71** sessions), and the single 100-attempt failure case — the numbers
reported in the paper.

---

## Repository layout

```
data/                          De-identified dataset + committed reference outputs
  sessions.csv                 One row per exam session (157 rows)
  heartbeats.csv               One row per connectivity heartbeat
  submissions.csv              One row per real submission attempt
  telemetry-calibration.json   Connectivity parameters derived by reproduce.py
  grace-sweep-results.csv       Reference simulation output (RQ3)
  simulation-results.csv        Reference simulation output (per-seed, all designs)
  EXPECTED_OUTPUT.txt           What reproduce.py should print
  DATA_DICTIONARY.md            Column-by-column description
analysis/
  reproduce.py                 Field statistics from the CSVs (RQ1, RQ2)
  make_connectivity_figure.py  Figure 1
  make_grace_figure.py         Figure 2
  prepare_clean_dataset.py     Provenance: how the raw export became these CSVs
simulation/                    Discrete-event model of the exam under intermittent connectivity
  scenarios.js                 Field-calibrated connectivity regimes
  run-grace-sweep.js           RQ3 grace-window sweep
  run-experiment.js            Cost/preservation across designs (Table 1)
  ... (model, clients, helpers)
figures/                       Generated figures (png + pdf)
results/                       Output target when you re-run the simulation
```

`analysis/prepare_clean_dataset.py` is included for transparency only. It needs
the original raw export, which is deliberately not distributed; it documents
exactly how the public CSVs were de-identified.

---

## Ethics and privacy

The study recorded de-identified network metadata during a real exam. Because the
participants are minors, data collection was authorised by the school and its
operating foundation, and parents or guardians were informed in writing
beforehand and consented. No personal data, identifiers, or answer content were
collected, and none appear in this repository. The published dataset is further
minimised: the uplink hash is removed, sessions are relabelled, and timestamps are
reduced to session-relative offsets.

---

## Licenses

- **Code** (`analysis/`, `simulation/`): MIT — see [`LICENSE`](LICENSE).
- **Data** (`data/`): Creative Commons Attribution 4.0 (CC BY 4.0) — see
  [`LICENSE-DATA.md`](LICENSE-DATA.md).

## Citation

See [`CITATION.cff`](CITATION.cff). Please cite the paper if you use this data or code.
