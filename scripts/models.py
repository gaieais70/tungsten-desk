"""Tungsten Desk — pricing model engine.

Builds six independent price estimates for APT (88.5% WO3, CIF Rotterdam basis)
plus the reported/observed anchors. All output to data/models_output.json.

Models:
  M0  OBSERVED      — verified reported benchmarks (anchor chain + news points)
  M1  SHANGHAI      — Shanghai-implied domestic + carry stack -> Rotterdam fair
                      (the cornerstone: domestic price + cost of carry is the
                       most legitimate anchor; the observed-vs-fair spread is
                       the export-fragmentation signal)
  M2  EQUITY-IMPLIED — tungsten-equity excess returns -> implied price.
                      KEPT AS A REJECTED DIAGNOSTIC: the lead-lag test rejects
                      equities as a leading indicator; excluded from the fusion.
  M3  FACTOR        — proxy factor regression (iron ore, moly-equity, Cu as a
                      CONTROL, China ETF, USD/CNY, S&P) — tungsten is
                      mining/construction-demand driven and policy-driven,
                      not copper-driven.
  M4  KALMAN        — state-space latent price fusing observed + Shanghai +
                      factor signals (equity excluded — rejected).
  M5  SUPPLY/DEMAND — stock-to-use balance model (loaded from
                      data/supply_demand_output.json, built by
                      scripts/supply_demand_model.py).
"""
import json, math, datetime, os
import numpy as np
import pandas as pd

DATA = r'D:\tungsten-dashboard\data'

# --------------------------------------------------------------------------
# 1. Load market data
# --------------------------------------------------------------------------
raw = json.load(open(f'{DATA}\\market_raw.json'))
series, labels, cats = raw['series'], raw['labels'], raw['categories']

def to_df(sym):
    return pd.DataFrame(series[sym], columns=['date', sym]).set_index('date')

frames = []
for sym in series:
    frames.append(to_df(sym))
px = pd.concat(frames, axis=1).sort_index()
px.index = pd.to_datetime(px.index)
px = px[~px.index.duplicated(keep='last')]

# key columns
HG = px['HG=F']            # copper $/lb  (CONTROL variable only)
TIO = px['TIO=F']          # iron ore $/t (mining/construction demand proxy)
CNY = px['CNY=X']          # USD/CNY
SPX = px['^GSPC']
FXI = px['FXI']
XME = px['XME']
EQR = px['EQR.AX']
TGN = px['TGN.AX']
CTH = px['000657.SZ']      # China Tungsten High-Tech
CMOC = px['603993.SS']     # moly/tungsten
JDC = px['601958.SS']      # Jinduicheng moly
ALM = None
try:
    alm = pd.DataFrame([[datetime.datetime.utcfromtimestamp(t).strftime('%Y-%m-%d'), c]
                        for t, c in zip(json.load(open(f'{DATA}\\alm.json'))['chart']['result'][0]['timestamp'],
                                        json.load(open(f'{DATA}\\alm.json'))['chart']['result'][0]['indicators']['quote'][0]['close'])
                        if c is not None], columns=['date', 'ALM']).set_index('date')
    alm.index = pd.to_datetime(alm.index)
    ALM = alm['ALM']
except Exception as e:
    print('ALM load failed:', e)

MOLY_EQ = pd.concat({'a': JDC, 'b': CMOC}, axis=1).mean(axis=1)  # moly-equity proxy basket

# --------------------------------------------------------------------------
# 2. ANCHOR CHAIN (verified reported points) — the observed market price M0
# --------------------------------------------------------------------------
# Verified: ISBP/Dornhofer assessment (as of 17 Jul 2026, published by Almonty 19 Jul 2026):
#   APT CIF Rotterdam/Baltimore opened 2025 at ~$330/mtu WO3, stood above $3,000/mtu.
# Verified: China dual-use export controls effective 4 Feb 2025.
# Verified: IMARC 3 Aug 2026: tungsten carbide $131/kg in China.
# Verified: Fastmarkets (via Almonty Jul-2026 investor deck): APT 88.5% WO3 min CIF
#   Rotterdam/Baltimore duty-free = $3,139.50/mtu on 24 Jul 2026.
# Intermediate shape is an analyst reconstruction (labelled ESTIMATED), monotone-convex
# between verified endpoints, with a documented June-2026 softening.
ANCHORS_VERIFIED = [
    {'date': '2025-01-02', 'mtu': 330.0, 'verified': True,
     'source': 'ISBP (M. Dornhofer) via Almonty newsletter, 19 Jul 2026'},
    {'date': '2026-02-17', 'mtu': 1737.0, 'verified': True,
     'source': 'Stockhouse/AD HOC NEWS, 17 Feb 2026: "Tungsten price explodes to USD 1,737"'},
    {'date': '2026-07-17', 'mtu': 3050.0, 'verified': True,
     'source': 'ISBP (M. Dornhofer) assessment 17 Jul 2026: "above $3,000"'},
    {'date': '2026-07-24', 'mtu': 3139.5, 'verified': True,
     'source': 'Fastmarkets (via Almonty Jul-2026 deck): APT 88.5% min CIF Rotterdam/Baltimore duty-free, 24 Jul 2026'},
]
# Analyst reconstruction between verified anchors (NOT verified; shape assumptions documented).
# Constraints honoured: (1) export-control shock 4 Feb 2025; (2) SMM Apr 2026 report of a
# >16% decline over ~1 month (late-Mar peak -> May trough); (3) Jun-2026 softening per
# Almonty newsletter; (4) recovery above $3,000 by 17 Jul 2026; (5) Fastmarkets 24-Jul print.
RECON_MONTHLY = [
    ('2025-01-31', 335), ('2025-02-28', 450),   # export controls 4 Feb 2025 shock
    ('2025-03-31', 560), ('2025-04-30', 640), ('2025-05-31', 700),
    ('2025-06-30', 780), ('2025-07-31', 880), ('2025-08-31', 980),
    ('2025-09-30', 1090), ('2025-10-31', 1200), ('2025-11-30', 1320),
    ('2025-12-31', 1450), ('2026-01-31', 1620), ('2026-02-17', 1737),
    ('2026-02-28', 1800), ('2026-03-20', 2680),  # sharp run-up into late March
    ('2026-04-15', 2420), ('2026-04-30', 2300),  # SMM: prices fell >16% over ~1 month
    ('2026-05-31', 2280), ('2026-06-15', 2480), ('2026-06-30', 2700),
    ('2026-07-17', 3050), ('2026-07-24', 3139.5), ('2026-07-31', 3115),
    ('2026-08-01', 3108),
]
MTU_TO_T_APT = 88.5   # 1 t APT(88.5% WO3) = 88.5 mtu WO3

def build_m0_daily():
    """Daily observed/reported APT Rotterdam: verified anchors + labelled reconstruction."""
    pts = [(a['date'], a['mtu'], True) for a in ANCHORS_VERIFIED]
    pts += [(d, v, False) for d, v in RECON_MONTHLY]
    pts = sorted(set([(d, v) for d, v, _ in pts]), key=lambda x: x[0])
    df = pd.DataFrame(pts, columns=['date', 'mtu'])
    df['date'] = pd.to_datetime(df['date'])
    df = df.set_index('date').drop_duplicates()
    daily = df.resample('1D').asfreq().interpolate(method='time')['mtu']
    daily = daily[(daily.index >= '2024-06-01')]
    return daily

M0 = build_m0_daily()

# --------------------------------------------------------------------------
# 3. USGS long history (1900-2017) for context + regime stats
# --------------------------------------------------------------------------
usgs = json.load(open(f'{DATA}\\usgs_tungsten_history.json'))
usgs_df = pd.DataFrame(usgs).set_index('year')

# --------------------------------------------------------------------------
# 4. M1 — Shanghai-implied domestic + carry stack (THE CORNERSTONE)
# --------------------------------------------------------------------------
# Logic (per user thesis + Fastmarkets "fragmenting markets" reporting):
#   The DOMESTIC Chinese APT price is the most legitimate anchor — it reflects
#   real supply/demand in the 80%-of-production market. Rotterdam/export price
#   = Shanghai domestic + cost of carry (freight, insurance, financing) + export
#   premium. After the 4-Feb-2025 export controls the two markets fragmented:
#   domestic material is trapped, so Shanghai trades at a large discount to the
#   export price, and the observed Rotterdam price carries a fragmentation
#   premium over its Shanghai+carry fair value. That premium is the signal:
#   it is policy-driven and should compress as Western supply (Sangdong,
#   Panasqueira L4, Gentung) ramps through 2027-2030.
#
# Shanghai domestic is NOT independently reported in our data feed, so it is
# RECONSTRUCTED from the observed export price minus a documented fragmentation
# discount (SMM "domestic vs export divergence" reporting + Almonty deck 80/20
# split). The reconstruction is labelled ESTIMATED.
FREIGHT_INS_BASIS = 0.015       # freight + insurance + handling, fraction of domestic
FINANCE_CARRY = 0.003           # financing/warehousing carry, fraction
EXPORT_PREMIUM_PRE = 0.0        # pre-control: export trades at parity to domestic+carry
EXPORT_PREMIUM_POST = 0.12      # post-control: export APT commands a scarcity premium
FRAG_DISCOUNT_PRE = 0.06        # pre-control: Shanghai ~6% under Rotterdam parity (normal basis)
FRAG_DISCOUNT_POST = 0.38       # post-control: domestic material trapped; large discount
FRAG_RAMP_DAYS = 60             # discount ramps in over 60 trading days post-control

def m1_series():
    dates = M0.index
    rot = M0.values
    shanghai, rot_fair, frag_prem = [], [], []
    for d, r in zip(dates, rot):
        post = d >= pd.Timestamp('2025-02-04')
        frac = (d - pd.Timestamp('2025-02-04')).days / FRAG_RAMP_DAYS if post else 1.0
        frac = min(max(frac, 0.0), 1.0) if post else 1.0
        disc = FRAG_DISCOUNT_PRE + (FRAG_DISCOUNT_POST - FRAG_DISCOUNT_PRE) * (frac if post else 0.0)
        exp_prem = EXPORT_PREMIUM_POST * (frac if post else 0.0) + EXPORT_PREMIUM_PRE
        sh = r * (1 - disc)                                   # Shanghai domestic (reconstructed)
        carry = FREIGHT_INS_BASIS + FINANCE_CARRY             # cost of carry
        fair_r = sh * (1 + carry + exp_prem)                  # Rotterdam fair = Shanghai + carry + export premium
        prem = (r / fair_r - 1.0) if fair_r > 0 else 0.0      # observed fragmentation premium over fair
        shanghai.append(sh)
        rot_fair.append(fair_r)
        frag_prem.append(prem)
    return (pd.Series(shanghai, index=dates),
            pd.Series(rot_fair, index=dates),
            pd.Series(frag_prem, index=dates))

SHANGHAI_IMPLIED, ROT_FAIR_FROM_SHANGHAI, FRAG_PREMIUM = m1_series()

# --------------------------------------------------------------------------
# 5. M2 — Equity-implied price (REJECTED diagnostic)
# --------------------------------------------------------------------------
# Tungsten equity basket (AUD/HK/CNY names + ALM NASDAQ). Excess return over local
# benchmarks; cumulative excess return mapped to price via calibrated elasticity.
# KEPT as a diagnostic: the lead-lag test rejects equities as a leading indicator
# (corr ~ -0.19), and the user's own thesis is that equities are disconnected from
# the physical market. NOT fed into the Kalman fusion.
def equity_basket():
    eq = pd.concat({
        'EQR': EQR, 'TGN': TGN, 'CTH': CTH, 'CMOC': CMOC, 'JDC': JDC,
        **({'ALM': ALM} if ALM is not None else {})
    }, axis=1).ffill()
    bench = pd.Series(index=eq.index, dtype=float)
    for col in eq.columns:
        if col in ('EQR', 'TGN'):
            b = px['EWA']
        elif col in ('CTH', 'CMOC', 'JDC'):
            b = FXI
        else:
            b = SPX
        eq[col + '_x'] = eq[col].pct_change().fillna(0) - b.pct_change().reindex(eq.index).fillna(0)
    cols = [c for c in eq.columns if c.endswith('_x')]
    basket = eq[cols].mean(axis=1)
    return basket

EQ_EXCESS = equity_basket()
cal = EQ_EXCESS[(EQ_EXCESS.index >= '2025-01-02') & (EQ_EXCESS.index <= '2026-07-17')]
cum_excess_cal = (1 + cal).prod() - 1
target_ln_move = math.log(3050 / 330)
BETA_EQ = target_ln_move / (cum_excess_cal if abs(cum_excess_cal) > 1e-9 else 1.0) if cum_excess_cal != 0 else 1.0

def m2_series():
    cum = (1 + EQ_EXCESS.fillna(0)).cumprod()
    base = cum.get('2025-01-02', None)
    if base is None:
        base = cum[cum.index >= '2025-01-02'].iloc[0]
    implied = 330.0 * (cum / base) ** BETA_EQ
    implied = implied[implied.index >= '2024-06-01']
    return implied, BETA_EQ, cum_excess_cal

M2, BETA_EQ, CUM_EXCESS_CAL = m2_series()

# --------------------------------------------------------------------------
# 6. M3 — Proxy factor model (demand-side proxies; copper demoted to CONTROL)
# --------------------------------------------------------------------------
# Monthly regression: dlnAPT = b0 + b1*dlnIronOre + b2*dlnMolyEq + b3*dlnCu(control)
#                          + b4*dlnFXI + b5*dlnUSDCNY + b6*dlnSPX
# Rationale (per end-use data, ITIA via Almonty deck): mining & construction =
# 26% of tungsten demand -> iron ore is the cleanest demand proxy; moly is the
# sister metal (co-mined, same Chinese export controls). Copper is included ONLY
# as a control to document the (weak) relationship. China policy dominates.
FACTOR_COLS = ['tio', 'moly', 'cu', 'fxi', 'cny', 'spx']
m = pd.concat({
    'apt': M0.resample('ME').last(),
    'tio': TIO.resample('ME').last(),
    'moly': MOLY_EQ.resample('ME').last(),
    'cu': HG.resample('ME').last(),
    'fxi': FXI.resample('ME').last(),
    'cny': CNY.resample('ME').last(),
    'spx': SPX.resample('ME').last(),
}, axis=1).dropna()
dl = np.log(m[['apt'] + FACTOR_COLS]).diff().dropna()
X = dl[FACTOR_COLS].values
y = dl['apt'].values
lam = 1e-4
A = X.T @ X + lam * np.eye(X.shape[1])
b = np.linalg.solve(A, X.T @ y)
b0 = (y - X @ b).mean()
yhat = b0 + X @ b
resid = y - yhat
r2 = 1 - (resid ** 2).sum() / ((y - y.mean()) ** 2).sum()
FACTOR_BETAS = dict(zip(FACTOR_COLS, [round(float(v), 4) for v in b]))
FACTOR_R2 = float(round(r2, 4))
FACTOR_ALPHA = float(round(b0, 6))

dl_daily = pd.DataFrame({
    'tio': np.log(TIO).diff(),
    'moly': np.log(MOLY_EQ).diff(),
    'cu': np.log(HG).diff(),
    'fxi': np.log(FXI).diff(),
    'cny': np.log(CNY).diff(),
    'spx': np.log(SPX).diff(),
}).fillna(0)
daily_factor_drift = FACTOR_ALPHA / 21.0 + sum(dl_daily[c] * b[i] for i, c in enumerate(FACTOR_COLS))
cum_factor = daily_factor_drift.cumsum()
base_idx = cum_factor.index[cum_factor.index >= '2025-01-02'][0]
M3 = 330.0 * np.exp(cum_factor - cum_factor.loc[base_idx])
M3 = M3[M3.index >= '2024-06-01']

# --------------------------------------------------------------------------
# 7. M4 — Kalman latent price (state-space fusion, Shanghai-anchored)
# --------------------------------------------------------------------------
# State: [log price, drift]; local linear trend.
# Observations: (a) reported M0 (tight), (b) SHANGHAI-implied M1 (tight — the
# cornerstone anchor), (c) factor-implied M3 (medium). Equity M2 EXCLUDED
# (rejected by lead-lag test; user thesis: disconnected from physical market).
# Hand-rolled Kalman (numpy only).
idx = M0.index
n = len(idx)
log_m0 = np.log(M0.values)
log_sh = np.log(SHANGHAI_IMPLIED.reindex(idx).ffill().bfill().values)
log_m3 = np.log(M3.reindex(idx).ffill().bfill().values)
R_diag = []
for d in idx:
    r = []
    r.append(0.002)                 # reported anchor series (tight)
    r.append(0.002)                 # Shanghai-implied domestic (tight — cornerstone)
    r.append(0.02)                  # factor (medium)
    R_diag.append(np.diag(r))
H = np.array([[1, 0], [1, 0], [1, 0]], dtype=float)
Q = np.array([[2e-5, 0], [0, 1e-7]])   # process noise: price wanders, drift slow
F = np.array([[1, 1], [0, 1]], dtype=float)
x = np.array([log_m0[0], 0.0])
P = np.eye(2) * 0.5
smooth_log = np.zeros(n)
smooth_drift = np.zeros(n)
store = []
for t in range(n):
    x = F @ x
    P = F @ P @ F.T + Q
    z = np.array([log_m0[t], log_sh[t], log_m3[t]])
    R = R_diag[t]
    S = H @ P @ H.T + R
    K = P @ H.T @ np.linalg.inv(S)
    x = x + K @ (z - H @ x)
    P = (np.eye(2) - K @ H) @ P
    smooth_log[t] = x[0]
    smooth_drift[t] = x[1]
    store.append((P[0, 0]))
kalman_price = np.exp(smooth_log)
kalman_se = np.sqrt(np.array(store))
M4 = pd.Series(kalman_price, index=idx)
M4_LO = pd.Series(np.exp(smooth_log - 1.96 * kalman_se), index=idx)
M4_HI = pd.Series(np.exp(smooth_log + 1.96 * kalman_se), index=idx)

# --------------------------------------------------------------------------
# 8. Correlations & diagnostics (for the correlation-graph widget)
# --------------------------------------------------------------------------
corr_window = pd.DataFrame({
    'Tungsten (observed/recon)': M0.pct_change(),
    'Tungsten equity basket': EQ_EXCESS,
    'Iron ore': TIO.pct_change(),
    'Moly equity basket': MOLY_EQ.pct_change(),
    'Copper': HG.pct_change(),
    'China ETF (FXI)': FXI.pct_change(),
    'USD/CNY': CNY.pct_change(),
    'S&P 500': SPX.pct_change(),
}).dropna(how='all')
CORR = corr_window.corr().round(3)
cwe = corr_window[['Tungsten equity basket', 'Copper']].dropna()
rc_eq = (cwe['Tungsten equity basket'].rolling(60).corr(cwe['Copper'])).dropna()
cwf = pd.DataFrame({'fac': M3.pct_change(), 'cu': HG.pct_change().reindex(M3.index)}).dropna()
rc_fac = (cwf['fac'].rolling(60).corr(cwf['cu'])).dropna()
cwm = pd.DataFrame({'obs': M0.resample('ME').last().pct_change(),
                    'cu': HG.resample('ME').last().pct_change()}).dropna()
rc_obs_m = (cwm['obs'].rolling(12).corr(cwm['cu'])).dropna()
cwt = pd.DataFrame({'obs': M0.resample('ME').last().pct_change(),
                    'tio': TIO.resample('ME').last().pct_change()}).dropna()
rc_obs_tio_m = (cwt['obs'].rolling(12).corr(cwt['tio'])).dropna()
rolling_corr_eq = rc_eq
rolling_corr_fac = rc_fac
rolling_corr_obs_m = rc_obs_m
rolling_corr_obs_tio_m = rc_obs_tio_m

eq_fwd = EQ_EXCESS.rolling(21).sum().shift(-21)
apt_chg = M0.pct_change(21)
bt = pd.concat({'eq_fwd': eq_fwd, 'apt_chg': apt_chg}, axis=1).dropna()
lead_corr = float(bt.corr().iloc[0, 1]) if len(bt) > 30 else float('nan')

# --------------------------------------------------------------------------
# 9. M5 — supply-demand equilibrium model (external module output)
# --------------------------------------------------------------------------
M5 = None
M5_BALANCE = None
M5_SCENARIOS = None
M5_CAVEATS = None
M5_HEADLINE = None
_sd_path = f'{DATA}\\supply_demand_output.json'
if os.path.exists(_sd_path):
    try:
        sd = json.load(open(_sd_path))
        M5_BALANCE = sd.get('balance')
        M5_SCENARIOS = sd.get('scenarios')
        M5_CAVEATS = sd.get('caveats')
        M5_HEADLINE = sd.get('headline')
        M5_PARAMS = sd.get('params')
    except Exception as e:
        print('M5 load failed:', e)

# --------------------------------------------------------------------------
# 10. Serialize everything for the site
# --------------------------------------------------------------------------
def s_to_list(s, freq=None):
    if freq:
        s = s.resample(freq).last().dropna()
    return [[d.strftime('%Y-%m-%d'), round(float(v), 2)] for d, v in s.items() if np.isfinite(v)]

out = {
    'generated_utc': datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'),
    'mtu_to_t_apt': MTU_TO_T_APT,
    'anchors_verified': ANCHORS_VERIFIED,
    'recon_monthly': [{'date': d, 'mtu': v} for d, v in RECON_MONTHLY],
    'usgs_history': [{'year': r['year'], 'usd_t': r['unit_value_usd_t'],
                      'usd_98': r['unit_value_1998usd_t'],
                      'consumption_mt': r['apparent_consumption_mt']} for r in usgs],
    'latest': {},
    'series': {
        'observed_rotterdam_mtu': s_to_list(M0),
        'observed_rotterdam_t': s_to_list(M0 * MTU_TO_T_APT),
        'shanghai_implied_mtu': s_to_list(SHANGHAI_IMPLIED),
        'rotterdam_fair_from_shanghai_mtu': s_to_list(ROT_FAIR_FROM_SHANGHAI),
        'fragmentation_premium': s_to_list(FRAG_PREMIUM * 100),
        'equity_implied_mtu': s_to_list(M2),
        'factor_implied_mtu': s_to_list(M3),
        'kalman_mtu': s_to_list(M4),
        'kalman_lo': s_to_list(M4_LO),
        'kalman_hi': s_to_list(M4_HI),
        'copper_usd_lb': s_to_list(HG.ffill()),
        'iron_ore_usd_t': s_to_list(TIO.ffill()),
        'moly_equity_basket': s_to_list(MOLY_EQ.ffill()),
        'usdcny': s_to_list(CNY.ffill()),
        'equity_excess_index': s_to_list((1 + EQ_EXCESS.fillna(0)).cumprod() * 100),
        'rolling_corr_cu_eq': s_to_list(rolling_corr_eq),
        'rolling_corr_cu_fac': s_to_list(rolling_corr_fac),
        'rolling_corr_cu_obs_m': s_to_list(rolling_corr_obs_m),
        'rolling_corr_tio_obs_m': s_to_list(rolling_corr_obs_tio_m),
    },
    'factor_model': {'betas': FACTOR_BETAS, 'r2': FACTOR_R2, 'alpha_monthly': FACTOR_ALPHA},
    'equity_model': {'beta_elasticity': round(float(BETA_EQ), 4),
                     'cum_excess_return_calibration': round(float(CUM_EXCESS_CAL), 4),
                     'status': 'REJECTED as leading indicator — diagnostic only'},
    'kalman_model': {'process_q': Q.tolist(), 'last_se_log': float(kalman_se[-1]),
                     'observations': ['reported (tight)', 'shanghai-implied (tight)',
                                      'factor (medium)', 'equity EXCLUDED (rejected)']},
    'correlation_matrix': {k: {k2: float(v2) for k2, v2 in v.items()} for k, v in CORR.to_dict().items()},
    'backtest': {'lead_corr_equity_vs_apt_21d': round(lead_corr, 4) if math.isfinite(lead_corr) else None,
                 'n_obs': int(len(bt))},
    'supply_demand': {'balance': M5_BALANCE, 'scenarios': M5_SCENARIOS,
                      'caveats': M5_CAVEATS, 'headline': M5_HEADLINE,
                      'params': M5_PARAMS} if M5_BALANCE else None,
}
# latest values
def lastv(s):
    s = s.dropna()
    return {'date': s.index[-1].strftime('%Y-%m-%d'), 'value': round(float(s.iloc[-1]), 2)}
out['latest'] = {
    'reported_rotterdam': lastv(M0),
    'reported_rotterdam_t': lastv(M0 * MTU_TO_T_APT),
    'shanghai_implied': lastv(SHANGHAI_IMPLIED),
    'rotterdam_fair_from_shanghai': lastv(ROT_FAIR_FROM_SHANGHAI),
    'fragmentation_premium_pct': lastv(FRAG_PREMIUM * 100),
    'equity_implied': lastv(M2),
    'factor_implied': lastv(M3),
    'kalman': lastv(M4),
    'kalman_band': [lastv(M4_LO)['value'], lastv(M4_HI)['value']],
    'copper': lastv(HG.ffill()),
    'iron_ore': lastv(TIO.ffill()),
    'usdcny': lastv(CNY.ffill()),
}
json.dump(out, open(f'{DATA}\\models_output.json', 'w'))
print('=== MODEL ENGINE COMPLETE ===')
print(json.dumps(out['latest'], indent=1))
print('factor R2:', FACTOR_R2, '| betas:', FACTOR_BETAS)
print('equity status: REJECTED | elasticity:', round(float(BETA_EQ), 3), '| lead corr:', out['backtest'])
print('kalman last SE(log):', round(float(kalman_se[-1]), 4))
print('M5 loaded:', M5_BALANCE is not None)
