from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import analysis as an
from app.data import Dataset, parse_ts
from app.main import app


def U(s):
    return parse_ts(s)


def tiny_ds():
    # actuals for 2 Jan 00:00 hour: halves 1000 & 2000 -> hourly mean 1500
    actual = [["2026-01-02T00:00:00Z", 1000], ["2026-01-02T00:30:00Z", 2000],
              ["2026-01-02T01:00:00Z", 500]]  # 01:00 has only one half -> dropped
    fc = [["2026-01-01T07:30:00Z", "2026-01-02T00:00:00Z", 1700],
          ["2026-01-01T09:30:00Z", "2026-01-02T00:00:00Z", 1800],
          ["2026-01-01T11:30:00Z", "2026-01-02T00:00:00Z", 9999]]  # after cutoff: must be ignored
    return Dataset(actual, fc)


def test_hourly_actual_requires_both_halves():
    ds = tiny_ds()
    assert ds.actual[U("2026-01-02T00:00:00Z")] == 1500
    assert U("2026-01-02T01:00:00Z") not in ds.actual


def test_decision_forecast_is_latest_before_cutoff():
    ds = tiny_ds()
    recs = an.build_records(ds, "09:50", [date(2026, 1, 2)])
    assert len(recs) == 1
    r = recs[0]
    assert r["forecast"] == 1800 and r["publish"] == U("2026-01-01T09:30:00Z")
    assert r["error"] == 300  # forecast - actual => over-forecast is positive


def test_cutoff_moves_selection():
    ds = tiny_ds()
    assert an.build_records(ds, "08:00", [date(2026, 1, 2)])[0]["forecast"] == 1700
    assert an.build_records(ds, "12:00", [date(2026, 1, 2)])[0]["forecast"] == 9999
    assert an.build_records(ds, "07:00", [date(2026, 1, 2)]) == []  # nothing published yet


def test_quantile_interpolates():
    assert an.quantile([1, 2, 3, 4], 0.5) == 2.5
    assert an.quantile([], 0.5) is None


def test_metrics_basic():
    recs = [{"error": 100, "actual": 1000, "naive_error": 200},
            {"error": -300, "actual": 1000, "naive_error": -200}]
    m = an.metrics(recs)
    assert m["mae"] == 200 and m["bias"] == -100
    assert m["rmse"] == pytest.approx(((100 ** 2 + 300 ** 2) / 2) ** 0.5)
    assert m["wmape"] == pytest.approx(0.2)
    assert m["skill_vs_naive"] == pytest.approx(0.0)


# ---- API against the real bundled snapshot ----
client = TestClient(app)


def test_api_meta_and_window():
    j = client.get("/api/meta").json()
    assert j["delivery_days"][0] == "2026-01-02" and j["delivery_days"][-1] == "2026-02-01"


def test_api_day_full_coverage():
    j = client.get("/api/day", params={"date": "2026-01-15", "cutoff": "09:50"}).json()
    assert len(j["rows"]) == 24
    assert all(r["publish"] <= j["cutoff_time"] for r in j["rows"])
    assert j["cutoff_time"] == "2026-01-14T09:50:00Z"


def test_api_accuracy_sane():
    j = client.get("/api/accuracy").json()
    s = j["summary"]
    assert s["n"] == 31 * 24
    assert 0 < s["mae"] < s["rmse"] < s["max_abs"]


def test_api_validation():
    assert client.get("/api/day", params={"date": "2025-06-01"}).status_code == 404
    assert client.get("/api/day", params={"date": "2026-01-15", "cutoff": "25:00"}).status_code == 422


def test_bias_correction_improves_out_of_sample():
    j = client.get("/api/accuracy").json()["bias_correction"]
    assert j["n"] > 0 and j["mae_corrected"] < j["mae_raw"]


def test_day_has_corrected_series_below_forecast_when_biased():
    j = client.get("/api/day", params={"date": "2026-01-21"}).json()
    assert j["band"]["mean_err"] > 0
    assert all(r["corrected"] <= r["forecast"] for r in j["rows"])
