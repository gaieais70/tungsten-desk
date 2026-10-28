# Tungsten Desk — Institutional Tungsten Price Intelligence & Econometric Pricing Engine (V4)

An institutional-grade commodity pricing, synthetic forward term structure, and supply-demand equilibrium terminal covering the global tungsten value chain (APT 88.5% WO₃, Wolframite/Scheelite Concentrate 65% WO₃, Ferrotungsten 70–75% W, and Tungsten Powder ≥99.7% W).

---

## Quick Start

### Option A — One-Click Windows Launcher (Recommended)

Double-click `start.bat` or run:

```bash
python launcher.py
```

- Serves the live `site/` directory on a dedicated local HTTP server (`http://localhost:8787`).
- Automatically picks an open port and opens your default browser.
- Press `Ctrl+C` in the console window to stop the server anytime.
- Zero external Python dependencies beyond standard library (`http.server`, `socket`, `webbrowser`, `threading`).

### Option B — Automated One-Click Full Data & Model Refresh

To update market data, CTIA Chinese spot dispatches, supply-demand balances, and re-run the V4 econometric pricing models:

```bash
update.bat
# or: python scripts/update.py
```

Runs the automated 5-step institutional pipeline:
1. `scripts/harvest_market.py` — Pulls daily closes from Yahoo Finance + FRED macro series.
2. `scripts/harvest_ctia.py` — Scrapes daily market analysis dispatches from CTIA.
3. `scripts/build_observations.py` — Extracts 1,769 verified physical observations across 6 streams.
4. `scripts/supply_demand_model.py` — Calibrates structural 2025–2035 balances with primary mine & price-elastic scrap decomposition.
5. `scripts/models.py` — Computes V4 models (M0–M9), 10-lens ROW composite, forward term structure, and writes `data/models_output.json` & `site/data/models_output.json`.
6. `scripts/extract_news.py` — Synthesizes regulatory filings, Almonty dispatches, and news wire dispatches.

### Option C — Direct Static HTTP Server

```bash
cd D:\tungsten-dashboard\site
python -m http.server 8787
# open http://localhost:8787 in your browser
```

---

## What's Inside the Repository

| Directory / Script | Description |
|---|---|
| `site/` | Institutional front-end terminal (zero external frameworks/CDN dependencies, native HTML5 Canvas charts, unit toggle `$/mtu WO₃` vs `$/t APT`, responsive layout). |
| `site/data/models_output.json` | Pre-computed model outputs and time-series consumed directly by the front-end terminal. |
| `scripts/models.py` | V4 Econometric Pricing Engine: Models M0–M9, Duan (1983) smearing, RTS backward smoother, 10-lens ROW composite, and Hermite forward spline. |
| `scripts/supply_demand_model.py` | Long-term structural stock-to-use equilibrium model (2025–2035) with decomposed primary mine supply and price-elastic scrap recovery. |
| `scripts/build_observations.py` | Text parser and regex sanitization engine extracting 1,769 verified physical price prints from 413 CTIA daily market dispatches. |
| `scripts/harvest_market.py` | Automated data fetcher for Yahoo Finance equity/commodity tickers, FX rates (USD/CNY, EUR/USD), and FRED macro series. |
| `scripts/update.py` | Master update coordinator executing the full data harvesting, modeling, and output deployment pipeline. |
| `launcher.py` | Windows terminal launcher serving the active `site/` directory and handling dynamic port allocation. |
| `start.bat` | One-click Windows batch file executing `launcher.py`. |
| `data/` | Canonical active data directory (`observations.csv`, `models_output.json`, `supply_demand_output.json`, `usgs_tungsten_history.json`, `almonty_posts.json`). |

---

## The Ten Pricing Models & Lenses (V4 Econometric Engine)

All prices are normalized on a standardized basis of **`$/mtu WO₃` (88.5% APT basis)**, where **`1 metric tonne (t) of APT = 88.5 metric tonne units (mtu) of WO₃`**.

### M0 — Observed Physical Benchmark Suite (6 Verified Streams & Stoichiometric Netbacks)
Synthesizes 1,769 verified physical observations across six distinct market streams from Fastmarkets, ISBP/Dornhofer, CTIA (China Tungsten Industry Association), SMM, and Jiangxi smelters:
1. `apt_eu_usd_mtu` — European APT 88.5% WO₃ CIF Rotterdam (`$2,700.00/mtu` | `$238,950/t APT`).
2. `few_eu_usd_kg` — European Ferrotungsten 75% W CIF Rotterdam (`$152.50/kg W` | native equivalent `$1,209.26/mtu-eq`; stoichiometric netback to APT: **`$1,118.57/mtu`** via European smelting yield factor 0.925).
3. `apt_cn_rmb_t` — China Domestic APT 88.5% WO₃ (`RMB 480,000/t` | `$812.19/mtu` ex-works).
4. `conc65_cn_rmb_t` — China 65% Wolframite/Scheelite Concentrate (`RMB 310,000/t` | `$714.18/mtu`).
5. `powder_cn_rmb_t` — China Tungsten Powder ≥99.7% W (`RMB 750,000/t` | stoichiometric netback to APT: **`$842.85/mtu`** via 1.4615 t APT/t W yield and RMB 22,000/t reduction conversion).
6. `few_cn_rmb_t` — China 70% Ferrotungsten (`RMB 500,000/t` | stoichiometric netback to APT: **`$788.19/mtu`** via 96% yield and RMB 16,000/t smelting fee).

### M1 — Physical Smelting & Hybrid Landed Export Parity Model
- **Concentrate-to-APT Smelting Parity**: $P_{smelt} = 1.445 \cdot P_{conc65} + \text{RMB } 24,000/\text{t}$ (stoichiometry $88.5 / 65.0 = 1.3615$ divided by $94.2\%$ plant recovery & slag carry = $1.445$; empirical level $R^2 = 0.9953$ with China Domestic APT; latest **`$798.57/mtu`** domestic / **`$952.64/mtu`** landed).
- **Hybrid Landed Export Parity**: $P_{export} = 1.1710 \cdot P_{CN\_APT} + \$17.514/\text{mtu}$ (**`$968.59/mtu`**), incorporating 13% cancelled export tax rebate, export licensing compliance (1.1710), and fixed $1,550/t container ocean freight and insurance ($17.514/mtu).
- **Export Fragmentation Wedge**: Measures the quote dislocation: $\text{Wedge} = (P_{obs} / P_{export} - 1) \cdot 100\% = \mathbf{+178.76\%}$, reflecting China's 4-Feb-2025 dual-use export control regime.

### M2 — Pure-Play Tungsten Equity Valuation & Lead Model (12 Constituents, Duan Smearing)
- **12-Constituent Universe**: Western Producers & Developers 53% (`EQR.AX` 13%, `GMET.L` 10%, `ALM` 10%, `TUN.L` 7%, `FWZ.V` 7%, `TGN.AX` 4%, `G6M.AX` Dolphin Mine 3%), Chinese Integrated Majors 38% (`002378.SZ` Zhangyuan 17%, `600549.SS` Xiamen 12%, `000657.SZ` CTHT 8%), Downstream Hardmetal Tooling 9% (`KMT` 5%, `SAND.ST` 4%). Weights sum to exactly $1.00$.
- **Country-Specific FX Sensitivities**: Accounts for local currency translation dynamics (AUD 0.85, GBP 0.78, CAD 0.45, SEK 1.05).
- **Lead Correlation & Fit**: Clean USD log-return index leads European APT spot by 21 trading days (4 weeks) with $r = \mathbf{+0.6015}$, achieving cointegrated level $R^2 = \mathbf{0.9182}$.
- **Duan (1983) Smearing Correction**: Corrects for Jensen's inequality deflation in log-linear retransformation ($\text{Factor} = 1.0324$), nowcasting **`$1,516.98/mtu`**.

### M3 — Value-Chain & Industrial Cointegrated Factor Model (Duan Smearing)
- **Non-Circular Physical Intermediates**: Replaced uncorrelated macro assets with European FeW netback ($1,118.57/mtu), China 65% Concentrate ($714.18/mtu), China Tungsten Powder netback ($842.85/mtu), and Hardmetal Tooling/REMX Index (with Copper as an unpenalized 0-weight control).
- **Fit & Smearing**: Achieves monthly return $R^2 = \mathbf{0.5446}$ and level $R^2 = \mathbf{0.8550}$ with interior elasticities. Duan (1983) smearing factor of $1.0629$ yields a fair-value nowcast of **`$1,389.40/mtu`**.

### M4 — Staleness-Aware Kalman State-Space Filter & Rauch-Tung-Striebel Backward Smoother
- **Bayesian Dual State-Space Formulation**: Fuses observed Rotterdam spot (M0), China export parity (M1), pure-play equities (M2), and intermediate factor fair value (M3) with staleness-aware observation variance $R_t(\Delta t_{print})$.
- **Rauch-Tung-Striebel (1965) Backward Smoother Pass**: Eliminates forward filtering phase lag and applies exact log-normal mean expectation correction $\exp(\hat{x} + \frac{1}{2}P)$.
- **Outputs**:
  - **Kalman Global Fundamental Fair Value (RTS Smoothed)**: **`$1,471.12/mtu`** (90% confidence band `$1,231.95–$1,756.76/mtu`).
  - **Western Executable Contract Clearing Spot**: **`$1,999.33/mtu`**.

### M5 — Long-Term Supply-Demand Stock-to-Use Equilibrium (2025–2035)
- **Decomposed ROW Supply**: Separates rest-of-world supply into primary mine baseline ($17,850.0\text{ t}$ in 2025, 2.5% CAGR) and price-elastic secondary scrap recovery ($2,206.6\text{ t}$ in 2026, elasticity exponent 0.18).
- **Exact Deficit Calibration**: Preserves exact Almonty Sangdong NI 43-101 deficit projections:
  - **2025**: Supply $79,430.0\text{ t}$, Demand $85,000.0\text{ t}$, **Deficit $\mathbf{5,570.0\text{ t}}$** (Coverage 1.25 months).
  - **2026**: Supply $90,051.4\text{ t}$, Demand $92,381.4\text{ t}$, **Deficit $\mathbf{2,330.0\text{ t}}$** (Coverage 0.95 months).
- **Structural Equilibrium Price**: Calibrated via structural stock-to-use elasticity to **`$2,318.23/mtu`**.

### M7 — Marginal Smelting Cost Floor & Greenfield Supply-Security Incentive Model
- **90th-Percentile Smelting AISC Floor**: Anchored by China domestic concentrate AISC ($\sim \$502.00/\text{mtu}$) plus conversion, environmental compliance, and container freight ($94.48/\text{mtu}$) = **`$596.48/mtu`**.
- **Greenfield Supply-Security Incentive Price**: Incorporates greenfield capital recovery for ex-China mine builds ($185.00/\text{mtu}$) and a convex inventory scarcity rent derived from M5 stock-to-use coverage:
  $$P_{\text{incentive}} = (P_{\text{floor}} + \text{CapRec}) \cdot \left(1 + 0.35 \cdot \max\left(0, 1.5 - \frac{\text{Coverage}}{1.8}\right)^2\right) = \mathbf{\$1,575.58/mtu}$$

### M8 — Vector Error Correction Model (VECM) 21-Day Lead-Lag Impulse Nowcast
- **Johansen Cointegration Framework**: Combines the cointegrated long-term anchor ($1,471.12/\text{mtu}$) with the 21-day leading return momentum of Pure-Play Equities ($\beta = 0.32$), European FeW ($\beta = 0.28$), and China Concentrate ($\beta = 0.18$), with error correction adjustment $\lambda = -0.05/\text{wk}$.
- **Momentum Nowcast**: Nowcasts **`$1,214.17/mtu`** reflecting a $-17.5\%$ leading momentum impulse from cooling upstream feedstocks.

### M9 — Downstream Value-in-Use Netback Parity Model
- **ITIA Consumption-Share Weighted Value-in-Use**: Derived from downstream end-product economics:
  - *Cemented Carbides* (62% share): Netback derived from tungsten powder and hardmetal inserts = **`$1,180.00/mtu`**.
  - *Specialty Steels & Superalloys* (24% share): Netback derived from European 75% Ferrotungsten = **`$1,118.57/mtu`**.
  - *Defense & Aerospace Heavy Alloys* (14% share): DFARS procurement security price = **`$1,650.00/mtu`**.
- **Composite Value-in-Use**: **`$1,232.28/mtu`**.

---

## M6 — Final Rest-of-World (ROW) Assumed Tungsten Price

The institutional benchmark synthesizing all 10 physical, netback, econometric, cost-floor, and structural balance signals into a single executable Rest-of-World benchmark:

$$\begin{aligned}
P_{\text{ROW}}(t) = \; & 0.16 \cdot M0_{\text{APT}} + 0.14 \cdot M4_{\text{West}} + 0.13 \cdot M4_{\text{Glob}} + 0.11 \cdot M8_{\text{VECM}} + 0.10 \cdot M3_{\text{Fac}} \\
& + 0.10 \cdot M2_{\text{Eq}} + 0.08 \cdot M9_{\text{Down}} + 0.06 \cdot M7_{\text{Inc}} + 0.06 \cdot M5_{\text{Bal}} + 0.06 \cdot M1_{\text{Exp}}
\end{aligned}$$

### Current Benchmark Summary (as of October 23, 2026)

| Metric | $/mtu WO₃ Basis | $/t APT Basis (88.5% WO₃) |
|---|---|---|
| **Final ROW Assumed Price (M6)** | **`$1,717.37/mtu`** | **`$151,988/t APT`** |
| **90% Econometric Confidence Band** | **`$1,472.03 – $2,003.61/mtu`** | **`$130,275 – $177,319/t APT`** |
| **Discount vs Observed Rotterdam Spot (M0)** | **`-36.39%`** | (Rotterdam Spot: `$2,700.00/mtu` / `$238,950/t`) |
| **Premium vs China Landed Export Parity (M1)** | **`+77.30%`** | (China Landed Parity: `$968.59/mtu` / `$85,720/t`) |
| **12-Month Forward ROW Projection** | **`$1,594.30/mtu`** | **`$141,096/t APT`** |

### Four Alternative Aggregation Benchmarks
Cross-checked across four independent aggregation estimators to verify benchmark stability:
1. **Arithmetic Weighted Mean**: **`$1,717.37/mtu`**
2. **Log-Geometric Mean**: **`$1,715.37/mtu`**
3. **Bates-Granger Precision (Inverse-Variance)**: **`$2,190.68/mtu`**
4. **Trimmed Mean (Middle 80%)**: **`$1,589.01/mtu`**

---

## Synthetic Forward Curve (Spot to 24M)

Constructed using a smooth $C^1$ cubic Hermite spline enforcing monotonicity and continuous derivative matching across tenors (Spot, 1M, 2M, 3M, 6M, 9M, 12M, 18M, 24M). Incorporates:
- Short-term leading momentum impulse decay from M8 VECM.
- A structural restocking hump peaking in Q1 2027 in anticipation of the **January 1, 2027 US DoD DFARS Section 225.7018 ban** on non-allied tungsten procurement.
- Long-term mean-reversion toward M5 structural equilibrium.

---

## Rebuild Everything from Scratch

To rebuild the entire database and re-run all models:

```bash
cd D:\tungsten-dashboard
python scripts/build_observations.py   # rebuild clean 6-stream physical observations DB (1,769 rows)
python scripts/supply_demand_model.py  # M5 supply-demand structural balance (2025-2035)
python scripts/models.py               # recompute V4 models M0-M9 & regenerate JSON outputs
```
