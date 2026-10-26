"""Append one published tungsten price print to data/observations.csv.

Examples
  python scripts/add_price.py --date 2026-10-21 --stream apt_eu_usd_mtu --low 1800 --high 1900 \
      --source "Fastmarkets" --url https://... --note "weekly assessment"
  python scripts/add_price.py --date 2026-10-21 --stream apt_cn_rmb_t --low 500000 --source CTIA --url https://...

  python scripts/add_price.py --bulk my_rows.csv      # same columns as observations.csv

Streams:  apt_eu_usd_mtu | apt_cn_rmb_t | conc65_cn_rmb_t | powder_cn_rmb_t | few_cn_rmb_t
(`--high` defaults to `--low` for single-point quotes.)
"""
import argparse
import csv
import sys

import prices_db


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--bulk')
    ap.add_argument('--date')
    ap.add_argument('--stream', choices=sorted(prices_db.STREAMS))
    ap.add_argument('--low', type=float)
    ap.add_argument('--high', type=float)
    ap.add_argument('--source', default='')
    ap.add_argument('--url', default='')
    ap.add_argument('--note', default='')
    ap.add_argument('--conf', default='verified', choices=['verified', 'manual', 'auto'])
    a = ap.parse_args()
    if a.bulk:
        rows = list(csv.DictReader(open(a.bulk, newline='', encoding='utf-8')))
        for r in rows:
            r.setdefault('conf', 'verified')
            if not r.get('high'):
                r['high'] = r['low']
            if not r.get('unit') and r.get('stream') in prices_db.STREAMS:
                r['unit'] = prices_db.STREAMS[r['stream']][2]
    else:
        if not (a.date and a.stream and a.low):
            ap.error('--date, --stream and --low are required (or use --bulk)')
        rows = [{'date': a.date, 'stream': a.stream, 'low': a.low, 'high': a.high or a.low,
                 'unit': prices_db.STREAMS[a.stream][2], 'source': a.source, 'url': a.url,
                 'note': a.note, 'conf': a.conf}]
    n = prices_db.append_rows(rows)
    print(f'added {n} new row(s) ({len(rows) - n} duplicate/invalid skipped)')
    print('staleness (days since latest print):', prices_db.staleness())
    return 0


if __name__ == '__main__':
    sys.exit(main())
