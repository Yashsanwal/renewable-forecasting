# Day-Ahead Wind Forecast Desk

A web app for a UK energy utility's day-ahead trading desk. It answers two questions using Elexon national wind data only:

1. **What is the latest wind forecast I actually had when I had to buy for tomorrow?**
2. **How wrong is that forecast, quantitatively, so I can size the extra power to procure?**

Scope: purchase decisions made in **January 2026** (delivery days 2 Jan – 1 Feb 2026).

- **Live app:** `<ADD VERCEL URL AFTER DEPLOY>`
- **Video demo:** `<ADD UNLISTED YOUTUBE URL>`

> **AI disclosure:** this project was built with the assistance of Claude (Anthropic) via Claude Code — for code generation, analysis design and documentation. All numbers were checked against the raw Elexon data, and the analysis logic is covered by tests.

## Key findings (Jan 2026, 09:50 D-1 cut-off, 744 hourly decisions)

| Metric | Value |
|---|---|
| MAE / RMSE | 2,013 MW / 2,506 MW (17.8 % of mean wind of 11.3 GW) |
| Bias (forecast − actual) | **+1,730 MW**; 84 % of hours over-forecast |
| MAE once bias is removed | 1,402 MW |
| Shortfall risk: P90 / P95 of over-forecast | 4,144 MW / 5,322 MW |
| Skill vs naive persistence | 51 % lower MAE |
| Bias-corrected MAE (out-of-sample, 648 h) | 1,481 MW vs 2,107 MW raw (30 % better) |
| 80 % band (trailing history) actual coverage | 78 % |

The forecast is useful (clearly beats persistence) but **systematically high**, mostly when wind is strong (actual outturn plateaus near 17–18 GW while forecasts reach 21 GW). Part of the offset may be a definitional/scope difference between WINDFOR and FUELHH rather than pure forecast skill — worth confirming with Elexon. For procurement: don't plan on the average miss; plan on the P95 shortfall.

## Interactions

- **Day heat-strip:** 31 tiles shaded by that day's forecast error; click to jump, or use ← / → keys.
- **Confidence slider:** recomputes "wind to rely on" and the thermal cover to hold, from the empirical error quantiles (50–99 %).
- **Series chips** toggle chart lines; hovering the chart highlights the matching table row (and vice versa).
- **Cut-off presets** (07:45 / 09:50 / 11:50) re-run the whole analysis for that decision time.
- **Accuracy tab:** click a daily bar to open that day. Light/dark theme (follows system, remembered), reduced-motion respected.

## How the analysis works

- **Decision forecast.** For each delivery hour on day D, take the latest WINDFOR record with `publishTime` ≤ (D-1 at the cut-off). Default cut-off **09:50** is an *assumption* (typical day-ahead gate closure) and is adjustable in the UI. Later issues are shown dashed as "you would not have had these".
- **Actuals.** FUELHH `fuelType=WIND` half-hours are averaged to hourly (both halves required) to match the hourly forecast.
- **Error** = forecast − actual. Positive = wind over-forecast = extra power to buy.
- **Uncertainty band.** Empirical P10/P90 (80 %) and P95 signed-error quantiles from delivery days ≤ D-2 only (the last outturn fully known at decision time) so the band is genuinely out-of-sample. Early days with < 5 days of history fall back to the full window and are flagged.
- **Bias correction.** Forecast minus the mean signed error of delivery days ≤ D-2 (floored at 0). Backtested only on days with ≥ 5 days of prior history, against the raw forecast on the same hours.
- **"Reliable wind (95 %)"** = forecast − P95 over-forecast error: the wind you can lean on with ~95 % confidence.
- **Baseline.** Naive persistence = most recent completed hourly actual at the cut-off, held flat.
- Alignment sensitivity was checked (±2 h, hourly-mean vs HH:00 vs HH:30 actuals): the bias is unchanged, so it is not a timestamp artefact.

## Repository layout

```
backend/
  app/data.py        Loads snapshots; hourly actuals; "latest forecast before cut-off" lookup
  app/analysis.py    Pure functions: decision records, metrics, error bands, histograms, lead-time profile
  app/main.py        FastAPI: /api/meta, /api/day, /api/accuracy, /api/health (+ serves built React app)
  data/              Bundled Elexon snapshots (windfor.json, fuelhh_wind.json)
  scripts/fetch_data.py   Re-download the snapshots from the Elexon API (no key needed)
  tests/             pytest: decision-time logic, metrics, API contracts
frontend/            React (Vite) + Recharts: "Tomorrow's decision" and "Forecast accuracy" tabs
api/index.py         Vercel serverless entrypoint (wraps the FastAPI app)
vercel.json          Vercel build/routing config
Dockerfile, docker-compose.yml   Multi-stage build: React -> static files served by FastAPI
.github/workflows/ci.yml         Tests + frontend build on every push
docs/VIDEO_SCRIPT.md             Script for the two-part demo video
```

**Design choice:** data is a committed snapshot rather than live calls, so the app is deterministic, instant, and independent of API availability/rate limits (the January 2026 window is historical and fixed). `fetch_data.py` refreshes it.

## Run it

**Docker (single container, app at http://localhost:8000):**
```bash
docker compose up --build
```

**Local development:**
```bash
# backend
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
cd backend && uvicorn app.main:app --reload --port 8000

# frontend (second terminal; proxies /api to :8000)
cd frontend && npm install && npm run dev      # http://localhost:5173
```

**Tests:** `cd backend && pytest -q`

**Deploy to Vercel:** import the repo (root directory = repo root); `vercel.json` handles the build and the Python function.

## Limitations / next steps

- Cut-off time is assumed; confirm the client's actual auction gate closures.
- No demand or price data (out of scope), so the app sizes the *wind uncertainty*, not the total purchase volume or £ cost.
- One month of data: the band is estimated from ≤ 30 days; a rolling longer history would be more stable.
- Error is analysed in aggregate; a regime split (e.g. by wind level) and bias-correcting the forecast are natural next steps.
