"""Harvest market data for the Tungsten Desk (Yahoo Finance chart API, no auth).

Pulls daily closes for
  * proxy metals + FX + indices (candidate *drivers* - the models test whether
    they actually carry information about tungsten; most do not)
  * the tungsten-equity universe: listed companies with real tungsten exposure
    (producers, developers, processors). The old basket contained two tickers that
    are not tungsten companies at all (1124.HK = Coastal Greenland, 0697.HK =
    Shoucheng Holdings) and missed the actual pure plays (Almonty, Xiamen
    Tungsten, Chongyi Zhangyuan, Guardian Metal, Tungsten West, Group 6).
Writes data/market_raw.json.   A symbol that fails keeps its previous history.

Usage:  python scripts/harvest_market.py [--with-fred]
"""
import datetime
import json
import sys
import time

from common import DATA, log, http_json, http_get

# (symbol, label, category)
#   category: metal | fx | index | tungsten_equity | tungsten_user | moly_equity
TICKERS = [
    ('HG=F', 'Copper', 'metal'), ('SI=F', 'Silver', 'metal'), ('GC=F', 'Gold', 'metal'),
    ('PL=F', 'Platinum', 'metal'), ('PA=F', 'Palladium', 'metal'), ('ALI=F', 'Aluminum', 'metal'),
    ('ZNC=F', 'Zinc', 'metal'), ('TIO=F', 'IronOre', 'metal'),
    ('CNY=X', 'USDCNY', 'fx'), ('USDJPY=X', 'USDJPY', 'fx'), ('EURUSD=X', 'EURUSD', 'fx'),
    ('^GSPC', 'SP500', 'index'), ('000300.SS', 'CSI300', 'index'), ('FXI', 'ChinaETF', 'index'),
    ('XME', 'USMetalsMiningETF', 'index'), ('REMX', 'StrategicMetalsETF', 'index'),
    ('COPX', 'CopperMinersETF', 'index'), ('SLX', 'SteelETF', 'index'),
    ('EWA', 'AustraliaETF', 'index'), ('EWC', 'CanadaETF', 'index'), ('EWU', 'UKETF', 'index'),
    # --- tungsten equity universe -------------------------------------------------
    ('ALM', 'Almonty', 'tungsten_equity'),                       # Sangdong (KR); NASDAQ since Jul-2025
    ('AII.TO', 'AlmontyTSX', 'tungsten_equity'),                 # legacy TSX line (pre-2025 history)
    ('GMTL', 'GuardianMetal', 'tungsten_equity'),                # Pilot Mountain / Idaho (US)
    ('GMET.L', 'GuardianMetalAIM', 'tungsten_equity'),
    ('TUN.L', 'TungstenWest', 'tungsten_equity'),                # Hemerdon (UK)
    ('EQR.AX', 'EQResources', 'tungsten_equity'),                # Mt Carbine (AU)
    ('TGN.AX', 'TungstenMining', 'tungsten_equity'),
    ('G6M.AX', 'Group6Metals', 'tungsten_equity'),               # Dolphin (AU)
    ('FWZ.V', 'Fireweed', 'tungsten_equity'),                    # Mactung (CA)
    ('600549.SS', 'XiamenTungsten', 'tungsten_equity'),          # China's largest W processor/miner
    ('002378.SZ', 'ChongyiZhangyuan', 'tungsten_equity'),        # pure-play W (Jiangxi)
    ('000657.SZ', 'ChinaTungstenHighTech', 'tungsten_equity'),   # W carbide / powder
    # --- tungsten *users* (negative input-cost exposure) / sister metal ------------
    ('KMT', 'Kennametal', 'tungsten_user'), ('SAND.ST', 'Sandvik', 'tungsten_user'),
    ('601958.SS', 'JinduichengMoly', 'moly_equity'), ('603993.SS', 'CMOC', 'moly_equity'),
]

FRED_MONTHLY = [('PTINUSDM', 'TIN_FRED', 'Tin', 'metal'),
                ('PNICKUSDM', 'NICKEL_FRED', 'Nickel', 'metal'),
                ('PLEADUSDM', 'LEAD_FRED', 'Lead', 'metal')]


def fetch_symbol(sym, start, end):
    url = (f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}'
           f'?period1={start}&period2={end}&interval=1d&events=div%2Csplit')
    d = http_json(url, tries=3, timeout=25, backoff=2)
    res = d['chart']['result'][0]
    ts = res['timestamp']
    close = res['indicators']['quote'][0]['close']
    return [(datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime('%Y-%m-%d'), round(c, 4))
            for t, c in zip(ts, close) if c is not None]


def fetch_fred(series_id):
    txt = http_get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}',
                   tries=2, timeout=15, backoff=2).decode('utf-8', 'ignore')
    rows = []
    for line in txt.strip().splitlines()[1:]:
        try:
            d, v = line.split(',')
            rows.append((d, round(float(v), 4)))
        except ValueError:
            continue
    return rows


def main(with_fred=False):
    path = DATA / 'market_raw.json'
    old = json.load(open(path)) if path.exists() else {'series': {}, 'labels': {}, 'categories': {}}
    # drop series that are no longer in the universe (e.g. the mislabelled HK tickers)
    keep = {s for s, _, _ in TICKERS} | {s for _, s, _, _ in FRED_MONTHLY}
    out = {k: v for k, v in old['series'].items() if k in keep}
    labels = {k: v for k, v in old['labels'].items() if k in keep}
    cats = {k: v for k, v in old['categories'].items() if k in keep}

    end = int(time.time()) + 86400
    start = int(datetime.datetime(2015, 1, 1).timestamp())
    ok = fail = 0
    for sym, label, cat in TICKERS:
        try:
            rows = fetch_symbol(sym, start, end)
            if not rows:
                raise ValueError('no rows')
            out[sym], labels[sym], cats[sym] = rows, label, cat
            ok += 1
            log(f'{sym:<10} {label:<22} {len(rows):>5} rows  last={rows[-1][0]} {rows[-1][1]}')
        except Exception as e:
            fail += 1
            log(f'{sym}: {str(e)[:70]} (keeping {"old data" if sym in out else "nothing"})', 'WARN')
        time.sleep(0.25)

    if with_fred:
        for sid, sym, label, cat in FRED_MONTHLY:
            try:
                rows = fetch_fred(sid)
                out[sym], labels[sym], cats[sym] = rows, label, cat
                log(f'{sym:<10} {label:<22} {len(rows):>5} rows (monthly)')
            except Exception as e:
                log(f'FRED {sid}: {str(e)[:70]}', 'WARN')

    json.dump({'series': out, 'labels': labels, 'categories': cats,
               'harvested_utc': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M')},
              open(path, 'w'))
    log(f'market: saved {len(out)} series ({ok} refreshed, {fail} failed)')
    return 0 if ok >= len(TICKERS) * 0.6 else 1


if __name__ == '__main__':
    sys.exit(main(with_fred='--with-fred' in sys.argv))
