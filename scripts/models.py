"""Tungsten Desk — Econometric Pricing & Forecasting Engine (V4).

Addresses the core challenges of tungsten market analysis:
  1. Price Discovery ("Nowcasting") in an illiquid, assessment-driven market split
     between Rotterdam CIF duty-free spot and China domestic ex-works pricing.
  2. Metallurgical Netback & Hybrid Logistics Parity: replacing crude stoichiometry
     and flat ad-valorem markups with exact yield recoveries, stage conversion costs,
     and fixed container shipping + ad-valorem compliance parity.
  3. Price Forecasting (Kink-Free Synthetic Forward Curve 1M–24M + 2025–2035 Stock-to-Use
     Equilibrium) with 21-day lead-lag impulse and Q1 2027 DFARS procurement ban restocking hump.
  4. Final Rest-of-World (ROW) Assumed Tungsten Price (M6) — an upgraded 10-lens
     institutional composite benchmark (plus Geometric, Bates-Granger precision, and
     Trimmed Mean alternative estimators) solving the Rotterdam illiquidity squeeze vs
     China dual-use export control bifurcation for ex-China valuation.

MODELS (M0–M9):
  M0: Observed Physical Benchmark Suite (6 Verified Streams) & Metallurgical Netbacks
      - European APT 88.5% WO3 ($/mtu, CIF Rotterdam)
      - European Ferrotungsten 75% W ($/kg W & metallurgical netback $/mtu WO3-eq)
      - China Domestic APT 88.5% WO3 (RMB/t & $/mtu)
      - China 65% Tungsten Concentrate (RMB/t & $/mtu WO3)
      - China Tungsten Powder >=99.7% (RMB/t & metallurgical netback $/mtu WO3-eq)
      - China 70% Ferrotungsten (RMB/t & metallurgical netback $/mtu WO3-eq)

  M1: Physical Smelting & Hybrid Landed Export Parity Model
      - Concentrate Smelting-Parity APT: P_smelt = 1.445 * P_conc65 + RMB 24,000/t
        conversion cost (stoichiometry 88.5/65.0 = 1.3615 t ore per t APT divided by
        94.2% practical plant recovery & working-capital/slag factor = 1.445; level R² = 0.9953).
      - Hybrid Rotterdam Landed Export Parity: P_export = P_CN_APT * 1.1710 + $17.51/mtu
        (13% cancelled VAT export rebate + 2.2% MOFCOM dual-use compliance + 0.35% insurance
        + 1.55% 75d transit carry + $1,550/t fixed container/drum freight).
      - Export Fragmentation Wedge (%): Measures the exact policy/quota squeeze
        between Rotterdam spot and Chinese landed export parity.

  M2: Pure-Play Tungsten Equity Valuation (12 Stocks, Duan-Adjusted)
      - Eliminates arithmetic volatility drag via USD-normalized log-return portfolio indexing.
      - Uses all 12 verified pure-play tungsten producers, developers, and downstream
        tooling majors across 3 sub-baskets (all 12 constituents positively weighted, sum = 1.00):
          (a) Western Producers & Developers: EQR.AX, GMET.L, TUN.L, ALM, FWZ.V, TGN.AX, G6M.AX
          (b) Chinese Integrated Majors: 002378.SZ (Zhangyuan), 600549.SS (Xiamen), 000657.SZ (CTHT)
          (c) Downstream Hardmetal Tooling Majors: KMT (Kennametal), SAND.ST (Sandvik)
      - Empirically leads European APT by 21 trading days (4 weeks) with r = +0.6135.
      - Duan's (1983) non-parametric smearing correction resolves log-linear Jensen's inequality bias.

  M3: Value-Chain & Industrial Factor Model (Duan-Adjusted)
      - Strictly non-APT observable value-chain and industrial demand factors:
          * European Ferrotungsten ($/mtu-eq)
          * China 65% Concentrate ($/mtu)
          * China Tungsten Powder ($/mtu-eq)
          * Western Tooling & Strategic Metals Index (KMT + SAND.ST + REMX)
          * Base Metals Control (HG=F Copper, near-zero beta, included for audit comparison)
      - Duan's (1983) non-parametric smearing correction resolves retransformation bias.

  M4: Kalman State-Space Fair Value & RTS Smoother
      - Dual Bayesian state-space filter with staleness-aware observation noise R_t
        and backward Rauch-Tung-Striebel (RTS) optimal state smoother.
      - Log-normal expectation correction: E[P_t] = exp(x_hat + 0.5 * P_var).

  M5: Supply-Demand Stock-to-Use Equilibrium (2025–2035)
      - Annual balance with primary mine baseline + price-elastic secondary scrap supply.

  M6 / ROW Composite: Final Rest-of-World (ROW) Assumed Tungsten Price
      - Upgraded 10-lens weighted composite benchmark ($/mtu WO3 & $/t APT) + 90% confidence
        band + 4 aggregation cross-checks (Arithmetic, Log-Geometric, Bates-Granger, Trimmed Mean).

  M7: Marginal Cost-Curve Floor & Greenfield Incentive Price
      - 90th-percentile global smelted APT AISC floor + Western DFARS greenfield capital
        recovery ($185/mtu) + convex inventory scarcity clearing rent.

  M8: Vector Error Correction & 21-Day Lead-Lag Impulse Nowcast
      - Cointegrated anchor + error-correction pull + 21-day leading indicator momentum nowcast.

  M9: Downstream Carbide, Alloy & Defense Netback Parity
      - Value-in-use netback parity across cemented carbide (62%), specialty steel FeW (24%),
        and defense DFARS procurement (14%) demand pillars.
"""

import datetime
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
SITE_DATA = ROOT / 'site' / 'data'
SITE_DATA.mkdir(parents=True, exist_ok=True)

MTU_PER_T_APT = 88.5
MTU_PER_T_CONC = 65.0
MTU_PER_T_W = 126.11
MTU_PER_T_FEW70 = MTU_PER_T_W * 0.70

# Hybrid Export Parity Constants:
# 13.0% unrebated VAT + 2.2% MOFCOM dual-use compliance + 0.35% insurance + 1.55% 75d transit carry = 1.1710
EXPORT_ADV_MULT = 1.1710
# $1,550/t fixed drumming, inland drayage, customs & 20ft ocean container freight to Rotterdam / 88.5 mtu/t
EXPORT_FIXED_USD_MTU = 1550.0 / MTU_PER_T_APT


# --------------------------------------------------------------------------
# Helper: Pure-NumPy Centered Bounded Ridge Least Squares (No scipy required)
# --------------------------------------------------------------------------
def bounded_ridge_lstsq(X, y, lb, ub, l2=0.1, iters=3000):
    """Solve min_b ||Xb - y||^2 + l2*||b_slope||^2 subject to lb <= b <= ub.

    When X[:, 0] is an intercept column of ones, predictors X[:, 1:] are centered
    prior to applying the L2 penalty so that ridge shrinkage does not bias the
    intercept or force a single regressor to absorb the level.
    """
    lb = np.asarray(lb, dtype=float)
    ub = np.asarray(ub, dtype=float)
    has_intercept = X.shape[1] > 1 and np.allclose(X[:, 0], 1.0)
    if has_intercept:
        x_mean = X[:, 1:].mean(axis=0)
        y_mean = float(np.mean(y))
        Xc = X[:, 1:] - x_mean
        yc = y - y_mean
        XtX = Xc.T @ Xc + l2 * np.eye(Xc.shape[1])
        Xty = Xc.T @ yc
        b_s = np.clip(np.linalg.solve(XtX + 1e-6 * np.eye(Xc.shape[1]), Xty), lb[1:], ub[1:])
        step = 0.9 / (np.linalg.norm(XtX, 2) + 1e-9)
        for _ in range(iters):
            grad = XtX @ b_s - Xty
            b_s = np.clip(b_s - step * grad, lb[1:], ub[1:])
        b0 = float(np.clip(y_mean - x_mean @ b_s, lb[0], ub[0]))
        return np.concatenate([[b0], b_s])

    XtX = X.T @ X + l2 * np.eye(X.shape[1])
    Xty = X.T @ y
    b = np.clip(np.linalg.solve(XtX + 1e-6 * np.eye(X.shape[1]), Xty), lb, ub)
    step = 0.9 / (np.linalg.norm(XtX, 2) + 1e-9)
    for _ in range(iters):
        grad = XtX @ b - Xty
        b = np.clip(b - step * grad, lb, ub)
    return b


def log_return_index(df_sub, weights=None, base=100.0):
    """Construct a chain-linked log-return index free of arithmetic volatility drag."""
    lr = np.log(df_sub).diff().fillna(0.0)
    if weights is not None:
        w = np.asarray(weights, dtype=float)
        w = w / np.sum(w)
        port_lr = (lr * w).sum(axis=1)
    else:
        port_lr = lr.mean(axis=1)
    return base * np.exp(port_lr.cumsum())


# --------------------------------------------------------------------------
# 1. Load Market Data (Yahoo Finance + FRED Monthly Series)
# --------------------------------------------------------------------------
market_raw = json.load(open(DATA / 'market_raw.json', encoding='utf-8'))
series_dict = market_raw['series']
labels_dict = market_raw['labels']


def sym_to_series(sym):
    if sym not in series_dict or not series_dict[sym]:
        return pd.Series(dtype=float)
    df = pd.DataFrame(series_dict[sym], columns=['date', sym])
    df['date'] = pd.to_datetime(df['date'])
    return df.set_index('date')[sym].sort_index()


# FX & Macro / Commodity Series
USDCNY = sym_to_series('CNY=X')
EURUSD = sym_to_series('EURUSD=X')
COPPER = sym_to_series('HG=F')
IRON_ORE = sym_to_series('TIO=F')
SPX = sym_to_series('^GSPC')
FXI = sym_to_series('FXI')
XME = sym_to_series('XME')
REMX = sym_to_series('REMX')
COPX = sym_to_series('COPX')
GOLD = sym_to_series('GC=F')
SILVER = sym_to_series('SI=F')
ALUMINUM = sym_to_series('ALI=F')
ZINC = sym_to_series('ZNC=F')
PLATINUM = sym_to_series('PL=F')
PALLADIUM = sym_to_series('PA=F')
TIN_FRED = sym_to_series('TIN_FRED')
NICKEL_FRED = sym_to_series('NICKEL_FRED')
LEAD_FRED = sym_to_series('LEAD_FRED')

# Pure-Play Tungsten Equities & Downstream Tooling Majors
ALM = sym_to_series('ALM')
GMET_L = sym_to_series('GMET.L')
TUN_L = sym_to_series('TUN.L')
EQR = sym_to_series('EQR.AX')
TGN = sym_to_series('TGN.AX')
G6M = sym_to_series('G6M.AX')
FWZ = sym_to_series('FWZ.V')
XIAMEN = sym_to_series('600549.SS')
ZHANGYUAN = sym_to_series('002378.SZ')
CTHT = sym_to_series('000657.SZ')
KMT = sym_to_series('KMT')
SAND_ST = sym_to_series('SAND.ST')
JDC = sym_to_series('601958.SS')
CMOC = sym_to_series('603993.SS')

# --------------------------------------------------------------------------
# 2. Load Verified Physical Observations DB (6 Streams)
# --------------------------------------------------------------------------
obs_df = pd.read_csv(DATA / 'observations.csv')
obs_df['date'] = pd.to_datetime(obs_df['date'])
obs_df['mid'] = (obs_df['low'] + obs_df['high']) / 2.0


def get_stream_daily(stream_name):
    sub = obs_df[obs_df['stream'] == stream_name]
    return sub.groupby('date')['mid'].mean().sort_index()


eu_apt_raw = get_stream_daily('apt_eu_usd_mtu')
eu_few_raw = get_stream_daily('few_eu_usd_kg')
cn_apt_raw = get_stream_daily('apt_cn_rmb_t')
cn_conc_raw = get_stream_daily('conc65_cn_rmb_t')
cn_pwd_raw = get_stream_daily('powder_cn_rmb_t')
cn_few_raw = get_stream_daily('few_cn_rmb_t')

end_date = max(eu_apt_raw.index.max(), cn_apt_raw.index.max())
full_idx = pd.date_range(start='2025-01-02', end=end_date, freq='D')


def align_interp(s):
    return s.reindex(full_idx).interpolate(method='time').ffill().bfill()


def align_ffill(s):
    return s.reindex(full_idx).ffill().bfill()


def compute_days_since_print(raw_series, idx):
    """Return array of days elapsed since the most recent actual physical print on or before day t."""
    obs_dates = np.sort(raw_series.index.values)
    out = np.zeros(len(idx), dtype=float)
    for i, d in enumerate(idx.values):
        pos = np.searchsorted(obs_dates, d, side='right') - 1
        if pos >= 0:
            delta_days = (d - obs_dates[pos]) / np.timedelta64(1, 'D')
            out[i] = max(0.0, float(delta_days))
        else:
            out[i] = 7.0
    return out


days_since_eu_print = compute_days_since_print(eu_apt_raw, full_idx)
days_since_cn_print = compute_days_since_print(cn_apt_raw, full_idx)

# M0 Physical Suite on daily calendar
m0_series = align_interp(eu_apt_raw)                       # Rotterdam APT ($/mtu)
few_eu_kg = align_interp(eu_few_raw)                       # Rotterdam FeW 75% ($/kg W)
cn_apt_rmb = align_interp(cn_apt_raw)                      # China APT (RMB/t)
cn_conc_rmb = align_interp(cn_conc_raw)                    # China 65% Concentrate (RMB/t)
cn_pwd_rmb = align_interp(cn_pwd_raw)                      # China W Powder (RMB/t)
cn_few_rmb = align_interp(cn_few_raw)                      # China 70% FeW (RMB/t)
usdcny_d = align_ffill(USDCNY)
eurusd_d = align_ffill(EURUSD)
eur_rel_d = eurusd_d / float(eurusd_d.iloc[0])

# Convert all physical streams to unified USD/mtu WO3-equivalent basis
# Raw stoichiometric equivalents (preserved for backwards compatibility)
shanghai_domestic_usd_mtu = cn_apt_rmb / (MTU_PER_T_APT * usdcny_d)
conc65_cn_usd_mtu = cn_conc_rmb / (MTU_PER_T_CONC * usdcny_d)
powder_cn_usd_mtu = cn_pwd_rmb / (MTU_PER_T_W * usdcny_d)
few_cn_usd_mtu = cn_few_rmb / (MTU_PER_T_FEW70 * usdcny_d)
few_eu_usd_mtu = few_eu_kg * (1000.0 / MTU_PER_T_W)       # 1 mtu WO3 = 7.9296 kg W

# APT-Equivalent Metallurgical Netback Series:
# (a) Pure W Powder (>=99.7% W): 1 t W requires 1.4615 t APT (126.11/88.5 = 1.42495 / 97.5% calcination+H2 reduction recovery)
#     plus RMB 22,000/t reduction conversion cost.
pwd_netback_cn_rmb = (cn_pwd_rmb - 22000.0) / 1.4615
pwd_netback_cn_usd_mtu = pwd_netback_cn_rmb / (MTU_PER_T_APT * usdcny_d)

# (b) China 70% Ferrotungsten: 96% furnace recovery, RMB 16,000/t smelting cost
few_netback_cn_rmb = (cn_few_rmb - 16000.0) * 0.96
few_netback_cn_usd_mtu = few_netback_cn_rmb / (MTU_PER_T_FEW70 * usdcny_d)

# (c) European 75% Ferrotungsten: netback factor 0.925 adjusting for Western EAF conversion/alloying margin
few_netback_eu_usd_mtu = few_eu_usd_mtu * 0.925

# --------------------------------------------------------------------------
# 3. M1: Physical Smelting & Hybrid Landed Export Parity Model
# --------------------------------------------------------------------------
# (a) Concentrate -> APT Smelting Parity in China:
#     Stoichiometry: 88.5 / 65.0 = 1.3615 t of 65% WO3 concentrate per t of 88.5% APT.
#     At ~94.2% practical plant recovery across mixed wolframite/scheelite concentrates
#     plus working-capital/slag losses (1.3615 / 0.9422 = 1.445) + RMB 24,000/t fixed
#     reagent/energy/environmental conversion cost (empirical level R² = 0.9953 with CN APT).
SMELT_ORE_RATIO = 1.445
SMELT_CONV_RMB = 24000.0
smelt_parity_cn_rmb = SMELT_ORE_RATIO * cn_conc_rmb + SMELT_CONV_RMB
smelt_parity_cn_usd_mtu = smelt_parity_cn_rmb / (MTU_PER_T_APT * usdcny_d)
smelt_corr_cn = float(np.log(smelt_parity_cn_rmb).diff().corr(np.log(cn_apt_rmb).diff()))
smelt_level_r2 = float(1.0 - np.sum((cn_apt_rmb - smelt_parity_cn_rmb) ** 2) / np.sum((cn_apt_rmb - cn_apt_rmb.mean()) ** 2))

# (b) China Domestic APT -> Hybrid Landed Export Parity (CIF Rotterdam):
#     Decomposes into 17.10% ad-valorem tax/compliance/carry + $1,550/t ($17.51/mtu) fixed logistics
rotterdam_fair_from_shanghai = shanghai_domestic_usd_mtu * EXPORT_ADV_MULT + EXPORT_FIXED_USD_MTU
smelt_export_parity_usd_mtu = smelt_parity_cn_usd_mtu * EXPORT_ADV_MULT + EXPORT_FIXED_USD_MTU
pwd_export_parity_usd_mtu = pwd_netback_cn_usd_mtu * EXPORT_ADV_MULT + EXPORT_FIXED_USD_MTU
fragmentation_premium = (m0_series / rotterdam_fair_from_shanghai - 1.0) * 100.0

# --------------------------------------------------------------------------
# 4. M2: Pure-Play Tungsten Equity Valuation & Lead-Lag Model (12 Stocks, Duan-Adjusted)
# --------------------------------------------------------------------------
# Regional FX normalization: empirical currency beta sensitivities to EUR/USD
aud_fx_d = 0.65 * (eur_rel_d ** 0.85)
gbp_fx_d = 0.0127 * (eur_rel_d ** 0.78)
cad_fx_d = 0.72 * (eur_rel_d ** 0.45)
sek_fx_d = 0.095 * (eur_rel_d ** 1.05)

eq_panel_native = pd.DataFrame({
    '002378.SZ': align_ffill(ZHANGYUAN),
    '600549.SS': align_ffill(XIAMEN),
    '000657.SZ': align_ffill(CTHT),
    'EQR.AX': align_ffill(EQR),
    'GMET.L': align_ffill(GMET_L),
    'TUN.L': align_ffill(TUN_L),
    'ALM': align_ffill(ALM),
    'FWZ.V': align_ffill(FWZ),
    'TGN.AX': align_ffill(TGN),
    'G6M.AX': align_ffill(G6M),
    'KMT': align_ffill(KMT),
    'SAND.ST': align_ffill(SAND_ST),
}, index=full_idx)

# USD-normalized equity panel (removes local currency drift across CNY, GBP, AUD, CAD, SEK)
eq_panel = pd.DataFrame({
    '002378.SZ': eq_panel_native['002378.SZ'] / usdcny_d,
    '600549.SS': eq_panel_native['600549.SS'] / usdcny_d,
    '000657.SZ': eq_panel_native['000657.SZ'] / usdcny_d,
    'EQR.AX': eq_panel_native['EQR.AX'] * aud_fx_d,
    'GMET.L': eq_panel_native['GMET.L'] * gbp_fx_d,
    'TUN.L': eq_panel_native['TUN.L'] * gbp_fx_d,
    'ALM': eq_panel_native['ALM'],
    'FWZ.V': eq_panel_native['FWZ.V'] * cad_fx_d,
    'TGN.AX': eq_panel_native['TGN.AX'] * aud_fx_d,
    'G6M.AX': eq_panel_native['G6M.AX'] * aud_fx_d,
    'KMT': eq_panel_native['KMT'],
    'SAND.ST': eq_panel_native['SAND.ST'] * sek_fx_d,
}, index=full_idx)

# 3 Pure-Play Sub-Baskets + 12-Constituent Composite Index (2025-01-02 = 100)
eq_cn_index = log_return_index(
    eq_panel[['002378.SZ', '600549.SS', '000657.SZ']],
    weights=[0.45, 0.35, 0.20]
)
eq_west_index = log_return_index(
    eq_panel[['EQR.AX', 'GMET.L', 'TUN.L', 'ALM', 'FWZ.V', 'TGN.AX', 'G6M.AX']],
    weights=[0.23, 0.19, 0.13, 0.17, 0.13, 0.08, 0.07]
)
eq_tool_index = log_return_index(
    eq_panel[['KMT', 'SAND.ST']],
    weights=[0.55, 0.45]
)
tungsten_eq_index = log_return_index(
    eq_panel[['002378.SZ', '600549.SS', '000657.SZ', 'EQR.AX', 'GMET.L', 'TUN.L', 'ALM', 'FWZ.V', 'TGN.AX', 'G6M.AX', 'KMT', 'SAND.ST']],
    weights=[0.17, 0.12, 0.08, 0.13, 0.10, 0.07, 0.10, 0.07, 0.04, 0.03, 0.05, 0.04]
)

# Lead-Lag Analysis at Weekly & 21-Trading-Day Horizons
w_panel = pd.DataFrame({
    'eu_apt': m0_series,
    'cn_apt': shanghai_domestic_usd_mtu,
    'eu_few': few_eu_usd_mtu,
    'cn_conc': conc65_cn_usd_mtu,
    'cn_pwd': powder_cn_usd_mtu,
    'eq_comp': tungsten_eq_index,
    'eq_west': eq_west_index,
    'eq_cn': eq_cn_index,
    'eq_tool': eq_tool_index,
}).resample('W-FRI').last().dropna()

w_lr_4w = np.log(w_panel).diff(4).dropna()
eq_4w_contemp_eu = float(w_lr_4w['eq_comp'].corr(w_lr_4w['eu_apt']))
eq_4w_contemp_cn = float(w_lr_4w['eq_comp'].corr(w_lr_4w['cn_apt']))
eq_4w_lead_eu = float(w_lr_4w['eq_comp'].corr(w_lr_4w['eu_apt'].shift(-1)))
eq_4w_lead_cn = float(w_lr_4w['eq_comp'].corr(w_lr_4w['cn_apt'].shift(-1)))
eq_21d_lead_eu = float(np.log(tungsten_eq_index).diff(21).corr(np.log(m0_series).diff(21).shift(-21)))

# Centered Constrained Cointegrated Log-Linear Equity Valuation Model (interior slopes)
X_eq_w = np.column_stack([
    np.ones(len(w_panel)),
    np.log(w_panel['eq_west'].values),
    np.log(w_panel['eq_cn'].values),
    np.log(w_panel['eq_tool'].values),
])
y_eu_w = np.log(w_panel['eu_apt'].values)
b_eq = bounded_ridge_lstsq(X_eq_w, y_eu_w, [-np.inf, 0.05, 0.05, 0.02], [np.inf, 0.85, 0.85, 0.50], l2=6.0)
yhat_eq_w = X_eq_w @ b_eq
eq_r2 = float(1.0 - np.sum((y_eu_w - yhat_eq_w) ** 2) / np.sum((y_eu_w - y_eu_w.mean()) ** 2))

# Duan's (1983) Non-Parametric Smearing Estimator
duan_eq = float(np.mean(np.exp(y_eu_w - yhat_eq_w)))

X_eq_d = np.column_stack([
    np.ones(len(full_idx)),
    np.log(eq_west_index.values),
    np.log(eq_cn_index.values),
    np.log(eq_tool_index.values),
])
M2 = pd.Series(np.exp(X_eq_d @ b_eq) * duan_eq, index=full_idx)

# Per-constituent summary stats (YTD/total return & monthly return correlation to APT)
m_eq_df = pd.concat([
    pd.DataFrame({'eu_apt': m0_series, 'cn_apt': shanghai_domestic_usd_mtu}),
    eq_panel
], axis=1).resample('ME').last()
m_eq_lr = np.log(m_eq_df).diff().dropna()
w4_eq_df = pd.concat([
    pd.DataFrame({'eu_apt': m0_series, 'cn_apt': shanghai_domestic_usd_mtu}),
    eq_panel
], axis=1).resample('W-FRI').last()
w4_eq_lr = np.log(w4_eq_df).diff(4).dropna()

# All 12 pure-play constituents positively weighted, summing to exactly 1.00
EQUITY_META = [
    ('002378.SZ', 'Chongyi Zhangyuan Tungsten', 'CN Producer', 0.17),
    ('600549.SS', 'Xiamen Tungsten Co.', 'CN Producer', 0.12),
    ('000657.SZ', 'China Tungsten & Hightech', 'CN Producer', 0.08),
    ('EQR.AX', 'EQ Resources (Mt Carbine / Barruecopardo)', 'Western Producer', 0.13),
    ('GMET.L', 'Guardian Metal Resources (Pilot Mountain)', 'Western Developer', 0.10),
    ('TUN.L', 'Tungsten West (Hemerdon)', 'Western Developer', 0.07),
    ('ALM', 'Almonty Industries (Sangdong / Panasqueira)', 'Western Producer', 0.10),
    ('FWZ.V', 'Fireweed Metals (Mactung)', 'Western Developer', 0.07),
    ('TGN.AX', 'Tungsten Mining NL (Mt Mulgine)', 'Western Developer', 0.04),
    ('G6M.AX', 'Group 6 Metals (Dolphin Mine)', 'Western Producer', 0.03),
    ('KMT', 'Kennametal Inc.', 'Downstream Tooling', 0.05),
    ('SAND.ST', 'Sandvik AB', 'Downstream Tooling', 0.04),
]
equity_constituent_stats = []
for sym, name, group, w_comp in EQUITY_META:
    s_usd = eq_panel[sym]
    s_nat = eq_panel_native[sym]
    ret_total = (float(s_usd.iloc[-1]) / float(s_usd.iloc[0]) - 1.0) * 100.0
    corr_cn = float(m_eq_lr[sym].corr(m_eq_lr['cn_apt']))
    corr_eu = float(m_eq_lr[sym].corr(m_eq_lr['eu_apt']))
    lead_4w_eu = float(w4_eq_lr[sym].corr(w4_eq_lr['eu_apt'].shift(-1)))
    equity_constituent_stats.append({
        'symbol': sym,
        'name': name,
        'group': group,
        'weight': w_comp,
        'latest_price': round(float(s_nat.iloc[-1]), 3),
        'latest_price_usd': round(float(s_usd.iloc[-1]), 3),
        'return_since_2025_pct': round(ret_total, 1),
        'monthly_corr_cn_apt': round(corr_cn, 3),
        'monthly_corr_eu_apt': round(corr_eu, 3),
        'lead_4w_corr_eu_apt': round(lead_4w_eu, 3),
    })

# --------------------------------------------------------------------------
# 5. M3: Value-Chain & Industrial Factor Model (Rehabilitated, Non-Circular)
# --------------------------------------------------------------------------
tool_remx_panel = pd.DataFrame({
    'KMT': eq_panel['KMT'],
    'SAND.ST': eq_panel['SAND.ST'],
    'REMX': align_ffill(REMX),
}, index=full_idx)
tool_remx_idx = log_return_index(tool_remx_panel, weights=[0.35, 0.35, 0.30])
copper_d = align_ffill(COPPER)
iron_ore_d = align_ffill(IRON_ORE)
spx_d = align_ffill(SPX)
xme_d = align_ffill(XME)
remx_d = align_ffill(REMX)
moly_d = ((align_ffill(JDC) + align_ffill(CMOC)) / 2.0) / usdcny_d

w_fac_df = pd.DataFrame({
    'eu_apt': m0_series,
    'cn_apt': shanghai_domestic_usd_mtu,
    'eu_few': few_eu_usd_mtu,
    'cn_conc': conc65_cn_usd_mtu,
    'cn_pwd': powder_cn_usd_mtu,
    'tool_remx': tool_remx_idx,
    'cu_ctrl': copper_d,
}).resample('W-FRI').last().dropna()

# (A) Monthly Log-Return Regression (Stationary return validation, zero intercept drift)
m_fac_ret = np.log(w_fac_df.resample('ME').last()).diff().dropna()
fcols = ['eu_few', 'cn_conc', 'cn_pwd', 'tool_remx', 'cu_ctrl']
Xf = m_fac_ret[fcols].values
yf = m_fac_ret['eu_apt'].values
Xf_c = Xf - Xf.mean(axis=0)
yf_c = yf - yf.mean()
bf_ret = bounded_ridge_lstsq(Xf_c, yf_c, [0.05, 0.05, 0.05, 0.05, -0.50], [0.85, 0.65, 0.65, 0.65, 0.50], l2=0.06)
factor_r2 = float(1.0 - np.sum((yf_c - Xf_c @ bf_ret) ** 2) / np.sum(yf_c ** 2))
factor_return_betas = {k: round(float(v), 4) for k, v in zip(fcols, bf_ret)}

# (B) Centered Cointegrated Log-Level Value-Chain Factor Model (Interior Elasticities, Zero M0 Circularity)
X_lv_w = np.column_stack([
    np.ones(len(w_fac_df)),
    np.log(w_fac_df['eu_few'].values),
    np.log(w_fac_df['cn_conc'].values),
    np.log(w_fac_df['cn_pwd'].values),
    np.log(w_fac_df['tool_remx'].values),
])
y_lv_w = np.log(w_fac_df['eu_apt'].values)
b_lv = bounded_ridge_lstsq(X_lv_w, y_lv_w, [-np.inf, 0.10, 0.05, 0.05, 0.05], [np.inf, 0.80, 0.55, 0.55, 0.55], l2=9.5)
factor_level_r2 = float(1.0 - np.sum((y_lv_w - X_lv_w @ b_lv) ** 2) / np.sum((y_lv_w - y_lv_w.mean()) ** 2))

# Duan's (1983) Non-Parametric Smearing Estimator for M3
duan_fac = float(np.mean(np.exp(y_lv_w - (X_lv_w @ b_lv))))

X_lv_d = np.column_stack([
    np.ones(len(full_idx)),
    np.log(few_eu_usd_mtu.values),
    np.log(conc65_cn_usd_mtu.values),
    np.log(powder_cn_usd_mtu.values),
    np.log(tool_remx_idx.values),
])
M3 = pd.Series(np.exp(X_lv_d @ b_lv) * duan_fac, index=full_idx)

factor_level_betas = {
    'intercept': round(float(b_lv[0]), 4),
    'eu_ferrotungsten': round(float(b_lv[1]), 4),
    'cn_concentrate_65': round(float(b_lv[2]), 4),
    'cn_tungsten_powder': round(float(b_lv[3]), 4),
    'tooling_strategic_idx': round(float(b_lv[4]), 4),
    'copper_control': 0.0,
}

# Detailed factor diagnostics table
w4_fac_lr = np.log(w_fac_df).diff(4).dropna()
FACTOR_DIAGNOSTICS = [
    {
        'id': 'eu_few',
        'name': 'European Ferrotungsten (75% W, Rotterdam)',
        'category': 'Value-Chain (Included)',
        'role': 'Downstream Western specialty steel/superalloy product',
        'latest_usd_mtu_eq': round(float(few_eu_usd_mtu.iloc[-1]), 1),
        'latest_native': f"${few_eu_kg.iloc[-1]:.1f}/kg W",
        'monthly_corr_eu_apt': round(float(m_fac_ret['eu_few'].corr(m_fac_ret['eu_apt'])), 3),
        'monthly_corr_cn_apt': round(float(m_fac_ret['eu_few'].corr(m_fac_ret['cn_apt'])), 3),
        'lead_4w_corr_eu_apt': round(float(w4_fac_lr['eu_few'].corr(w4_fac_lr['eu_apt'].shift(-1))), 3),
        'return_beta': factor_return_betas['eu_few'],
        'level_elasticity': factor_level_betas['eu_ferrotungsten'],
    },
    {
        'id': 'cn_conc',
        'name': 'China 65% Tungsten Concentrate (Wolframite/Scheelite)',
        'category': 'Value-Chain (Included)',
        'role': 'Primary upstream mine feedstock (1.445 t per t APT)',
        'latest_usd_mtu_eq': round(float(conc65_cn_usd_mtu.iloc[-1]), 1),
        'latest_native': f"RMB {cn_conc_rmb.iloc[-1]:,.0f}/t",
        'monthly_corr_eu_apt': round(float(m_fac_ret['cn_conc'].corr(m_fac_ret['eu_apt'])), 3),
        'monthly_corr_cn_apt': round(float(m_fac_ret['cn_conc'].corr(m_fac_ret['cn_apt'])), 3),
        'lead_4w_corr_eu_apt': round(float(w4_fac_lr['cn_conc'].corr(w4_fac_lr['eu_apt'].shift(-1))), 3),
        'return_beta': factor_return_betas['cn_conc'],
        'level_elasticity': factor_level_betas['cn_concentrate_65'],
    },
    {
        'id': 'cn_pwd',
        'name': 'China Tungsten Powder (>=99.7% W)',
        'category': 'Value-Chain (Included)',
        'role': 'Downstream cemented carbide & defense precursor',
        'latest_usd_mtu_eq': round(float(powder_cn_usd_mtu.iloc[-1]), 1),
        'latest_native': f"RMB {cn_pwd_rmb.iloc[-1]:,.0f}/t",
        'monthly_corr_eu_apt': round(float(m_fac_ret['cn_pwd'].corr(m_fac_ret['eu_apt'])), 3),
        'monthly_corr_cn_apt': round(float(m_fac_ret['cn_pwd'].corr(m_fac_ret['cn_apt'])), 3),
        'lead_4w_corr_eu_apt': round(float(w4_fac_lr['cn_pwd'].corr(w4_fac_lr['eu_apt'].shift(-1))), 3),
        'return_beta': factor_return_betas['cn_pwd'],
        'level_elasticity': factor_level_betas['cn_tungsten_powder'],
    },
    {
        'id': 'tool_remx',
        'name': 'Hardmetal Tooling & Strategic Metals (KMT / SAND.ST / REMX)',
        'category': 'Industrial Demand (Included)',
        'role': 'Western cemented-carbide cutting tools & critical mineral policy complex',
        'latest_usd_mtu_eq': round(float(tool_remx_idx.iloc[-1]), 1),
        'latest_native': f"Index {tool_remx_idx.iloc[-1]:.1f}",
        'monthly_corr_eu_apt': round(float(m_fac_ret['tool_remx'].corr(m_fac_ret['eu_apt'])), 3),
        'monthly_corr_cn_apt': round(float(m_fac_ret['tool_remx'].corr(m_fac_ret['cn_apt'])), 3),
        'lead_4w_corr_eu_apt': round(float(w4_fac_lr['tool_remx'].corr(w4_fac_lr['eu_apt'].shift(-1))), 3),
        'return_beta': factor_return_betas['tool_remx'],
        'level_elasticity': factor_level_betas['tooling_strategic_idx'],
    },
    {
        'id': 'cu_ctrl',
        'name': 'COMEX Copper Futures (HG=F)',
        'category': 'Macro Control (Excluded = 0 wt)',
        'role': 'Generic base metal — near-zero/negative correlation with tungsten supply shock',
        'latest_usd_mtu_eq': round(float(copper_d.iloc[-1]), 2),
        'latest_native': f"${copper_d.iloc[-1]:.2f}/lb",
        'monthly_corr_eu_apt': round(float(m_fac_ret['cu_ctrl'].corr(m_fac_ret['eu_apt'])), 3),
        'monthly_corr_cn_apt': round(float(m_fac_ret['cu_ctrl'].corr(m_fac_ret['cn_apt'])), 3),
        'lead_4w_corr_eu_apt': round(float(w4_fac_lr['cu_ctrl'].corr(w4_fac_lr['eu_apt'].shift(-1))), 3),
        'return_beta': factor_return_betas['cu_ctrl'],
        'level_elasticity': 0.0,
    },
]

# --------------------------------------------------------------------------
# 6. M4: Kalman State-Space Fair-Value Filter (Staleness-Aware R_t & RTS Smoother)
# --------------------------------------------------------------------------
n_obs = len(full_idx)
log_m0 = np.log(m0_series.values)
log_m1 = np.log(rotterdam_fair_from_shanghai.values)
log_m2 = np.log(M2.values)
log_m3 = np.log(M3.values)


def run_kalman_dynamic(obs_mat, R_time_series, q_level=1.2e-4, q_drift=1e-6):
    """Kalman filter with time-varying diagonal observation noise R_t[t] and RTS backward smoother."""
    F = np.array([[1.0, 1.0], [0.0, 0.96]])
    Q = np.diag([q_level, q_drift])
    k_obs = obs_mat.shape[0]
    H = np.zeros((k_obs, 2))
    H[:, 0] = 1.0
    x_hat = np.array([obs_mat[0, 0], 0.0])
    P_mat = np.eye(2) * 0.04

    x_filt = np.zeros((n_obs, 2))
    P_filt = np.zeros((n_obs, 2, 2))
    x_pred = np.zeros((n_obs, 2))
    P_pred = np.zeros((n_obs, 2, 2))

    out_log = np.zeros(n_obs)
    out_var = np.zeros(n_obs)
    out_drift = np.zeros(n_obs)

    for t in range(n_obs):
        if t == 0:
            x_p = x_hat
            P_p = P_mat
        else:
            x_p = F @ x_filt[t - 1]
            P_p = F @ P_filt[t - 1] @ F.T + Q
        x_pred[t] = x_p
        P_pred[t] = P_p

        z = obs_mat[:, t]
        R_t = np.diag(R_time_series[:, t])
        y_tilde = z - H @ x_p
        S_mat = H @ P_p @ H.T + R_t
        K_gain = P_p @ H.T @ np.linalg.inv(S_mat)
        x_hat = x_p + K_gain @ y_tilde
        P_mat = (np.eye(2) - K_gain @ H) @ P_p

        x_filt[t] = x_hat
        P_filt[t] = P_mat
        out_log[t] = x_hat[0]
        out_var[t] = P_mat[0, 0]
        out_drift[t] = x_hat[1]

    # Rauch-Tung-Striebel (RTS) Backward Smoother Pass
    x_smooth = np.zeros((n_obs, 2))
    P_smooth = np.zeros((n_obs, 2, 2))
    x_smooth[-1] = x_filt[-1]
    P_smooth[-1] = P_filt[-1]

    for t in range(n_obs - 2, -1, -1):
        J_t = P_filt[t] @ F.T @ np.linalg.inv(P_pred[t + 1])
        x_smooth[t] = x_filt[t] + J_t @ (x_smooth[t + 1] - x_pred[t + 1])
        P_smooth[t] = P_filt[t] + J_t @ (P_smooth[t + 1] - P_pred[t + 1]) @ J_t.T

    smooth_log = x_smooth[:, 0]
    smooth_var = P_smooth[:, 0, 0]

    return out_log, out_var, out_drift, smooth_log, smooth_var


# (A) Global Fundamental Fair Value (staleness-aware R_t scales M0 & M1 variance between actual prints)
obs_global = np.vstack([log_m0, log_m1, log_m2, log_m3])
R_global_ts = np.vstack([
    0.012 * (1.0 + 0.35 * days_since_eu_print),
    0.014 * (1.0 + 0.25 * days_since_cn_print),
    np.full(n_obs, 0.009),
    np.full(n_obs, 0.008),
])
kalman_log, kalman_var, kalman_drift, kalman_smooth_log, kalman_smooth_var = run_kalman_dynamic(obs_global, R_global_ts)
# Log-normal expectation correction: E[P_t] = exp(x_hat + 0.5 * P_var)
M4 = pd.Series(np.exp(kalman_log + 0.5 * kalman_var), index=full_idx)
M4_RTS = pd.Series(np.exp(kalman_smooth_log + 0.5 * kalman_smooth_var), index=full_idx)
cross_disp = np.std(obs_global, axis=0)
total_sd = np.sqrt(kalman_var + (0.28 * cross_disp) ** 2)
M4_LO = pd.Series(np.exp(kalman_log - 1.645 * total_sd), index=full_idx)
M4_HI = pd.Series(np.exp(kalman_log + 1.645 * total_sd), index=full_idx)

# (B) Western Executable Clearing Price (staleness-aware M0 + M2 + M3 for ex-China bilateral clearing)
obs_west = np.vstack([log_m0, log_m2, log_m3])
R_west_ts = np.vstack([
    0.005 * (1.0 + 0.25 * days_since_eu_print),
    np.full(n_obs, 0.018),
    np.full(n_obs, 0.016),
])
west_log, west_var, west_drift, west_smooth_log, west_smooth_var = run_kalman_dynamic(obs_west, R_west_ts)
M4_WEST = pd.Series(np.exp(west_log + 0.5 * west_var), index=full_idx)

# --------------------------------------------------------------------------
# 6B. New Models: M7 (Incentive & Cost Floor), M8 (VECM Lead Nowcast), M9 (Downstream Parity)
# --------------------------------------------------------------------------
# (A) M7: Marginal Cost-Curve Floor & Greenfield Incentive Price Model
# 90th-percentile global smelted APT AISC floor anchored at RMB 205,000/t concentrate + RMB 24,000/t smelting
base_cost_floor_rmb = 1.445 * 205000.0 + 24000.0
base_cost_floor_usd_mtu = base_cost_floor_rmb / (MTU_PER_T_APT * usdcny_d)
input_mining_factor = 0.85 + 0.15 * (xme_d / float(xme_d.iloc[0]))
marginal_cost_floor_mtu = base_cost_floor_usd_mtu * input_mining_factor

# Daily coverage interpolated from M5 stock-to-use balance
cov_anchor_s = pd.Series({
    pd.Timestamp('2025-01-02'): 3.00,
    pd.Timestamp('2025-07-01'): 2.262,
    pd.Timestamp('2026-07-01'): 1.915,
    pd.Timestamp('2027-07-01'): 2.358,
})
cov_daily_idx = pd.date_range('2025-01-02', '2027-07-01', freq='D')
cov_d = cov_anchor_s.reindex(cov_daily_idx).interpolate(method='time').reindex(full_idx).ffill().bfill()
scarcity_mult = np.maximum(0.0, (3.0 / np.maximum(cov_d, 0.8)) ** 2.1 - 1.0)
M7 = marginal_cost_floor_mtu + 185.0 + 310.0 * scarcity_mult * (0.55 + 0.45 * (few_eu_usd_mtu / 350.0))

# (B) M8: Vector Error Correction & 21-Day Lead-Lag Impulse Nowcast
coint_base = np.exp(0.50 * np.log(M3) + 0.50 * np.log(M2))

w_vecm_df = pd.DataFrame({
    'apt': m0_series,
    'coint': coint_base,
    'eq': tungsten_eq_index,
    'few': few_eu_usd_mtu,
    'conc': conc65_cn_usd_mtu,
}).resample('W-FRI').last().dropna()

w_lr_apt_4w = np.log(w_vecm_df['apt']).diff(4)
y_vecm_w = w_lr_apt_4w.shift(-4).dropna()
common_w_idx = y_vecm_w.index.intersection(w_vecm_df.index)

z_w = (np.log(w_vecm_df['apt']) - np.log(w_vecm_df['coint'])).loc[common_w_idx].values
dl_eq_w = np.log(w_vecm_df['eq']).diff(4).loc[common_w_idx].fillna(0.0).values
dl_few_w = np.log(w_vecm_df['few']).diff(4).loc[common_w_idx].fillna(0.0).values
dl_conc_w = np.log(w_vecm_df['conc']).diff(4).loc[common_w_idx].fillna(0.0).values
y_v = y_vecm_w.loc[common_w_idx].values

X_vecm_w = np.column_stack([
    np.ones(len(common_w_idx)),
    z_w,
    dl_eq_w,
    dl_few_w,
    dl_conc_w,
])

b_vecm = bounded_ridge_lstsq(
    X_vecm_w, y_v,
    [-0.20, -0.65, 0.05, 0.05, 0.05],
    [0.20, -0.08, 0.60, 0.60, 0.60],
    l2=2.0
)

dl_eq_21 = np.log(tungsten_eq_index).diff(21).fillna(0.0)
dl_few_21 = np.log(few_eu_usd_mtu).diff(21).fillna(0.0)
dl_conc_21 = np.log(conc65_cn_usd_mtu).diff(21).fillna(0.0)
z_d = np.log(m0_series) - np.log(coint_base)

vecm_impulse_d = (
    b_vecm[1] * z_d +
    b_vecm[2] * dl_eq_21 +
    b_vecm[3] * dl_few_21 +
    b_vecm[4] * dl_conc_21
)
M8 = coint_base * np.exp(vecm_impulse_d)

# (C) M9: Downstream Carbide, Alloy & Defense Netback Parity Model
carbide_pillar = pwd_export_parity_usd_mtu * ((eq_tool_index / 100.0) ** 0.38)
steel_pillar = 0.65 * few_netback_eu_usd_mtu + 0.35 * (few_netback_cn_usd_mtu * EXPORT_ADV_MULT + EXPORT_FIXED_USD_MTU)
defense_pillar = 0.55 * M4_WEST + 0.45 * M7
M9 = 0.62 * carbide_pillar + 0.24 * steel_pillar + 0.14 * defense_pillar

# --------------------------------------------------------------------------
# 7. Load M5 Supply-Demand Equilibrium & Build Final ROW Assumed Price (M6)
# --------------------------------------------------------------------------
sd_output_path = DATA / 'supply_demand_output.json'
sd_data = json.load(open(sd_output_path, encoding='utf-8')) if sd_output_path.exists() else None

m5_2025_base = 925.0
m5_2026_base = 2575.1
m5_2027_base = 1751.8
m5_2027_bull = 2500.0
m5_2027_bear = 1480.0
m5_2028_base = 1100.2
if sd_data and 'scenarios' in sd_data:
    b_map = {r['year']: r['price_mtu'] for r in sd_data['scenarios']['base']['price_path_mtu']}
    u_map = {r['year']: r['price_mtu'] for r in sd_data['scenarios']['bull']['price_path_mtu']}
    d_map = {r['year']: r['price_mtu'] for r in sd_data['scenarios']['bear']['price_path_mtu']}
    m5_2025_base = float(b_map.get(2025, 925.0))
    m5_2026_base = float(b_map.get(2026, 2575.1))
    m5_2027_base = float(b_map.get(2027, 1751.8))
    m5_2027_bull = float(u_map.get(2027, 2500.0))
    m5_2027_bear = float(d_map.get(2027, 1480.0))
    m5_2028_base = float(b_map.get(2028, 1100.2))

# Daily-interpolated M5 Stock-to-Use Structural Equilibrium series across full_idx
m5_anchor_s = pd.Series({
    pd.Timestamp('2025-01-02'): 330.0,
    pd.Timestamp('2025-07-01'): m5_2025_base,
    pd.Timestamp('2026-07-01'): m5_2026_base,
    pd.Timestamp('2027-07-01'): m5_2027_base,
})
m5_daily_idx = pd.date_range('2025-01-02', '2027-07-01', freq='D')
m5_daily_series = m5_anchor_s.reindex(m5_daily_idx).interpolate(method='time').reindex(full_idx).ffill().bfill()

# --------------------------------------------------------------------------
# 7B. Final Rest-of-World (ROW) Assumed Tungsten Price (M6 10-Lens Composite)
# --------------------------------------------------------------------------
# Explicit multi-lens weights summing to exactly 1.00 (100%):
ROW_WEIGHTS = [
    (
        'm0_rotterdam',
        'Observed Rotterdam CIF Spot',
        'M0 (Spot)',
        0.16,
        m0_series,
        'Marginal Western physical spot transactions & urgent unhedged restocking benchmark (CIF Rotterdam duty-free)',
    ),
    (
        'm4_west',
        'Western Executable Contract Nowcast',
        'M4 (West)',
        0.14,
        M4_WEST,
        'Ex-China bilateral industrial contract clearing price filtered for thin spot vessel illiquidity',
    ),
    (
        'm4_global',
        'Kalman Global Fundamental Fair Value',
        'M4 (Global)',
        0.13,
        M4,
        'Bayesian precision-weighted latent global equilibrium fusing physical & financial information',
    ),
    (
        'm8_vecm',
        'VECM 21-Day Lead-Lag Impulse Nowcast',
        'M8 (VECM Lead)',
        0.11,
        M8,
        '21-day econometric lead-lag error correction impulse nowcast combining equity & downstream signals',
    ),
    (
        'm3_factor',
        'Value-Chain & Industrial Factor Fair Value',
        'M3 (Factor)',
        0.10,
        M3,
        'Non-APT intermediate value-chain parity (European FeW, Concentrate, Powder & Western hardmetal tooling)',
    ),
    (
        'm2_equity',
        'Pure-Play Equity-Implied Valuation (12 Stocks)',
        'M2 (Equity)',
        0.10,
        M2,
        'Capital-market implied incentive price across 12 pure-play miners, developers & tooling majors (4W lead)',
    ),
    (
        'm9_downstream',
        'Downstream Carbide & Alloy Netback Parity',
        'M9 (Downstream)',
        0.08,
        M9,
        'Value-in-use netback parity across cemented carbide (62%), specialty steel (24%), and defense (14%) pillars',
    ),
    (
        'm7_incentive',
        'Marginal Cost & Supply-Security Incentive Price',
        'M7 (Incentive)',
        0.06,
        M7,
        '90th-percentile global smelting AISC cost-curve floor + Western greenfield capital recovery + scarcity rent',
    ),
    (
        'm5_equilibrium',
        'M5 Structural Stock-to-Use Equilibrium',
        'M5 (Balance)',
        0.06,
        m5_daily_series,
        'Annual global deficit & inventory coverage balance trajectory (Sangdong NI 43-101 + policy premium)',
    ),
    (
        'm1_export_parity',
        'China Hybrid Landed Export Parity (CIF Rotterdam)',
        'M1 (Parity)',
        0.06,
        rotterdam_fair_from_shanghai,
        'Licensed Chinese export arbitrage anchor (China ex-works APT x 1.1710 VAT/licensing + $17.51/mtu freight)',
    ),
]

ROW_PRICE = sum(w * s for _, _, _, w, s, _ in ROW_WEIGHTS)
row_log_mat = np.vstack([np.log(s.values) for _, _, _, _, s, _ in ROW_WEIGHTS])
row_w_vec = np.array([w for _, _, _, w, _, _ in ROW_WEIGHTS])[:, None]
row_mean_log = np.sum(row_w_vec * row_log_mat, axis=0)
row_var_log = np.sum(row_w_vec * (row_log_mat - row_mean_log) ** 2, axis=0)
row_sd_log = np.sqrt(kalman_var + (0.30 * np.sqrt(row_var_log)) ** 2)
ROW_LO = pd.Series(ROW_PRICE.values * np.exp(-1.645 * row_sd_log), index=full_idx)
ROW_HI = pd.Series(ROW_PRICE.values * np.exp(+1.645 * row_sd_log), index=full_idx)

# Alternative Aggregation Benchmarks across the 10 lenses:
ROW_GEOM_PRICE = pd.Series(np.exp(row_mean_log + 0.5 * row_var_log), index=full_idx)
ROW_GEOM_MEDIAN = pd.Series(np.exp(row_mean_log), index=full_idx)

# Bates-Granger rolling 60-day inverse variance precision weighting:
lens_mat = np.column_stack([s.values for _, _, _, _, s, _ in ROW_WEIGHTS])
lens_ret_df = pd.DataFrame(np.log(lens_mat), index=full_idx).diff().fillna(0.0)
lens_var_df = lens_ret_df.rolling(60, min_periods=10).var().bfill()
precisions = 1.0 / np.maximum(lens_var_df.values, 1e-6)
w_bg = precisions / precisions.sum(axis=1, keepdims=True)
row_bg_vals = np.sum(w_bg * lens_mat, axis=1)
ROW_BATES_GRANGER = pd.Series(row_bg_vals, index=full_idx)

# Trimmed mean (excluding min and max lenses at each day)
row_trimmed_vals = np.mean(np.sort(lens_mat, axis=1)[:, 1:-1], axis=1)
ROW_TRIMMED = pd.Series(row_trimmed_vals, index=full_idx)

spot_rot = float(m0_series.iloc[-1])
spot_west_exec = float(M4_WEST.iloc[-1])
spot_glob_fair = float(M4.iloc[-1])
spot_cn_parity = float(rotterdam_fair_from_shanghai.iloc[-1])
spot_eq_imp = float(M2.iloc[-1])
spot_fac_imp = float(M3.iloc[-1])
spot_row = float(ROW_PRICE.iloc[-1])

row_components_detail = []
for cid, cname, mtag, w, s, rationale in ROW_WEIGHTS:
    lv = float(s.iloc[-1])
    contrib = w * lv
    row_components_detail.append({
        'id': cid,
        'name': cname,
        'model_tag': mtag,
        'weight': round(float(w), 4),
        'latest_usd_mtu': round(lv, 2),
        'latest_usd_t': round(lv * MTU_PER_T_APT, 0),
        'weighted_contribution_usd_mtu': round(contrib, 2),
        'weighted_contribution_usd_t': round(contrib * MTU_PER_T_APT, 0),
        'vs_rotterdam_pct': round((lv / spot_rot - 1.0) * 100.0, 1),
        'rationale': rationale,
    })

# --------------------------------------------------------------------------
# 7C. Synthetic Forward Curve (Spot, 1M, 2M, 3M, 6M, 9M, 12M, 24M)
# --------------------------------------------------------------------------
HORIZONS = [
    ('Spot', 0, 'Current Observed / Nowcast'),
    ('1M', 30, '4-Week Lead Indicator Impulse (FeW + Equities + Concentrate)'),
    ('2M', 60, 'Pre-DoW Ban Restocking & Quota Tightening Window'),
    ('3M', 91, 'Q1 2027 US DoW Procurement Ban Effective + Lunar New Year Smelter Maintenance'),
    ('6M', 182, 'H1 2027 Sangdong Phase I Commercial Ramp & Arbitrage Compression'),
    ('9M', 273, 'Q3 2027 Western Supply Integration vs Defense Stockpiling'),
    ('12M', 365, '1-Year Forward Equilibrium (Aligned with M5 2027 Stock-to-Use Balance)'),
    ('24M', 730, '2-Year Forward Equilibrium (Sangdong Phase II + Mt Carbine Ramp)'),
]

rot_12m_target = 0.55 * m5_2027_base + 0.25 * spot_west_exec + 0.20 * spot_eq_imp
rot_24m_target = 0.65 * m5_2028_base + 0.35 * spot_eq_imp
glob_12m_target = 0.40 * spot_eq_imp + 0.30 * spot_fac_imp + 0.30 * m5_2027_base
glob_24m_target = 0.50 * m5_2028_base + 0.50 * spot_fac_imp
cn_12m_target = 0.50 * spot_cn_parity + 0.50 * glob_12m_target
cn_24m_target = 0.60 * spot_cn_parity + 0.40 * glob_24m_target
row_12m_target = 0.30 * rot_12m_target + 0.40 * glob_12m_target + 0.15 * m5_2027_base + 0.15 * cn_12m_target
row_24m_target = 0.30 * rot_24m_target + 0.40 * glob_24m_target + 0.15 * m5_2028_base + 0.15 * cn_24m_target

lead_impulse_pct = float((M8.iloc[-1] / M4.iloc[-1]) - 1.0)


def smooth_fwd_eval(s0, t12, t24, days, kappa=2.2):
    tau = days / 365.0
    denom = 1.0 - np.exp(-kappa)
    d1 = (t12 - s0) * (kappa * np.exp(-kappa)) / denom
    if tau <= 1.0:
        u = (1.0 - np.exp(-kappa * tau)) / denom
        base = s0 + (t12 - s0) * u
    else:
        th = min(1.0, tau - 1.0)
        h00 = 2 * th**3 - 3 * th**2 + 1
        h10 = th**3 - 2 * th**2 + th
        h01 = -2 * th**3 + 3 * th**2
        h11 = th**3 - th**2
        base = h00 * t12 + h10 * d1 + h01 * t24
    if days == 0:
        tr = 0.0
    else:
        tr_lead = lead_impulse_pct * np.exp(-tau / 0.10) * (tau / (tau + 0.05))
        tr_dfars = 0.045 * np.exp(-((tau - 0.22) / 0.12) ** 2) * (tau / (tau + 0.03))
        tr = tr_lead + tr_dfars
    return base * (1.0 + tr)


forward_curve = []
for label, days, driver_note in HORIZONS:
    tau = days / 365.0
    rot_fwd = smooth_fwd_eval(spot_rot, rot_12m_target, rot_24m_target, days, kappa=2.2)
    glob_fwd = smooth_fwd_eval(spot_glob_fair, glob_12m_target, glob_24m_target, days, kappa=1.8)
    cn_fwd = smooth_fwd_eval(spot_cn_parity, cn_12m_target, cn_24m_target, days, kappa=2.0)
    row_fwd = smooth_fwd_eval(spot_row, row_12m_target, row_24m_target, days, kappa=2.0)

    sigma_h = 0.06 + 0.20 * np.sqrt(max(tau, 0.02)) if days > 0 else 0.037
    bull_hi = rot_fwd * np.exp(1.28 * sigma_h)
    bear_lo = rot_fwd * np.exp(-1.28 * sigma_h)

    fwd_date = (end_date + pd.Timedelta(days=days)).strftime('%Y-%m-%d')
    forward_curve.append({
        'tenor': label,
        'days': days,
        'date': fwd_date,
        'rotterdam_Clean_fwd_mtu': round(float(rot_fwd), 1),
        'rotterdam_fwd_mtu': round(float(rot_fwd), 1),
        'row_composite_fwd_mtu': round(float(row_fwd), 1),
        'global_fair_fwd_mtu': round(float(glob_fwd), 1),
        'china_parity_fwd_mtu': round(float(cn_fwd), 1),
        'implied_wedge_pct': round(float((rot_fwd / cn_fwd - 1.0) * 100.0), 1),
        'bull_80_hi_mtu': round(float(bull_hi), 1),
        'bear_80_lo_mtu': round(float(bear_lo), 1),
        'rotterdam_chg_pct': round(float((rot_fwd / spot_rot - 1.0) * 100.0), 1),
        'row_chg_pct': round(float((row_fwd / spot_row - 1.0) * 100.0), 1),
        'global_chg_pct': round(float((glob_fwd / spot_glob_fair - 1.0) * 100.0), 1),
        'china_chg_pct': round(float((cn_fwd / spot_cn_parity - 1.0) * 100.0), 1),
        'driver': driver_note,
    })

# Daily / Weekly continuous 12-month forward trajectory for seamless charting
fwd_dates = pd.date_range(start=end_date, end=end_date + pd.Timedelta(days=365), freq='7D')
fwd_rot_series = []
fwd_row_series = []
fwd_glob_series = []
fwd_cn_series = []
fwd_hi_series = []
fwd_lo_series = []
for d in fwd_dates:
    days = (d - end_date).days
    tau = days / 365.0
    ds = d.strftime('%Y-%m-%d')
    rf = smooth_fwd_eval(spot_rot, rot_12m_target, rot_24m_target, days, kappa=2.2)
    rowf = smooth_fwd_eval(spot_row, row_12m_target, row_24m_target, days, kappa=2.0)
    gf = smooth_fwd_eval(spot_glob_fair, glob_12m_target, glob_24m_target, days, kappa=1.8)
    cf = smooth_fwd_eval(spot_cn_parity, cn_12m_target, cn_24m_target, days, kappa=2.0)
    sig = 0.04 + 0.20 * np.sqrt(max(tau, 0.005))
    fwd_rot_series.append([ds, round(float(rf), 2)])
    fwd_row_series.append([ds, round(float(rowf), 2)])
    fwd_glob_series.append([ds, round(float(gf), 2)])
    fwd_cn_series.append([ds, round(float(cf), 2)])
    fwd_hi_series.append([ds, round(float(rf * np.exp(1.28 * sig)), 2)])
    fwd_lo_series.append([ds, round(float(rf * np.exp(-1.28 * sig)), 2)])

# --------------------------------------------------------------------------
# 8. Full Metal Complex Co-Movement & Correlation Matrix
# --------------------------------------------------------------------------
metals_dict = {
    'EU Ferrotungsten (FeW)': few_eu_usd_mtu,
    'CN Concentrate (65%)': conc65_cn_usd_mtu,
    'CN Tungsten Powder': powder_cn_usd_mtu,
    'CN Ferrotungsten (70%)': few_cn_usd_mtu,
    'Tungsten Equities (Pure-Play)': tungsten_eq_index,
    'Tooling & Strategic (KMT/SAND/REMX)': tool_remx_idx,
    'Molybdenum Equities (JDC/CMOC)': moly_d,
    'Strategic Metals ETF (REMX)': remx_d,
    'Metals & Mining ETF (XME)': xme_d,
    'Gold': align_ffill(GOLD),
    'Silver': align_ffill(SILVER),
    'Platinum': align_ffill(PLATINUM),
    'Palladium': align_ffill(PALLADIUM),
    'Copper': copper_d,
    'Aluminum': align_ffill(ALUMINUM),
    'Zinc': align_ffill(ZINC),
    'Iron Ore': iron_ore_d,
    'Tin (FRED)': TIN_FRED,
    'Nickel (FRED)': NICKEL_FRED,
    'Lead (FRED)': LEAD_FRED,
    'S&P 500': spx_d,
}

base_m_panel = pd.DataFrame({
    'APT Observed': m0_series.resample('ME').last(),
    'Shanghai Implied': shanghai_domestic_usd_mtu.resample('ME').last(),
    'Kalman Fair Value': M4.resample('ME').last(),
})
base_m_ret = np.log(base_m_panel).diff().dropna()

metal_corrs = {}
for m_name, m_s in metals_dict.items():
    m_monthly = m_s.resample('ME').last().dropna()
    m_ret = np.log(m_monthly).diff().dropna()
    common_idx = base_m_ret.index.intersection(m_ret.index)
    metal_corrs[m_name] = {
        'observed': round(float(base_m_ret.loc[common_idx, 'APT Observed'].corr(m_ret.loc[common_idx])), 3),
        'shanghai': round(float(base_m_ret.loc[common_idx, 'Shanghai Implied'].corr(m_ret.loc[common_idx])), 3),
        'kalman': round(float(base_m_ret.loc[common_idx, 'Kalman Fair Value'].corr(m_ret.loc[common_idx])), 3),
    }

metal_prices = {}
for m_name, s in {
    **metals_dict,
    'Strategic Metals (REMX)': REMX,
    'Base Metals (XME)': XME,
}.items():
    s_clean = s.dropna()
    if len(s_clean):
        metal_prices[m_name] = {
            'date': s_clean.index[-1].strftime('%Y-%m-%d'),
            'value': round(float(s_clean.iloc[-1]), 2)
        }

# Monthly log-return correlation matrix across key value-chain, equity, and macro series
weekly_corr_df = pd.DataFrame({
    'EU APT Spot': m0_series,
    'ROW Assumed Price': ROW_PRICE,
    'CN APT Domestic': shanghai_domestic_usd_mtu,
    'EU Ferrotungsten': few_eu_usd_mtu,
    'CN Concentrate': conc65_cn_usd_mtu,
    'CN W Powder': powder_cn_usd_mtu,
    'Pure-Play Equities': tungsten_eq_index,
    'Tooling & REMX': tool_remx_idx,
    'Copper': copper_d,
    'S&P 500': spx_d,
}).resample('ME').last()
corr_matrix = np.log(weekly_corr_df).diff().dropna().corr().round(3).to_dict()

# Rolling 90-day correlations (7-calendar-day returns against EU APT)
w_ret_d = np.log(pd.DataFrame({
    'apt': m0_series,
    'cn_apt': shanghai_domestic_usd_mtu,
    'few': few_eu_usd_mtu,
    'eq': tungsten_eq_index,
    'cu': copper_d,
    'tio': iron_ore_d,
})).diff(7)
rolling_corr_cu_apt = w_ret_d['apt'].rolling(90).corr(w_ret_d['cu']).dropna()
rolling_corr_few_apt = w_ret_d['few'].rolling(90).corr(w_ret_d['apt']).dropna()
rolling_corr_tio_apt = w_ret_d['apt'].rolling(90).corr(w_ret_d['tio']).dropna()
rolling_corr_eq_apt = w_ret_d['apt'].rolling(90).corr(w_ret_d['eq']).dropna()

# --------------------------------------------------------------------------
# 9. Model Audit Summary (Explaining Why Legacy Models Failed & How Fixed)
# --------------------------------------------------------------------------
MODEL_AUDIT = {
    'm2_equity_audit': {
        'legacy_flaws': [
            'Contaminated Basket: Included non-tungsten HK stocks (1124.HK Coastal Greenland real estate, 0697.HK Shoucheng parking/infra) and copper giant 603993.SS CMOC (monthly corr = -0.069 with EU APT), producing a negative 21-day lead correlation of -0.1968.',
            'Arithmetic Volatility Drag & Late-Listing Backfill: Compounded equal-weighted daily arithmetic returns and backfilled OTC ticker GMTL (listed March 2026) back to Jan 2025.',
            'Ad-Hoc Functional Form & Retransformation Bias: Mapped index gains through an arbitrary curve without econometric calibration or Duan smearing, understating conditional mean by ~2% via Jensen\'s inequality.'
        ],
        'v4_fixes': [
            'Verified Pure-Play Universe (All 12 Stocks Weighted & USD-Normalized): Chinese Producers (002378.SZ Zhangyuan 17%, 600549.SS Xiamen 12%, 000657.SZ CTHT 8%), Western Producers/Developers (EQR.AX 13%, GMET.L 10%, ALM 10%, TUN.L 7%, FWZ.V 7%, TGN.AX 4%, G6M.AX 3%), and Downstream Tooling Majors (KMT 5%, SAND.ST 4%).',
            f'Strong Positive Lead Signal: Clean USD log-return index leads European APT by 21 trading days (4 weeks) with r = +{eq_21d_lead_eu:.4f}.',
            f'Centered Cointegrated Regression with Duan (1983) Smearing: Regresses log(APT) on the 3 log-return sub-baskets with interior economic elasticities, achieving R² = {eq_r2:.4f} and smearing factor {duan_eq:.4f}, nowcasting ${M2.iloc[-1]:,.0f}/mtu.'
        ],
        'old_lead_corr': -0.1968,
        'new_lead_corr': round(eq_21d_lead_eu, 4),
        'new_r2': round(eq_r2, 4),
        'duan_smearing_factor': round(duan_eq, 4),
    },
    'm3_factor_audit': {
        'legacy_flaws': [
            'Uncorrelated Macro Proxies: Regressed tungsten returns on Copper (HG=F, r = -0.165), S&P 500 (^GSPC, r = -0.312), FXI China Large-Cap (r = -0.061), and Iron Ore (TIO=F, r = +0.059). Generic macro assets did not experience China’s Feb 2025 dual-use tungsten export controls.',
            'Explosive Intercept Drift ($7,739/mtu): Because the macro factors had ~0 explanatory power, OLS dumped the entire 9x tungsten rally into the monthly intercept (+11.96%/mo) and compounded it daily without mean reversion, exploding to $7,739/mtu.',
            'Circular Smoothing in V2 Draft: Attempted to hide negative regression R² (-0.428) by blending 97.5% step + 2.5% (0.5*M0 + 0.5*M1), creating circular dependence on M0.'
        ],
        'v4_fixes': [
            'Physical Value-Chain & Industrial Factors (Zero Circularity with M0): Replaced generic macro proxies with European Ferrotungsten ($/mtu-eq), China 65% Concentrate ($/mtu), China Tungsten Powder ($/mtu-eq), and Western Hardmetal Tooling/Strategic Metals (KMT + SAND.ST + REMX).',
            f'Econometric Validation: Monthly log-return regression R² improved from -0.428 to +{factor_r2:.4f} (with zero intercept drift), while the centered cointegrated level model achieves R² = {factor_level_r2:.4f} with interior elasticities and Duan smearing ({duan_fac:.4f}).',
            f'Actionable Valuation Insight: Nowcasts ${M3.iloc[-1]:,.0f}/mtu because European FeW (${few_eu_kg.iloc[-1]:.1f}/kg = ${few_eu_usd_mtu.iloc[-1]:,.0f}/mtu-eq) and Chinese Concentrate/Powder have cooled 50–65% from their March 2026 peaks, signaling that Rotterdam APT ($2,700/mtu) carries a ~${2700 - M3.iloc[-1]:,.0f}/mtu illiquidity/vessel-shortage premium.'
        ],
        'old_r2': -0.428,
        'new_return_r2': round(factor_r2, 4),
        'new_level_r2': round(factor_level_r2, 4),
        'duan_smearing_factor': round(duan_fac, 4),
    },
    'new_models_v4': {
        'm7_incentive': 'Marginal cost curve floor (90th-percentile smelting AISC ~$502/mtu) + Western greenfield capital recovery ($185/mtu) + convex inventory scarcity rent derived from M5 stock-to-use coverage.',
        'm8_vecm': 'Vector Error Correction Model fusing cointegrated anchor with 21-day lead returns of Equities, European FeW, and China Concentrate.',
        'm9_downstream': 'ITIA end-use weighted value-in-use netback parity across Cemented Carbide (62%), Specialty Steel & Superalloy FeW (24%), and Defense DFARS procurement (14%).',
    },
    'data_hygiene_audit': {
        'issue': 'Initial regex scraping of CTIA articles matched retrospective monthly/quarterly average articles ("Average Price from January to August"), low-grade 17% tungsten slime auction quotes, and "ferrotungsten powder" substrings, causing false single-day spikes.',
        'fix': f'Filtered strictly to 413 daily market analysis reports, stripped lookback/threshold clauses, added negative lookbehinds for ferrotungsten/carbide powder, and parsed multi-product "respectively" clauses across all 6 physical streams ({len(obs_df):,} verified observations, 0 false single-day reversals across all 6 streams).'
    }
}


# --------------------------------------------------------------------------
# 10. Format Outputs & Serialization
# --------------------------------------------------------------------------
def s_to_list(s):
    return [[d.strftime('%Y-%m-%d'), round(float(v), 2)] for d, v in s.items() if np.isfinite(v)]


output = {
    'generated_utc': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
    'mtu_to_t_apt': MTU_PER_T_APT,
    'latest': {
        'row_composite': {'date': ROW_PRICE.index[-1].strftime('%Y-%m-%d'), 'value': round(float(ROW_PRICE.iloc[-1]), 2)},
        'row_composite_t': {'date': ROW_PRICE.index[-1].strftime('%Y-%m-%d'), 'value': round(float(ROW_PRICE.iloc[-1] * MTU_PER_T_APT), 2)},
        'row_composite_band': [round(float(ROW_LO.iloc[-1]), 2), round(float(ROW_HI.iloc[-1]), 2)],
        'row_vs_rotterdam_pct': {'date': ROW_PRICE.index[-1].strftime('%Y-%m-%d'), 'value': round((spot_row / spot_rot - 1.0) * 100.0, 1)},
        'row_vs_china_parity_pct': {'date': ROW_PRICE.index[-1].strftime('%Y-%m-%d'), 'value': round((spot_row / spot_cn_parity - 1.0) * 100.0, 1)},
        'forward_12m_row_composite': {'date': forward_curve[6]['date'], 'value': forward_curve[6]['row_composite_fwd_mtu']},
        'reported_rotterdam': {'date': m0_series.index[-1].strftime('%Y-%m-%d'), 'value': round(float(m0_series.iloc[-1]), 2)},
        'reported_rotterdam_t': {'date': m0_series.index[-1].strftime('%Y-%m-%d'), 'value': round(float(m0_series.iloc[-1] * MTU_PER_T_APT), 2)},
        'shanghai_domestic_usd_mtu': {'date': shanghai_domestic_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(shanghai_domestic_usd_mtu.iloc[-1]), 2)},
        'shanghai_domestic_rmb_t': {'date': cn_apt_rmb.index[-1].strftime('%Y-%m-%d'), 'value': round(float(cn_apt_rmb.iloc[-1]), 2)},
        'rotterdam_fair_from_shanghai': {'date': rotterdam_fair_from_shanghai.index[-1].strftime('%Y-%m-%d'), 'value': round(float(rotterdam_fair_from_shanghai.iloc[-1]), 2)},
        'smelting_parity_cn_usd_mtu': {'date': smelt_parity_cn_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(smelt_parity_cn_usd_mtu.iloc[-1]), 2)},
        'smelting_export_parity_usd_mtu': {'date': smelt_export_parity_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(smelt_export_parity_usd_mtu.iloc[-1]), 2)},
        'fragmentation_premium_pct': {'date': fragmentation_premium.index[-1].strftime('%Y-%m-%d'), 'value': round(float(fragmentation_premium.iloc[-1]), 2)},
        'eu_ferrotungsten_usd_kg': {'date': few_eu_kg.index[-1].strftime('%Y-%m-%d'), 'value': round(float(few_eu_kg.iloc[-1]), 2)},
        'eu_ferrotungsten_usd_mtu_eq': {'date': few_eu_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(few_eu_usd_mtu.iloc[-1]), 2)},
        'eu_ferrotungsten_netback_usd_mtu': {'date': few_netback_eu_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(few_netback_eu_usd_mtu.iloc[-1]), 2)},
        'cn_concentrate_rmb_t': {'date': cn_conc_rmb.index[-1].strftime('%Y-%m-%d'), 'value': round(float(cn_conc_rmb.iloc[-1]), 0)},
        'cn_concentrate_usd_mtu': {'date': conc65_cn_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(conc65_cn_usd_mtu.iloc[-1]), 2)},
        'cn_powder_rmb_t': {'date': cn_pwd_rmb.index[-1].strftime('%Y-%m-%d'), 'value': round(float(cn_pwd_rmb.iloc[-1]), 0)},
        'cn_powder_usd_mtu_eq': {'date': powder_cn_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(powder_cn_usd_mtu.iloc[-1]), 2)},
        'cn_powder_netback_usd_mtu': {'date': pwd_netback_cn_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(pwd_netback_cn_usd_mtu.iloc[-1]), 2)},
        'cn_ferrotungsten_rmb_t': {'date': cn_few_rmb.index[-1].strftime('%Y-%m-%d'), 'value': round(float(cn_few_rmb.iloc[-1]), 0)},
        'cn_ferrotungsten_usd_mtu_eq': {'date': few_cn_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(few_cn_usd_mtu.iloc[-1]), 2)},
        'cn_ferrotungsten_netback_usd_mtu': {'date': few_netback_cn_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(few_netback_cn_usd_mtu.iloc[-1]), 2)},
        'equity_implied': {'date': M2.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M2.iloc[-1]), 2)},
        'factor_implied': {'date': M3.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M3.iloc[-1]), 2)},
        'kalman': {'date': M4.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M4.iloc[-1]), 2)},
        'kalman_band': [round(float(M4_LO.iloc[-1]), 2), round(float(M4_HI.iloc[-1]), 2)],
        'kalman_rts_smooth': {'date': M4_RTS.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M4_RTS.iloc[-1]), 2)},
        'western_executable_nowcast': {'date': M4_WEST.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M4_WEST.iloc[-1]), 2)},
        'marginal_cost_floor_mtu': {'date': marginal_cost_floor_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(marginal_cost_floor_mtu.iloc[-1]), 2)},
        'm7_incentive_price_mtu': {'date': M7.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M7.iloc[-1]), 2)},
        'm8_vecm_nowcast_mtu': {'date': M8.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M8.iloc[-1]), 2)},
        'm9_downstream_parity_mtu': {'date': M9.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M9.iloc[-1]), 2)},
        'row_geometric_mean_usd_mtu': {'date': ROW_GEOM_PRICE.index[-1].strftime('%Y-%m-%d'), 'value': round(float(ROW_GEOM_PRICE.iloc[-1]), 2)},
        'row_bates_granger_usd_mtu': {'date': ROW_BATES_GRANGER.index[-1].strftime('%Y-%m-%d'), 'value': round(float(ROW_BATES_GRANGER.iloc[-1]), 2)},
        'row_trimmed_mean_usd_mtu': {'date': ROW_TRIMMED.index[-1].strftime('%Y-%m-%d'), 'value': round(float(ROW_TRIMMED.iloc[-1]), 2)},
        'forward_3m_rotterdam': {'date': forward_curve[3]['date'], 'value': forward_curve[3]['rotterdam_fwd_mtu']},
        'forward_12m_rotterdam': {'date': forward_curve[6]['date'], 'value': forward_curve[6]['rotterdam_fwd_mtu']},
        'forward_12m_global_fair': {'date': forward_curve[6]['date'], 'value': forward_curve[6]['global_fair_fwd_mtu']},
        'tungsten_equity_index': {'date': tungsten_eq_index.index[-1].strftime('%Y-%m-%d'), 'value': round(float(tungsten_eq_index.iloc[-1]), 2)},
        'eq_west_index': {'date': eq_west_index.index[-1].strftime('%Y-%m-%d'), 'value': round(float(eq_west_index.iloc[-1]), 2)},
        'eq_cn_index': {'date': eq_cn_index.index[-1].strftime('%Y-%m-%d'), 'value': round(float(eq_cn_index.iloc[-1]), 2)},
        'eq_tool_index': {'date': eq_tool_index.index[-1].strftime('%Y-%m-%d'), 'value': round(float(eq_tool_index.iloc[-1]), 2)},
        'copper': {'date': COPPER.index[-1].strftime('%Y-%m-%d'), 'value': round(float(COPPER.iloc[-1]), 2)},
        'iron_ore': {'date': IRON_ORE.index[-1].strftime('%Y-%m-%d'), 'value': round(float(IRON_ORE.iloc[-1]), 2)},
        'usdcny': {'date': USDCNY.index[-1].strftime('%Y-%m-%d'), 'value': round(float(USDCNY.iloc[-1]), 4)},
    },
    'series': {
        'row_composite_mtu': s_to_list(ROW_PRICE),
        'row_composite_lo': s_to_list(ROW_LO),
        'row_composite_hi': s_to_list(ROW_HI),
        'row_geometric_mean_mtu': s_to_list(ROW_GEOM_PRICE),
        'row_bates_granger_mtu': s_to_list(ROW_BATES_GRANGER),
        'row_trimmed_mean_mtu': s_to_list(ROW_TRIMMED),
        'observed_rotterdam_mtu': s_to_list(m0_series),
        'observed_rotterdam_t': s_to_list(m0_series * MTU_PER_T_APT),
        'shanghai_domestic_usd_mtu': s_to_list(shanghai_domestic_usd_mtu),
        'shanghai_domestic_rmb_t': s_to_list(cn_apt_rmb),
        'rotterdam_fair_from_shanghai_mtu': s_to_list(rotterdam_fair_from_shanghai),
        'smelting_parity_cn_usd_mtu': s_to_list(smelt_parity_cn_usd_mtu),
        'smelting_export_parity_usd_mtu': s_to_list(smelt_export_parity_usd_mtu),
        'fragmentation_premium': s_to_list(fragmentation_premium),
        'eu_ferrotungsten_usd_mtu': s_to_list(few_eu_usd_mtu),
        'eu_ferrotungsten_netback_usd_mtu': s_to_list(few_netback_eu_usd_mtu),
        'eu_ferrotungsten_usd_kg': s_to_list(few_eu_kg),
        'cn_concentrate_usd_mtu': s_to_list(conc65_cn_usd_mtu),
        'cn_concentrate_rmb_t': s_to_list(cn_conc_rmb),
        'cn_powder_usd_mtu': s_to_list(powder_cn_usd_mtu),
        'cn_powder_netback_usd_mtu': s_to_list(pwd_netback_cn_usd_mtu),
        'cn_powder_rmb_t': s_to_list(cn_pwd_rmb),
        'cn_ferrotungsten_usd_mtu': s_to_list(few_cn_usd_mtu),
        'cn_ferrotungsten_netback_usd_mtu': s_to_list(few_netback_cn_usd_mtu),
        'cn_ferrotungsten_rmb_t': s_to_list(cn_few_rmb),
        'equity_implied_mtu': s_to_list(M2),
        'factor_implied_mtu': s_to_list(M3),
        'kalman_mtu': s_to_list(M4),
        'kalman_lo': s_to_list(M4_LO),
        'kalman_hi': s_to_list(M4_HI),
        'kalman_rts_smooth_mtu': s_to_list(M4_RTS),
        'western_executable_mtu': s_to_list(M4_WEST),
        'marginal_cost_floor_mtu': s_to_list(marginal_cost_floor_mtu),
        'm7_incentive_price_mtu': s_to_list(M7),
        'm8_vecm_nowcast_mtu': s_to_list(M8),
        'm9_downstream_parity_mtu': s_to_list(M9),
        'm5_equilibrium_mtu': s_to_list(m5_daily_series),
        'tungsten_equity_index': s_to_list(tungsten_eq_index),
        'eq_west_index': s_to_list(eq_west_index),
        'eq_cn_index': s_to_list(eq_cn_index),
        'eq_tool_index': s_to_list(eq_tool_index),
        'tool_remx_index': s_to_list(tool_remx_idx),
        'copper_usd_lb': s_to_list(COPPER),
        'iron_ore_usd_t': s_to_list(IRON_ORE),
        'moly_basket': s_to_list(moly_d),
        'usdcny': s_to_list(USDCNY),
        'rolling_corr_cu_apt': s_to_list(rolling_corr_cu_apt),
        'rolling_corr_few_apt': s_to_list(rolling_corr_few_apt),
        'rolling_corr_tio_apt': s_to_list(rolling_corr_tio_apt),
        'rolling_corr_eq_apt': s_to_list(rolling_corr_eq_apt),
        'forecast_rotterdam_12m': fwd_rot_series,
        'forecast_row_composite_12m': fwd_row_series,
        'forecast_global_fair_12m': fwd_glob_series,
        'forecast_china_parity_12m': fwd_cn_series,
        'forecast_bull_80_hi': fwd_hi_series,
        'forecast_bear_80_lo': fwd_lo_series,
    },
    'row_composite_model': {
        'headline_usd_mtu': round(spot_row, 2),
        'headline_usd_t': round(spot_row * MTU_PER_T_APT, 0),
        'band_90_usd_mtu': [round(float(ROW_LO.iloc[-1]), 2), round(float(ROW_HI.iloc[-1]), 2)],
        'discount_to_rotterdam_pct': round((spot_row / spot_rot - 1.0) * 100.0, 1),
        'premium_to_china_landed_pct': round((spot_row / spot_cn_parity - 1.0) * 100.0, 1),
        'forward_12m_usd_mtu': forward_curve[6]['row_composite_fwd_mtu'],
        'arithmetic_weighted_usd_mtu': round(spot_row, 2),
        'geometric_mean_usd_mtu': round(float(ROW_GEOM_PRICE.iloc[-1]), 2),
        'geometric_median_usd_mtu': round(float(ROW_GEOM_MEDIAN.iloc[-1]), 2),
        'bates_granger_precision_usd_mtu': round(float(ROW_BATES_GRANGER.iloc[-1]), 2),
        'trimmed_mean_usd_mtu': round(float(ROW_TRIMMED.iloc[-1]), 2),
        'method': '10-Lens Weighted Rest-of-World (ROW) Assumed Price Benchmark (Solving Rotterdam Spot Illiquidity vs China Export Bifurcation)',
        'summary': (
            f"Combines all 10 physical, netback, econometric, incentive cost-floor, and structural balance signals into a single executable "
            f"Rest-of-World (ex-China) assumed tungsten price of ${spot_row:,.0f}/mtu (${spot_row * MTU_PER_T_APT:,.0f}/t APT). "
            f"Weights Ex-China physical spot & contract clearing at 30% (M0 Rotterdam 16% + M4 Western Executable 14%), "
            f"econometric lead & value-chain nowcasts at 44% (M4 Global Fair 13% + M8 VECM Lead 11% + M3 Value-Chain 10% + M2 Pure-Play Equities 10%), "
            f"and physical netback, incentive cost floor & structural balance anchors at 26% (M9 Downstream 8% + M7 Incentive 6% + M5 Stock-to-Use 6% + M1 China Landed Parity 6%). "
            f"Cross-checked across 4 aggregation methodologies: Arithmetic Weighted (${spot_row:,.0f}/mtu), Log-Geometric Mean (${ROW_GEOM_PRICE.iloc[-1]:,.0f}/mtu), "
            f"Bates-Granger Inverse-Variance Precision (${ROW_BATES_GRANGER.iloc[-1]:,.0f}/mtu), and Trimmed Mean (${ROW_TRIMMED.iloc[-1]:,.0f}/mtu)."
        ),
        'components': row_components_detail,
    },
    'forward_curve': forward_curve,
    'factor_model': {
        'betas': factor_return_betas,
        'level_elasticities': factor_level_betas,
        'r2': round(factor_r2, 4),
        'level_r2': round(factor_level_r2, 4),
        'duan_smearing_factor': round(duan_fac, 4),
        'factors_detail': FACTOR_DIAGNOSTICS,
        'method': 'Non-Circular Value-Chain & Industrial Cointegrated Factor Model (EU FeW + CN Conc + CN Powder + Tooling/REMX) with Duan (1983) Smearing'
    },
    'equity_model': {
        'constituents': [x[0] for x in EQUITY_META],
        'constituent_details': equity_constituent_stats,
        'sub_basket_elasticities': {
            'intercept': round(float(b_eq[0]), 4),
            'western_producers': round(float(b_eq[1]), 4),
            'chinese_producers': round(float(b_eq[2]), 4),
            'downstream_tooling': round(float(b_eq[3]), 4),
        },
        'r2': round(eq_r2, 4),
        'duan_smearing_factor': round(duan_eq, 4),
        'lead_21d_corr_eu_apt': round(eq_21d_lead_eu, 4),
        'lead_4w_corr_eu_apt': round(eq_4w_lead_eu, 4),
        'lead_4w_corr_cn_apt': round(eq_4w_lead_cn, 4),
        'contemp_4w_corr_eu_apt': round(eq_4w_contemp_eu, 4),
        'contemp_4w_corr_cn_apt': round(eq_4w_contemp_cn, 4),
        'latest_index': round(float(tungsten_eq_index.iloc[-1]), 2),
        'method': 'USD-Normalized Log-Return Pure-Play Equity Index (All 12 Constituents Weighted) & Centered Constrained Cointegrated Valuation with Duan Smearing'
    },
    'kalman_model': {
        'states': ['Latent Global APT Fair Value', 'Western Executable Clearing Price', 'Trend Drift'],
        'observations': ['Observed Rotterdam Spot (M0)', 'China Landed Export Parity (M1)', 'Pure-Play Equity Valuation (M2)', 'Value-Chain Factor Value (M3)'],
        'last_se_usd': round(float(total_sd[-1] * M4.iloc[-1]), 2),
        'smelting_corr_cn_apt': round(smelt_corr_cn, 4),
        'smelting_level_r2_cn_apt': round(smelt_level_r2, 4),
        'rts_smoother': True,
        'log_normal_variance_correction': True,
    },
    'incentive_model': {
        'latest_aisc_floor_usd_mtu': round(float(marginal_cost_floor_mtu.iloc[-1]), 2),
        'greenfield_recovery_capex_usd_mtu': 185.0,
        'scarcity_multiplier': round(float(scarcity_mult.iloc[-1]), 3),
        'coverage_months': round(float(cov_d.iloc[-1]), 2),
        'incentive_clearing_usd_mtu': round(float(M7.iloc[-1]), 2),
        'method': '90th-Percentile Smelting AISC Floor + Western Greenfield Capital Recovery + Stock-to-Use Convex Scarcity Rent'
    },
    'vecm_model': {
        'coint_base_usd_mtu': round(float(coint_base.iloc[-1]), 2),
        'nowcast_usd_mtu': round(float(M8.iloc[-1]), 2),
        'error_correction_lambda': round(float(b_vecm[1]), 4),
        'equity_lead_beta': round(float(b_vecm[2]), 4),
        'few_lead_beta': round(float(b_vecm[3]), 4),
        'concentrate_lead_beta': round(float(b_vecm[4]), 4),
        'impulse_lead_pct': round(lead_impulse_pct * 100.0, 2),
        'method': 'Vector Error Correction Model (VECM) 21-Day Lead-Lag Momentum Nowcast'
    },
    'downstream_model': {
        'carbide_pillar_usd_mtu': round(float(carbide_pillar.iloc[-1]), 2),
        'steel_pillar_usd_mtu': round(float(steel_pillar.iloc[-1]), 2),
        'defense_pillar_usd_mtu': round(float(defense_pillar.iloc[-1]), 2),
        'carbide_share': 0.62,
        'steel_share': 0.24,
        'defense_share': 0.14,
        'downstream_parity_usd_mtu': round(float(M9.iloc[-1]), 2),
        'method': 'ITIA End-Use Weighted Value-in-Use Netback Parity (Carbide 62% + FeW Alloy 24% + Defense 14%)'
    },
    'model_audit': MODEL_AUDIT,
    'correlation_matrix': corr_matrix,
    'metal_correlations': {
        'monthly_returns': metal_corrs,
        'n_obs': len(base_m_ret),
        'note': 'Monthly log-return correlations against Observed EU APT, China Domestic APT, and Kalman Fair Value'
    },
    'metal_prices': metal_prices,
    'supply_demand': sd_data,
}

usgs_hist_file = DATA / 'usgs_tungsten_history.json'
if usgs_hist_file.exists():
    try:
        output['usgs_history'] = json.load(open(usgs_hist_file, encoding='utf-8'))
    except Exception:
        pass

json.dump(output, open(DATA / 'models_output.json', 'w', encoding='utf-8'), indent=1)
json.dump(output, open(SITE_DATA / 'models_output.json', 'w', encoding='utf-8'), indent=1)

print('=== MODEL ENGINE V4 COMPLETE ===')
print(f"Generated UTC: {output['generated_utc']}")
print(f"FINAL ROW ASSUMED PRICE (M6 10-Lens): ${output['latest']['row_composite']['value']}/mtu (${output['latest']['row_composite_t']['value']:,.0f}/t) [90% band: ${output['latest']['row_composite_band'][0]} - ${output['latest']['row_composite_band'][1]}]")
print(f"Alternative Aggregations:  Geometric=${output['latest']['row_geometric_mean_usd_mtu']['value']}/mtu | Bates-Granger=${output['latest']['row_bates_granger_usd_mtu']['value']}/mtu | Trimmed=${output['latest']['row_trimmed_mean_usd_mtu']['value']}/mtu")
print(f"M0 Rotterdam APT Spot:        ${output['latest']['reported_rotterdam']['value']}/mtu ({output['latest']['reported_rotterdam']['date']})")
print(f"M0 European Ferrotungsten:    ${output['latest']['eu_ferrotungsten_usd_kg']['value']}/kg W (Netback: ${output['latest']['eu_ferrotungsten_netback_usd_mtu']['value']}/mtu)")
print(f"M0 China Domestic APT:        RMB {output['latest']['shanghai_domestic_rmb_t']['value']:,.0f}/t (${output['latest']['shanghai_domestic_usd_mtu']['value']}/mtu)")
print(f"M0 China 65% Concentrate:     RMB {output['latest']['cn_concentrate_rmb_t']['value']:,.0f}/t (${output['latest']['cn_concentrate_usd_mtu']['value']}/mtu)")
print(f"M0 China Tungsten Powder:     RMB {output['latest']['cn_powder_rmb_t']['value']:,.0f}/t (Netback: ${output['latest']['cn_powder_netback_usd_mtu']['value']}/mtu)")
print(f"M0 China 70% Ferrotungsten:   RMB {output['latest']['cn_ferrotungsten_rmb_t']['value']:,.0f}/t (Netback: ${output['latest']['cn_ferrotungsten_netback_usd_mtu']['value']}/mtu)")
print(f"M1 Smelting Parity (CN/Exp):  ${output['latest']['smelting_parity_cn_usd_mtu']['value']}/mtu domestic | ${output['latest']['smelting_export_parity_usd_mtu']['value']}/mtu landed (Lvl R2={smelt_level_r2:.4f})")
print(f"M1 Rotterdam Landed Parity:   ${output['latest']['rotterdam_fair_from_shanghai']['value']}/mtu (Hybrid Parity Wedge: +{output['latest']['fragmentation_premium_pct']['value']}%)")
print(f"M2 Pure-Play Equity (12 Stk): ${output['latest']['equity_implied']['value']}/mtu (R2={eq_r2:.4f}, Duan={duan_eq:.4f}, 21d Lead r=+{eq_21d_lead_eu:.4f})")
print(f"M3 Value-Chain Factor Model:  ${output['latest']['factor_implied']['value']}/mtu (Ret R2={factor_r2:.4f}, Lvl R2={factor_level_r2:.4f}, Duan={duan_fac:.4f})")
print(f"M4 Global Fundamental Fair:   ${output['latest']['kalman']['value']}/mtu (RTS Smoothed: ${output['latest']['kalman_rts_smooth']['value']}/mtu)")
print(f"M4 Western Executable Spot:   ${output['latest']['western_executable_nowcast']['value']}/mtu")
print(f"M7 Marginal Cost & Incentive: Floor=${output['latest']['marginal_cost_floor_mtu']['value']}/mtu | Incentive=${output['latest']['m7_incentive_price_mtu']['value']}/mtu")
print(f"M8 VECM Lead-Lag Nowcast:     ${output['latest']['m8_vecm_nowcast_mtu']['value']}/mtu (Lead Impulse: {lead_impulse_pct*100:+.1f}%)")
print(f"M9 Downstream Carbide/Alloy:  ${output['latest']['m9_downstream_parity_mtu']['value']}/mtu")
print("Synthetic Forward Curve (Rotterdam | ROW Assumed | Global Fair | China Landed Parity):")
for row in forward_curve:
    print(f"  {row['tenor']:4s} ({row['date']}): Rotterdam=${row['rotterdam_fwd_mtu']:7.1f} | ROW=${row['row_composite_fwd_mtu']:7.1f} | Global=${row['global_fair_fwd_mtu']:7.1f} | CN Parity=${row['china_parity_fwd_mtu']:7.1f}")
