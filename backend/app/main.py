"""FastAPI app: JSON API under /api, and (optionally) the built React app at /."""
from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import analysis as an
from .data import Dataset, load_dataset

app = FastAPI(title="Wind Forecast Decision Support", version="1.0.0")


@lru_cache(maxsize=1)
def ds() -> Dataset:
    return load_dataset()


def _cutoff(c: str) -> str:
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", c):
        raise HTTPException(422, "cutoff must be HH:MM (UK time, 24h)")
    return c


def _day(s: str) -> date:
    try:
        d = date.fromisoformat(s)
    except ValueError:
        raise HTTPException(422, "date must be YYYY-MM-DD")
    if d not in an.delivery_days():
        raise HTTPException(404, "date outside the January-2026 decision window (delivery 2026-01-02..2026-02-01)")
    return d


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    d = ds()
    days = an.delivery_days()
    return {
        "delivery_days": [x.isoformat() for x in days],
        "default_cutoff": an.DEFAULT_CUTOFF,
        "last_forecast_publish": _iso(d.publish_times[-1]),
        "last_actual_hour": _iso(d.last_actual_hour),
        "assumptions": [
            "Decisions are made on D-1 for delivery day D; the decision forecast is the latest WINDFOR publish at or before the cutoff time (UK time = UTC in January).",
            "FUELHH half-hourly actuals are averaged to hourly to match the hourly WINDFOR forecast.",
            "Error = forecast - actual. Positive error means wind was over-forecast and extra power must be bought elsewhere.",
            "Window: decisions made 1-31 Jan 2026, i.e. delivery days 2 Jan - 1 Feb 2026.",
        ],
    }


@app.get("/api/day")
def day(date: str = Query(..., description="Delivery day YYYY-MM-DD"), cutoff: str = an.DEFAULT_CUTOFF):
    """Decision view for one delivery day: forecast available at the cutoff, outturn, error band, revisions."""
    c = _cutoff(cutoff)
    dd = _day(date)
    d = ds()
    cdt = an.cutoff_dt(dd, c)
    band = an.error_band(d, dd, c)
    recs = {r["hour"]: r for r in an.build_records(d, c, [dd])}

    rows, revisions = [], {}
    for h in an.day_hours(dd):
        r = recs.get(h.hour)
        if r is None:
            continue
        rows.append({
            "t": _iso(h), "hour": h.hour, "forecast": r["forecast"], "actual": r["actual"],
            "error": r["error"],
            # forecast with the trailing mean error removed (never below zero)
            "corrected": max(0.0, r["forecast"] - band["mean_err"]),
            "publish": _iso(r["publish"]),
            # actual expected within [forecast - hi_err, forecast - lo_err] 80% of the time
            "lo": r["forecast"] - band["hi_err"], "hi": r["forecast"] - band["lo_err"],
            # conservative planning value: wind you can rely on with ~95% confidence
            "firm95": max(0.0, r["forecast"] - band["p95_err"]),
        })
        for pub, mw in d.forecasts.get(h, []):
            revisions.setdefault(_iso(pub), {})[h.hour] = mw

    rev = [{"publish": k, "after_cutoff": k > _iso(cdt), "values": v}
           for k, v in sorted(revisions.items())
           # keep the issues that matter: the 3 before the cutoff and everything after
           ]
    before = [x for x in rev if not x["after_cutoff"]][-3:]
    rev = before + [x for x in rev if x["after_cutoff"]]
    return {
        "date": dd.isoformat(), "cutoff": c, "cutoff_time": _iso(cdt),
        "decision_publish": rows[0]["publish"] if rows else None,
        "band": band, "metrics": an.metrics(list(recs.values())),
        "rows": rows, "revisions": rev,
    }


@app.get("/api/accuracy")
def accuracy(cutoff: str = an.DEFAULT_CUTOFF, start: str = "2026-01-02", end: str = "2026-02-01"):
    c = _cutoff(cutoff)
    s, e = _day(start), _day(end)
    if s > e:
        raise HTTPException(422, "start must be <= end")
    days = [x for x in an.delivery_days() if s <= x <= e]
    d = ds()
    recs = an.build_records(d, c, days)
    return {
        "cutoff": c, "start": s.isoformat(), "end": e.isoformat(),
        "summary": an.metrics(recs),
        "daily": [{**r, "day": r.pop("key").isoformat()} for r in an.by_group(recs, lambda r: r["day"])],
        "by_hour": [{**r, "hour": r.pop("key")} for r in an.by_group(recs, lambda r: r["hour"])],
        "histogram": an.error_histogram(recs),
        "scatter": [{"forecast": round(r["forecast"]), "actual": round(r["actual"])} for r in recs],
        "band_backtest": an.band_backtest(d, c),
        "bias_correction": an.bias_correction_backtest(d, c),
        "horizon": an.horizon_profile(d, days),
    }


# ---- static frontend (Docker / single-service deployment) ----
_dist = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = _dist / path
        return FileResponse(f if path and f.is_file() else _dist / "index.html")
