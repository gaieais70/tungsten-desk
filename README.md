# Tungsten Desk — Multi-Model Tungsten Price Intelligence

A research prototype dashboard + newsletter-style site covering the tungsten market.
Built as a test of Qwen (via Hermes Agent) end-to-end: real data harvesting → five
independent pricing models → a fedlock-style data-centric UI with a haywire-style
live wire.

## Quick start

**Option A — the executable (no Python needed):**

```bash
D:\tungsten-dashboard\dist\TungstenDesk.exe
```

Double-click it. A console opens, the browser launches at http://localhost:8787,
press Ctrl+C in the console to stop. The site files are bundled inside the exe;
drop an updated `site\` folder next to the exe and it will serve that instead
(live-data override — no rebuild needed).

**Option B — the batch fallback (needs Python on PATH):**

```bash
D:\tungsten-dashboard\start.bat
```

**Option C — plain static server:**

```bash
cd D:\tungsten-dashboard\site
python -m http.server 8787
# open http://localhost:8787
```

No build step, no dependencies beyond a static file server. All data ships as
pre-computed JSON under `site/data/`.

## What's inside

| Path | Purpose |
|---|---|
| `site/` | The dashboard (static HTML/CSS/JS, zero front-end deps, canvas charts) |
| `scripts/harvest_market.py` | Pulls daily closes from Yahoo Finance (20 series: copper, iron ore, FX, indices, tungsten/moly equities) |
| `scripts/models.py` | The model engine — builds all 5 price estimates + backtests |
| `scripts/extract_news.py` | Google News RSS harvest → `site/data/news.json` |
| `data/` | Raw harvests (market_raw.json, usgs_tungsten_history.json, MIS files, RSS XML) |
| `data/models_output.json` | Model outputs copied to `site/data/` |

## The six price lenses (all in $/mtu WO₃, APT 88.5% basis)

- **M0 — Observed/reported**: verified ISBP/Dornhofer anchors ($330 open-2025,
  $1,737 Feb-2026, >$3,000 Jul-2026), Fastmarkets ($3,139.50 on 24-Jul-2026, via
  Almonty deck) + a documented analyst reconstruction of the path between them.
- **M1 — Shanghai-implied + cost of carry (CORNERSTONE)**: the domestic Chinese
  price is the most legitimate anchor (real supply/demand in the 80%-of-production
  market). Rotterdam fair = Shanghai × (1 + carry + export premium). The observed
  Rotterdam premium over fair (~40%+) is the fragmentation signal — policy-driven,
  should compress as Western supply ramps.
- **M2 — Equity-implied (REJECTED, diagnostic only)**: tungsten-equity excess
  returns mapped to price via a calibrated elasticity. Lead-lag test rejects
  equities as a leading indicator (corr −0.19); excluded from the fusion.
- **M3 — Demand-side factor model**: ridge regression on iron ore (mining &
  construction = 26% of end-use), moly basket (sister metal), China ETF, USD/CNY,
  S&P — copper demoted to a CONTROL. R² ≈ 0.42.
- **M4 — Kalman latent-price fusion**: state-space fusion of reported + Shanghai +
  factor signals, equity excluded → headline fair value (Shanghai-anchored, so it
  sits below the reported Rotterdam price).
- **M5 — Supply-demand equilibrium**: stock-to-use balance model (deficits 5,570 t
  2025 / 2,330 t 2026, ~85 kt supply, 2.0% demand CAGR to 2050 — Almonty deck +
  USGS) → price path 2025-2035 in base/bull/bear scenarios, shown as a chart AND
  a full balance table (supply/demand/deficit/stock-to-use/price per year).

## The metal co-movement matrix

- Monthly log-return correlations of tungsten (observed, Shanghai-implied,
  Kalman) against the full metal complex: gold, silver, platinum, palladium,
  copper, zinc, aluminum, iron ore, tin, nickel, lead.
- Tin/nickel/lead come from FRED (World Bank global prices, month-end) — Yahoo's
  LME-linked iPath ETNs (LD/JJN/JJT) were delisted mid-2023 and are useless for
  the 2024+ window. Everything else is Yahoo daily, resampled to month-end.
- Monthly (not daily) is the honest frequency: APT is a monthly-assessed market.
- Shown as a sorted bar chart + a color-scaled matrix table.

## Rebuild everything

```bash
cd D:\tungsten-dashboard
python scripts/supply_demand_model.py  # M5 supply-demand balance (needs the deck figures; standalone)
python scripts/harvest_market.py     # refresh market data (needs internet)
python scripts/models.py             # recompute models (loads M5 output automatically)
python scripts/extract_news.py       # refresh news
copy data\models_output.json site\data\models_output.json
```

## Honesty notes (the site says this too)

- The daily path between verified anchors is an *analyst reconstruction*, labelled
  ESTIMATED throughout — only the anchors are independently verified.
- Equity-implied prices are not prices; the model is REJECTED as a leading
  indicator and kept only as a diagnostic.
- The Shanghai-implied domestic line is reconstructed (no direct SMM feed) — the
  fragmentation discount is the model's biggest single assumption.
- M5 rests on company-sourced balance figures (Almonty/NI 43-101) and modeled,
  not reported, stock levels. It is a scenario tool, not a forecast.
- Factor R² ≈ 0.42 is a finding, not a bug: tungsten is policy/demand-driven.
- Research prototype. Not investment advice.
