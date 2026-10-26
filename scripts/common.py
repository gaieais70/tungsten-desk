"""Shared helpers for the Tungsten Desk pipeline (paths, resilient HTTP, logging)."""
import json
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
RAW = DATA / 'raw'
SITE = ROOT / 'site'
SITE_DATA = SITE / 'data'
for _p in (DATA, RAW, SITE_DATA):
    _p.mkdir(parents=True, exist_ok=True)

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')


def log(msg, level='INFO'):
    stream = sys.stderr if level in ('WARN', 'ERROR') else sys.stdout
    try:
        print(f'[{level}] {msg}', file=stream, flush=True)
    except UnicodeEncodeError:
        print(f'[{level}] {msg}'.encode('ascii', 'replace').decode(), file=stream, flush=True)


def http_get(url, tries=5, timeout=30, backoff=3.0, headers=None):
    """GET with retry + exponential backoff. Returns bytes or raises the last error.

    Several of the free sources we rely on (CTIA, FRED) drop connections
    intermittently, so every harvester goes through this function."""
    hdr = {'User-Agent': UA, 'Accept': '*/*'}
    if headers:
        hdr.update(headers)
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=hdr)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404):    # no point retrying
                break
        except Exception as e:                     # timeouts, resets, DNS ...
            last = e
        time.sleep(backoff * (attempt + 1))
    raise last


def http_json(url, **kw):
    return json.loads(http_get(url, **kw).decode('utf-8', 'ignore'))
