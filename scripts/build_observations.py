"""Build data/observations.csv from verified CTIA daily market reports and historical anchors.

Filters out retrospective monthly/quarterly average articles and low-grade slime
auction news that previously caused false daily spikes, and extracts 6 clean
physical tungsten benchmark streams:
  1. apt_eu_usd_mtu   — European APT 88.5% WO3 (CIF Rotterdam, USD/mtu)
  2. few_eu_usd_kg    — European Ferrotungsten 75% W (Rotterdam, USD/kg W)
  3. apt_cn_rmb_t     — China Domestic APT 88.5% WO3 (RMB/t)
  4. conc65_cn_rmb_t  — China 65% Wolframite/Scheelite Concentrate (RMB/t)
  5. powder_cn_rmb_t  — China Tungsten Powder >=99.7% (RMB/t)
  6. few_cn_rmb_t     — China 70% Ferrotungsten (RMB/t)
"""
import csv
import json
import re
from pathlib import Path
from prices_db import usdcny

ROOT = Path(__file__).resolve().parent.parent
POSTS_PATH = ROOT / 'data' / 'raw' / 'ctia_posts.jsonl'
OBS_PATH = ROOT / 'data' / 'observations.csv'

NUM = r'(\d{1,3}(?:,\d{3})*(?:\.\d+)?)'
DASH = r'(?:\s*[-–~—to]+\s*)'


def clean_sentences(txt: str) -> str:
    """Strip retrospective lookback or slime auction sentences from daily market reports."""
    sents = re.split(r'(?<=[.!?;])\s+|\n+', txt)
    out = []
    for s in sents:
        s = re.sub(
            r'(?:fell|dropped|dipped)\s+below\s+the\s+rmb\s+[^.;]+?\s+threshold\s+and\s+',
            '',
            s,
            flags=re.I,
        )
        sl = s.lower()
        if any(p in sl for p in [
            'on august 15', 'in the first three quarters', 'started at approximately',
            'at the beginning of the year, they', 'threshold of rmb', 'in the first half of 202',
            'from january to', 'average price', 'auctioned', 'negotiated the sale of'
        ]):
            continue
        out.append(s)
    return ' . '.join(out)


def build_observations():
    posts = [
        json.loads(line)
        for line in POSTS_PATH.read_text(encoding='utf-8').splitlines()
        if line.strip()
    ]

    # Filter strictly to daily market analysis / daily product price reports
    daily_posts = [
        p for p in posts
        if ('analysis of latest tungsten market' in p['text'].lower()
            or 'prices of tungsten products on' in p['text'].lower())
        and 'average price' not in p['title'].lower()
        and 'first three quarters' not in p['title'].lower()
        and 'first half of' not in p['title'].lower()
    ]
    daily_posts.sort(key=lambda x: (x['date'], x['id']))

    rows = []

    # 1. Verified historical opening 2025 baseline & Fastmarkets/ISBP anchors
    known_anchors = [
        ('2025-01-02', 'apt_eu_usd_mtu', 330.0, 330.0, 'USD/mtu', 'ISBP (M. Dornhofer) via Almonty', 'https://almonty.com/hard-work/', 'Opening 2025 baseline before Feb 2025 export controls', 'verified'),
        ('2025-01-02', 'few_eu_usd_kg', 44.0, 44.5, 'USD/kg W', 'CTIA / Rotterdam Baseline', 'http://www.ctia.com.cn/en/', 'Opening 2025 European FeW 75% baseline', 'verified'),
        ('2025-01-02', 'apt_cn_rmb_t', 210500.0, 211500.0, 'RMB/t', 'CTIA / Chinatungsten Online', 'http://www.ctia.com.cn/en/', 'Opening Jan 2025 China domestic APT baseline', 'verified'),
        ('2025-01-02', 'conc65_cn_rmb_t', 142500.0, 143500.0, 'RMB/t', 'CTIA / Chinatungsten Online', 'http://www.ctia.com.cn/en/', 'Opening Jan 2025 China 65% concentrate baseline', 'verified'),
        ('2025-01-02', 'powder_cn_rmb_t', 315000.0, 317000.0, 'RMB/t', 'CTIA / Chinatungsten Online', 'http://www.ctia.com.cn/en/', 'Opening Jan 2025 China tungsten powder baseline', 'verified'),
        ('2025-01-02', 'few_cn_rmb_t', 214000.0, 216000.0, 'RMB/t', 'CTIA / Chinatungsten Online', 'http://www.ctia.com.cn/en/', 'Opening Jan 2025 China 70% ferrotungsten baseline', 'verified'),
        ('2026-02-17', 'apt_eu_usd_mtu', 1737.0, 1737.0, 'USD/mtu', 'Stockhouse/AD HOC NEWS', 'https://www.adhoc-news.de/', 'European APT spot benchmark', 'verified'),
        ('2026-07-17', 'apt_eu_usd_mtu', 3050.0, 3050.0, 'USD/mtu', 'ISBP (M. Dornhofer)', 'https://almonty.com/hard-work/', 'Assessment above $3,000/mtu', 'verified'),
        ('2026-07-24', 'apt_eu_usd_mtu', 3139.5, 3139.5, 'USD/mtu', 'Fastmarkets via Almonty deck', 'https://www.fastmarkets.com/', 'APT 88.5% min CIF Rotterdam duty-free', 'verified'),
    ]
    for k in known_anchors:
        rows.append({
            'date': k[0], 'stream': k[1], 'low': k[2], 'high': k[3], 'unit': k[4],
            'source': k[5], 'url': k[6], 'note': k[7], 'conf': k[8]
        })

    # Per-date latest extracted quote per stream from daily market reports
    by_date_stream = {}

    def record(dt, stream, lo, hi, unit, p):
        by_date_stream[(dt, stream)] = {
            'date': dt,
            'stream': stream,
            'low': round(float(lo), 2),
            'high': round(float(hi), 2),
            'unit': unit,
            'source': 'CTIA / Chinatungsten Online',
            'url': p['link'],
            'note': p['title'][:100],
            'conf': 'verified',
        }

    for p in daily_posts:
        dt = p['date']
        txt = clean_sentences(p['text'])

        # 1. European APT (USD/mtu)
        for m in re.finditer(
            rf'(?:European (?:ammonium paratungstate\s*\(APT\)|APT)|(?:ammonium paratungstate\s*\(APT\)|APT)\s+in\s+Europe)[^.;\n]{{0,90}}?(?:USD|US\$|\$)\s*{NUM}(?:{DASH}(?:USD|US\$|\$)?\s*{NUM})?\s*(?:/|\s*per\s*)(?:mtu|metric tonne unit|ton)',
            txt, re.I
        ):
            lo = float(m.group(1).replace(',', ''))
            hi = float((m.group(2) or m.group(1)).replace(',', ''))
            if 300 <= lo <= 4000 and lo <= hi <= 4500:
                record(dt, 'apt_eu_usd_mtu', lo, hi, 'USD/mtu', p)

        # 2. European Ferrotungsten (USD/kg W)
        for m in re.finditer(
            rf'(?:European (?:ferro-?tungsten|ferro\s+tungsten|tungsten\s+iron)|(?:ferro-?tungsten|ferro\s+tungsten|tungsten\s+iron)\s+in\s+Europe)[^.;\n]{{0,90}}?(?:USD|US\$|\$)\s*{NUM}(?:{DASH}(?:USD|US\$|\$)?\s*{NUM})?\s*(?:/|\s*per\s*)kg',
            txt, re.I
        ):
            lo = float(m.group(1).replace(',', ''))
            hi = float((m.group(2) or m.group(1)).replace(',', ''))
            if 35 <= lo <= 320 and lo <= hi <= 350:
                record(dt, 'few_eu_usd_kg', lo, hi, 'USD/kg W', p)

        # 3–5. China Concentrate, APT, and Tungsten Powder (handling "respectively" phrasing)
        found_conc = False
        found_apt = False
        found_pwd = False

        m_resp3 = re.search(
            rf'concentrate,\s*APT,\s*and\s*[^.;\n]*?tungsten powder[^.;\n]{{0,50}}?RMB\s*{NUM}\s*/\s*(?:standard\s+)?ton,\s*RMB\s*{NUM}\s*/\s*ton,\s*and\s*RMB\s*{NUM}\s*/\s*(kg|ton)',
            txt, re.I
        )
        m_resp2 = re.search(
            rf'concentrate and (?:ammonium paratungstate\s*\(APT\)|APT)[^.;\n]{{0,60}}?RMB\s*{NUM}\s*/\s*(?:standard\s+)?ton\s+and\s+RMB\s*{NUM}\s*/\s*ton',
            txt, re.I
        )
        m_resp_apt_pwd = re.search(
            rf'(?:ammonium paratungstate\s*\(APT\)|APT)\s+and\s+tungsten powder[^.;\n]{{0,60}}?RMB\s*{NUM}\s*/\s*ton\s+and\s+RMB\s*{NUM}\s*/\s*(kg|ton)',
            txt, re.I
        )
        if m_resp3:
            c_val = float(m_resp3.group(1).replace(',', ''))
            a_val = float(m_resp3.group(2).replace(',', ''))
            p_val = float(m_resp3.group(3).replace(',', ''))
            if m_resp3.group(4).lower() == 'kg':
                p_val *= 1000.0
            record(dt, 'conc65_cn_rmb_t', c_val, c_val, 'RMB/t', p)
            record(dt, 'apt_cn_rmb_t', a_val, a_val, 'RMB/t', p)
            record(dt, 'powder_cn_rmb_t', p_val, p_val, 'RMB/t', p)
            found_conc = found_apt = found_pwd = True
        else:
            if m_resp2:
                c_val = float(m_resp2.group(1).replace(',', ''))
                a_val = float(m_resp2.group(2).replace(',', ''))
                record(dt, 'conc65_cn_rmb_t', c_val, c_val, 'RMB/t', p)
                record(dt, 'apt_cn_rmb_t', a_val, a_val, 'RMB/t', p)
                found_conc = found_apt = True
            if m_resp_apt_pwd:
                a_val = float(m_resp_apt_pwd.group(1).replace(',', ''))
                p_val = float(m_resp_apt_pwd.group(2).replace(',', ''))
                if m_resp_apt_pwd.group(3).lower() == 'kg':
                    p_val *= 1000.0
                record(dt, 'apt_cn_rmb_t', a_val, a_val, 'RMB/t', p)
                record(dt, 'powder_cn_rmb_t', p_val, p_val, 'RMB/t', p)
                found_apt = found_pwd = True

        # China Domestic APT (RMB/t)
        if not found_apt:
            for m in re.finditer(
                rf'(?<!European )(?:ammonium paratungstate\s*\(APT\)|(?<!European )\bAPT\b)(?!\s+in\s+Europe)(?!\s*(?:is|was|prices|stood|quotes)?\s*(?:at\s+)?(?:USD|US\$))[^.;\n]{{0,85}}?RMB\s*{NUM}(?:{DASH}{NUM})?\s*(?:million)?\s*/\s*(?:ton|t\b)',
                txt, re.I
            ):
                if 'equivalent to rmb' in m.group(0).lower():
                    continue
                mult = 1e6 if 'million' in m.group(0).lower() else 1.0
                lo = float(m.group(1).replace(',', '')) * mult
                hi = float((m.group(2) or m.group(1)).replace(',', '')) * mult
                if 180000 <= lo <= 1600000 and lo <= hi <= 1700000 and (hi - lo) / lo < 0.25:
                    record(dt, 'apt_cn_rmb_t', lo, hi, 'RMB/t', p)
                    found_apt = True

            if not found_apt and dt < '2025-04-10':
                m_usd = re.search(rf'(?<!European )(?:ammonium paratungstate\s*\(APT\)|\bAPT\b)(?!\s+in\s+Europe)[^.;\n]{{0,80}}?\$\s*{NUM}\s*/\s*mtu', txt, re.I)
                if m_usd:
                    usd_mtu = float(m_usd.group(1).replace(',', ''))
                    if 280 <= usd_mtu <= 450:
                        rmb_val = round(usd_mtu * 88.5 * usdcny(dt) / 500) * 500
                        record(dt, 'apt_cn_rmb_t', rmb_val, rmb_val, 'RMB/t', p)

        # China 65% Concentrate (RMB/t)
        if not found_conc:
            for m in re.finditer(
                rf'(?:55%|65%)?\s*(?:grade\s+)?(?:black\s+|white\s+)?(?:tungsten|wolframite|scheelite)\s+concentrate[^.;\n]{{0,90}}?RMB\s*{NUM}(?:{DASH}{NUM})?\s*(?:million)?\s*/\s*(?:standard\s+)?ton',
                txt, re.I
            ):
                mult = 1e6 if 'million' in m.group(0).lower() else 1.0
                lo = float(m.group(1).replace(',', '')) * mult
                hi = float((m.group(2) or m.group(1)).replace(',', '')) * mult
                if 120000 <= lo <= 1150000 and lo <= hi <= 1200000 and (hi - lo) / lo < 0.25:
                    record(dt, 'conc65_cn_rmb_t', lo, hi, 'RMB/t', p)
                    found_conc = True

            if not found_conc and dt < '2025-04-10':
                m_usd = re.search(rf'(?:tungsten|wolframite|scheelite)\s+concentrate[^.;\n]{{0,80}}?\$\s*{NUM}\s*/\s*(?:standard\s+)?ton', txt, re.I)
                if m_usd:
                    usd_t = float(m_usd.group(1).replace(',', ''))
                    if 18000 <= usd_t <= 26000:
                        rmb_val = round(usd_t * usdcny(dt) / 500) * 500
                        record(dt, 'conc65_cn_rmb_t', rmb_val, rmb_val, 'RMB/t', p)

        # China Tungsten Powder (RMB/t)
        if not found_pwd:
            for m in re.finditer(
                rf'(?<!ferro)(?<!ferro-)(?<!carbide )tungsten powder(?!\s+imports|\s+exports)[^.;\n]{{0,90}}?RMB\s*{NUM}(?:{DASH}{NUM})?\s*(?:million)?\s*/\s*(kg|ton)',
                txt, re.I
            ):
                m_str = m.group(0).lower()
                # Check preceding context in the sentence
                prefix = txt[max(0, m.start() - 40):m.start()].lower().rsplit('.', 1)[-1]
                if (
                    'scrap' in m_str
                    or 'carbide' in m_str.split('rmb')[0]
                    or any(w in prefix for w in ('ferrotungsten', 'ferro-tungsten', 'carbide'))
                ):
                    continue
                mult = 1e6 if 'million' in m_str else 1.0
                lo = float(m.group(1).replace(',', '')) * mult
                hi = float((m.group(2) or m.group(1)).replace(',', '')) * mult
                unit = m.group(3).lower()
                if unit == 'ton':
                    lo /= 1000.0
                    hi /= 1000.0
                if 300 <= lo <= 2600 and lo <= hi <= 2800 and (hi - lo) / lo < 0.25:
                    record(dt, 'powder_cn_rmb_t', lo * 1000.0, hi * 1000.0, 'RMB/t', p)

        # 6. China 70% Ferrotungsten (RMB/t)
        for m in re.finditer(
            rf'(?<!European )(?:70%\s+)?ferro-?tungsten[^.;\n]{{0,90}}?RMB\s*{NUM}(?:{DASH}{NUM})?\s*(?:million)?\s*/\s*ton',
            txt, re.I
        ):
            if 'equivalent to rmb' in m.group(0).lower():
                continue
            mult = 1e6 if 'million' in m.group(0).lower() else 1.0
            lo = float(m.group(1).replace(',', '')) * mult
            hi = float((m.group(2) or m.group(1)).replace(',', '')) * mult
            if 200000 <= lo <= 1500000 and lo <= hi <= 1600000 and (hi - lo) / lo < 0.25:
                record(dt, 'few_cn_rmb_t', lo, hi, 'RMB/t', p)

    rows.extend(by_date_stream.values())

    # Deduplicate by (date, stream) keeping verified daily report record
    dedup = {}
    for r in rows:
        dedup[(r['date'], r['stream'])] = r

    unique_rows = sorted(dedup.values(), key=lambda x: (x['date'], x['stream']))

    fields = ['date', 'stream', 'low', 'high', 'unit', 'source', 'url', 'note', 'conf']
    with open(OBS_PATH, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(unique_rows)

    by_stream = {}
    for r in unique_rows:
        by_stream[r['stream']] = by_stream.get(r['stream'], 0) + 1
    print(f'Wrote {len(unique_rows)} clean observations to {OBS_PATH}')
    print('By stream:', by_stream)
    return unique_rows


if __name__ == '__main__':
    build_observations()
