"""Loads the bundled Elexon snapshots into in-memory structures.

Raw sources (both from the Elexon BMRS API):
  * FUELHH (fuelType=WIND): half-hourly outturn          -> [startTime, generation]
  * WINDFOR:                hourly national wind forecast -> [publishTime, startTime, generation]
All timestamps are UTC (== UK local time throughout January).
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Tuple

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def parse_ts(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


class Dataset:
    def __init__(self, actual_rows, forecast_rows):
        # Hourly actuals = mean of the two half-hour settlement periods in the hour,
        # so they are like-for-like with the hourly WINDFOR forecast.
        buckets: Dict[datetime, List[float]] = defaultdict(list)
        for start, gen in actual_rows:
            t = parse_ts(start)
            buckets[t.replace(minute=0)].append(float(gen))
        # Only keep hours where both half-hours are present
        self.actual: Dict[datetime, float] = {
            h: sum(v) / len(v) for h, v in buckets.items() if len(v) == 2
        }

        # forecasts[target_hour] -> list of (publish_time, mw) sorted by publish time
        fc: Dict[datetime, List[Tuple[datetime, float]]] = defaultdict(list)
        for pub, start, gen in forecast_rows:
            fc[parse_ts(start)].append((parse_ts(pub), float(gen)))
        for v in fc.values():
            v.sort()
        self.forecasts = fc
        self.publish_times = sorted({p for v in fc.values() for p, _ in v})

    @property
    def last_actual_hour(self) -> datetime:
        return max(self.actual)

    def latest_forecast(self, target: datetime, cutoff: datetime):
        """Latest forecast for `target` published at or before `cutoff` -> (publish, mw) or None."""
        best = None
        for pub, mw in self.forecasts.get(target, []):
            if pub <= cutoff:
                best = (pub, mw)
            else:
                break
        return best

    def latest_actual_before(self, cutoff: datetime):
        """Most recent hourly actual that is complete (hour ended) at `cutoff`."""
        h = (cutoff - timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        for _ in range(48):
            if h in self.actual:
                return self.actual[h]
            h -= timedelta(hours=1)
        return None


def load_dataset() -> Dataset:
    actual = json.loads((DATA_DIR / "fuelhh_wind.json").read_text())
    fcst = json.loads((DATA_DIR / "windfor.json").read_text())
    return Dataset(actual, fcst)
