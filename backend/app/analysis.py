"""Pure analysis functions: decision-time forecast selection, error metrics, error bands.

Conventions
  * error = forecast - actual   (positive => wind over-forecast => SHORTFALL the buyer must cover)
  * A "decision" for delivery day D is made on D-1 at `cutoff` (HH:MM, UTC == UK time in Jan).
    The decision forecast for each hour of D is the latest WINDFOR publish <= that cutoff.
  * Evaluation window: purchase decisions made in January 2026 => delivery days 2 Jan - 1 Feb 2026.
"""
from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional

from .data import Dataset

DECISION_START = date(2026, 1, 1)   # first decision day (delivers 2 Jan)
DECISION_END = date(2026, 1, 31)    # last decision day  (delivers 1 Feb)
DEFAULT_CUTOFF = "09:50"            # assumed day-ahead gate closure; user-adjustable
MIN_HISTORY_DAYS = 5                # trailing days needed before a band is "out-of-sample"


# ---------- small stats helpers (no numpy needed -> light serverless bundle) ----------
def quantile(values: List[float], q: float) -> Optional[float]:
    if not values:
        return None
    s = sorted(values)
    pos = (len(s) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def parse_cutoff(c: str) -> time:
    h, m = c.split(":")
    return time(int(h), int(m))


def cutoff_dt(delivery_day: date, cutoff: str) -> datetime:
    """Cutoff instant for a delivery day: the previous day at HH:MM UTC."""
    return datetime.combine(delivery_day - timedelta(days=1), parse_cutoff(cutoff), tzinfo=timezone.utc)


def delivery_days() -> List[date]:
    n = (DECISION_END - DECISION_START).days + 1
    return [DECISION_START + timedelta(days=i + 1) for i in range(n)]


def day_hours(d: date) -> List[datetime]:
    base = datetime.combine(d, time(0), tzinfo=timezone.utc)
    return [base + timedelta(hours=h) for h in range(24)]


# ---------- core record building ----------
def build_records(ds: Dataset, cutoff: str, days: Optional[List[date]] = None) -> List[dict]:
    """One record per delivery hour with decision forecast, actual and error."""
    out = []
    for d in days or delivery_days():
        cdt = cutoff_dt(d, cutoff)
        naive = ds.latest_actual_before(cdt)
        for h in day_hours(d):
            f = ds.latest_forecast(h, cdt)
            a = ds.actual.get(h)
            if f is None or a is None:
                continue
            pub, mw = f
            out.append({
                "day": d, "hour": h.hour, "t": h, "forecast": mw, "actual": a,
                "error": mw - a, "publish": pub,
                "lead_h": (h - pub).total_seconds() / 3600,
                "naive": naive, "naive_error": (naive - a) if naive is not None else None,
            })
    return out


def metrics(recs: List[dict]) -> dict:
    n = len(recs)
    if n == 0:
        return {"n": 0}
    err = [r["error"] for r in recs]
    abs_err = [abs(e) for e in err]
    act = [r["actual"] for r in recs]
    mae = sum(abs_err) / n
    rmse = math.sqrt(sum(e * e for e in err) / n)
    mean_act = sum(act) / n
    nv = [abs(r["naive_error"]) for r in recs if r["naive_error"] is not None]
    naive_mae = sum(nv) / len(nv) if nv else None
    return {
        "n": n,
        "mae": mae,
        "rmse": rmse,
        "bias": sum(err) / n,
        # MAE once the average offset is removed = the unavoidable "random" part of the error
        "mae_debiased": sum(abs(e - sum(err) / n) for e in err) / n,
        "mean_actual": mean_act,
        "wmape": sum(abs_err) / sum(act) if sum(act) else None,   # MAE / mean actual
        "abs_p50": quantile(abs_err, 0.5),
        "abs_p90": quantile(abs_err, 0.9),
        "abs_p95": quantile(abs_err, 0.95),
        "max_abs": max(abs_err),
        # signed-error quantiles: p95 is the over-forecast (shortfall) risk, p05 the surplus risk
        "err_p05": quantile(err, 0.05), "err_p10": quantile(err, 0.10),
        "err_p50": quantile(err, 0.50),
        "err_p90": quantile(err, 0.90), "err_p95": quantile(err, 0.95),
        "naive_mae": naive_mae,
        "skill_vs_naive": (1 - mae / naive_mae) if naive_mae else None,
        "pct_over_forecast": sum(1 for e in err if e > 0) / n,
    }


def error_band(ds: Dataset, target_day: date, cutoff: str):
    """Empirical 80% band (p10/p90 of signed error) usable when deciding for `target_day`.

    Uses only delivery days whose outturn is fully known at decision time (<= D-2), so it is
    out-of-sample. Falls back to the full-window band (flagged in_sample) if too little history.
    """
    hist_days = [d for d in delivery_days() if d <= target_day - timedelta(days=2)]
    recs = build_records(ds, cutoff, hist_days)
    in_sample = False
    if len({r["day"] for r in recs}) < MIN_HISTORY_DAYS:
        recs = build_records(ds, cutoff)
        in_sample = True
    err = [r["error"] for r in recs]
    return {
        "mean_err": sum(err) / len(err) if err else None,
        "lo_err": quantile(err, 0.10), "hi_err": quantile(err, 0.90),
        "p95_err": quantile(err, 0.95), "p05_err": quantile(err, 0.05),
        "history_days": len({r["day"] for r in recs}), "in_sample": in_sample,
    }


def band_backtest(ds: Dataset, cutoff: str) -> dict:
    """How often did the actual fall inside the 80% band built from trailing history?"""
    hit = tot = 0
    for d in delivery_days():
        b = error_band(ds, d, cutoff)
        if b["in_sample"]:
            continue
        for r in build_records(ds, cutoff, [d]):
            # actual in [forecast - hi_err, forecast - lo_err]
            if r["forecast"] - b["hi_err"] <= r["actual"] <= r["forecast"] - b["lo_err"]:
                hit += 1
            tot += 1
    return {"nominal": 0.8, "observed": hit / tot if tot else None, "n": tot}


def bias_correction_backtest(ds: Dataset, cutoff: str) -> dict:
    """Out-of-sample test of subtracting the trailing mean error (days <= D-2) from the forecast.

    Compared against the raw forecast on exactly the same delivery days/hours.
    """
    raw = cor = n = 0
    raw_sq = cor_sq = 0.0
    for d in delivery_days():
        b = error_band(ds, d, cutoff)
        if b["in_sample"]:
            continue
        for r in build_records(ds, cutoff, [d]):
            e_cor = max(0.0, r["forecast"] - b["mean_err"]) - r["actual"]
            raw += abs(r["error"]); cor += abs(e_cor)
            raw_sq += r["error"] ** 2; cor_sq += e_cor ** 2
            n += 1
    if not n:
        return {"n": 0}
    return {"n": n, "mae_raw": raw / n, "mae_corrected": cor / n,
            "rmse_raw": math.sqrt(raw_sq / n), "rmse_corrected": math.sqrt(cor_sq / n),
            "mae_improvement": 1 - cor / raw}


# ---------- aggregations for the API ----------
def by_group(recs: List[dict], key) -> List[dict]:
    groups: Dict = {}
    for r in recs:
        groups.setdefault(key(r), []).append(r)
    rows = []
    for k in sorted(groups):
        m = metrics(groups[k])
        rows.append({"key": k, "n": m["n"], "mae": m["mae"], "rmse": m["rmse"], "bias": m["bias"],
                     "mean_actual": m["mean_actual"], "abs_p95": m["abs_p95"]})
    return rows


def error_histogram(recs: List[dict], width: int = 1000) -> List[dict]:
    counts: Dict[int, int] = {}
    for r in recs:
        b = math.floor(r["error"] / width) * width
        counts[b] = counts.get(b, 0) + 1
    if not counts:
        return []
    return [{"from": b, "to": b + width, "count": counts.get(b, 0)}
            for b in range(min(counts), max(counts) + width, width)]


def horizon_profile(ds: Dataset, days: List[date], bucket_h: int = 6) -> List[dict]:
    """Error vs forecast lead time using EVERY publish (not just the decision one)."""
    want = {h for d in days for h in day_hours(d)}
    acc: Dict[int, List[float]] = {}
    for h in want:
        a = ds.actual.get(h)
        if a is None:
            continue
        for pub, mw in ds.forecasts.get(h, []):
            lead = (h - pub).total_seconds() / 3600
            if lead < 0:
                continue
            acc.setdefault(int(lead // bucket_h) * bucket_h, []).append(mw - a)
    rows = []
    for b in sorted(acc):
        e = acc[b]
        rows.append({"from_h": b, "to_h": b + bucket_h, "n": len(e),
                     "mae": sum(abs(x) for x in e) / len(e),
                     "bias": sum(e) / len(e)})
    return rows
