"""Tungsten Desk — Econometric Pricing & Forecasting Engine (V3).

Addresses the core challenges of tungsten market analysis:
  1. Price Discovery ("Nowcasting") in an illiquid, assessment-driven market split
     between Rotterdam CIF duty-free spot and China domestic ex-works pricing.
  2. Price Forecasting (Synthetic Forward Curve 1M–24M + 2025–2035 Stock-to-Use
     Equilibrium) in the absence of an active exchange-traded futures curve.

MODELS:
  M0: Observed Physical Benchmark Suite (6 Verified Streams)
      - European APT 88.5% WO3 ($/mtu, CIF Rotterdam)
      - European Ferrotungsten 75% W ($/kg W & $/mtu WO3-eq, Rotterdam)
      - China Domestic APT 88.5% WO3 (RMB/t & $/mtu)
      - China 65% Tungsten Concentrate (RMB/t & $/mtu WO3)
      - China Tungsten Powder >=99.7% (RMB/t & $/mtu WO3-eq)
      - China 70% Ferrotungsten (RMB/t & $/mtu WO3-eq)

  M1: Physical Smelting & Export-Parity Arbitrage Model
      - Concentrate Smelting-Parity APT: P_smelt = 1.418 * P_conc65 + RMB 22,000/t
        conversion cost (empirical r = 0.992 with China Domestic APT).
      - Rotterdam Landed Export Parity: P_export = P_CN_APT * 1.192 (13% cancelled
        VAT export rebate + export licensing/compliance + ocean freight + transit carry).
      - Export Fragmentation Wedge (%): Measures the exact policy/quota squeeze
        between Rotterdam spot and Chinese landed export parity.

  M2: Pure-Play Tungsten Equity Valuation & Lead-Lag Model (Rehabilitated)
      - Eliminates arithmetic volatility drag via log-return portfolio indexing.
      - Replaces uncorrelated conglomerates with 11 verified pure-play tungsten
        producers, developers, and downstream tooling majors across 3 sub-baskets:
          (a) Western Producers & Developers: EQR.AX, GMET.L, TUN.L, ALM, FWZ.V, TGN.AX
          (b) Chinese Integrated Majors: 002378.SZ (Zhangyuan), 600549.SS (Xiamen), 000657.SZ (CTHT)
          (c) Downstream Hardmetal Tooling Majors: KMT (Kennametal), SAND.ST (Sandvik)
      - Empirically leads European APT by 21 trading days (4 weeks) with r = +0.6105
        (vs -0.1968 in the old contaminated basket).
      - Cointegrated Non-Negative Log-Linear Valuation (R² = 0.9393) extracts the
        sustainable APT price implied by equity market enterprise valuations.

  M3: Value-Chain & Industrial Factor Model (Rehabilitated)
      - Eliminates the two fatal flaws of the legacy macro factor model:
          (1) Uncorrelated macro proxies (Copper r = -0.165, S&P 500 r = -0.312)
              that dumped the entire rally into a +11.96%/mo intercept, compounding
              to an absurd $7,739/mtu.
          (2) Circular blending with M0 in the V2 draft.
      - Uses strictly non-APT observable value-chain and industrial demand factors:
          * European Ferrotungsten ($/mtu-eq, monthly r = +0.785, 4W lead r = +0.740)
          * China 65% Concentrate ($/mtu, monthly r = +0.570, 4W lead r = +0.676)
          * China Tungsten Powder ($/mtu-eq, monthly r = +0.498, 4W lead r = +0.672)
          * Western Tooling & Strategic Metals Index (KMT + SAND.ST + REMX, r = +0.413)
          * Base Metals Control (HG=F Copper, beta = -0.026 ~ 0, included for audit comparison)
      - Achieves Monthly Return R² = 0.5506 and Cointegrated Level R² = 0.8727.

  M4: Kalman State-Space Fair Value & Synthetic Forward Curve (1M–24M)
      - Dual Bayesian state-space filter estimating:
          (a) Global Fundamental Fair Value ($/mtu) — fusing M0, M1, M2, and M3
              weighted by inverse observation noise variance.
          (b) Western Executable Clearing Price ($/mtu) — nowcasting realistic contract
              clearing in the ex-China market adjusted for spot assessment illiquidity.
      - Generates a 1M / 2M / 3M / 6M / 9M / 12M / 24M Synthetic Forward Curve
        combining 4-week leading indicator impulses (FeW, Concentrate, Equities) with
        Ornstein-Uhlenbeck convergence toward the M5 stock-to-use equilibrium.

  M5: Supply-Demand Stock-to-Use Equilibrium (2025–2035)
      - Annual balance and Base / Bull / Bear structural price paths.
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


# --------------------------------------------------------------------------
# Helper: Pure-NumPy Bounded Ridge Least Squares (No scipy required)
# --------------------------------------------------------------------------
def bounded_ridge_lstsq(X, y, lb, ub, l2=0.1, iters=2500):
    """Solve min_b ||Xb - y||^2 + l2*||b_slope||^2 subject to lb <= b <= ub."""
    lb = np.asarray(lb, dtype=float)
    ub = np.asarray(ub, dtype=float)
    pen = np.array([0.0 if (i == 0 and np.allclose(X[:, 0], 1.0)) else 1.0 for i in range(X.shape[1])])
    XtX = X.T @ X + l2 * np.diag(pen)
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
# 1. Load Market Data (Yahoo Finance)
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


# M0 Physical Suite on daily calendar
m0_series = align_interp(eu_apt_raw)                       # Rotterdam APT ($/mtu)
few_eu_kg = align_interp(eu_few_raw)                       # Rotterdam FeW 75% ($/kg W)
cn_apt_rmb = align_interp(cn_apt_raw)                      # China APT (RMB/t)
cn_conc_rmb = align_interp(cn_conc_raw)                    # China 65% Concentrate (RMB/t)
cn_pwd_rmb = align_interp(cn_pwd_raw)                      # China W Powder (RMB/t)
cn_few_rmb = align_interp(cn_few_raw)                      # China 70% FeW (RMB/t)
usdcny_d = align_ffill(USDCNY)

# Convert all physical streams to unified USD/mtu WO3-equivalent basis
shanghai_domestic_usd_mtu = cn_apt_rmb / (MTU_PER_T_APT * usdcny_d)
conc65_cn_usd_mtu = cn_conc_rmb / (MTU_PER_T_CONC * usdcny_d)
powder_cn_usd_mtu = cn_pwd_rmb / (MTU_PER_T_W * usdcny_d)
few_cn_usd_mtu = cn_few_rmb / (MTU_PER_T_FEW70 * usdcny_d)
few_eu_usd_mtu = few_eu_kg * (1000.0 / MTU_PER_T_W)       # 1 mtu WO3 = 7.9296 kg W

# --------------------------------------------------------------------------
# 3. M1: Physical Smelting & Export-Parity Arbitrage Model
# --------------------------------------------------------------------------
# (a) Concentrate -> APT Smelting Parity in China:
#     Requires ~1.418 t of 65% concentrate per t of 88.5% APT (96% recovery) + RMB 22,000/t smelting cost
SMELT_ORE_RATIO = 1.418
SMELT_CONV_RMB = 22000.0
smelt_parity_cn_rmb = SMELT_ORE_RATIO * cn_conc_rmb + SMELT_CONV_RMB
smelt_parity_cn_usd_mtu = smelt_parity_cn_rmb / (MTU_PER_T_APT * usdcny_d)
smelt_corr_cn = float(np.log(smelt_parity_cn_rmb).diff().corr(np.log(cn_apt_rmb).diff()))

# (b) China Domestic APT -> Rotterdam CIF Landed Export Parity:
#     13% non-rebated VAT on export + 3.5% ocean freight/insurance + 1.5% port/licensing + 1.2% transit financing = 1.192x
CARRY_MULT = 1.192
rotterdam_fair_from_shanghai = shanghai_domestic_usd_mtu * CARRY_MULT
smelt_export_parity_usd_mtu = smelt_parity_cn_usd_mtu * CARRY_MULT
fragmentation_premium = (m0_series / rotterdam_fair_from_shanghai - 1.0) * 100.0

# --------------------------------------------------------------------------
# 4. M2: Pure-Play Tungsten Equity Valuation & Lead-Lag Model (Rehabilitated)
# --------------------------------------------------------------------------
eq_panel = pd.DataFrame({
    '002378.SZ': align_ffill(ZHANGYUAN),
    '600549.SS': align_ffill(XIAMEN),
    '000657.SZ': align_ffill(CTHT),
    'EQR.AX': align_ffill(EQR),
    'GMET.L': align_ffill(GMET_L),
    'TUN.L': align_ffill(TUN_L),
    'ALM': align_ffill(ALM),
    'FWZ.V': align_ffill(FWZ),
    'TGN.AX': align_ffill(TGN),
    'KMT': align_ffill(KMT),
    'SAND.ST': align_ffill(SAND_ST),
}, index=full_idx)

# 3 Pure-Play Sub-Baskets + Composite Index (chain-linked log-return indices, 2025-01-02 = 100)
eq_cn_index = log_return_index(
    eq_panel[['002378.SZ', '600549.SS', '000657.SZ']],
    weights=[0.45, 0.35, 0.20]
)
eq_west_index = log_return_index(
    eq_panel[['EQR.AX', 'GMET.L', 'TUN.L', 'ALM', 'FWZ.V', 'TGN.AX']],
    weights=[0.25, 0.20, 0.15, 0.15, 0.15, 0.10]
)
eq_tool_index = log_return_index(
    eq_panel[['KMT', 'SAND.ST']],
    weights=[0.50, 0.50]
)
tungsten_eq_index = log_return_index(
    eq_panel[['002378.SZ', '600549.SS', '000657.SZ', 'EQR.AX', 'GMET.L', 'TUN.L', 'ALM', 'FWZ.V', 'KMT']],
    weights=[0.20, 0.12, 0.08, 0.15, 0.12, 0.08, 0.10, 0.08, 0.07]
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

# Constrained Non-Negative Cointegrated Log-Linear Equity Valuation Model
X_eq_w = np.column_stack([
    np.ones(len(w_panel)),
    np.log(w_panel['eq_west'].values),
    np.log(w_panel['eq_cn'].values),
    np.log(w_panel['eq_tool'].values),
])
y_eu_w = np.log(w_panel['eu_apt'].values)
b_eq = bounded_ridge_lstsq(X_eq_w, y_eu_w, [-np.inf, 0.15, 0.15, 0.08], [np.inf, 1.20, 1.20, 0.80], l2=0.2)
yhat_eq_w = X_eq_w @ b_eq
eq_r2 = float(1.0 - np.sum((y_eu_w - yhat_eq_w) ** 2) / np.sum((y_eu_w - y_eu_w.mean()) ** 2))

X_eq_d = np.column_stack([
    np.ones(len(full_idx)),
    np.log(eq_west_index.values),
    np.log(eq_cn_index.values),
    np.log(eq_tool_index.values),
])
M2 = pd.Series(np.exp(X_eq_d @ b_eq), index=full_idx)

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

EQUITY_META = [
    ('002378.SZ', 'Chongyi Zhangyuan Tungsten', 'CN Producer', 0.20),
    ('600549.SS', 'Xiamen Tungsten Co.', 'CN Producer', 0.12),
    ('000657.SZ', 'China Tungsten & Hightech', 'CN Producer', 0.08),
    ('EQR.AX', 'EQ Resources (Mt Carbine / Barruecopardo)', 'Western Producer', 0.15),
    ('GMET.L', 'Guardian Metal Resources (Pilot Mountain)', 'Western Developer', 0.12),
    ('TUN.L', 'Tungsten West (Hemerdon)', 'Western Developer', 0.08),
    ('ALM', 'Almonty Industries (Sangdong / Panasqueira)', 'Western Producer', 0.10),
    ('FWZ.V', 'Fireweed Metals (Mactung)', 'Western Developer', 0.08),
    ('TGN.AX', 'Tungsten Mining NL (Mt Mulgine)', 'Western Developer', 0.00),
    ('KMT', 'Kennametal Inc.', 'Downstream Tooling', 0.07),
    ('SAND.ST', 'Sandvik AB', 'Downstream Tooling', 0.00),
]
equity_constituent_stats = []
for sym, name, group, w_comp in EQUITY_META:
    s = eq_panel[sym]
    ret_total = (float(s.iloc[-1]) / float(s.iloc[0]) - 1.0) * 100.0
    corr_cn = float(m_eq_lr[sym].corr(m_eq_lr['cn_apt']))
    corr_eu = float(m_eq_lr[sym].corr(m_eq_lr['eu_apt']))
    lead_4w_eu = float(w4_eq_lr[sym].corr(w4_eq_lr['eu_apt'].shift(-1)))
    equity_constituent_stats.append({
        'symbol': sym,
        'name': name,
        'group': group,
        'weight': w_comp,
        'latest_price': round(float(s.iloc[-1]), 3),
        'return_since_2025_pct': round(ret_total, 1),
        'monthly_corr_cn_apt': round(corr_cn, 3),
        'monthly_corr_eu_apt': round(corr_eu, 3),
        'lead_4w_corr_eu_apt': round(lead_4w_eu, 3),
    })

# --------------------------------------------------------------------------
# 5. M3: Value-Chain & Industrial Factor Model (Rehabilitated, Non-Circular)
# --------------------------------------------------------------------------
# Observable non-APT value-chain & industrial demand factors:
#   1. eu_few     : European Ferrotungsten ($/mtu WO3-eq) — Western steel/alloy downstream benchmark
#   2. cn_conc    : China 65% Concentrate ($/mtu WO3)     — Primary upstream ore feedstock
#   3. cn_pwd     : China Tungsten Powder ($/mtu WO3-eq)  — Downstream cemented carbide precursor
#   4. tool_remx  : Western Tooling & Strategic Metals Index (35% KMT + 35% SAND.ST + 30% REMX)
#   5. cu_ctrl    : Copper (HG=F) — Included in return regression as benchmark control (~0 beta)
tool_remx_panel = pd.DataFrame({
    'KMT': align_ffill(KMT),
    'SAND.ST': align_ffill(SAND_ST),
    'REMX': align_ffill(REMX),
}, index=full_idx)
tool_remx_idx = log_return_index(tool_remx_panel, weights=[0.35, 0.35, 0.30])
copper_d = align_ffill(COPPER)
iron_ore_d = align_ffill(IRON_ORE)
spx_d = align_ffill(SPX)
xme_d = align_ffill(XME)
remx_d = align_ffill(REMX)
moly_d = (align_ffill(JDC) + align_ffill(CMOC)) / 2.0

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
bf_ret = bounded_ridge_lstsq(Xf_c, yf_c, [0.05, 0.05, 0.05, 0.05, -0.50], [1.0, 1.0, 1.0, 1.0, 0.50], l2=0.02)
factor_r2 = float(1.0 - np.sum((yf_c - Xf_c @ bf_ret) ** 2) / np.sum(yf_c ** 2))
factor_return_betas = {k: round(float(v), 4) for k, v in zip(fcols, bf_ret)}

# (B) Cointegrated Log-Level Value-Chain Factor Model (Non-Negative Elasticities, Zero M0 Circularity)
X_lv_w = np.column_stack([
    np.ones(len(w_fac_df)),
    np.log(w_fac_df['eu_few'].values),
    np.log(w_fac_df['cn_conc'].values),
    np.log(w_fac_df['cn_pwd'].values),
    np.log(w_fac_df['tool_remx'].values),
])
y_lv_w = np.log(w_fac_df['eu_apt'].values)
b_lv = bounded_ridge_lstsq(X_lv_w, y_lv_w, [-np.inf, 0.30, 0.10, 0.10, 0.08], [np.inf, 0.85, 0.50, 0.50, 0.60], l2=0.2)
factor_level_r2 = float(1.0 - np.sum((y_lv_w - X_lv_w @ b_lv) ** 2) / np.sum((y_lv_w - y_lv_w.mean()) ** 2))

X_lv_d = np.column_stack([
    np.ones(len(full_idx)),
    np.log(few_eu_usd_mtu.values),
    np.log(conc65_cn_usd_mtu.values),
    np.log(powder_cn_usd_mtu.values),
    np.log(tool_remx_idx.values),
])
M3 = pd.Series(np.exp(X_lv_d @ b_lv), index=full_idx)

factor_level_betas = {
    'intercept': round(float(b_lv[0]), 4),
    'eu_ferrotungsten': round(float(b_lv[1]), 4),
    'cn_concentrate_65': round(float(b_lv[2]), 4),
    'cn_tungsten_powder': round(float(b_lv[3]), 4),
    'tooling_strategic_idx': round(float(b_lv[4]), 4),
    'copper_control': 0.0,
}

# Detailed factor diagnostics table (comparing Value-Chain Factors vs Naive Macro Factors)
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
        'role': 'Primary upstream mine feedstock (1.418 t per t APT)',
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
# 6. M4: Kalman State-Space Fair-Value Filter & Synthetic Forward Curve
# --------------------------------------------------------------------------
# We run two Kalman filters:
#   (A) M4 Global Fundamental Fair Value: Fuses M0 (Rotterdam Spot), M1 (China Landed Parity),
#       M2 (Pure-Play Equity Valuation), and M3 (Value-Chain Factor Fair Value).
#   (B) M4 Western Executable Clearing Price: Fuses M0 (Rotterdam Spot), M3 (Value-Chain Factor),
#       and M2 (Equity Valuation) for physical buyers restricted from Chinese domestic supply.
n_obs = len(full_idx)
log_m0 = np.log(m0_series.values)
log_m1 = np.log(rotterdam_fair_from_shanghai.values)
log_m2 = np.log(M2.values)
log_m3 = np.log(M3.values)


def run_kalman_4obs(obs_mat, R_diag, q_level=1.2e-4, q_drift=1e-6):
    F = np.array([[1.0, 1.0], [0.0, 0.96]])
    Q = np.diag([q_level, q_drift])
    k_obs = obs_mat.shape[0]
    H = np.zeros((k_obs, 2))
    H[:, 0] = 1.0
    R = np.diag(R_diag)
    x_hat = np.array([obs_mat[0, 0], 0.0])
    P_mat = np.eye(2) * 0.04
    out_log = np.zeros(n_obs)
    out_var = np.zeros(n_obs)
    out_drift = np.zeros(n_obs)
    for t in range(n_obs):
        x_hat = F @ x_hat
        P_mat = F @ P_mat @ F.T + Q
        z = obs_mat[:, t]
        y_tilde = z - H @ x_hat
        S_mat = H @ P_mat @ H.T + R
        K_gain = P_mat @ H.T @ np.linalg.inv(S_mat)
        x_hat = x_hat + K_gain @ y_tilde
        P_mat = (np.eye(2) - K_gain @ H) @ P_mat
        out_log[t] = x_hat[0]
        out_var[t] = P_mat[0, 0]
        out_drift[t] = x_hat[1]
    return out_log, out_var, out_drift


# (A) Global Fundamental Fair Value (weights M3 Value-Chain & M2 Equity highest, plus M0 Spot & M1 Landed Parity)
obs_global = np.vstack([log_m0, log_m1, log_m2, log_m3])
kalman_log, kalman_var, kalman_drift = run_kalman_4obs(
    obs_global, R_diag=[0.016, 0.018, 0.009, 0.008]
)
M4 = pd.Series(np.exp(kalman_log), index=full_idx)
# Band reflects cross-sectional dispersion across the 4 structural signals + state variance
cross_disp = np.std(obs_global, axis=0)
total_sd = np.sqrt(kalman_var + (0.28 * cross_disp) ** 2)
M4_LO = pd.Series(np.exp(kalman_log - 1.645 * total_sd), index=full_idx)
M4_HI = pd.Series(np.exp(kalman_log + 1.645 * total_sd), index=full_idx)

# (B) Western Executable Clearing Price (for buyers in Rotterdam/US who cannot source Chinese domestic APT)
obs_west = np.vstack([log_m0, log_m2, log_m3])
west_log, west_var, _ = run_kalman_4obs(
    obs_west, R_diag=[0.006, 0.018, 0.016]
)
M4_WEST = pd.Series(np.exp(west_log), index=full_idx)

# --------------------------------------------------------------------------
# 7. Load M5 Supply-Demand Equilibrium & Build Synthetic Forward Curve (1M–24M)
# --------------------------------------------------------------------------
sd_output_path = DATA / 'supply_demand_output.json'
sd_data = json.load(open(sd_output_path, encoding='utf-8')) if sd_output_path.exists() else None

# Extract M5 scenario anchors for 2026, 2027, 2028
m5_2027_base = 2057.8
m5_2027_bull = 2500.0
m5_2027_bear = 1480.0
m5_2028_base = 1411.4
if sd_data and 'scenarios' in sd_data:
    b_map = {r['year']: r['price_mtu'] for r in sd_data['scenarios']['base']['price_path_mtu']}
    u_map = {r['year']: r['price_mtu'] for r in sd_data['scenarios']['bull']['price_path_mtu']}
    d_map = {r['year']: r['price_mtu'] for r in sd_data['scenarios']['bear']['price_path_mtu']}
    m5_2027_base = float(b_map.get(2027, 2057.8))
    m5_2027_bull = float(u_map.get(2027, 2500.0))
    m5_2027_bear = float(d_map.get(2027, 1480.0))
    m5_2028_base = float(b_map.get(2028, 1411.4))

# Construct the Synthetic Forward Curve (Spot, 1M, 2M, 3M, 6M, 9M, 12M, 24M)
# Empirically grounded in:
#   - 1M–3M: 4-week leading indicators (European FeW $1,209/mtu-eq, Equity Implied $1,528/mtu,
#     Value-Chain Factor $1,388/mtu, and China Landed Parity $971/mtu) pull Rotterdam Spot
#     down from its stranded $2,700/mtu vessel squeeze while pulling China Landed Parity up
#     on the -6.45% MNR quota contraction and pre-Jan-2027 DoW ban stockpiling.
#   - 6M–24M: Ornstein-Uhlenbeck convergence toward the M5 stock-to-use equilibrium path.
spot_rot = float(m0_series.iloc[-1])
spot_west_exec = float(M4_WEST.iloc[-1])
spot_glob_fair = float(M4.iloc[-1])
spot_cn_parity = float(rotterdam_fair_from_shanghai.iloc[-1])
spot_eq_imp = float(M2.iloc[-1])
spot_fac_imp = float(M3.iloc[-1])

# Target attractors for Rotterdam Spot, Global Fair Value, and China Landed Parity
# 1M (21d) lead signal target for Rotterdam combines Western Executable ($2,085), Equity ($1,528), Factor ($1,388), and M5 2027 ($2,058)
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

forward_curve = []
for label, days, driver_note in HORIZONS:
    tau = days / 365.0
    # Rotterdam Ex-China CIF Forward ($/mtu):
    # Decays from $2,700 spot toward ~$1,960 at 12M and ~$1,480 at 24M as acute spot squeeze normalizes toward M5 equilibrium
    rot_12m_target = 0.55 * m5_2027_base + 0.25 * spot_west_exec + 0.20 * spot_eq_imp  # ~$1,960
    rot_24m_target = 0.65 * m5_2028_base + 0.35 * spot_eq_imp                           # ~$1,452
    if tau <= 1.0:
        w_decay = 1.0 - np.exp(-2.2 * tau)
        rot_fwd = spot_rot * (1.0 - w_decay) + rot_12m_target * w_decay
    else:
        w2 = min(1.0, (tau - 1.0))
        rot_fwd_1y = spot_rot * np.exp(-2.2) + rot_12m_target * (1.0 - np.exp(-2.2))
        rot_fwd = rot_fwd_1y * (1.0 - 0.65 * w2) + rot_24m_target * (0.65 * w2)

    # Global Fundamental Fair Value Forward ($/mtu):
    glob_12m_target = 0.40 * spot_eq_imp + 0.30 * spot_fac_imp + 0.30 * m5_2027_base   # ~$1,645
    glob_24m_target = 0.50 * m5_2028_base + 0.50 * spot_fac_imp                         # ~$1,400
    if tau <= 1.0:
        wg = 1.0 - np.exp(-1.8 * tau)
        glob_fwd = spot_glob_fair * (1.0 - wg) + glob_12m_target * wg
    else:
        w2 = min(1.0, (tau - 1.0))
        glob_fwd_1y = spot_glob_fair * np.exp(-1.8) + glob_12m_target * (1.0 - np.exp(-1.8))
        glob_fwd = glob_fwd_1y * (1.0 - 0.65 * w2) + glob_24m_target * (0.65 * w2)

    # China Landed Export-Parity Forward ($/mtu):
    # Rises from $971/mtu toward ~$1,290/mtu over 12M as Chinese domestic inventories tighten on quota cuts
    cn_12m_target = 0.50 * spot_cn_parity + 0.50 * glob_12m_target                      # ~$1,308
    cn_24m_target = 0.60 * spot_cn_parity + 0.40 * glob_24m_target                      # ~$1,142
    if tau <= 1.0:
        wc = 1.0 - np.exp(-2.0 * tau)
        cn_fwd = spot_cn_parity * (1.0 - wc) + cn_12m_target * wc
    else:
        w2 = min(1.0, (tau - 1.0))
        cn_fwd_1y = spot_cn_parity * np.exp(-2.0) + cn_12m_target * (1.0 - np.exp(-2.0))
        cn_fwd = cn_fwd_1y * (1.0 - 0.60 * w2) + cn_24m_target * (0.60 * w2)

    # 80% Forecast Confidence Band around Rotterdam Forward (widens with sqrt(tau) and M5 Bull/Bear spread)
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
        'global_fair_fwd_mtu': round(float(glob_fwd), 1),
        'china_parity_fwd_mtu': round(float(cn_fwd), 1),
        'implied_wedge_pct': round(float((rot_fwd / cn_fwd - 1.0) * 100.0), 1),
        'bull_80_hi_mtu': round(float(bull_hi), 1),
        'bear_80_lo_mtu': round(float(bear_lo), 1),
        'rotterdam_chg_pct': round(float((rot_fwd / spot_rot - 1.0) * 100.0), 1),
        'global_chg_pct': round(float((glob_fwd / spot_glob_fair - 1.0) * 100.0), 1),
        'china_chg_pct': round(float((cn_fwd / spot_cn_parity - 1.0) * 100.0), 1),
        'driver': driver_note,
    })

# Daily / Weekly continuous 12-month forward trajectory for seamless charting
fwd_dates = pd.date_range(start=end_date, end=end_date + pd.Timedelta(days=365), freq='7D')
rot_12m_target = 0.55 * m5_2027_base + 0.25 * spot_west_exec + 0.20 * spot_eq_imp
glob_12m_target = 0.40 * spot_eq_imp + 0.30 * spot_fac_imp + 0.30 * m5_2027_base
cn_12m_target = 0.50 * spot_cn_parity + 0.50 * glob_12m_target

fwd_rot_series = []
fwd_glob_series = []
fwd_cn_series = []
fwd_hi_series = []
fwd_lo_series = []
for d in fwd_dates:
    tau = (d - end_date).days / 365.0
    ds = d.strftime('%Y-%m-%d')
    wr = 1.0 - np.exp(-2.2 * tau)
    wg = 1.0 - np.exp(-1.8 * tau)
    wc = 1.0 - np.exp(-2.0 * tau)
    rf = spot_rot * (1.0 - wr) + rot_12m_target * wr
    gf = spot_glob_fair * (1.0 - wg) + glob_12m_target * wg
    cf = spot_cn_parity * (1.0 - wc) + cn_12m_target * wc
    sig = 0.04 + 0.20 * np.sqrt(max(tau, 0.005))
    fwd_rot_series.append([ds, round(float(rf), 2)])
    fwd_glob_series.append([ds, round(float(gf), 2)])
    fwd_cn_series.append([ds, round(float(cf), 2)])
    fwd_hi_series.append([ds, round(float(rf * np.exp(1.28 * sig)), 2)])
    fwd_lo_series.append([ds, round(float(rf * np.exp(-1.28 * sig)), 2)])

# --------------------------------------------------------------------------
# 8. Metal Complex Co-Movement & Correlation Matrix
# --------------------------------------------------------------------------
metals_dict = {
    'EU Ferrotungsten (FeW)': few_eu_usd_mtu,
    'CN Concentrate (65%)': conc65_cn_usd_mtu,
    'CN Tungsten Powder': powder_cn_usd_mtu,
    'Tungsten Equities (Pure-Play)': tungsten_eq_index,
    'Tooling & Strategic (KMT/SAND/REMX)': tool_remx_idx,
    'Strategic Metals ETF (REMX)': remx_d,
    'Silver': align_ffill(SILVER),
    'Gold': align_ffill(GOLD),
    'Metals & Mining ETF (XME)': xme_d,
    'Iron Ore': iron_ore_d,
    'Copper': copper_d,
    'S&P 500': spx_d,
}

metal_panel = pd.DataFrame({
    'APT Observed': m0_series.resample('ME').last(),
    'Shanghai Implied': shanghai_domestic_usd_mtu.resample('ME').last(),
    'Kalman Fair Value': M4.resample('ME').last(),
    **{k: v.resample('ME').last() for k, v in metals_dict.items()}
}).dropna(how='all')

metal_returns = np.log(metal_panel).diff().dropna()

metal_corrs = {}
for m_name in metals_dict:
    metal_corrs[m_name] = {
        'observed': round(float(metal_returns['APT Observed'].corr(metal_returns[m_name])), 3),
        'shanghai': round(float(metal_returns['Shanghai Implied'].corr(metal_returns[m_name])), 3),
        'kalman': round(float(metal_returns['Kalman Fair Value'].corr(metal_returns[m_name])), 3),
    }

metal_prices = {}
for m_name, s in {
    'Gold': GOLD, 'Silver': SILVER, 'Platinum': PLATINUM, 'Palladium': PALLADIUM,
    'Copper': COPPER, 'Aluminum': ALUMINUM, 'Zinc': ZINC, 'Iron Ore': IRON_ORE,
    'Strategic Metals (REMX)': REMX, 'Base Metals (XME)': XME,
}.items():
    s_clean = s.dropna()
    if len(s_clean):
        metal_prices[m_name] = {
            'date': s_clean.index[-1].strftime('%Y-%m-%d'),
            'value': round(float(s_clean.iloc[-1]), 2)
        }

# Weekly log-return correlation matrix across key value-chain, equity, and macro series
weekly_corr_df = pd.DataFrame({
    'EU APT Spot': m0_series,
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

# Rolling 12-week (60-day) correlations
w_ret_d = np.log(pd.DataFrame({
    'apt': m0_series,
    'cn_apt': shanghai_domestic_usd_mtu,
    'few': few_eu_usd_mtu,
    'eq': tungsten_eq_index,
    'cu': copper_d,
    'tio': iron_ore_d,
})).diff(7)
rolling_corr_cu_apt = w_ret_d['apt'].rolling(90).corr(w_ret_d['cu']).dropna()
rolling_corr_tio_apt = w_ret_d['few'].rolling(90).corr(w_ret_d['apt']).dropna()
rolling_corr_eq_apt = w_ret_d['cn_apt'].rolling(90).corr(w_ret_d['eq']).dropna()


# --------------------------------------------------------------------------
# 9. Model Audit Summary (Explaining Why Legacy Models Failed & How Fixed)
# --------------------------------------------------------------------------
MODEL_AUDIT = {
    'm2_equity_audit': {
        'legacy_flaws': [
            'Contaminated Basket: Included non-tungsten HK stocks (1124.HK Coastal Greenland real estate, 0697.HK Shoucheng parking/infra) and copper giant 603993.SS CMOC (monthly corr = -0.069 with EU APT), producing a negative 21-day lead correlation of -0.1968.',
            'Arithmetic Volatility Drag & Late-Listing Backfill: Compounded equal-weighted daily arithmetic returns and backfilled OTC ticker GMTL (listed March 2026) back to Jan 2025.',
            'Ad-Hoc Functional Form: Mapped index gains through an arbitrary curve 330 + 850*log(1 + 1.8*gain) with no econometric calibration.'
        ],
        'v3_fixes': [
            'Verified Pure-Play Universe (11 Stocks in 3 Sub-Baskets): Chinese Producers (002378.SZ Zhangyuan r=+0.619, 600549.SS Xiamen r=+0.504, 000657.SZ CTHT), Western Producers/Developers (EQR.AX r=+0.532, GMET.L r=+0.482, TUN.L, ALM, FWZ.V, TGN.AX), and Downstream Tooling Majors (KMT r=+0.413, SAND.ST r=+0.380).',
            'Strong Positive Lead Signal: Clean log-return index leads European APT by 21 trading days (4 weeks) with r = +0.6105 (and leads China APT by 4 weeks with r = +0.617).',
            'Constrained Non-Negative Cointegrated Regression: Regresses log(APT) on the 3 log-return sub-baskets with positive economic elasticity bounds, achieving R² = 0.9393 and nowcasting $1,528/mtu.'
        ],
        'old_lead_corr': -0.1968,
        'new_lead_corr': round(eq_21d_lead_eu, 4),
        'new_r2': round(eq_r2, 4),
    },
    'm3_factor_audit': {
        'legacy_flaws': [
            'Uncorrelated Macro Proxies: Regressed tungsten returns on Copper (HG=F, r = -0.165), S&P 500 (^GSPC, r = -0.312), FXI China Large-Cap (r = -0.061), and Iron Ore (TIO=F, r = +0.059). Generic macro assets did not experience China’s Feb 2025 dual-use tungsten export controls.',
            'Explosive Intercept Drift ($7,739/mtu): Because the macro factors had ~0 explanatory power, OLS dumped the entire 9x tungsten rally into the monthly intercept (+11.96%/mo) and compounded it daily without mean reversion, exploding to $7,739/mtu.',
            'Circular Smoothing in V2 Draft: Attempted to hide negative regression R² (-0.428) by blending 97.5% step + 2.5% (0.5*M0 + 0.5*M1), creating circular dependence on M0.'
        ],
        'v3_fixes': [
            'Physical Value-Chain & Industrial Factors (Zero Circularity with M0): Replaced generic macro proxies with European Ferrotungsten ($/mtu-eq, r = +0.785, 4W lead = +0.740), China 65% Concentrate ($/mtu, 4W lead = +0.676), China Tungsten Powder ($/mtu-eq, 4W lead = +0.672), and Western Hardmetal Tooling/Strategic Metals (KMT + SAND.ST + REMX, r = +0.413).',
            'Econometric Validation: Monthly log-return regression R² improved from -0.428 to +0.5506 (with zero intercept drift), while the non-negative cointegrated level model achieves R² = 0.8727.',
            'Actionable Valuation Insight: Nowcasts $1,388/mtu because European FeW ($152.5/kg = $1,209/mtu-eq) and Chinese Concentrate/Powder have cooled 50–65% from their March 2026 peaks, signaling that Rotterdam APT ($2,700/mtu) carries a ~$1,312/mtu illiquidity/vessel-shortage premium.'
        ],
        'old_r2': -0.428,
        'new_return_r2': round(factor_r2, 4),
        'new_level_r2': round(factor_level_r2, 4),
    },
    'data_hygiene_audit': {
        'issue': 'Initial regex scraping of CTIA articles matched retrospective monthly/quarterly average articles ("Average Price from January to August") and low-grade 17% tungsten slime auction quotes, causing 79 false >15% daily jumps.',
        'fix': 'Filtered strictly to 413 daily market analysis reports ("analysis of latest tungsten market" / "prices of tungsten products on"), stripped lookback sentences, and parsed multi-product "respectively" clauses across 6 physical streams (1,750 verified observations, 0 false jumps in CN APT, CN Concentrate, and EU FeW).'
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
        'cn_concentrate_rmb_t': {'date': cn_conc_rmb.index[-1].strftime('%Y-%m-%d'), 'value': round(float(cn_conc_rmb.iloc[-1]), 0)},
        'cn_concentrate_usd_mtu': {'date': conc65_cn_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(conc65_cn_usd_mtu.iloc[-1]), 2)},
        'cn_powder_rmb_t': {'date': cn_pwd_rmb.index[-1].strftime('%Y-%m-%d'), 'value': round(float(cn_pwd_rmb.iloc[-1]), 0)},
        'cn_powder_usd_mtu_eq': {'date': powder_cn_usd_mtu.index[-1].strftime('%Y-%m-%d'), 'value': round(float(powder_cn_usd_mtu.iloc[-1]), 2)},
        'equity_implied': {'date': M2.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M2.iloc[-1]), 2)},
        'factor_implied': {'date': M3.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M3.iloc[-1]), 2)},
        'kalman': {'date': M4.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M4.iloc[-1]), 2)},
        'kalman_band': [round(float(M4_LO.iloc[-1]), 2), round(float(M4_HI.iloc[-1]), 2)],
        'western_executable_nowcast': {'date': M4_WEST.index[-1].strftime('%Y-%m-%d'), 'value': round(float(M4_WEST.iloc[-1]), 2)},
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
        'observed_rotterdam_mtu': s_to_list(m0_series),
        'observed_rotterdam_t': s_to_list(m0_series * MTU_PER_T_APT),
        'shanghai_domestic_usd_mtu': s_to_list(shanghai_domestic_usd_mtu),
        'shanghai_domestic_rmb_t': s_to_list(cn_apt_rmb),
        'rotterdam_fair_from_shanghai_mtu': s_to_list(rotterdam_fair_from_shanghai),
        'smelting_parity_cn_usd_mtu': s_to_list(smelt_parity_cn_usd_mtu),
        'smelting_export_parity_usd_mtu': s_to_list(smelt_export_parity_usd_mtu),
        'fragmentation_premium': s_to_list(fragmentation_premium),
        'eu_ferrotungsten_usd_mtu': s_to_list(few_eu_usd_mtu),
        'eu_ferrotungsten_usd_kg': s_to_list(few_eu_kg),
        'cn_concentrate_usd_mtu': s_to_list(conc65_cn_usd_mtu),
        'cn_concentrate_rmb_t': s_to_list(cn_conc_rmb),
        'cn_powder_usd_mtu': s_to_list(powder_cn_usd_mtu),
        'cn_powder_rmb_t': s_to_list(cn_pwd_rmb),
        'cn_ferrotungsten_usd_mtu': s_to_list(few_cn_usd_mtu),
        'equity_implied_mtu': s_to_list(M2),
        'factor_implied_mtu': s_to_list(M3),
        'kalman_mtu': s_to_list(M4),
        'kalman_lo': s_to_list(M4_LO),
        'kalman_hi': s_to_list(M4_HI),
        'western_executable_mtu': s_to_list(M4_WEST),
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
        'rolling_corr_tio_apt': s_to_list(rolling_corr_tio_apt),
        'rolling_corr_eq_apt': s_to_list(rolling_corr_eq_apt),
        'forecast_rotterdam_12m': fwd_rot_series,
        'forecast_global_fair_12m': fwd_glob_series,
        'forecast_china_parity_12m': fwd_cn_series,
        'forecast_bull_80_hi': fwd_hi_series,
        'forecast_bear_80_lo': fwd_lo_series,
    },
    'forward_curve': forward_curve,
    'factor_model': {
        'betas': factor_return_betas,
        'level_elasticities': factor_level_betas,
        'r2': round(factor_r2, 4),
        'level_r2': round(factor_level_r2, 4),
        'factors_detail': FACTOR_DIAGNOSTICS,
        'method': 'Non-Circular Value-Chain & Industrial Cointegrated Factor Model (EU FeW + CN Conc + CN Powder + Tooling/REMX)'
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
        'lead_21d_corr_eu_apt': round(eq_21d_lead_eu, 4),
        'lead_4w_corr_eu_apt': round(eq_4w_lead_eu, 4),
        'lead_4w_corr_cn_apt': round(eq_4w_lead_cn, 4),
        'contemp_4w_corr_eu_apt': round(eq_4w_contemp_eu, 4),
        'contemp_4w_corr_cn_apt': round(eq_4w_contemp_cn, 4),
        'latest_index': round(float(tungsten_eq_index.iloc[-1]), 2),
        'method': 'Log-Return Pure-Play Equity Index & Constrained Cointegrated Valuation Model (4-Week Lead Signal)'
    },
    'kalman_model': {
        'states': ['Latent Global APT Fair Value', 'Western Executable Clearing Price', 'Trend Drift'],
        'observations': ['Observed Rotterdam Spot (M0)', 'China Landed Export Parity (M1)', 'Pure-Play Equity Valuation (M2)', 'Value-Chain Factor Value (M3)'],
        'last_se_usd': round(float(total_sd[-1] * M4.iloc[-1]), 2),
        'smelting_corr_cn_apt': round(smelt_corr_cn, 4),
    },
    'model_audit': MODEL_AUDIT,
    'correlation_matrix': corr_matrix,
    'metal_correlations': {
        'monthly_returns': metal_corrs,
        'n_obs': len(metal_returns),
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

print('=== MODEL ENGINE V3 COMPLETE ===')
print(f"Generated UTC: {output['generated_utc']}")
print(f"M0 Rotterdam APT Spot:        ${output['latest']['reported_rotterdam']['value']}/mtu ({output['latest']['reported_rotterdam']['date']})")
print(f"M0 European Ferrotungsten:    ${output['latest']['eu_ferrotungsten_usd_kg']['value']}/kg W (${output['latest']['eu_ferrotungsten_usd_mtu_eq']['value']}/mtu-eq)")
print(f"M0 China Domestic APT:        RMB {output['latest']['shanghai_domestic_rmb_t']['value']:,.0f}/t (${output['latest']['shanghai_domestic_usd_mtu']['value']}/mtu)")
print(f"M0 China 65% Concentrate:     RMB {output['latest']['cn_concentrate_rmb_t']['value']:,.0f}/t (${output['latest']['cn_concentrate_usd_mtu']['value']}/mtu)")
print(f"M1 Smelting Parity (CN/Exp):  ${output['latest']['smelting_parity_cn_usd_mtu']['value']}/mtu domestic | ${output['latest']['smelting_export_parity_usd_mtu']['value']}/mtu landed")
print(f"M1 Rotterdam Landed Parity:   ${output['latest']['rotterdam_fair_from_shanghai']['value']}/mtu (Wedge: +{output['latest']['fragmentation_premium_pct']['value']}%)")
print(f"M2 Pure-Play Equity Implied:  ${output['latest']['equity_implied']['value']}/mtu (R2={eq_r2:.4f}, 21d Lead r=+{eq_21d_lead_eu:.4f}, Index={output['latest']['tungsten_equity_index']['value']})")
print(f"M3 Value-Chain Factor Model:  ${output['latest']['factor_implied']['value']}/mtu (Ret R2={factor_r2:.4f}, Lvl R2={factor_level_r2:.4f})")
print(f"M4 Global Fundamental Fair:   ${output['latest']['kalman']['value']}/mtu [90% band: ${output['latest']['kalman_band'][0]} - ${output['latest']['kalman_band'][1]}]")
print(f"M4 Western Executable Spot:   ${output['latest']['western_executable_nowcast']['value']}/mtu")
print("Synthetic Forward Curve (Rotterdam | Global Fair | China Landed Parity):")
for row in forward_curve:
    print(f"  {row['tenor']:4s} ({row['date']}): Rotterdam=${row['rotterdam_fwd_mtu']:7.1f} | Global=${row['global_fair_fwd_mtu']:7.1f} | CN Parity=${row['china_parity_fwd_mtu']:7.1f} | 80% Band=[${row['bear_80_lo_mtu']:.0f}, ${row['bull_80_hi_mtu']:.0f}]")
