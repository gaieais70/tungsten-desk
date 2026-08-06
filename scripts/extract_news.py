"""Extract news items from downloaded Google News RSS into site/data/news.json."""
import re, json, xml.etree.ElementTree as ET

FILES = ['news_apt.xml', 'news_tungsten.xml', 'news_mtu.xml', 'news_wo3.xml']
items = []
seen = set()
for f in FILES:
    try:
        tree = ET.parse(rf'D:\tungsten-dashboard\data\{f}')
    except FileNotFoundError:
        continue
    for it in tree.getroot().findall('.//item'):
        title = re.sub(r'\s+', ' ', (it.findtext('title') or '').strip())
        link = (it.findtext('link') or '').strip()
        pub = (it.findtext('pubDate') or '').strip()
        src = ''
        m = re.search(r'\s-\s([^-]+)$', title)
        if m:
            src = m.group(1).strip()
            title = title[:m.start()].strip()
        key = title.lower()
        if not title or key in seen:
            continue
        seen.add(key)
        # relevance scoring
        score = 0
        tl = title.lower()
        if 'apt' in tl or 'mtu' in tl: score += 3
        if re.search(r'\$\s?\d', title): score += 3
        if any(w in tl for w in ['price', 'surge', 'record', 'soar', 'rally', 'tight']): score += 2
        if any(w in tl for w in ['export control', 'quota', 'china', 'supply']): score += 1
        if any(s in src for s in ['Fastmarkets', 'Shanghai Metals Market', 'Bloomberg', 'Reuters', 'Mining.com']): score += 2
        items.append({'title': title, 'source': src, 'date': pub, 'link': link, 'score': score})

# direct verified sources (deduped against RSS items)
MANUAL = [
    {'title': 'Tungsten markets fragmenting as domestic Chinese APT market diverges from exports',
     'source': 'Fastmarkets', 'date': 'Mon, 29 Jun 2026', 'link': 'https://www.fastmarkets.com/'},
    {'title': 'ISBP assessment: APT CIF Rotterdam/Benchmark above $3,000/mtu WO3; opened 2025 at ~$330 (9x rise since Chinese export controls)',
     'source': 'ISBP via Almonty "Hard Work" newsletter', 'date': 'Sun, 19 Jul 2026',
     'link': 'https://almonty.com/hard-work/'},
    {'title': 'Tungsten Carbide Prices Reach USD 131/KG in China — IMARC Group real-time global price trend',
     'source': 'IMARC via openPR', 'date': 'Mon, 03 Aug 2026', 'link': 'https://www.imarcgroup.com/'},
]
for m in MANUAL:
    if m['title'].lower() not in seen:
        m['score'] = 0
        items.append(m)
        seen.add(m['title'].lower())

items.sort(key=lambda x: (-x['score'], x['date']), reverse=False)
items.sort(key=lambda x: x['score'], reverse=True)
for i in items[:50]:
    i.pop('score')
json.dump(items[:50], open(r'D:\tungsten-dashboard\site\data\news.json', 'w'), indent=1)
print(f'saved {min(len(items),50)} news items')
