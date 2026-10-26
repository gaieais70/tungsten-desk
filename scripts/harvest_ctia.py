"""Harvest tungsten price reports from CTIA (China Tungsten Industry Association).

ctia.com.cn/en is a WordPress site (the English edition of Chinatungsten
Online); its public REST API lists every article, including daily/weekly
price reports ("Ammonium Paratungstate (APT) Prices Test RMB 500,000/ton",
"Tungsten Concentrate Back to RMB 300,000/standard ton", etc.).

Optimized for fast incremental refresh:
  Paginates latest posts in reverse chronological order and stops as soon as
  it hits previously cached posts, completing in 2-3 seconds.
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data' / 'raw'
RAW.mkdir(parents=True, exist_ok=True)

from common import log, http_json

BASE = 'http://www.ctia.com.cn/en/wp-json/wp/v2/posts'
CACHE = RAW / 'ctia_posts.jsonl'

TITLE_RE = re.compile(
    r'(tungsten|APT|ammonium paratungstate|scheelite|wolframite|ferro-?tungsten|carbide|'
    r'quota|export control|vietnam|futures)', re.I)
SKIP_RE = re.compile(
    r'(stranded|heating element|crucible|how to|what is|why does|how does|how are|'
    r'what are|effect of|factors affecting|requirements of)', re.I)

def clean(htm):
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', htm, flags=re.S | re.I)
    t = re.sub(r'<[^>]+>', ' ', t)
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()

def load_cache():
    out = {}
    if CACHE.exists():
        for line in CACHE.read_text(encoding='utf-8').splitlines():
            if line.strip():
                try:
                    p = json.loads(line)
                    out[p['id']] = p
                except Exception:
                    pass
    return out

def fetch_posts(max_pages=5):
    cache = load_cache()
    new_count = 0
    consecutive_cached_pages = 0
    
    for page in range(1, max_pages + 1):
        url = f'{BASE}?per_page=50&page={page}&_fields=id,date,title,link,content'
        try:
            posts = http_json(url, tries=3, timeout=25, backoff=2.0)
        except Exception as e:
            log(f'ctia: page {page} fetch failed: {str(e)[:80]}', 'WARN')
            break
            
        if not posts or not isinstance(posts, list):
            break
            
        page_new = 0
        for p in posts:
            pid = p['id']
            if pid in cache:
                continue
            title = clean(p['title']['rendered'])
            if SKIP_RE.search(title) or not TITLE_RE.search(title):
                continue
            cache[pid] = {
                'id': pid,
                'date': p['date'][:10],
                'title': title,
                'link': p['link'],
                'text': clean(p['content']['rendered'])
            }
            page_new += 1
            new_count += 1
            
        if page_new == 0 and len(cache) > 50:
            consecutive_cached_pages += 1
            if consecutive_cached_pages >= 2:
                # Up to date
                break
        else:
            consecutive_cached_pages = 0

    with open(CACHE, 'w', encoding='utf-8') as f:
        for p in sorted(cache.values(), key=lambda x: x['date']):
            f.write(json.dumps(p, ensure_ascii=False) + '\n')
            
    log(f'ctia: {len(cache)} cached posts ({new_count} new fetched)')
    return cache

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', type=int, default=3)
    ap.add_argument('--since', default='2025-01-01')
    a = ap.parse_args()
    fetch_posts(max_pages=a.pages)
    return 0

if __name__ == '__main__':
    sys.exit(main())
