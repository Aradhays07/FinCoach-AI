from flask import Blueprint, request, jsonify
from db import get_db, email_from_token
from datetime import datetime, timezone, timedelta
import os

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

feature_bp = Blueprint('feature', __name__)


# ── PLAYBOOK ──────────────────────────────────────────────────────────────────
@feature_bp.route('/playbook', methods=['POST'])
def playbook():
    d     = request.get_json(silent=True)
    if not d:
        return jsonify({'message': 'Request must be JSON'}), 400

    goal  = d.get('goal', '').strip() or 'Improve my finances'
    score = d.get('score')   # may be None — fine
    email = email_from_token(request)

    # Enrich prompt: merge request body fields + DB user profile
    # Request body takes priority (sent by agentService with real scored features)
    req_income = d.get('monthly_income')
    req_debt   = d.get('existing_debt')
    req_risk   = d.get('risk')

    profile_context = ''
    parts = []

    # Fields from request body (real-time, highest priority)
    if req_income: parts.append(f"Monthly income: ₹{int(req_income):,}")
    if req_debt:   parts.append(f"Existing debt: ₹{int(req_debt):,}")
    if req_risk:   parts.append(f"Risk band: {req_risk}")

    # Fill remaining from DB user profile
    if email:
        db   = get_db()
        user = db.users.find_one({'email': email}, {'_id': 0, 'password': 0})
        if user:
            if not req_income and user.get('monthly_income'):
                parts.append(f"Monthly income: ₹{user['monthly_income']:,}")
            if not req_debt and user.get('existing_debt'):
                parts.append(f"Existing debt: ₹{user['existing_debt']:,}")
            if user.get('employment_type'):
                parts.append(f"Employment: {user['employment_type']}")
            if user.get('credit_history_length'):
                parts.append(f"Credit history: {user['credit_history_length']}")
            if user.get('loan_purpose'):
                parts.append(f"Loan purpose: {user['loan_purpose']}")

    if parts:
        profile_context = ' | '.join(parts)

    score_text = f"Credit score: {score}/850." if score is not None else "Credit score: unknown."
    profile_text = f" User profile: {profile_context}." if profile_context else ''

    api_key = os.getenv('GEMINI_API_KEY')
    advice  = None

    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            prompt = (
                f'You are a SEBI-certified financial planner in India. '
                f'Goal: "{goal}". {score_text}{profile_text} '
                f'Give a 5-step actionable playbook with ₹ figures, SIP, NPS, ELSS specifics. '
                f'Be concise and specific to the user\'s actual financial situation.'
            )
            advice = genai.GenerativeModel('gemini-1.5-flash').generate_content(prompt).text
        except Exception as e:
            print(f'⚠️  Gemini error: {e}')

    if not advice:
        advice = _dynamic_fallback_playbook(goal, score, profile_context)

    if email:
        try:
            db = get_db()
            db.playbooks.insert_one({
                'email': email,
                'goal': goal,
                'score': score,
                'advice': advice,
                'ts': utcnow(),
            })
        except Exception as e:
            print(f"⚠️ /playbook: could not save history (advice still returned): {e}")

    return jsonify({'advice': advice, 'goal': goal, 'ts': utcnow().isoformat()})


def _dynamic_fallback_playbook(goal: str, score, profile_context: str) -> str:
    lines = [f'Financial playbook for: "{goal}"', '']

    if score is not None:
        if score >= 720:
            lines.append('Step 1 – Your credit score is strong. Focus on growing wealth rather than score repair.')
        elif score >= 600:
            lines.append('Step 1 – Your score is in the review range. Prioritise on-time payments for the next 6 months.')
        else:
            lines.append('Step 1 – Build credit health first: reduce utilization below 30% and clear overdue amounts.')
    else:
        lines.append('Step 1 – Get a credit health check: run a score prediction to understand your starting point.')

    lines.append('Step 2 – Emergency fund: 6 months of expenses in a liquid FD or sweep account.')
    lines.append('Step 3 – Debt clearance: pay off obligations above 12% interest rate first (highest rate first).')
    lines.append('Step 4 – Invest via SIP: allocate 20% of take-home into a low-cost Nifty 50 index fund.')
    lines.append('Step 5 – Tax optimisation: max ₹1.5L ELSS under 80C and ₹50K NPS under 80CCD(1B).')

    if profile_context:
        lines.append('')
        lines.append(f'(Plan based on your profile: {profile_context})')

    return '\n'.join(lines)


# ── QUESTS ────────────────────────────────────────────────────────────────────
DEFAULT_QUESTS = [
    {'id': 1, 'title': 'Connect your HRMS',           'xp': 200, 'done': False, 'tag': 'Integration', 'desc': 'Sync your HR system to auto-populate borrower profiles and speed up scoring.'},
    {'id': 2, 'title': 'Run first credit batch',       'xp': 500, 'done': False, 'tag': 'Core',        'desc': 'Submit a bulk scoring job with at least 20 applicants to unlock batch analytics.'},
    {'id': 3, 'title': 'Enable SHAP reports',          'xp': 300, 'done': False, 'tag': 'Analytics',   'desc': 'Turn on SHAP explainability on your next credit score to see factor breakdown.'},
    {'id': 4, 'title': 'Reach 500 API calls',          'xp': 750, 'done': False, 'tag': 'Usage',       'desc': 'Hit 500 total API calls to unlock the Growth pricing tier and priority support.'},
    {'id': 5, 'title': 'Generate 10 playbooks',        'xp': 400, 'done': False, 'tag': 'AI',          'desc': 'Create 10 Gemini-powered financial playbooks for your borrowers.'},
    {'id': 6, 'title': 'Set up Zapier webhook',        'xp': 350, 'done': False, 'tag': 'Platform',    'desc': 'Connect a Zapier webhook to automate post-score workflows in your stack.'},
    {'id': 7, 'title': 'Complete first lender match',  'xp': 600, 'done': False, 'tag': 'Marketplace', 'desc': 'Run a lender match for a scored borrower and earn your first referral fee.'},
    {'id': 8, 'title': 'Export RBI audit bundle',      'xp': 500, 'done': False, 'tag': 'Compliance',  'desc': 'Generate and download a full RBI-compliant audit bundle from the Compliance page.'},
]

@feature_bp.route('/quest', methods=['GET'])
def get_quests():
    email = email_from_token(request)
    if not email:
        return jsonify(DEFAULT_QUESTS)
    db  = get_db()
    doc = db.quests.find_one({'email': email})
    if not doc:
        return jsonify(DEFAULT_QUESTS)

    quests = doc['quests']
    _auto_update_quests(quests, email, db)
    db.quests.update_one({'email': email}, {'$set': {'quests': quests}})
    return jsonify(quests)


def _auto_update_quests(quests: list, email: str, db) -> None:
    api_call_target  = int(os.getenv('QUEST_API_CALL_TARGET',  500))
    playbook_target  = int(os.getenv('QUEST_PLAYBOOK_TARGET',  10))

    api_calls      = db.api_logs.count_documents({'email': email})
    playbook_cnt   = db.playbooks.count_documents({'email': email})
    bulk_exists    = db.bulk_jobs.find_one({'email': email, 'status': 'completed'}) is not None
    webhook_exists = db.zapier_webhooks.find_one({'email': email, 'active': True}) is not None
    export_exists  = db.compliance_exports.find_one({'email': email}) is not None
    hrms_connected = db.integrations.find_one({'email': email, 'type': 'hrms'}) is not None

    auto_conditions = {
        1: hrms_connected,
        2: bulk_exists,
        4: api_calls >= api_call_target,
        5: playbook_cnt >= playbook_target,
        6: webhook_exists,
        8: export_exists,
    }

    for q in quests:
        if q['id'] in auto_conditions and not q['done']:
            q['done'] = auto_conditions[q['id']]


@feature_bp.route('/quest', methods=['POST'])
def update_quest():
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401

    body = request.get_json(silent=True)
    if not body or 'id' not in body:
        return jsonify({'message': 'Quest id required'}), 400

    quest_id = body['id']
    db       = get_db()
    doc      = db.quests.find_one({'email': email})
    quests   = doc['quests'] if doc else [q.copy() for q in DEFAULT_QUESTS]

    found = False
    for q in quests:
        if q['id'] == quest_id:
            q['done'] = True
            found = True
            break

    if not found:
        return jsonify({'message': f'Quest {quest_id} not found'}), 404

    db.quests.update_one({'email': email}, {'$set': {'quests': quests}}, upsert=True)
    return jsonify({'quests': quests})


# ── TRACKER ───────────────────────────────────────────────────────────────────
@feature_bp.route('/tracker', methods=['GET'])
def tracker():
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401

    # FIX: this whole function previously had no error handling — if Mongo
    # was unreachable or auth failed (confirmed happening in production —
    # 'bad auth : authentication failed' from Atlas), every query below threw
    # and Flask returned a raw unhandled 500 with a full stack trace instead
    # of something the frontend could actually show the user. get_db() itself
    # can now raise too, so it must be inside this same try block.
    try:
        db = get_db()
        return _tracker_impl(email, db)
    except Exception as e:
        print(f"⚠️ /tracker failed (likely MongoDB connectivity/auth): {e}")
        return jsonify({
            'message': 'Dashboard data is temporarily unavailable — the database connection failed.',
            'records': [], 'stats': {}, 'segments': [], 'activity': [],
        }), 503


def _tracker_impl(email, db):

    now    = utcnow()
    months = []
    # FIX: `now - timedelta(days=30*i)` approximates months as fixed 30-day
    # blocks, which drifts against real calendar months (28-31 days) — over
    # a 6-iteration loop this could land two iterations in the same month
    # (duplicate label) while skipping another entirely, depending on what
    # day of the month 'now' falls on. Compute real calendar months instead.
    _base_index = now.year * 12 + (now.month - 1)
    for i in range(5, -1, -1):
        idx = _base_index - i
        y, mo = divmod(idx, 12)
        mo += 1
        months.append({'year': y, 'month': mo, 'label': datetime(y, mo, 1).strftime('%b')})

    records = []
    for m in months:
        start = datetime(m['year'], m['month'], 1)
        if m['month'] == 12:
            end = datetime(m['year'] + 1, 1, 1) - timedelta(seconds=1)
        else:
            end = datetime(m['year'], m['month'] + 1, 1) - timedelta(seconds=1)

        pipeline = [
            {'$match': {'email': email, 'ts': {'$gte': start, '$lte': end}}},
            {'$group': {'_id': None, 'avg_score': {'$avg': '$score'}, 'count': {'$sum': 1}}},
        ]
        score_result = list(db.credit_scores.aggregate(pipeline))
        avg_score    = round(score_result[0]['avg_score'], 1) if score_result else None

        api_calls = db.api_logs.count_documents({
            'email': email, 'ts': {'$gte': start, '$lte': end}
        })

        bulk_jobs = db.bulk_jobs.count_documents({
            'email': email, 'status': 'completed',
            'created_at': {'$gte': start, '$lte': end}
        })

        records.append({
            'month':     m['label'],
            'score':     avg_score,
            'calls':     api_calls,
            'bulk_jobs': bulk_jobs,
        })

    # ── OVERALL STATS (all-time) ──────────────────────────────────────────────
    pipeline_all = [
        {'$match': {'email': email}},
        {'$group': {'_id': None, 'avg': {'$avg': '$score'}, 'total': {'$sum': 1}}},
    ]
    all_scores  = list(db.credit_scores.aggregate(pipeline_all))
    overall_avg = round(all_scores[0]['avg'], 1) if all_scores else None

    # ── ACTIVE USERS THIS MONTH (distinct clients scored) ────────────────────
    this_month_start = datetime(now.year, now.month, 1)
    last_month_start = datetime(now.year, now.month - 1, 1) if now.month > 1 else datetime(now.year - 1, 12, 1)
    last_month_end   = this_month_start

    # Count distinct clients by client_id; fall back to raw count if no client_id stored
    _this_distinct = db.credit_scores.distinct('client_id', {
        'email': email, 'ts': {'$gte': this_month_start}, 'client_id': {'$exists': True, '$ne': None}
    })
    active_this = len(_this_distinct) if _this_distinct else db.credit_scores.count_documents(
        {'email': email, 'ts': {'$gte': this_month_start}}
    )

    _last_distinct = db.credit_scores.distinct('client_id', {
        'email': email, 'ts': {'$gte': last_month_start, '$lt': last_month_end},
        'client_id': {'$exists': True, '$ne': None}
    })
    active_last = len(_last_distinct) if _last_distinct else db.credit_scores.count_documents(
        {'email': email, 'ts': {'$gte': last_month_start, '$lt': last_month_end}}
    )

    users_change = round(((active_this - active_last) / active_last * 100), 1) if active_last else None

    # ── AVG SCORE CHANGE ─────────────────────────────────────────────────────
    score_this_pipeline = [
        {'$match': {'email': email, 'ts': {'$gte': this_month_start}}},
        {'$group': {'_id': None, 'avg': {'$avg': '$score'}}},
    ]
    score_last_pipeline = [
        {'$match': {'email': email, 'ts': {'$gte': last_month_start, '$lt': last_month_end}}},
        {'$group': {'_id': None, 'avg': {'$avg': '$score'}}},
    ]
    score_this_res = list(db.credit_scores.aggregate(score_this_pipeline))
    score_last_res = list(db.credit_scores.aggregate(score_last_pipeline))
    score_this_avg = score_this_res[0]['avg'] if score_this_res else None
    score_last_avg = score_last_res[0]['avg'] if score_last_res else None
    score_change   = round(((score_this_avg - score_last_avg) / score_last_avg * 100), 1) if score_this_avg and score_last_avg else None

    # ── API CALLS TODAY / CHANGE ──────────────────────────────────────────────
    today_start     = datetime(now.year, now.month, now.day)
    yesterday_start = today_start - timedelta(days=1)
    calls_today     = db.api_logs.count_documents({'email': email, 'ts': {'$gte': today_start}})
    calls_yesterday = db.api_logs.count_documents({'email': email, 'ts': {'$gte': yesterday_start, '$lt': today_start}})
    calls_change    = round(((calls_today - calls_yesterday) / calls_yesterday * 100), 1) if calls_yesterday else None

    # ── REVENUE MTD / CHANGE ─────────────────────────────────────────────────
    billing_this = list(db.billing.aggregate([
        {'$match': {'email': email, 'ts': {'$gte': this_month_start}}},
        {'$group': {'_id': None, 'total': {'$sum': '$amount_inr'}}},
    ]))
    billing_last = list(db.billing.aggregate([
        {'$match': {'email': email, 'ts': {'$gte': last_month_start, '$lt': last_month_end}}},
        {'$group': {'_id': None, 'total': {'$sum': '$amount_inr'}}},
    ]))
    revenue_this   = billing_this[0]['total'] if billing_this else None
    revenue_last   = billing_last[0]['total'] if billing_last else None
    revenue_change = round(((revenue_this - revenue_last) / revenue_last * 100), 1) if revenue_this and revenue_last else None
    revenue_fmt    = f'₹{revenue_this:,.0f}' if revenue_this else None

    # ── SEGMENTS (risk tier distribution) ────────────────────────────────────
    risk_pipeline = [
        {'$match': {'email': email}},
        {'$group': {'_id': '$risk', 'count': {'$sum': 1}}},
    ]
    risk_results = list(db.credit_scores.aggregate(risk_pipeline))
    segments = [
        {'name': r['_id'].capitalize() if r['_id'] else 'Unknown', 'val': r['count']}
        for r in risk_results if r['_id']
    ]

    # ── RECENT ACTIVITY ───────────────────────────────────────────────────────
    recent_scores = list(db.credit_scores.find(
        {'email': email},
        {'score': 1, 'risk': 1, 'ts': 1, 'name': 1, '_id': 0}
    ).sort('ts', -1).limit(5))

    recent_bulk = list(db.bulk_jobs.find(
        {'email': email},
        {'status': 1, 'total': 1, 'created_at': 1, '_id': 0}
    ).sort('created_at', -1).limit(3))

    activity = []
    for s in recent_scores:
        ts = s.get('ts')
        time_str = ts.strftime('%H:%M') if ts else '—'
        risk = s.get('risk', 'low')
        dot_type = 'red' if risk == 'high' else 'gold' if risk == 'medium' else 'green'
        activity.append({
            'type':   dot_type,
            'action': f"Credit score: {int(s['score'])} ({risk.capitalize()} risk)",
            'detail': s.get('name') or 'Client scored',
            'time':   time_str,
            '_ts':    ts,  # real datetime, used for sorting only — stripped before response
        })
    for b in recent_bulk:
        ts = b.get('created_at')
        time_str = ts.strftime('%H:%M') if ts else '—'
        activity.append({
            'type':   'blue',
            'action': f"Bulk job {b.get('status', 'processed')}",
            'detail': f"{b.get('total', 0)} records processed",
            'time':   time_str,
            '_ts':    ts,
        })
    # FIX: previously sorted by the 'HH:MM' display string alone, which has
    # no date component — activity from different days would interleave
    # incorrectly (e.g. yesterday 23:50 would outrank today 08:00). Sort by
    # the real timestamp, falling back to "oldest" for any missing value so
    # they don't crash the sort or float to the top.
    from datetime import datetime as _dt
    activity.sort(key=lambda x: x['_ts'] or _dt.min, reverse=True)
    activity = [{k: v for k, v in a.items() if k != '_ts'} for a in activity[:8]]

    return jsonify({
        'records': records,
        'stats': {
            'avg_score':      overall_avg,
            'score_change':   score_change,
            'active_users':   active_this,
            'users_change':   users_change,
            'api_calls_today':calls_today,
            'calls_change':   calls_change,
            'revenue_mtd':    revenue_fmt,
            'revenue_change': revenue_change,
        },
        'segments': segments,
        'activity': activity,
    })


# ── LENDER MATCHING ───────────────────────────────────────────────────────────
@feature_bp.route('/match-lenders', methods=['POST'])
def match_lenders():
    email = email_from_token(request)
    d = request.get_json(silent=True)
    if not d:
        return jsonify({'message': 'Request must be JSON'}), 400

    score  = int(d.get('score', 0))
    amount = float(d.get('amount', 0))

    if not score:
        return jsonify({'message': 'score is required'}), 400

    db      = get_db()
    lenders = list(db.lenders.find({}, {'_id': 0}))

    if not lenders:
        return jsonify({
            'message': 'No lenders configured. Ask your admin to seed the lenders collection.',
            'matches': [],
        }), 200

    matches = []
    for lender in lenders:
        min_score  = lender.get('min_score', 0)
        max_amount = lender.get('max_amount', float('inf'))

        if score < min_score:
            continue
        if amount and max_amount < amount:
            continue

        # Score component (0-60): how far above minimum
        max_possible_headroom = 850 - min_score
        score_component = (score - min_score) / max(max_possible_headroom, 1) * 60

        # Amount component (0-30): how much of requested amount can be covered
        if amount and max_amount:
            amount_component = min(30, (max_amount / amount) * 15)
        else:
            amount_component = 15  # neutral if no amount specified

        # Rate component (0-9): lower rates = better match
        rate_component = max(0, 9 - (lender.get('rate_min', 12) - 8))

        match_pct = min(99, max(50, int(score_component + amount_component + rate_component)))

        matches.append({**lender, 'match_pct': match_pct})

    matches.sort(key=lambda x: -x['match_pct'])
    top_matches = matches[:5]

    # FIX: this event was never persisted anywhere — the frontend's "Total
    # matches", "Recent matches" list, and "Revenue breakdown" were all
    # hardcoded fake numbers with nothing real behind them. Log it for real
    # so /match-lenders/stats can report genuine figures.
    if email:
        try:
            db.match_history.insert_one({
                'email':      email,
                'score':      score,
                'amount':     amount,
                'purpose':    d.get('purpose'),
                'match_count': len(matches),
                'top_match':  top_matches[0]['name'] if top_matches else None,
                'top_pct':    top_matches[0]['match_pct'] if top_matches else None,
                'ts':         utcnow(),
            })
        except Exception as e:
            print(f"⚠️ match-lenders: could not log match history: {e}")

    return jsonify({
        'matches': top_matches,
        'score':   score,
        'total':   len(matches),
    })


@feature_bp.route('/match-lenders/stats', methods=['GET'])
def match_lenders_stats():
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401
    try:
        db = get_db()
        total_matches = db.match_history.count_documents({'email': email})
        recent = list(
            db.match_history.find({'email': email}, {'_id': 0})
            .sort('ts', -1).limit(5)
        )
        pcts = [r['top_pct'] for r in db.match_history.find(
            {'email': email, 'top_pct': {'$ne': None}}, {'top_pct': 1, '_id': 0}
        )]
        avg_match_pct = round(sum(pcts) / len(pcts), 1) if pcts else None
        lenders_in_pool = db.lenders.count_documents({})
    except Exception as e:
        print(f"⚠️ /match-lenders/stats failed (likely MongoDB connectivity/auth): {e}")
        return jsonify({
            'total_matches': None, 'avg_match_pct': None,
            'lenders_in_pool': None, 'recent': [],
        }), 503

    for r in recent:
        r['date'] = r['ts'].strftime('%d %b, %H:%M') if hasattr(r.get('ts'), 'strftime') else str(r.get('ts', ''))[:16]
        r.pop('ts', None)

    return jsonify({
        'total_matches':   total_matches,
        'avg_match_pct':   avg_match_pct,
        'lenders_in_pool': lenders_in_pool,
        'recent':          recent,
    })


# ── ZAPIER WEBHOOKS ───────────────────────────────────────────────────────────
@feature_bp.route('/zapier/webhooks', methods=['GET'])
def get_webhooks():
    email = email_from_token(request)
    if not email:
        return jsonify([])
    db    = get_db()
    hooks = list(db.zapier_webhooks.find({'email': email}, {'_id': 0, 'email': 0}))
    return jsonify(hooks)


@feature_bp.route('/zapier/webhooks', methods=['POST'])
def add_webhook():
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401

    d = request.get_json(silent=True)
    if not d or not d.get('trigger') or not d.get('url'):
        return jsonify({'message': 'trigger and url are required'}), 400

    hook = {
        'id':         f'wh_{os.urandom(4).hex()}',
        'trigger':    d['trigger'],
        'url':        d['url'],
        'active':     True,
        'fires':      0,
        'last':       None,
        'email':      email,
        'created_at': utcnow(),
    }
    get_db().zapier_webhooks.insert_one(hook)
    hook.pop('email')
    hook.pop('_id', None)
    return jsonify(hook), 201


@feature_bp.route('/zapier/webhooks/<hook_id>', methods=['DELETE'])
def delete_webhook(hook_id):
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401
    get_db().zapier_webhooks.delete_one({'id': hook_id, 'email': email})
    return jsonify({'deleted': True})


@feature_bp.route('/zapier/webhooks/<hook_id>/test', methods=['POST'])
def test_webhook(hook_id):
    import requests as req_lib

    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401

    db   = get_db()
    hook = db.zapier_webhooks.find_one({'id': hook_id, 'email': email})
    if not hook:
        return jsonify({'message': 'Webhook not found'}), 404

    last_score_doc = db.credit_scores.find_one({'email': email}, sort=[('ts', -1)])
    last_score     = last_score_doc['score'] if last_score_doc else None
    last_risk      = last_score_doc['risk']  if last_score_doc else None

    payload = {
        'event':     hook['trigger'],
        'timestamp': utcnow().isoformat(),
        'data': {
            'tenant_id': email,
            'score':     last_score,
            'risk_band': last_risk,
            'note':      'test_event',
        },
    }

    try:
        r       = req_lib.post(hook['url'], json=payload, timeout=5)
        success = r.status_code < 400
        status_code = r.status_code
    except Exception as e:
        success     = False
        status_code = None

    if success:
        db.zapier_webhooks.update_one(
            {'id': hook_id},
            {'$inc': {'fires': 1}, '$set': {'last': utcnow().isoformat()}},
        )

    return jsonify({'success': success, 'http_status': status_code, 'payload': payload})


# ── PLAYBOOK HISTORY ─────────────────────────────────────────────────────────
@feature_bp.route('/playbook/history', methods=['GET'])
def playbook_history():
    email = email_from_token(request)
    if not email:
        return jsonify([])
    try:
        db   = get_db()
        # FIX: playbook() persists the timestamp as 'ts' (see above), not
        # 'generated_at' — sorting by a field that's never actually written
        # meant history never reliably ordered by recency.
        rows = list(db.playbooks.find({'email': email}, {'_id': 0}).sort('ts', -1).limit(10))
    except Exception as e:
        print(f"⚠️ /playbook/history failed (likely MongoDB connectivity/auth): {e}")
        return jsonify([])
    result = []
    for r in rows:
        ts = r.get('ts') or r.get('generated_at') or ''
        if hasattr(ts, 'strftime'):
            ts = ts.strftime('%d %b %Y')
        result.append({
            'goal':  r.get('goal', '—'),
            'score': r.get('score'),
            'date':  str(ts)[:10] if ts else '—',
        })
    return jsonify(result)


# ── BENCHMARKS ────────────────────────────────────────────────────────────────
@feature_bp.route('/benchmarks', methods=['GET'])
def benchmarks():
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401

    try:
        db = get_db()
        return _benchmarks_impl(email, db)
    except Exception as e:
        print(f"⚠️ /benchmarks failed (likely MongoDB connectivity/auth): {e}")
        return jsonify({
            'message': 'Benchmark data is temporarily unavailable — the database connection failed.',
            'your_avg': None, 'platform_avg': None, 'top_quartile': None,
            'your_npa': None, 'platform_npa': None, 'states': [], 'peer_data': [],
        }), 503


def _benchmarks_impl(email, db):

    tenant_pipeline = [
        {'$match': {'email': email}},
        {'$group': {
            '_id':       None,
            'avg_score': {'$avg': '$score'},
            'count':     {'$sum': 1},
        }},
    ]
    tenant_result = list(db.credit_scores.aggregate(tenant_pipeline))
    your_avg = round(tenant_result[0]['avg_score'], 1) if tenant_result else None

    total_scored = db.credit_scores.count_documents({'email': email})
    high_risk    = db.credit_scores.count_documents({'email': email, 'risk': 'high'})
    your_npa     = round((high_risk / total_scored) * 100, 2) if total_scored else None

    platform_pipeline = [
        {'$group': {
            '_id':       None,
            'avg_score': {'$avg': '$score'},
            'count':     {'$sum': 1},
        }},
    ]
    platform_result = list(db.credit_scores.aggregate(platform_pipeline))
    platform_avg    = round(platform_result[0]['avg_score'], 1) if platform_result else None

    all_high   = db.credit_scores.count_documents({'risk': 'high'})
    all_total  = db.credit_scores.count_documents({})
    platform_npa = round((all_high / all_total) * 100, 2) if all_total else None

    top_quartile = None
    if all_total:
        skip_n = int(all_total * 0.75)
        top_doc = db.credit_scores.find(
            {}, {'score': 1, '_id': 0}
        ).sort('score', 1).skip(skip_n).limit(1)
        top_list = list(top_doc)
        if top_list:
            top_quartile = round(top_list[0]['score'], 1)

    state_pipeline = [
        {'$match': {'state': {'$exists': True, '$ne': None}}},
        {'$group': {
            '_id':       '$state',
            'avg_score': {'$avg': '$score'},
            'count':     {'$sum': 1},
        }},
        {'$match': {'count': {'$gte': 5}}},
        {'$sort': {'avg_score': -1}},
        {'$limit': 10},
    ]
    state_results = list(db.credit_scores.aggregate(state_pipeline))
    states = [
        {'state': r['_id'], 'score': round(r['avg_score'], 1)}
        for r in state_results
    ]

    # NOTE: there is no external NBFC/bank dataset in this deployment to
    # source real competitive benchmarks from. Previously this endpoint
    # synthesized "Low-tier/Mid-tier/Top-tier NBFCs" and "Banks" figures as
    # platform_avg plus/minus arbitrary hardcoded offsets and returned them
    # indistinguishably from the real your_avg/platform_avg numbers above —
    # that's exactly the kind of hardcoded-looking-like-real-data pattern
    # that should be avoided. Keep the illustrative comparison (it's still
    # useful context for the UI) but label it clearly as estimated.
    peer_data = [
        {'name': 'Low-tier NBFCs',  'score': round((platform_avg or 670) - 22, 1), 'estimated': True},
        {'name': 'Mid-tier NBFCs',  'score': round((platform_avg or 670) - 8,  1), 'estimated': True},
        {'name': 'Your platform',   'score': your_avg or platform_avg or 670,      'estimated': False},
        {'name': 'Top-tier NBFCs',  'score': round((platform_avg or 670) + 15, 1), 'estimated': True},
        {'name': 'Banks',           'score': round((platform_avg or 670) + 28, 1), 'estimated': True},
    ]

    return jsonify({
        'your_avg':      your_avg,
        'platform_avg':  platform_avg,
        'top_quartile':  top_quartile,
        'your_npa':      your_npa,
        'platform_npa':  platform_npa,
        'states':        states,
        'peer_data':     peer_data,
        'peer_data_note': ('Low-tier/Mid-tier/Top-tier NBFC and Bank figures are illustrative '
                            'estimates offset from your platform average — there is no external '
                            'competitor dataset behind them. Only "Your platform" is a real, '
                            'computed number.'),
    })


# ── CONSENT / COMPLIANCE ──────────────────────────────────────────────────────
@feature_bp.route('/consent/log', methods=['GET'])
def consent_log():
    email = email_from_token(request)
    if not email:
        return jsonify([])
    db   = get_db()
    raw_logs = list(db.consent.find({'tenant': email}, {'_id': 0}).sort('ts', -1).limit(50))
    logs = [
        {
            'user':    r.get('user_id', 'Unknown'),
            'modules': r.get('modules', []),
            'status':  r.get('status', 'active'),
            'date':    r['ts'].strftime('%d %b %Y') if hasattr(r.get('ts'), 'strftime') else str(r.get('ts', ''))[:10],
        }
        for r in raw_logs
    ]
    return jsonify(logs)


@feature_bp.route('/compliance/stats', methods=['GET'])
def compliance_stats():
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401
    try:
        db = get_db()
        export_count = db.compliance_exports.count_documents({'email': email})
    except Exception as e:
        print(f"⚠️ /compliance/stats failed (likely MongoDB connectivity/auth): {e}")
        return jsonify({'export_count': None}), 503
    return jsonify({'export_count': export_count})


@feature_bp.route('/consent/grant', methods=['POST'])
def grant_consent():
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401

    d = request.get_json(silent=True)
    if not d:
        return jsonify({'message': 'Request must be JSON'}), 400

    record = {
        'tenant':   email,
        'user_id':  d.get('user_id'),
        'modules':  d.get('modules', []),
        'status':   'active',
        'ts':       utcnow(),
    }
    get_db().consent.insert_one(record)
    return jsonify({'message': 'Consent recorded'})


@feature_bp.route('/consent/revoke', methods=['POST'])
def revoke_consent():
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401

    user_id = (request.get_json(silent=True) or {}).get('user_id')
    if not user_id:
        return jsonify({'message': 'user_id required'}), 400

    get_db().consent.update_many(
        {'tenant': email, 'user_id': user_id},
        {'$set': {'status': 'revoked', 'revoked_at': utcnow()}},
    )
    return jsonify({'message': 'Consent revoked'})


@feature_bp.route('/compliance/export', methods=['POST'])
def compliance_export():
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401

    try:
        db = get_db()
        model_version = os.getenv('MODEL_VERSION', 'unknown')

        bundle = {
            'generated_at':    utcnow().isoformat(),
            'tenant':          email,
            'model_version':   model_version,
            'dpdp_compliant':  True,
            'consent_records': list(db.consent.find(
                {'tenant': email}, {'_id': 0}
            )),
            'credit_decisions': list(db.bulk_jobs.find(
                {'email': email}, {'_id': 0, 'email': 0}
            ).sort('created_at', -1).limit(100)),
            'individual_scores': list(db.credit_scores.find(
                {'email': email}, {'_id': 0}
            ).sort('ts', -1).limit(500)),
        }

        db.compliance_exports.insert_one({
            'email': email,
            'ts':    utcnow(),
        })

        return jsonify(bundle)

    except Exception as e:
        print(f"⚠️ /compliance/export failed (likely MongoDB connectivity/auth): {e}")
        return jsonify({
            'message': 'Could not generate the audit bundle — the database connection failed. Please check your MongoDB connection and try again.'
        }), 503


# ── AI CHATBOT ────────────────────────────────────────────────────────────────

def _detect_intent(message: str):
    """
    Uses Claude to classify the user's intent from natural language.
    Falls back to keyword matching only if the API call fails.
    Returns one of: 'credit', 'explain', 'playbook', 'benchmark', 'quest', 'bulk', or None.
    """
    # FIX: no ANTHROPIC_API_KEY is configured anywhere in this deployment
    # (only GEMINI_API_KEY is set, used by /playbook). Without this guard,
    # every single chat message made a real network call to
    # api.anthropic.com that was guaranteed to fail (empty api-key header),
    # adding up to the full 5s timeout of latency before falling back to
    # the keyword matcher — which is perfectly adequate on its own. Skip
    # straight to it when no key is present.
    if not os.getenv("ANTHROPIC_API_KEY"):
        return _keyword_intent_fallback(message)

    try:
        import json as _json
        import urllib.request as _urllib

        system_prompt = (
            "You are an intent classifier for a fintech chatbot. "
            "Given a user message, return ONLY a JSON object with a single key 'intent'. "
            "The value must be exactly one of: "
            "'credit' (score assessment, loan eligibility, approval, risk, can I borrow, should I apply, am I eligible), "
            "'explain' (why is my score X, what factors, break down my result), "
            "'playbook' (financial plan, investing, SIP, retirement, savings goal, wealth), "
            "'benchmark' (compare to peers, industry average, NPA, platform stats), "
            "'quest' (tasks, XP, challenges, my progress, rewards), "
            "'bulk' (batch scoring, multiple applicants, dataset), "
            "'none' (anything else). "
            "Return only valid JSON. No explanation. No markdown. Example: {\"intent\": \"credit\"}"
        )

        payload = _json.dumps({
            "model":      "claude-sonnet-4-20250514",
            "max_tokens": 50,
            "system":     system_prompt,
            "messages":   [{"role": "user", "content": message}],
        }).encode("utf-8")

        req = _urllib.Request(
            "https://api.anthropic.com/v1/messages",
            data    = payload,
            headers = {
                "Content-Type":      "application/json",
                "x-api-key":         os.getenv("ANTHROPIC_API_KEY", ""),
                "anthropic-version": "2023-06-01",
            },
        )

        with _urllib.urlopen(req, timeout=5) as resp:
            data   = _json.loads(resp.read().decode("utf-8"))
            text   = data["content"][0]["text"].strip()
            result = _json.loads(text)
            intent = result.get("intent", "none")
            return None if intent == "none" else intent

    except Exception as e:
        print(f"⚠️  LLM intent detection failed, falling back to keywords: {e}")
        return _keyword_intent_fallback(message)


# Keyword fallback — only used if the LLM call fails
_INTENT_RULES = [
    ('bulk',      ['bulk', 'batch', 'multiple applicant', 'all applicant', 'dataset']),
    ('explain',   ['explain', 'why', 'reason', 'factor', 'what caused', 'break down']),
    ('playbook',  ['retire', 'invest', 'savings plan', 'financial plan', 'goal', 'sip', 'mutual fund', 'wealth']),
    ('benchmark', ['benchmark', 'compare', 'peer', 'industry average', 'npa', 'platform average']),
    ('quest',     ['quest', 'task', 'xp', 'challenge', 'reward', 'progress']),
    ('credit',    ['loan', 'credit', 'score', 'eligibility', 'borrow', 'approve', 'risk', 'lender',
                   'can i take', 'am i eligible', 'should i apply', 'assess']),
]


def _keyword_intent_fallback(message: str):
    lower = message.lower()
    for intent, keywords in _INTENT_RULES:
        if any(kw in lower for kw in keywords):
            return intent
    return None


def _load_credit_helpers():
    """
    Lazy-load credit helpers at call time instead of module import time.
    This prevents a failed model load from crashing the entire blueprint
    registration and causing 404s on every route in this file.
    Returns (prepare_input, compute_shap, model, shap_to_reasons, generate_recommendations)
    or raises ImportError with a clear message if the module can't be loaded.
    """
    try:
        from routes.credit_routes import (
            prepare_input,
            compute_shap,
            model,
            shap_to_reasons,
            generate_recommendations,
        )
        return prepare_input, compute_shap, model, shap_to_reasons, generate_recommendations
    except Exception as e:
        raise ImportError(f'Could not load credit helpers: {e}')


def _get_user_features(email: str, db) -> dict:
    user = db.users.find_one({'email': email}, {'_id': 0, 'password': 0})
    if not user:
        return {}

    monthly_income = float(user.get('monthly_income') or 0)
    annual_income  = monthly_income * 12
    existing_debt  = float(user.get('existing_debt') or 0)
    # FIX: signup() never actually asks for/stores a 'savings' field, so this
    # was always exactly 0 for every user, zeroing out R_SAVINGS_INCOME and
    # R_DEBT_SAVINGS regardless of the applicant. Fall back to a reasonable
    # estimate (consistent with the CreditScorePage form's own default)
    # rather than a guaranteed-wrong hard zero.
    savings = float(user.get('savings') or 0) or annual_income * 0.15

    features = {
        'INCOME':           annual_income,
        'SAVINGS':          savings,
        'DEBT':             existing_debt,
        'R_SAVINGS_INCOME': round(savings / annual_income, 4) if annual_income else 0,
        'R_DEBT_INCOME':    round(existing_debt / annual_income, 4) if annual_income else 0,
        'R_DEBT_SAVINGS':   round(existing_debt / savings, 4) if savings else 0,
    }

    # Remaining 79 transaction/category features default to 0 via prepare_input()
    return features


def _format_score_reply(score: float, risk: str, decision: str,
                        reasons: list, recommendations: list,
                        confidence: str = None, delta: dict = None) -> str:
    lines = [
        f"Credit score: {round(score, 1)} — {risk.upper()} RISK",
        f"Decision: {decision.upper()}",
    ]

    if confidence:
        lines.append(f"Confidence: {confidence.upper()}")

    if delta and delta.get('points', 0) > 0:
        lines.append(f"📍 {delta['message']}")

    lines.append("")

    if reasons:
        lines.append("Key factors:")
        lines.extend(f"  • {r}" for r in reasons)
        lines.append("")

    if recommendations:
        lines.append("Recommendations:")
        lines.extend(f"  {i+1}. {r}" for i, r in enumerate(recommendations))
        lines.append("")

    # Decision-aware follow-up — keeps conversation going
    if decision == 'approve':
        lines.append("✅ You're in good shape. Would you like me to match you with lenders?")
    elif decision == 'review':
        lines.append("💡 Would you like a personalised plan to close that gap and reach approval?")
    else:
        lines.append("🔄 Would you like a step-by-step recovery plan to reach the review threshold?")

    return "\n".join(lines)


@feature_bp.route('/chat', methods=['POST'])
def chat():
    d = request.get_json(silent=True)
    if not d:
        return jsonify({'message': 'Request must be JSON'}), 400

    message     = (d.get('message') or '').strip()
    last_result = d.get('last_result', {})

    if not message:
        return jsonify({'reply': 'Please send a message.'})

    email  = email_from_token(request)
    db     = get_db()
    intent = _detect_intent(message)

    # ── CREDIT SCORING ────────────────────────────────────────────────────────
    if intent == 'credit':
        try:
            prepare_input, compute_shap, model, shap_to_reasons, generate_recommendations = _load_credit_helpers()
        except ImportError as e:
            return jsonify({'reply': f'⚠️ Scoring module unavailable: {e}'}), 503

        if model is None:
            return jsonify({'reply': '⚠️ Scoring model is not available right now.'})

        features = _get_user_features(email, db) if email else {}

        inline = d.get('features', {})
        features.update({k: v for k, v in inline.items() if v is not None})

        if not features:
            return jsonify({
                'reply': (
                    "To assess your credit eligibility I need your financial profile. "
                    "Please complete your profile in Settings with:\n"
                    "  • Monthly income\n  • Existing debt\n"
                    "  • Employment type\n  • Credit history length"
                )
            })

        try:
            from routes.credit_routes import score_confidence, score_delta, _score_to_decision

            df         = prepare_input(features)
            score      = float(model.predict(df)[0])
            risk, decision = _score_to_decision(score)
            confidence = score_confidence(score)
            delta      = score_delta(score)

            shap_list  = compute_shap(df)
            top_shap   = dict(sorted(
                shap_list[0].items(), key=lambda x: abs(x[1]), reverse=True
            )[:5]) if shap_list[0] else {}

            reasons = shap_to_reasons(top_shap, raw_features=features)
            recs    = generate_recommendations(top_shap)
            reply   = _format_score_reply(score, risk, decision, reasons, recs, confidence, delta)

            if email:
                db.credit_scores.insert_one({
                    'email':      email,
                    'score':      score,
                    'risk':       risk,
                    'decision':   decision,
                    'confidence': confidence,
                    'shap':       top_shap,
                    'ts':         utcnow(),
                    'source':     'chat',
                })
                db.api_logs.insert_one({'email': email, 'endpoint': '/chat/credit', 'ts': utcnow()})

            return jsonify({
                'reply': reply,
                'structured': {
                    'score':           round(score, 1),
                    'risk':            risk,
                    'decision':        decision,
                    'confidence':      confidence,
                    'delta':           delta,
                    'shap':            top_shap,
                    'reasons':         reasons,
                    'recommendations': recs,
                },
            })

        except RuntimeError as e:
            return jsonify({'reply': f'⚠️ {e}'}), 503
        except Exception as e:
            print(f'Chat scoring error: {e}')
            return jsonify({'reply': '⚠️ Scoring failed. Please try again.'})

    # ── EXPLAIN LAST RESULT ───────────────────────────────────────────────────
    if intent == 'explain':
        try:
            _, _, _, shap_to_reasons, _ = _load_credit_helpers()
        except ImportError:
            shap_to_reasons = lambda d, top_n=3: []  # noqa: E731

        if not last_result and email:
            doc = db.credit_scores.find_one({'email': email}, sort=[('ts', -1)])
            if doc:
                last_result = {
                    'score': doc['score'], 'risk': doc['risk'],
                    'shap': doc.get('shap', {}),
                }

        if not last_result:
            return jsonify({
                'reply': "I don't have a recent result to explain. Ask me to assess your credit score first."
            })

        shap_vals = last_result.get('shap', {})
        reasons   = shap_to_reasons(shap_vals, top_n=5)
        score     = last_result.get('score', '—')
        risk      = last_result.get('risk', '—')

        lines = [
            f"Explanation for score {score} ({risk} risk):",
            "",
            "What drove this result:",
        ]
        lines.extend(f"  • {r}" for r in reasons) if reasons else lines.append("  No SHAP data available.")
        return jsonify({'reply': "\n".join(lines)})

    # ── PLAYBOOK ──────────────────────────────────────────────────────────────
    if intent == 'playbook':
        last_score = None
        if email:
            doc = db.credit_scores.find_one({'email': email}, sort=[('ts', -1)])
            if doc:
                last_score = doc['score']

        api_key = os.getenv('GEMINI_API_KEY')
        advice  = None

        if api_key:
            try:
                import google.generativeai as genai
                genai.configure(api_key=api_key)
                user        = db.users.find_one({'email': email}, {'_id': 0, 'password': 0}) if email else {}
                score_text  = f"Credit score: {round(last_score, 1)}/850." if last_score else ""
                profile_ctx = ", ".join(
                    f"{k.replace('_',' ')}: {v}"
                    for k, v in (user or {}).items()
                    if k in ('monthly_income', 'existing_debt', 'employment_type', 'loan_purpose') and v
                )
                prompt = (
                    f'You are a SEBI-certified financial planner in India. '
                    f'User message: "{message}". {score_text} '
                    f'{"Profile: " + profile_ctx + "." if profile_ctx else ""} '
                    f'Give a concise 4-step actionable plan with ₹ figures and SIP/NPS/ELSS specifics.'
                )
                advice = genai.GenerativeModel('gemini-1.5-flash').generate_content(prompt).text
            except Exception as e:
                print(f'Gemini error: {e}')

        if not advice:
            advice = (
                "Here's a quick financial plan:\n\n"
                "1. Emergency fund — 6 months of expenses in a liquid FD.\n"
                "2. Debt clearance — pay off anything above 12% interest first.\n"
                "3. SIP — 20% of income in a Nifty 50 index fund.\n"
                "4. Tax savings — max ELSS (80C) + NPS (80CCD1B).\n\n"
                "Share your monthly income for a personalised breakdown."
            )

        return jsonify({'reply': advice})

    # ── BENCHMARKS ────────────────────────────────────────────────────────────
    if intent == 'benchmark':
        your_avg     = None
        platform_avg = None

        if email:
            res = list(db.credit_scores.aggregate([
                {'$match': {'email': email}},
                {'$group': {'_id': None, 'avg': {'$avg': '$score'}}},
            ]))
            your_avg = round(res[0]['avg'], 1) if res else None

        res2 = list(db.credit_scores.aggregate([
            {'$group': {'_id': None, 'avg': {'$avg': '$score'}}}
        ]))
        platform_avg = round(res2[0]['avg'], 1) if res2 else None

        lines = ["Platform benchmark summary:", ""]
        if your_avg:
            lines.append(f"  • Your average score: {your_avg}")
        if platform_avg:
            lines.append(f"  • Platform average: {platform_avg}")
        if not your_avg and not platform_avg:
            lines.append("  No scoring data available yet. Run a credit score first.")
        lines.append("")
        lines.append("See the Benchmarks page for the full state-wise breakdown.")

        return jsonify({'reply': "\n".join(lines)})

    # ── QUEST STATUS ──────────────────────────────────────────────────────────
    if intent == 'quest':
        quests = []
        if email:
            doc    = db.quests.find_one({'email': email})
            quests = doc['quests'] if doc else []

        if not quests:
            return jsonify({'reply': "You haven't started any quests yet. Visit the Quests page to begin."})

        done  = [q for q in quests if q.get('done')]
        total = len(quests)
        next_q = next((q for q in quests if not q.get('done')), None)

        lines = [f"Quests: {len(done)}/{total} complete.", ""]
        if next_q:
            lines.append(f"Next: {next_q['title']} (+{next_q['xp']} XP)")
        return jsonify({'reply': "\n".join(lines)})

    # ── DEFAULT ───────────────────────────────────────────────────────────────
    return jsonify({
        'reply': (
            "I can help you with:\n\n"
            "  • Credit scoring — ask me to assess your eligibility\n"
            "  • Explain — why your score is what it is\n"
            "  • Financial planning — retirement, SIP, investing\n"
            "  • Benchmarks — how you compare to other platforms\n"
            "  • Quests — your progress and next tasks"
        )
    })