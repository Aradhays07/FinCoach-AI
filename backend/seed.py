"""
seed.py — run once: python seed.py
Seeds MongoDB with 6 months of fake credit scores, API logs, bulk jobs, billing, and lenders.
"""
from dotenv import load_dotenv
load_dotenv()

import random
from datetime import datetime, timedelta, timezone
from db import get_db

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

EMAIL = "test@fineasy.ai"   # ← IMPORTANT: change to your actual login email

if EMAIL == "test@fineasy.ai":
    print("⚠️  WARNING: EMAIL is still the default. Change it to your login email before running.")
    answer = input("Continue anyway? [y/N]: ").strip().lower()
    if answer != 'y':
        print("Aborted.")
        exit(0)

db = get_db()

# clear old seed data
for col in ['credit_scores','api_logs','bulk_jobs','billing','lenders']:
    db[col].delete_many({'_seed': True})

now   = utcnow()
names = ["Rahul Sharma","Priya Patel","Amit Verma","Sunita Rao","Karan Singh","Deepa Nair",
         "Vijay Kumar","Anita Joshi","Rohit Gupta","Meera Iyer","Arjun Mehta","Pooja Shah"]

for month_offset in range(6):
    month_start = now.replace(day=1) - timedelta(days=30 * month_offset)
    n_scores    = random.randint(18, 35)
    n_calls     = random.randint(80, 220)
    n_bulk      = random.randint(2, 8)
    revenue     = random.uniform(12000, 45000)

    for _ in range(n_scores):
        score = random.gauss(680, 80)
        score = max(300, min(850, score))
        risk  = 'low' if score >= 720 else 'medium' if score >= 600 else 'high'
        ts    = month_start + timedelta(days=random.randint(0,27), hours=random.randint(0,23))
        db.credit_scores.insert_one({
            'email': EMAIL, 'score': round(score,2), 'risk': risk,
            'name': random.choice(names),
            'client_id': f'client_{random.randint(1000,9999)}',
            'ts': ts, '_seed': True
        })

    for _ in range(n_calls):
        ts = month_start + timedelta(days=random.randint(0,27), hours=random.randint(0,23))
        db.api_logs.insert_one({'email': EMAIL, 'endpoint': '/creditscore', 'ts': ts, '_seed': True})

    for _ in range(n_bulk):
        ts = month_start + timedelta(days=random.randint(0,27))
        db.bulk_jobs.insert_one({
            'email': EMAIL, 'status': 'completed',
            'total': random.randint(20,200),
            'created_at': ts, '_seed': True
        })

    ts = month_start + timedelta(days=28)
    db.billing.insert_one({
        'email': EMAIL, 'amount_inr': round(revenue,2),
        'ts': ts, '_seed': True
    })

# ── SEED LENDERS ─────────────────────────────────────────────────────────────
LENDERS = [
    { 'name':'Bajaj Finserv',    'type':'NBFC',        'min_score':650, 'max_amount':2500000, 'rate_min':10.5, 'rate_max':14.0, 'fee':1500 },
    { 'name':'Tata Capital',     'type':'NBFC',        'min_score':680, 'max_amount':3000000, 'rate_min':11.0, 'rate_max':15.5, 'fee':1200 },
    { 'name':'Lendingkart',      'type':'Fintech',     'min_score':620, 'max_amount':1500000, 'rate_min':13.0, 'rate_max':20.0, 'fee':999  },
    { 'name':'HDFC Bank',        'type':'Bank',        'min_score':720, 'max_amount':5000000, 'rate_min':9.5,  'rate_max':12.0, 'fee':2000 },
    { 'name':'Muthoot Finance',  'type':'NBFC',        'min_score':600, 'max_amount':1000000, 'rate_min':12.0, 'rate_max':18.0, 'fee':800  },
    { 'name':'Navi Technologies','type':'Fintech',     'min_score':640, 'max_amount':2000000, 'rate_min':11.5, 'rate_max':17.0, 'fee':500  },
    { 'name':'Axis Bank',        'type':'Bank',        'min_score':700, 'max_amount':4000000, 'rate_min':10.0, 'rate_max':13.5, 'fee':1800 },
    { 'name':'FlexiLoans',       'type':'Fintech',     'min_score':580, 'max_amount':1200000, 'rate_min':14.0, 'rate_max':22.0, 'fee':0    },
]
for l in LENDERS:
    db.lenders.insert_one({**l, '_seed': True})

print(f"✅ Seeded 6 months of data + {len(LENDERS)} lenders for {EMAIL}")
