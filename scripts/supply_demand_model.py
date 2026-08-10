"""Tungsten Desk — M5 supply-demand equilibrium model (stock-to-use balance).

Explains the 2025-2026 tungsten price explosion (APT 88.5% WO3, $/mtu) from a
stock-to-use / balance standpoint and forecasts 2025-2035 under three scenarios
(base / bull / bear). Output written to data/supply_demand_output.json.

MODEL (annual, 2025-2035)
  Balance:  deficit_t = demand_t - supply_t
            stock_t   = stock_{t-1} - deficit_t        (deficit draws stock)
  Coverage: c_t = stock_t / (demand_t / 12)             (months of demand cover)
  Price:    price_t = max( floor, P_bal(c_t) ) x premium_t
            P_bal(c) = floor + A * (c / 3.0)^(-k)       convex balance curve
            premium_t = policy-shock premium (export controls, market
                        fragmentation, stockpiling) — calibrated to verified
                        price points, decays as supply chains re-wire.
  Demand feedback: from 2027, sustained high prices suppress demand
            (substitution, recycling, efficiency):
            demand_used_t = demand_base_t * (P_REF / P_bal_smooth_{t-1})^eps
  Stock floor: if the balance would push coverage below COVERAGE_FLOOR months,
            the model caps price at MAX_PRICE (rationing regime, documented).

KEY NUMBERS (all cited — see SOURCES below)
  Supply 2025  = 85,000 t primary production (USGS MCS Apr 2026, via Almonty deck)
  Demand 2025  = 90,600 t   (= 85,000 + 5,570 deficit)
  Deficit 2025 = ~5,570 t, 2026 = ~2,330 t   (Sangdong NI 43-101 via Almonty deck)
  Demand CAGR 2025-2050 = 2.0% (Merchant Research & Consulting, via deck)
  China share ~79% of production (USGS MCS 2026, via deck)
  Sangdong I ~2,300 t/yr WO3 (230,000 MTU) from 2026; Phase II +2,300 t by 2027
    (640 kt -> 1.2 Mt ore throughput); Panasqueira L4 -> ~1,240 t; Gentung (MT)
    small ~2029+; C1 concentrate cost US$126.8/MTU (floor sanity anchor).
  Verified prices: ~$330/mtu open-2025 (balanced market); $1,737/mtu 17-Feb-2026;
    $3,139.50/mtu 24-Jul-2026 (Fastmarkets, via deck).
  USGS history 2012-2017: $25,000-$56,700/t -> ~$282-$640/mtu (÷88.5) — the
    long-run normal-market band that the balance curve is checked against.

HONESTY
  * Inventory is invisible — global tungsten stocks are not publicly reported;
    the initial stock level (3.0 months coverage at end-2024) is a calibration
    assumption, and the whole stock series is MODELED, not observed.
  * Policy shocks (China export controls effective 4 Feb 2025; US DoW ban on
    China/Russia/NK tungsten from 1 Jan 2027) dominate the 2025-26 price move
    and can override any balance model. The 2025-26 explosion is mostly premium,
    NOT balance: coverage only fell ~3.0 -> ~2.0 months.
  * The 2025/2026 deficit figures come from a single source (Sangdong NI 43-101
    technical report, quoted in Almonty marketing materials) — may be biased.
  * USGS consumption data ends 2017.
  * Scenario tool — NOT investment advice.
"""
import json, math, datetime
import numpy as np
import pandas as pd

DATA = r'D:\tungsten-dashboard\data'
OUT = f'{DATA}\\supply_demand_output.json'

YEARS = list(range(2025, 2036))
MTU_TO_T_APT = 88.5        # 1 t APT(88.5% WO3) = 88.5 mtu WO3 (deck: 1 t WO3 = 100 MTU)

# ---------------------------------------------------------------------------
# Global parameters (documented in output JSON)
# ---------------------------------------------------------------------------
SUPPLY_2025 = 85_000.0            # t, USGS MCS Apr 2026 via Almonty deck
DEMAND_2025 = 90_600.0            # t, = supply 2025 + 5,570 deficit
DEFICIT_2025 = 5_570.0            # t, NI 43-101 via deck (known)
DEFICIT_2026 = 2_330.0            # t, NI 43-101 via deck (known)
CHINA_SHARE_2025 = 0.79           # USGS MCS 2026 via deck
CHINA_DECLINE = 0.003             # /yr, flat-to-slightly-declining (est.)
OTHER_ROW_GROWTH = 0.025          # /yr after 2026, recycling/restarts (est.)
INITIAL_STOCK_MONTHS = 3.0        # end-2024 coverage, calibration guess
PRICE_FLOOR = 300.0               # $/mtu APT floor (above Sangdong C1 $126.8 conc.)
CURVE_A = 30.0                    # $/mtu amplitude at 3.0 months reference
CURVE_K = 3.0                     # convexity exponent of P_bal
P_REF = 330.0                     # $/mtu balanced-market reference (open-2025)
MAX_PRICE = 5_000.0               # rationing cap, avoids absurd extrapolation
COVERAGE_FLOOR = 0.30             # months, below which price sits at cap
FEEDBACK_START = 2027             # demand feedback begins after sustained spike

# Documented Western project additions (t WO3/yr, cumulative step schedule).
# base:  Sangdong I 2,300 (2026) + Panasqueira L4 partial 300 (2026)
#        + Sangdong II 2,300 (2027) + Panasqueira L4 completion 240 (2027)
#        + minor others 300 (2027) + 200 (2028) + 300 (2029)
#        + Gentung (Montana) 500 (2029)
ADDITIONS = {
    'base': {2026: 2_600, 2027: 5_440, 2028: 5_640, 2029: 6_440},
    'bull': {2026: 2_300, 2027: 3_140, 2028: 5_440, 2029: 5_440, 2030: 6_240},
    'bear': {2026: 2_600, 2027: 5_440, 2028: 6_140, 2029: 6_640},
}
ADDITION_PLATEAU = {'base': 6_440, 'bull': 6_240, 'bear': 6_640}

# "Second wave" of unnamed supply the Almonty supply-gap chart implicitly needs
# (their chart shows the gap -> ~0 by the early 2030s while documented projects
# cover only ~a third of implied growth). LABELLED ESTIMATE / deck-implied.
SECOND_WAVE = {
    # start, step (t/yr), ramp_end year, plateau
    'base': dict(start=2028, step=1_200, ramp_end=2032, plateau=6_000),
    'bull': dict(start=2030, step=1_000, ramp_end=2035, plateau=6_000),
    'bear': dict(start=2027, step=2_400, ramp_end=2031, plateau=12_000),
}

# Year-average policy premium (multiplicative on P_bal). Calibrated so that:
#   Jan-2025:  premium ~1.0 at c=3.0  -> $330 (exact anchor)
#   17-Feb-2026: c~2.17 -> P_bal ~379 -> premium ~4.6 -> ~$1,737 (anchor)
#   24-Jul-2026: c~1.99 -> P_bal ~403 -> premium ~7.8 -> ~$3,139.50 (anchor)
#   then decays toward 1.0 as fragmentation heals (speed differs by scenario).
PREMIUM = {
    'base': {2025: 2.50, 2026: 6.20, 2027: 4.80, 2028: 3.20, 2029: 2.20,
             2030: 2.00, 2031: 1.60, 2032: 1.35, 2033: 1.15, 2034: 1.05, 2035: 1.00},
    'bull': {2025: 2.50, 2026: 6.50, 2027: 5.50, 2028: 4.00, 2029: 3.20,
             2030: 2.50, 2031: 2.00, 2032: 1.60, 2033: 1.30, 2034: 1.15, 2035: 1.05},
    'bear': {2025: 2.50, 2026: 6.00, 2027: 3.50, 2028: 2.00, 2029: 1.40,
             2030: 1.10, 2031: 1.00},
}
DEMAND_CAGR = {'base': 0.020, 'bull': 0.030, 'bear': 0.010}
DEMAND_EPS = {'base': 0.05, 'bull': 0.08, 'bear': 0.03}   # price elasticity of demand

SCENARIO_NOTES = {
    'base': 'Base: demand CAGR 2.0% (Merchant Research & Consulting via deck), '
            'documented Western additions on schedule, ~6 kt of deck-implied '
            '"second wave" supply by 2032, policy premium decays through 2033.',
    'bull': 'Bull: demand CAGR 3.0% (defense build-up, semiconductors/AI, EV), '
            'Sangdong II/Gentung delayed ~1 yr, second-wave supply halved and '
            'late, premium decays slowly (policy persists).',
    'bear': 'Bear: demand CAGR 1.0% (global slowdown, substitution), additions '
            'accelerated (Gentung 2028), 12 kt second-wave supply by 2031, '
            'premium unwinds fast.',
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def china_series():
    """China primary production: 79% of 85 kt, declining 0.3%/yr (est.)."""
    c0 = CHINA_SHARE_2025 * SUPPLY_2025
    return pd.Series([c0 * (1 - CHINA_DECLINE) ** (y - 2025) for y in YEARS],
                     index=YEARS)


def additions_series(scn):
    """Documented Western project additions (t/yr), step schedule + plateau."""
    out = {}
    for y in YEARS:
        out[y] = ADDITIONS[scn].get(y, ADDITION_PLATEAU[scn] if y >= min(ADDITIONS[scn]) else 0.0)
    return pd.Series(out)


def second_wave_series(scn):
    """Unnamed/deck-implied supply ramp (t/yr). Documented as ESTIMATE."""
    p = SECOND_WAVE[scn]
    out = {}
    for y in YEARS:
        if y < p['start']:
            out[y] = 0.0
        else:
            out[y] = min(p['step'] * (y - p['start'] + 1), p['plateau'])
    return pd.Series(out)


def balance_price(coverage):
    """Convex stock-to-use -> price curve (long-run, policy-free).

    floor + A*(c/3)^(-k): c=3.0 -> $330; c=2..4 months -> $313..$401, inside
    the USGS 2012-2017 normal-market band (~$282-$642/mtu). k=3 keeps the
    forecast leg sane; the 2025-26 spike is carried by the policy premium.
    """
    c = np.maximum(coverage, COVERAGE_FLOOR)
    return PRICE_FLOOR + CURVE_A * (c / 3.0) ** (-CURVE_K)


def demand_base_series(cagr):
    d = DEMAND_2025
    out = []
    for y in YEARS:
        out.append(d)
        d *= (1 + cagr)
    return pd.Series(out, index=YEARS)


def simulate(scn):
    """Run one scenario; returns DataFrame with balance + price columns."""
    g = DEMAND_CAGR[scn]
    eps = DEMAND_EPS[scn]
    premium = PREMIUM[scn]
    d_base = demand_base_series(g)
    china = china_series()
    add = additions_series(scn)
    wave = second_wave_series(scn)

    # Other ROW baseline: 2025 = 85,000 - China 2025 (deficit 2025 honoured by
    # construction); 2026 calibrated so the 2026 deficit equals the known
    # 2,330 t (NI 43-101); then grows at OTHER_ROW_GROWTH. The 2025->2026 step
    # is a calibration residual absorbing un-named ROW restarts / recycling /
    # re-allocation — LABELLED ESTIMATE.
    other = {}
    other[2025] = SUPPLY_2025 - china[2025]
    other[2026] = (d_base[2026] - DEFICIT_2026 - china[2026] - add[2026])
    for y in YEARS:
        if y <= 2026:
            continue
        other[y] = other[y - 1] * (1 + OTHER_ROW_GROWTH)
    other = pd.Series(other)

    supply = china + other + add + wave

    rows = []
    stock = INITIAL_STOCK_MONTHS * DEMAND_2025 / 12.0   # end-2024 stock
    pbal_smooth = P_REF                                  # 2024 balanced market
    for y in YEARS:
        # demand feedback: sustained high (policy-free) price suppresses demand
        if y >= FEEDBACK_START:
            fb = (P_REF / pbal_smooth) ** eps
        else:
            fb = 1.0
        demand = d_base[y] * fb
        deficit = demand - supply[y]
        stock -= deficit                                # deficit draws stock
        coverage = stock / (demand / 12.0)
        pbal = float(balance_price(coverage))
        price = float(np.clip(pbal * premium.get(y, 1.0), PRICE_FLOOR, MAX_PRICE))
        pbal_smooth = 0.5 * pbal + 0.5 * pbal_smooth    # smoothing (damping)
        rows.append({'year': int(y), 'supply_t': round(float(supply[y]), 1),
                     'demand_t': round(float(demand), 1),
                     'deficit_t': round(float(deficit), 1),
                     'stock_to_use_months': round(float(coverage), 3),
                     'price_mtu': round(float(price), 1)})
    return pd.DataFrame(rows).set_index('year')


def year_price(df, y):
    """Lookup price_mtu for a given year from a scenario DataFrame."""
    return float(df.loc[y, 'price_mtu'])


# ---------------------------------------------------------------------------
# USGS long-run sanity check
# ---------------------------------------------------------------------------
usgs = json.load(open(f'{DATA}\\usgs_tungsten_history.json'))
usgs_df = pd.DataFrame(usgs).set_index('year')
usgs_1217 = usgs_df.loc[2012:2017, 'unit_value_usd_t']
USGS_SANITY = {
    'years': '2012-2017',
    'usd_per_t_min': float(usgs_1217.min()),
    'usd_per_t_max': float(usgs_1217.max()),
    'implied_usd_per_mtu_min': round(float(usgs_1217.min()) / MTU_TO_T_APT, 0),
    'implied_usd_per_mtu_max': round(float(usgs_1217.max()) / MTU_TO_T_APT, 0),
    'note': 'USGS unit value (US$/t contained W, APT-equivalent approx) converted '
            'to $/mtu by /88.5; the normal-market band our balance curve is '
            'checked against. USGS consumption series ends 2017.',
}

# ---------------------------------------------------------------------------
# Run scenarios + serialize
# ---------------------------------------------------------------------------
def main():
    bal = simulate('base')
    scn_out = {}
    for s in ('base', 'bull', 'bear'):
        df = simulate(s)
        scn_out[s] = {
            'demand_cagr': DEMAND_CAGR[s],
            'price_path_mtu': [{'year': int(y), 'price_mtu': float(df.loc[y, 'price_mtu'])}
                               for y in YEARS],
            'note': SCENARIO_NOTES[s],
        }

    out = {
        'generated_utc': datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'),
        'model_name': 'M5 — supply-demand equilibrium (stock-to-use balance)',
        'sources': [
            {'name': 'Almonty Industries investor presentation, July 2026 (C:\\Users\\Josh\\Downloads\\true.txt)',
             'key_figures': '~85,000 t global primary production 2025 (USGS MCS Apr 2026); deficits '
                            '~5,570 t (2025) / ~2,330 t (2026) (Sangdong NI 43-101); demand CAGR 2.0% '
                            '2025-2050 (Merchant Research & Consulting); China ~79% of production; end-use: '
                            'transport 26%, mining/construction 26%, industrial 14%, chemical/petrochem 10%, '
                            'consumer durables 9%, DEFENSE 8%, energy 6%, medical 1% (ITIA 2021); '
                            'APT $3,139.50/mtu 24-Jul-2026 (Fastmarkets); Sangdong I 2,300 t (230,000 MTU) / '
                            'Phase II +2,300 t by 2027 (640kt->1.2Mt); Panasqueira L4 -> 1,240 t; '
                            'Gentung (MT) small, ~2029+; C1 US$126.8/MTU; export controls 4-Feb-2025; '
                            'DoW ban on China/Russia/NK tungsten from 1-Jan-2027.'},
            {'name': 'USGS Mineral Commodity Summaries 2026 (via Almonty deck)',
             'key_figures': '~85,000 t primary production 2025; China ~79-80% of global production.'},
            {'name': 'D:\\tungsten-dashboard\\data\\usgs_tungsten_history.json',
             'key_figures': '1900-2017 unit value (US$/t) + apparent consumption; 2012-2017 $25.0k-$56.7k/t '
                            '-> ~$282-$642/mtu sanity band for the long-run balance curve.'},
            {'name': 'D:\\tungsten-dashboard\\scripts\\models.py (project M0 anchor chain)',
             'key_figures': 'Verified anchors: $330/mtu open-2025 (ISBP/Dornhofer); $1,737/mtu 17-Feb-2026; '
                            '>$3,000/mtu 17-Jul-2026; used for premium calibration.'},
            {'name': 'D:\\tungsten-dashboard\\data\\almonty_posts.json (Almonty newsletters)',
             'key_figures': 'Context: price discovery is "broken" after ~30 yrs of China-administered '
                            'pricing; Dornhofer China-West market split commentary; next squeeze narrative.'},
        ],
        'params': {
            'years': YEARS,
            'supply_2025_t': SUPPLY_2025,
            'demand_2025_t': DEMAND_2025,
            'known_deficit_2025_t': DEFICIT_2025,
            'deficit_2025_implied_note': 'demand_2025 (90,600 t) - supply_2025 (85,000 t) = 5,600 t '
                                         'implied deficit vs NI 43-101 ~5,570 t — 30 t rounding on the '
                                         'demand base; both used, ~5,570 cited as the source figure.',
            'known_deficit_2026_t': DEFICIT_2026,
            'china_share_2025': CHINA_SHARE_2025,
            'china_decline_per_yr': CHINA_DECLINE,
            'other_row_growth_per_yr': OTHER_ROW_GROWTH,
            'additions_schedule_t': {s: {int(k): int(v) for k, v in ADDITIONS[s].items()}
                                     for s in ADDITIONS},
            'additions_plateau_t': ADDITION_PLATEAU,
            'second_wave_unnamed_supply_t': {s: {k: (int(v) if isinstance(v, (int, float)) else v)
                                                 for k, v in SECOND_WAVE[s].items()}
                                             for s in SECOND_WAVE},
            'initial_stock_end2024_months': INITIAL_STOCK_MONTHS,
            'price_floor_usd_mtu': PRICE_FLOOR,
            'curve_amplitude_A': CURVE_A,
            'curve_exponent_k': CURVE_K,
            'price_ref_usd_mtu': P_REF,
            'max_price_cap_usd_mtu': MAX_PRICE,
            'coverage_floor_months': COVERAGE_FLOOR,
            'demand_feedback_start_year': FEEDBACK_START,
            'demand_cagr_by_scenario': DEMAND_CAGR,
            'demand_price_elasticity_by_scenario': DEMAND_EPS,
            'policy_premium_schedule': {s: {int(k): v for k, v in PREMIUM[s].items()}
                                        for s in PREMIUM},
            'calibration_anchors': [
                {'point': 'open-2025', 'price_mtu': 330.0, 'coverage_months': 3.0,
                 'premium': 1.0, 'source': 'ISBP/Dornhofer via Almonty (balanced market)'},
                {'point': '17-Feb-2026', 'price_mtu': 1737.0, 'coverage_months': 2.17,
                 'premium': 4.6, 'source': 'Stockhouse/AD HOC NEWS via project M0'},
                {'point': '24-Jul-2026', 'price_mtu': 3139.5, 'coverage_months': 1.99,
                 'premium': 7.8, 'source': 'Fastmarkets via Almonty deck'},
            ],
            'usgs_sanity_check': USGS_SANITY,
            'units': 't = tonnes WO3; mtu = 10 kg WO3; price = $/mtu APT 88.5% WO3, Rotterdam/Baltimore basis',
        },
        'balance': [{'year': r.name, 'supply_t': r['supply_t'], 'demand_t': r['demand_t'],
                     'deficit_t': r['deficit_t'], 'stock_to_use_months': r['stock_to_use_months'],
                     'price_mtu': r['price_mtu']} for _, r in bal.iterrows()],
        'scenarios': scn_out,
        'caveats': [
            'Inventory is invisible: global tungsten stocks are not publicly reported. The initial '
            'stock (3.0 months coverage at end-2024) is a calibration guess and the entire stock '
            'series is MODELED, not observed; errors compound over the forecast horizon.',
            'Policy shocks dominate: China export controls (effective 4-Feb-2025), US DoW military '
            'procurement ban on China/Russia/NK tungsten (1-Jan-2027) and any new controls can '
            'override a balance model. The 2025-26 price explosion is mostly a policy/fragmentation '
            'premium (coverage only fell ~3.0 -> ~2.0 months), not pure balance.',
            'Single-source deficits: the 5,570 t (2025) / 2,330 t (2026) figures come from the '
            'Sangdong NI 43-101 technical report quoted in Almonty marketing materials — one, '
            'potentially biased source; not independently verified.',
            'USGS consumption data ends 2017; the long-run price/balance relationship is inferred '
            'from partial history and the deck-cited normal band (~$283-$642/mtu 2012-2017).',
            'The "second wave" supply term (6-12 kt of unnamed supply by 2031-2035) is required to '
            'close the deck\'s own supply-gap chart but is NOT an announced project list. If it '
            'does not materialise, the late-decade re-tightening shown in base/bull is worse.',
            'Demand price-elasticity (0.03-0.08) and the premium decay path are labelled estimates; '
            'they are the two least-observable parameters and drive most of the 2028+ spread.',
            'Scenario tool for the Tungsten Desk dashboard — NOT investment advice.',
        ],
        'headline': (
            "The 2025-26 tungsten spike ($330 -> ~$3,140/mtu) is reproduced as a stock-to-use "
            "squeeze amplified by a policy premium: the known 5.6 kt (2025) and 2.3 kt (2026) "
            "deficits drew modeled stocks from ~3.0 to ~1.9 months of coverage, and even a strongly "
            "convex balance curve cannot explain a 10x price move from that alone — export-control "
            "fragmentation, panic buying and defense stockpiling carry most of the move and decay "
            "into the early 2030s. Base case: price stays elevated (~$2,000-2,600) through 2027, "
            "then normalizes into the $850-1,500 range by 2029-2033 as documented Western supply "
            "(Sangdong I/II, Panasqueira L4, Gentung) plus ~6 kt of unnamed supply lands, with a "
            "re-tightening after 2033 if demand keeps compounding ~2% against a finite supply ramp. "
            "Bull (3% demand, delays): chronic $2,500-3,700 tightness through 2035. Bear (1% demand, "
            "accelerated supply): premium unwinds to a ~$300 floor by 2030-31. Confidence is LOW "
            "beyond ~2027: inventory is unobserved, the deficit anchors are single-source, and "
            "policy can override the balance at any time."
        ),
    }

    json.dump(out, open(OUT, 'w'), indent=1)

    # console summary
    print('=== M5 SUPPLY-DEMAND EQUILIBRIUM COMPLETE ===')
    print(f'output -> {OUT}')
    print('\nBase-case balance & price:')
    print(bal[['supply_t', 'demand_t', 'deficit_t', 'stock_to_use_months', 'price_mtu']].to_string())
    print('\nScenario price paths ($/mtu):')
    for s in ('base', 'bull', 'bear'):
        path = {int(y): float(v) for y, v in
                ((r['year'], r['price_mtu']) for r in scn_out[s]['price_path_mtu'])}
        print(f"  {s:5s} 2028: {path[2028]:8.0f} | 2032: {path[2032]:8.0f} | 2035: {path[2035]:8.0f}")
    print('\nUSGS sanity band 2012-2017: $%d-$%d/mtu' %
          (USGS_SANITY['implied_usd_per_mtu_min'], USGS_SANITY['implied_usd_per_mtu_max']))


if __name__ == '__main__':
    main()
