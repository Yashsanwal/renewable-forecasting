# Video script (target ≤ 9:30 total)

Record the screen with the deployed app open. Unlisted YouTube; verify in incognito.

## Part 1 — Client pitch (≈ 4:30)

**0:00 – Hook (20 s)**
"Every morning your desk has to commit to tomorrow's power before you know what the wind will do. Two questions decide how much thermal you buy: what's the latest wind forecast I had, and how far can I trust it? This pilot answers both, using January 2026 national wind data from Elexon."

**0:20 – Tab: Tomorrow's decision (90 s)**
- Pick **Wed 21 Jan**. "The banner shows the decision moment — 09:50 on the 20th — and the exact forecast issue you had at that time: published 09:30."
- Chart: "Blue is that forecast. Green is what actually happened. The shaded band is the 80 % range learned from the previous days' misses — only outturn you would genuinely have known. The red dashed line is wind you can rely on with 95 % confidence."
- KPIs: "Forecast averaged 19.6 GW, but plan on ~14.1 GW of firm wind. That 5.4 GW gap is the shortfall risk you cover from thermal."
- Revisions chart: "Grey lines are earlier issues, dashed lines were published *after* you'd have bought — we never let them leak into the decision."
- Change the cut-off to 08:00 and back: "Decision time is adjustable to match your auction gate."

**1:50 – Tab: Forecast accuracy (2 min)**
- Headline box: "Across 744 hourly decisions, the forecast averaged 2.0 GW error — 18 % of typical wind. It is clearly useful: 51 % better than assuming nothing changes."
- "But the key finding: it's biased high. 84 % of hours over-forecast, +1.7 GW on average. In 1 hour in 20, you'd be short by more than 5.3 GW."
- Daily chart: "Errors cluster in events — 11–12 Jan and 28 Jan miss by ~5 GW for a whole day."
- Scatter: "Strong wind is where it over-promises: actuals flatten around 17–18 GW while forecasts reach 21."
- Lead-time chart: "Error improves only modestly closer to delivery (about 1.7 GW at 0–6 h vs 2.0 GW at a day out) and the bias stays — it's largely a systematic offset, not noise — which is why a correction or a reserve rule pays off."

**4:00 – Close (30 s)**
"With this you can set a reserve rule — for example, buy cover for the P90 or P95 miss — instead of reacting at balancing prices. Next steps: add demand and price data to turn MW risk into £ risk, and bias-correct the forecast. Thank you."

## Part 2 — Tech lead walkthrough (≈ 5:00)

**0:00 – Architecture (60 s)** — show README layout.
"React + Vite + Recharts front end, FastAPI back end, no database: two Elexon datasets (FUELHH wind, WINDFOR) are committed as compact JSON snapshots, loaded once into memory (~21 k forecast rows, 1.6 k actuals). January 2026 is fixed history, so a snapshot makes the app deterministic and independent of API limits; `scripts/fetch_data.py` refreshes it. Docker builds React then serves it from FastAPI; Vercel serves the static build and runs `api/index.py` as a serverless function."

**1:00 – Analysis design (120 s)** — open `backend/app/analysis.py`.
- "The core is `build_records`: for each delivery hour, take the latest WINDFOR publish ≤ D-1 at cut-off — `Dataset.latest_forecast` in `data.py`. No look-ahead."
- "Actuals: two half-hours averaged to hourly, both required, to match hourly forecasts."
- "`error_band`: signed-error quantiles from delivery days ≤ D-2 only, because D-1's outturn isn't complete at 09:50. `band_backtest` checks it empirically: nominal 80 %, observed 78 %."
- "`metrics`: MAE, RMSE, bias, de-biased MAE, P90/P95, and skill vs persistence baseline."
- "I tested alignment sensitivity (±2 h, HH:00 vs HH:30): the +1.4 GW bias persists, so it's not a time artefact — possibly a scope difference between datasets; flagged as an open question."

**3:00 – API + frontend (60 s)** — open `main.py`, `DayView.jsx`.
"Three endpoints: `/api/meta`, `/api/day`, `/api/accuracy`; validation returns 404/422. All business logic is server-side in pure functions; the frontend only renders. One origin everywhere via Vite proxy / FastAPI static / Vercel rewrite."

**4:00 – Practices (60 s)** — run `pytest -q`.
"9 tests: decision-time selection (including a forecast published after cut-off that must be ignored), half-hour completeness, quantile maths, and API contracts against real data. CI runs tests and the front-end build. Dependencies are minimal — no pandas — to keep the serverless bundle small. AI assistance is disclosed in the README."

**Known limitations to state:** assumed cut-off, one month of history, no demand/price data.
