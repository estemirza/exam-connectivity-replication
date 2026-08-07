#!/usr/bin/env python3
"""Reproduce the paper's connectivity numbers from the public CSVs in ../data/.

Reads sessions.csv, heartbeats.csv, submissions.csv and prints the headline
statistics reported in the paper (RQ1 connectivity, RQ2 submission outcomes),
then writes telemetry-calibration.json — the connectivity parameters that feed
the simulation. Stdlib only.

Usage:
  python3 reproduce.py            # uses ../data
  python3 reproduce.py <data_dir>
"""
import csv, json, os, sys, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "data")
BAD_UPLINK_PCT = 10


def read(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def q(sorted_vals, p):
    return sorted_vals[min(len(sorted_vals) - 1, int(p * len(sorted_vals)))] if sorted_vals else None


def runs(bools):
    out = []
    for b in bools:
        if out and out[-1][0] == b:
            out[-1][1] += 1
        else:
            out.append([b, 1])
    return out


def main():
    sessions = read("sessions.csv")
    hbs = read("heartbeats.csv")
    subs = read("submissions.csv")

    # group heartbeats by session, in seq order
    by_sess = {}
    for h in hbs:
        by_sess.setdefault(h["session_id"], []).append(h)
    for k in by_sess:
        by_sess[k].sort(key=lambda h: float(h["seq"]))

    total_beats = len(hbs)
    down_beats = sum(1 for h in hbs if h["reachable"] == "0")
    rtt = sorted(float(h["rtt_ms"]) for h in hbs if h["rtt_ms"] != "")

    up_runs, down_runs, per_sess_down = [], [], []
    for sid, hh in by_sess.items():
        offs = [float(h["t_offset_s"]) for h in hh]
        gaps = [offs[i + 1] - offs[i] for i in range(len(offs) - 1)]
        step = st.median(gaps) if gaps else 15.0
        reach = [h["reachable"] == "1" for h in hh]
        nd = sum(1 for r in reach if not r)
        per_sess_down.append(100 * nd / len(reach))
        for b, n in runs(reach):
            (up_runs if b else down_runs).append(n * step)
    up_runs.sort(); down_runs.sort(); per_sess_down.sort()

    def kind_stats(kind):
        ids = {s["session_id"] for s in sessions if s["network_kind"] == kind}
        beats = [h for h in hbs if h["session_id"] in ids]
        if not beats:
            return None
        d = sum(1 for h in beats if h["reachable"] == "0")
        rr = sorted(float(h["rtt_ms"]) for h in beats if h["rtt_ms"] != "")
        return {"n_sessions": len(ids), "downtime_pct": round(100 * d / len(beats), 1),
                "rtt_median_ms": round(st.median(rr)) if rr else None}

    # submissions
    sub_by_sess = {}
    for x in subs:
        sub_by_sess.setdefault(x["session_id"], []).append(x)
    attempts = len(subs)
    fail = sum(1 for x in subs if x["ok"] == "0")
    any_fail = sum(1 for sid, xs in sub_by_sess.items() if any(x["ok"] == "0" for x in xs))
    counts = sorted(((len(xs), sid) for sid, xs in sub_by_sess.items()), reverse=True)
    extreme_n = counts[0][0] if counts else 0
    extreme_fail = sum(1 for x in sub_by_sess[counts[0][1]] if x["ok"] == "0") if counts else 0
    sbytes = sorted(float(x["bytes"]) for x in subs if x["bytes"] not in ("", None))

    calib = {
        "connectivity": {
            "n_sessions": len(sessions),
            "n_uplinks": len({s["uplink_id"] for s in sessions if s["uplink_id"]}),
            "downtime_fraction": round(down_beats / total_beats, 4),
            "rtt_ms": {"median": q(rtt, .5), "p90": q(rtt, .9), "p95": q(rtt, .95), "p99": q(rtt, .99)},
            "meanUpMs_est": round(st.median(up_runs) * 1000) if up_runs else None,
            "meanDownMs_est": round(st.median(down_runs) * 1000) if down_runs else None,
            "downMs_p90": round(q(down_runs, .9) * 1000) if down_runs else None,
            "bad_uplink_sessions_ge_%dpct" % BAD_UPLINK_PCT: sum(1 for x in per_sess_down if x >= BAD_UPLINK_PCT),
            "downtime_pct_persession_max": round(per_sess_down[-1], 1),
        },
        "by_network_kind": {k: kind_stats(k) for k in ("school_wifi", "cellular", "other")},
        "submit": {
            "sessions_with_submit": len(sub_by_sess), "attempts": attempts,
            "ok": attempts - fail, "fail": fail, "sessions_with_any_fail": any_fail,
            "extreme_session_share_of_attempts_pct": round(100 * extreme_n / max(attempts, 1), 1),
            "without_extreme": {"attempts": attempts - extreme_n, "fail": fail - extreme_fail},
            "bytes_median": round(st.median(sbytes)) if sbytes else None,
        },
    }
    json.dump(calib, open(os.path.join(DATA, "telemetry-calibration.json"), "w"), indent=2)

    c = calib["connectivity"]; k = calib["by_network_kind"]; sm = calib["submit"]
    print("=== RQ1: connectivity (n=%d sessions, %d uplinks) ===" % (c["n_sessions"], c["n_uplinks"]))
    print("Overall downtime      : %.1f%%" % (100 * c["downtime_fraction"]))
    print("RTT ms median/p90/p99 : %s / %s / %s" % (c["rtt_ms"]["median"], c["rtt_ms"]["p90"], c["rtt_ms"]["p99"]))
    print("Median UP run         : %d s" % (c["meanUpMs_est"] // 1000))
    print("Median DOWN run (p90) : %d s (%d s)" % (c["meanDownMs_est"] // 1000, c["downMs_p90"] // 1000))
    print("Sessions >=10%% down   : %d (worst %.1f%%)" % (c["bad_uplink_sessions_ge_10pct"], c["downtime_pct_persession_max"]))
    for name in ("school_wifi", "cellular"):
        s = k[name]
        print("  %-11s: %d sessions, downtime %.1f%%, RTT median %s ms" %
              (name, s["n_sessions"], s["downtime_pct"], s["rtt_median_ms"]))
    print("=== RQ2: submissions ===")
    print("Sessions submitting   : %d ; attempts %d (ok %d, fail %d)" %
          (sm["sessions_with_submit"], sm["attempts"], sm["ok"], sm["fail"]))
    print("Sessions w/ any fail  : %d" % sm["sessions_with_any_fail"])
    print("One extreme session   : %.1f%% of all attempts; without it %d attempts, %d fails" %
          (sm["extreme_session_share_of_attempts_pct"], sm["without_extreme"]["attempts"], sm["without_extreme"]["fail"]))
    print("Median real submit    : %d bytes" % sm["bytes_median"])
    print("\n[written] %s" % os.path.join(DATA, "telemetry-calibration.json"))


if __name__ == "__main__":
    main()
