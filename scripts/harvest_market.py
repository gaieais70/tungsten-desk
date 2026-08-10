"""Harvest market data for the Tungsten Desk pricing models.

Pulls daily OHLC from Yahoo Finance (chart v8, no auth) for:
  - proxy metals: copper, silver, gold, platinum, palladium, aluminum, zinc,
    iron ore
  - FX: USD/CNY
  - equity indices: S&P 500, China ETF, global materials
  - tungsten-equity basket (producers with tungsten exposure)
Pulls monthly World Bank global-price series from FRED for metals Yahoo
does not carry (tin, nickel, lead — the LME-linked iPath ETNs were
delisted in 2023, so FRED month-end is the reliable source).
Saves to data/market_raw.json
"""
import json, time, urllib.request, sys, datetime

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# (symbol, label, category) — Yahoo daily
TICKERS = [
    ('HG=F', 'Copper', 'metal'),
    ('SI=F', 'Silver', 'metal'),
    ('GC=F', 'Gold', 'metal'),
    ('PL=F', 'Platinum', 'metal'),
    ('PA=F', 'Palladium', 'metal'),
    ('ALI=F', 'Aluminum', 'metal'),
    ('ZNC=F', 'Zinc', 'metal'),
    ('TIO=F', 'IronOre', 'metal'),
    ('USDJPY=X', 'USDJPY', 'fx'),
    ('CNY=X', 'USDCNY', 'fx'),
    ('EURUSD=X', 'EURUSD', 'fx'),
    ('^GSPC', 'SP500', 'index'),
    ('FXI', 'ChinaETF', 'index'),
    ('XME', 'USEquityMaterials', 'index'),
    ('GDX', 'GoldMinersETF', 'index'),
    ('EWC', 'CanadaETF', 'index'),
    ('EWA', 'AustraliaETF', 'index'),
    # tungsten-linked equities
    ('EQR.AX', 'EQResources', 'tungsten_equity'),
    ('TGN.AX', 'TungstenMining', 'tungsten_equity'),
    ('ALI.TO', 'Almonty', 'tungsten_equity'),
    ('ALM.TO', 'Almonty2', 'tungsten_equity'),
    ('1124.HK', 'ChinaTungsten', 'tungsten_equity'),
    ('0697.HK', 'ShouchengHoldings', 'tungsten_equity'),
    ('603993.SS', 'CMOCLuoyang', 'tungsten_equity'),
    ('000657.SZ', 'ChinaTungstenHighTech', 'tungsten_equity'),
    ('601958.SS', 'JinduichengMoly', 'tungsten_equity'),
    ('603520.SS', 'NingboJinshi', 'tungsten_equity'),
    ('MCU', 'USA_Materials', 'index'),
]

# (fred_series, symbol, label, category) — monthly World Bank global prices.
# Yahoo has no daily feed for tin/nickel/lead (iPath ETNs delisted 2023);
# FRED month-end is the reliable source. models.py resamples to month-end for
# the correlation matrix, so the frequency mix is safe.
FRED_MONTHLY = [
    ('PTINUSDM', 'TIN_FRED', 'Tin', 'metal'),
    ('PNICKUSDM', 'NICKEL_FRED', 'Nickel', 'metal'),
    ('PLEADUSDM', 'LEAD_FRED', 'Lead', 'metal'),
]

def fetch(symbol, period1, period2):
    url = (f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
           f'?period1={period1}&period2={period2}&interval=1d&events=div%2Csplit')
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        return {'error': str(e)}

def fetch_fred(series_id, tries=5):
    """Monthly World Bank global price from FRED (fredgraph.csv, no auth).
    FRED is flaky under load — retry with backoff."""
    url = f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}'
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                txt = r.read().decode('utf-8', 'ignore')
            rows = []
            for line in txt.strip().splitlines()[1:]:
                if not line.strip():
                    continue
                date, val = line.split(',')
                try:
                    v = float(val)
                except ValueError:
                    continue
                rows.append((date, round(v, 4)))
            if rows:
                return rows
        except Exception as e:
            if attempt == tries - 1:
                return {'error': f'{series_id}: {e}'}
            time.sleep(4 * (attempt + 1))
    return {'error': f'{series_id}: empty'}

def main():
    end = int(time.time())
    start = int(datetime.datetime(2015, 1, 1).timestamp())
    out = {}
    labels = {}
    cats = {}
    for sym, label, cat in TICKERS:
        d = fetch(sym, start, end)
        if 'error' in d:
            print(f'ERR {sym}: {d["error"]}', file=sys.stderr)
            continue
        try:
            res = d['chart']['result'][0]
            ts = res['timestamp']
            close = res['indicators']['quote'][0]['close']
            rows = []
            for t, c in zip(ts, close):
                if c is None: continue
                dt = datetime.datetime.utcfromtimestamp(t).strftime('%Y-%m-%d')
                rows.append((dt, round(c, 4)))
            if not rows:
                continue
            out[sym] = rows
            labels[sym] = label
            cats[sym] = cat
            print(f'OK  {sym:<14} {label:<22} {len(rows)} rows  last={rows[-1][0]} {rows[-1][1]}')
        except Exception as e:
            print(f'PARSE ERR {sym}: {e}', file=sys.stderr)
        time.sleep(0.4)

    # FRED monthly (tin, nickel, lead — no Yahoo daily feed)
    for series_id, sym, label, cat in FRED_MONTHLY:
        rows = fetch_fred(series_id)
        if isinstance(rows, dict) and 'error' in rows:
            print(f'ERR FRED {series_id}: {rows["error"]}', file=sys.stderr)
            continue
        if not rows:
            continue
        out[sym] = rows
        labels[sym] = label
        cats[sym] = cat
        print(f'OK  {sym:<14} {label:<22} {len(rows)} rows (monthly)  last={rows[-1][0]} {rows[-1][1]}')
        time.sleep(1)

    with open(r'D:\tungsten-dashboard\data\market_raw.json', 'w') as f:
        json.dump({'series': out, 'labels': labels, 'categories': cats}, f)
    print(f'\nSaved {len(out)} series to market_raw.json')

if __name__ == '__main__':
    main()
