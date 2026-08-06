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

## The five price lenses (all in $/mtu WO₃, APT 88.5% basis)

- **M0 — Observed/reported**: verified ISBP/Dornhofer anchors ($330 open-2025,
  $1,737 Feb-2026, >$3,000 Jul-2026) + a documented analyst reconstruction of the
  path between them.
- **M1 — Arbitrage/Shanghai-implied**: structural carry model; the
  Rotterdam↔Shanghai fragmentation discount post export controls IS the signal.
- **M2 — Equity-implied**: the "alpha hypothesis" tested honestly — tungsten-equity
  excess returns mapped to price via a calibrated elasticity. Lead-lag test
  **rejects** equities as a leading indicator (lead corr −0.19).
- **M3 — Proxy-metal factor**: ridge regression on copper, China ETF, USD/CNY,
  S&P, moly basket. R² ≈ 0.41 — tungsten is policy-driven, not copper-driven.
- **M4 — Kalman latent-price fusion**: state-space fusion of all signals →
  headline fair value with a ±1.96σ band.

## Rebuild everything

```bash
cd D:\tungsten-dashboard
python scripts/harvest_market.py     # refresh market data (needs internet)
python scripts/models.py             # recompute models
python scripts/extract_news.py       # refresh news
copy data\models_output.json site\data\models_output.json
```

## Honesty notes (the site says this too)

- The daily path between verified anchors is an *analyst reconstruction*, labelled
  ESTIMATED throughout — only the anchors are independently verified.
- Equity-implied prices are not prices; β is calibrated on a single 18-month window.
- Factor R² is low by construction — that is a finding, not a bug.
- Research prototype. Not investment advice.
