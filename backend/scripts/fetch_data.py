"""Re-download the Elexon snapshots used by the app (no API key needed).

    python backend/scripts/fetch_data.py

Writes backend/data/fuelhh_wind.json and backend/data/windfor.json in compact form.
"""
import json
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets/"
OUT = Path(__file__).resolve().parent.parent / "data"
# Forecasts published from 28 Dec (covers the longest ~66h horizon) to the end of the window
FC_FROM, FC_TO = datetime(2025, 12, 28), datetime(2026, 2, 2)
ACT_FROM, ACT_TO = "2025-12-31", "2026-02-01"


def get(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.load(r)


def main():
    act = get(f"{BASE}FUELHH/stream?settlementDateFrom={ACT_FROM}&settlementDateTo={ACT_TO}&fuelType=WIND")
    fmt = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
    fc, d = [], FC_FROM
    while d < FC_TO:  # chunked to stay well inside API response limits
        e = d + timedelta(days=2)
        fc += get(f"{BASE}WINDFOR/stream?publishDateTimeFrom={fmt(d)}&publishDateTimeTo={fmt(e)}")
        d = e
    fc = {(x["publishTime"], x["startTime"]): x["generation"] for x in fc}  # de-dupe chunk edges
    OUT.mkdir(exist_ok=True)
    (OUT / "fuelhh_wind.json").write_text(json.dumps([[x["startTime"], x["generation"]] for x in act], separators=(",", ":")))
    (OUT / "windfor.json").write_text(json.dumps([[p, s, g] for (p, s), g in sorted(fc.items())], separators=(",", ":")))
    print(f"actuals={len(act)} forecasts={len(fc)}")


if __name__ == "__main__":
    main()
