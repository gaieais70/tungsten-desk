"""observations.csv - the database of published tungsten price prints.

Every number the models treat as a *price observation* lives in
data/observations.csv, one row per published print:

    date,stream,low,high,unit,source,url,note,conf

  stream  one of STREAMS below
  low/high  the published range (equal for single quotes), in the stream's native unit
  conf    verified (read from the source by a human/AI), auto (scraped, regex), manual

The same file is appended to by (a) scripts/harvest_ctia.py (automatic),
(b) scripts/add_price.py (manual / AI-assisted), and (c) the one-off backfill.
"""
import csv
import json
from datetime import datetime

from common import DATA, RAW, log

OBS = DATA / 'observations.csv'
FIELDS = ['date', 'stream', 'low', 'high', 'unit', 'source', 'url', 'note', 'conf']
MTU_PER_T_APT = 88.5          # 1 t APT (88.5% WO3) holds 88.5 mtu WO3
MTU_PER_T_CONC65 = 65.0       # 1 "standard" tonne of 65% WO3 concentrate = 65 mtu
MTU_PER_T_W = 126.11          # 1 t of tungsten metal = 1.2611 t WO3 = 126.11 mtu

# stream -> (description, market, native unit, mtu-per-tonne or None if already $/mtu)
STREAMS = {
    'apt_eu_usd_mtu': ('APT 88.5% WO3, Europe (Rotterdam) / ex-China', 'EU', 'USD/mtu', None),
    'few_eu_usd_kg': ('Ferro-tungsten 75% W, Europe (Rotterdam)', 'EU', 'USD/kg W', None),
    'apt_cn_rmb_t': ('APT 88.5% WO3, China domestic', 'CN', 'RMB/t', MTU_PER_T_APT),
    'conc65_cn_rmb_t': ('Wolframite/scheelite concentrate 65% WO3, China domestic', 'CN', 'RMB/t', MTU_PER_T_CONC65),
    'powder_cn_rmb_t': ('Tungsten powder >=99.7%, China domestic (per t W)', 'CN', 'RMB/t', MTU_PER_T_W),
    'few_cn_rmb_t': ('Ferro-tungsten 70% W, China domestic (per t bulk)', 'CN', 'RMB/t', MTU_PER_T_W * 0.70),
}


def _load_fx():
    """Daily USD/CNY from the harvested market data (falls back to a constant)."""
    p = DATA / 'market_raw.json'
    try:
        rows = json.load(open(p))['series']['CNY=X']
        return {d: v for d, v in rows}
    except Exception:
        return {}


_FX = None


def usdcny(date_str):
    global _FX
    if _FX is None:
        _FX = _load_fx()
    if not _FX:
        return 6.7
    if date_str in _FX:
        return _FX[date_str]
    keys = sorted(_FX)
    prev = [k for k in keys if k <= date_str]
    return _FX[prev[-1]] if prev else _FX[keys[0]]


def to_usd_mtu(stream, value, date_str):
    """Convert a native-unit quote to USD per mtu WO3 (APT-equivalent basis)."""
    _, _, unit, mtu_per_t = STREAMS[stream]
    if stream == 'few_eu_usd_kg':
        return float(value) * (1000.0 / MTU_PER_T_W)
    if mtu_per_t is None:
        return float(value)
    return float(value) / mtu_per_t / usdcny(date_str)


def read_rows():
    if not OBS.exists():
        return []
    with open(OBS, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def _key(r):
    return (r['date'], r['stream'], round(float(r['low'])), round(float(r['high'])))


def append_rows(rows):
    """Append rows not already present (dedupe on date+stream+range). Returns count added."""
    existing = read_rows()
    seen = {_key(r) for r in existing}
    added = []
    for r in rows:
        r = {k: r.get(k, '') for k in FIELDS}
        if r['stream'] not in STREAMS:
            log(f'prices_db: unknown stream {r["stream"]!r} skipped', 'WARN')
            continue
        datetime.strptime(r['date'], '%Y-%m-%d')                     # validate
        if float(r['low']) <= 0 or float(r['high']) < float(r['low']):
            log(f'prices_db: bad range {r}', 'WARN')
            continue
        k = _key(r)
        if k in seen:
            continue
        seen.add(k)
        added.append(r)
    if added:
        allrows = existing + added
        allrows.sort(key=lambda r: (r['date'], r['stream']))
        with open(OBS, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()
            w.writerows({k: r.get(k, '') for k in FIELDS} for r in allrows)
    return len(added)


def staleness():
    """Days since the latest print per market (used by update.py to warn)."""
    rows = read_rows()
    out = {}
    today = datetime.utcnow().date()
    for mkt in ('EU', 'CN'):
        ds = [r['date'] for r in rows if STREAMS[r['stream']][1] == mkt]
        out[mkt] = (today - datetime.strptime(max(ds), '%Y-%m-%d').date()).days if ds else None
    return out
