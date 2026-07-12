"""
market_routes.py
Proxies Yahoo Finance quotes server-side to avoid CORS.
Caches results for 30 seconds to avoid rate limiting.
GET /market/quotes  →  { quotes: [ { label, price, change } ] }
"""
import urllib.request
import json
import time
import concurrent.futures
from flask import Blueprint, jsonify

market_bp = Blueprint('market', __name__)

SYMBOLS = [
    ('^NSEI',       'NIFTY 50'  ),
    ('^BSESN',      'SENSEX'    ),
    ('^NSEBANK',    'BANKNIFTY' ),
    ('RELIANCE.NS', 'RELIANCE'  ),
    ('HDFCBANK.NS', 'HDFC BANK' ),
    ('INFY.NS',     'INFOSYS'   ),
    ('TCS.NS',      'TCS'       ),
]

_cache      = {'quotes': [], 'ts': 0}
CACHE_TTL   = 30  # seconds


def _fetch_quote(symbol):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=2d'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
        meta  = data['chart']['result'][0]['meta']
        price = meta.get('regularMarketPrice')
        prev  = meta.get('previousClose') or meta.get('chartPreviousClose')
        if price and prev:
            return round(price, 2), round((price - prev) / prev * 100, 2)
    except Exception:
        pass
    return None, None


@market_bp.route('/market/quotes')
def quotes():
    now = time.time()
    if now - _cache['ts'] < CACHE_TTL and _cache['quotes']:
        return jsonify({'quotes': _cache['quotes'], 'cached': True, 'stale': False})

    results = []
    # FIX: previously fetched 7 symbols sequentially, each with a 5s
    # timeout — a single cache-miss request could block for up to 35s.
    # Fetch them concurrently so worst case is ~5s, not 7x that.
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(SYMBOLS)) as pool:
        futures = {pool.submit(_fetch_quote, sym): label for sym, label in SYMBOLS}
        for future in concurrent.futures.as_completed(futures):
            label = futures[future]
            try:
                price, change = future.result()
            except Exception:
                price, change = None, None
            if price is not None:
                results.append({'label': label, 'price': price, 'change': change})
    # Restore the original SYMBOLS display order (as_completed finishes out of order)
    order = {label: i for i, (_, label) in enumerate(SYMBOLS)}
    results.sort(key=lambda r: order.get(r['label'], 999))

    # Yahoo Finance's free endpoint rate-limits aggressively. Only refresh the
    # cache when we actually got data; otherwise keep serving the last
    # known-good quotes (flagged stale) so the ticker doesn't just vanish.
    if results:
        _cache['quotes'] = results
        _cache['ts']     = now
        return jsonify({'quotes': results, 'cached': False, 'stale': False})

    if _cache['quotes']:
        return jsonify({'quotes': _cache['quotes'], 'cached': True, 'stale': True})

    return jsonify({'quotes': [], 'cached': False, 'stale': True,
                     'message': 'Market data temporarily unavailable — rate limited. Retrying shortly.'})
