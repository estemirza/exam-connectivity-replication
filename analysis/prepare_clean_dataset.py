#!/usr/bin/env python3
"""Provenance script: turn the raw platform telemetry export into the
de-identified public dataset shipped in ../data/.

This script needs the ORIGINAL raw telemetry export, which is NOT distributed
with this repository (it contains practice sessions taken on home connections and
a salted uplink hash that we deliberately do not publish). It is included only to
document, transparently, exactly how the public CSVs were produced.

What it does to de-identify:
  * keeps only the exam-day, exam-plausible sessions (see filters below);
  * replaces the server-side salted uplink hash with an opaque sequential id
    (uplink_01, uplink_02, ...), so uplinks can still be grouped but the hash
    (and therefore any IP prefix) cannot be recovered;
  * re-labels sessions s001..s157 (the original random session id is dropped);
  * converts absolute heartbeat timestamps to session-relative offsets in
    seconds, so no wall-clock time is published;
  * publishes network metadata only — never any name, student number, or answer.

Usage:
  python3 prepare_clean_dataset.py <raw_telemetry.json> [out_dir=../data]
"""
import csv, json, os, sys, statistics as st

MIN_DUR_MIN, MAX_DUR_MIN, MIN_BEATS, RTT_MAX_MS = 2, 120, 6, 60000
EXAM_DATE = "2026-08-06"
# ASN -> coarse, non-identifying connection kind used in the paper.
ASN_KIND = {7713: "school_wifi", 23693: "cellular"}


def jloads(s):
    try:
        v = json.loads(s) if s else []
        return v if isinstance(v, list) else []
    except Exception:
        return []


def load_rows(path):
    raw = json.load(open(path, encoding="utf-8"))
    if isinstance(raw, list):
        return raw[0]["results"] if raw and isinstance(raw[0], dict) and "results" in raw[0] else raw
    if isinstance(raw, dict) and "results" in raw:
        return raw["results"]
    sys.exit("Unrecognised JSON shape.")


def latest_per_sid(rows):
    best = {}
    for r in rows:
        s = r.get("sid") or "(none)"
        if s not in best or (r.get("nHeartbeat") or 0) >= (best[s].get("nHeartbeat") or 0):
            best[s] = r
    return list(best.values())


def hb_of(r):
    h = [x for x in jloads(r.get("hb")) if isinstance(x, dict) and "t" in x]
    h.sort(key=lambda x: x["t"])
    return h


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    raw_path = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(out, exist_ok=True)

    rows = load_rows(raw_path)
    sess = latest_per_sid(rows)
    sess = [r for r in sess if str(r.get("waktu") or "").startswith(EXAM_DATE)]

    exam = []
    for r in sess:
        hb = hb_of(r)
        if len(hb) < 2:
            continue
        dur = (hb[-1]["t"] - hb[0]["t"]) / 60000
        if dur > MAX_DUR_MIN or len(hb) < MIN_BEATS or dur < MIN_DUR_MIN:
            continue
        exam.append((r, hb))
    # stable order: by first heartbeat time
    exam.sort(key=lambda t: t[1][0]["t"])

    # opaque uplink ids, assigned in first-seen order
    uplink_map, uplink_n = {}, 0
    def uplink_id(ng):
        nonlocal uplink_n
        if not ng:
            return ""
        if ng not in uplink_map:
            uplink_n += 1
            uplink_map[ng] = f"uplink_{uplink_n:02d}"
        return uplink_map[ng]

    S = open(os.path.join(out, "sessions.csv"), "w", newline="", encoding="utf-8")
    H = open(os.path.join(out, "heartbeats.csv"), "w", newline="", encoding="utf-8")
    B = open(os.path.join(out, "submissions.csv"), "w", newline="", encoding="utf-8")
    sw = csv.writer(S); hw = csv.writer(H); bw = csv.writer(B)
    sw.writerow(["session_id", "uplink_id", "asn", "network_kind",
                 "n_heartbeats", "duration_min", "downtime_pct",
                 "submit_attempts", "submit_failures", "submit_bytes_median",
                 "client_nav_type", "client_effective_type"])
    hw.writerow(["session_id", "seq", "t_offset_s", "reachable", "rtt_ms"])
    bw.writerow(["session_id", "attempt_seq", "ok", "bytes"])

    for i, (r, hb) in enumerate(exam, start=1):
        sid = f"s{i:03d}"
        t0 = hb[0]["t"]
        nd = sum(1 for x in hb if x.get("ok") is False)
        # heartbeats
        for seq, x in enumerate(hb, start=1):
            ok = bool(x.get("ok"))
            rtt = x.get("rtt")
            rtt = rtt if (ok and isinstance(rtt, (int, float)) and rtt <= RTT_MAX_MS) else ""
            hw.writerow([sid, seq, round((x["t"] - t0) / 1000, 1), 1 if ok else 0, rtt])
        # submissions
        subs = jloads(r.get("submits"))
        for k, x in enumerate(subs, start=1):
            bw.writerow([sid, k, 1 if x.get("ok") else 0,
                         x.get("bytes") if isinstance(x.get("bytes"), (int, float)) else ""])
        sub_bytes = sorted(x["bytes"] for x in subs
                           if isinstance(x.get("bytes"), (int, float)) and x["bytes"] > 0)
        ni = {}
        try:
            ni = json.loads(r.get("netinfo")) if r.get("netinfo") else {}
        except Exception:
            ni = {}
        asn = r.get("asn")
        sw.writerow([
            sid, uplink_id(r.get("netgroup")), asn if asn is not None else "",
            ASN_KIND.get(asn, "other"),
            len(hb), round((hb[-1]["t"] - t0) / 60000, 1), round(100 * nd / len(hb), 1),
            len(subs), sum(1 for x in subs if not x.get("ok")),
            (round(st.median(sub_bytes)) if sub_bytes else ""),
            (ni.get("type") if isinstance(ni, dict) else "") or "",
            (ni.get("eff") if isinstance(ni, dict) else "") or "",
        ])
    for f in (S, H, B):
        f.close()
    print(f"Wrote {len(exam)} sessions, {uplink_n} uplinks to {out}/")


if __name__ == "__main__":
    main()
