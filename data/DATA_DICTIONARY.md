# Data dictionary

All data are from one online exam (6 August 2026), restricted to the 157
exam-plausible sessions (duration 2–120 minutes, at least six heartbeats). Network
metadata only — no personal data, identifiers, or answer content.

## `sessions.csv` — one row per exam session (157 rows)

| Column | Type | Description |
|---|---|---|
| `session_id` | string | Opaque session label `s001`–`s157`. Not linkable to a student; the original random session id is not published. |
| `uplink_id` | string | Opaque uplink group `uplink_01`–`uplink_61`. Sessions sharing a physical uplink share this id. Replaces a salted IP-prefix hash, which is **not** published. |
| `asn` | integer | Autonomous system number of the connecting network (public routing information). |
| `network_kind` | string | Coarse label from the ASN: `school_wifi` (ASN 7713), `cellular` (ASN 23693), or `other`. |
| `n_heartbeats` | integer | Number of connectivity heartbeats recorded in the session. |
| `duration_min` | float | Session length in minutes (first to last heartbeat). |
| `downtime_pct` | float | Percentage of heartbeats on which the network was unreachable. |
| `submit_attempts` | integer | Number of final-submission attempts made in the session. |
| `submit_failures` | integer | Number of those attempts that failed. |
| `submit_bytes_median` | integer | Median size in bytes of the session's real submission payloads (blank if none). |
| `client_nav_type` | string | Browser-reported connection type (`wifi`, blank if unknown); coarse, self-reported. |
| `client_effective_type` | string | Browser-reported effective connection class (e.g., `4g`); coarse, self-reported. |

## `heartbeats.csv` — one row per connectivity heartbeat

| Column | Type | Description |
|---|---|---|
| `session_id` | string | Foreign key to `sessions.csv`. |
| `seq` | integer | Heartbeat sequence number within the session (1-based). |
| `t_offset_s` | float | Seconds since the session's first heartbeat (no wall-clock time is published). |
| `reachable` | integer | `1` if the network responded to this heartbeat, `0` if not. |
| `rtt_ms` | number | Round-trip time in milliseconds. Blank when the beat was unreachable or the sample was dropped as an artefact (>60 s). |

## `submissions.csv` — one row per final-submission attempt

| Column | Type | Description |
|---|---|---|
| `session_id` | string | Foreign key to `sessions.csv`. |
| `attempt_seq` | integer | Attempt number within the session (1-based; retries increment this). |
| `ok` | integer | `1` if the submission succeeded, `0` if it failed. |
| `bytes` | integer | Payload size in bytes (blank if not recorded). |

## Derived / reference files

- `telemetry-calibration.json` — connectivity parameters computed by
  `analysis/reproduce.py` (regenerated, not hand-edited).
- `grace-sweep-results.csv`, `simulation-results.csv` — reference outputs of the
  simulation; regenerate with the `simulation/run-*.js` scripts.
- `EXPECTED_OUTPUT.txt` — the console output `reproduce.py` should produce.
