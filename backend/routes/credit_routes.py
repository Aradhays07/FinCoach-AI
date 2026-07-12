import os
import joblib
import pandas as pd
import shap
from flask import Blueprint, request, jsonify
from db import email_from_token, get_db
from datetime import datetime, timezone, timedelta

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

credit_bp = Blueprint("credit", __name__)

# ─── MODEL + SHAP EXPLAINER ───────────────────────────────────────────────────
model      = None
explainer  = None
model_path = os.path.join(
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
    "model.pkl",
)

try:
    model     = joblib.load(model_path)
    explainer = shap.TreeExplainer(model)
    print(f"✅ Model + SHAP loaded from {model_path}")
    print(f"   Features ({len(model.feature_names_in_)}): {list(model.feature_names_in_)}")
except FileNotFoundError:
    print(f"❌ model.pkl not found at: {model_path}")
except Exception as e:
    print(f"❌ Model / SHAP init failed: {e}")


# ─── INPUT PREPARATION ────────────────────────────────────────────────────────

def prepare_input(data) -> pd.DataFrame:
    if model is None:
        raise RuntimeError("Model is not loaded.")
    df = pd.DataFrame([data] if isinstance(data, dict) else data)
    df = pd.get_dummies(df)
    missing = set(model.feature_names_in_) - set(df.columns)
    if missing:
        df = pd.concat(
            [df, pd.DataFrame(0, index=df.index, columns=sorted(missing))],
            axis=1,
        )
    return df[model.feature_names_in_]


# ─── SHAP COMPUTATION ─────────────────────────────────────────────────────────

def compute_shap(df: pd.DataFrame) -> list:
    if explainer is None:
        return [{} for _ in range(len(df))]
    try:
        sv = explainer.shap_values(df)
        if isinstance(sv, list):
            sv = sv[1]  # positive class for binary classifiers
        return [
            {col: round(float(val), 4) for col, val in zip(df.columns, row)}
            for row in sv
        ]
    except Exception as e:
        print(f"⚠️  SHAP error: {e}")
        return [{} for _ in range(len(df))]


# ─── HUMAN-READABLE FEATURE NAMES ────────────────────────────────────────────

# Maps raw model feature names → plain English labels.
# Add any feature your model uses that needs a friendlier name.
# Anything not listed falls back to auto-formatting (underscores → spaces).
FEATURE_LABELS = {
    # Core financials
    'INCOME':               'income level',
    'SAVINGS':              'savings amount',
    'DEBT':                 'total debt',

    # Ratio features
    'R_SAVINGS_INCOME':     'savings-to-income ratio',
    'R_DEBT_INCOME':        'debt-to-income ratio',
    'R_DEBT_SAVINGS':       'debt-to-savings ratio',
    'R_EXPENDITURE':        'overall spending behaviour',
    'R_EXPENDITURE_INCOME': 'spending-to-income ratio',

    # Category ratios
    'R_GAMBLING':           'gambling spend',
    'R_GAMBLING_INCOME':    'gambling-to-income ratio',
    'R_GAMBLING_SAVINGS':   'gambling relative to savings',
    'R_GAMBLING_DEBT':      'gambling relative to debt',

    'R_HOUSING':            'housing costs',
    'R_HOUSING_INCOME':     'housing-to-income ratio',

    'R_HEALTH':             'healthcare spending',
    'R_HEALTH_INCOME':      'healthcare-to-income ratio',

    'R_EDUCATION':          'education spending',
    'R_EDUCATION_INCOME':   'education-to-income ratio',

    'R_CLOTHING':           'clothing spend',
    'R_CLOTHING_INCOME':    'clothing-to-income ratio',

    'R_ENTERTAINMENT':      'entertainment spend',
    'R_ENTERTAINMENT_INCOME': 'entertainment-to-income ratio',

    'R_GROCERIES':          'grocery spend',
    'R_GROCERIES_INCOME':   'grocery-to-income ratio',

    'R_TRAVEL':             'travel spend',
    'R_TRAVEL_INCOME':      'travel-to-income ratio',

    'R_UTILITIES':          'utilities spend',
    'R_UTILITIES_INCOME':   'utilities-to-income ratio',

    'R_TAX':                'tax payments',
    'R_TAX_INCOME':         'tax-to-income ratio',

    'R_FINES':              'fines and penalties',
    'R_FINES_INCOME':       'fines relative to income',

    # Transaction volume features
    'T_EXPENDITURE_12':     'total spending (last 12 months)',
    'T_EXPENDITURE_6':      'total spending (last 6 months)',

    # Categorical flags
    'CAT_DEBT':             'existing debt obligations',
    'CAT_CREDIT_CARD':      'credit card usage',
    'CAT_MORTGAGE':         'mortgage status',
    'CAT_SAVINGS_ACCOUNT':  'savings account presence',
    'CAT_DEPENDENTS':       'number of dependants',
    'CAT_GAMBLING_Low':     'low gambling activity',
    'CAT_GAMBLING_No':      'no gambling activity',
}

# Maps feature name keywords → actionable recommendation text.
# Keyed on substrings so one entry covers multiple related features.
RECOMMENDATION_RULES = [
    ('gambling',    'Reduce or eliminate gambling-related spending — lenders treat this as high risk.'),
    ('fines',       'Clear outstanding fines and penalties; they signal financial instability.'),
    ('debt_income', 'Work on reducing your debt-to-income ratio — aim below 0.4 for better approval odds.'),
    ('debt',        'Pay down existing debt to strengthen your credit profile.'),
    ('savings',     'Continue building your savings — a healthy savings buffer improves your score.'),
    ('income',      'Maintaining stable, consistent income will strengthen your credit profile.'),
    ('housing',     'Keep housing costs under 30% of income to stay in a healthy range.'),
    ('expenditure', 'Reduce unnecessary expenses to improve your net financial position.'),
    ('entertainment','Cut back on discretionary spending like entertainment to free up savings.'),
    ('travel',      'High travel spending can flag lifestyle risk — keep it proportionate to income.'),
    ('tax',         'Consistent tax payments demonstrate financial responsibility to lenders.'),
    ('credit_card', 'Keep credit card utilisation below 30% of your limit.'),
    ('mortgage',    'Maintaining your mortgage payments on time is critical for your score.'),
]


def clean_feature_name(feature: str) -> str:
    """Returns a human-readable label for a raw model feature name."""
    if feature in FEATURE_LABELS:
        return FEATURE_LABELS[feature]
    # Auto-format anything not explicitly mapped
    return feature.lower().replace('_', ' ').strip()


# ─── DYNAMIC REASON GENERATION ────────────────────────────────────────────────

def shap_to_reasons(shap_dict: dict, top_n: int = 3, raw_features: dict = None) -> list:
    """
    Generates plain-English reasons from SHAP values.
    Applies domain overrides where model output contradicts known financial logic
    (e.g. high debt-to-income ratio should never be positive).
    """
    if not shap_dict:
        return []

    # Domain overrides — force sign correction where model bias is known
    # These only flip the direction of the reason text, not the SHAP value itself
    DOMAIN_OVERRIDES = {
        'R_DEBT_INCOME':    lambda v, raw: -1 if (raw or {}).get('R_DEBT_INCOME', 0) > 0.4 else (1 if v > 0 else -1),
        'R_DEBT_SAVINGS':   lambda v, raw: -1 if (raw or {}).get('R_DEBT_SAVINGS', 0) > 1.0 else (1 if v > 0 else -1),
        'R_GAMBLING':       lambda v, raw: -1,   # gambling is always a negative signal
        'R_GAMBLING_INCOME':lambda v, raw: -1,
        'R_FINES':          lambda v, raw: -1,
        'R_FINES_INCOME':   lambda v, raw: -1,
    }

    top     = sorted(shap_dict.items(), key=lambda x: abs(x[1]), reverse=True)[:top_n]
    reasons = []

    for feature, value in top:
        name = clean_feature_name(feature)

        # Apply domain override if one exists for this feature
        if feature in DOMAIN_OVERRIDES:
            direction = DOMAIN_OVERRIDES[feature](value, raw_features)
        else:
            direction = 1 if value > 0 else -1

        if direction > 0:
            reasons.append(f"Your {name} is positively contributing to your credit profile.")
        else:
            reasons.append(f"Your {name} is negatively impacting your credit profile.")

    return reasons


# ─── CONFIDENCE + DELTA ───────────────────────────────────────────────────────

def score_confidence(score: float) -> str:
    """
    Returns confidence level based on how far the score is from decision boundaries.
    Scores near thresholds are uncertain; scores far from thresholds are high confidence.
    Thresholds read from env so they stay consistent with _score_to_decision.
    """
    approve_threshold = float(os.getenv("SCORE_THRESHOLD_APPROVE", 720))
    review_threshold  = float(os.getenv("SCORE_THRESHOLD_REVIEW",  600))

    # Distance from nearest boundary
    dist = min(
        abs(score - approve_threshold),
        abs(score - review_threshold),
    )

    if dist <= 20:
        return "low"       # right on the boundary — uncertain
    elif dist <= 60:
        return "moderate"
    else:
        return "high"


def score_delta(score: float) -> dict:
    """
    Returns how many points away the user is from the next decision level,
    and what that level is. Gives the single most actionable number.
    """
    approve_threshold = float(os.getenv("SCORE_THRESHOLD_APPROVE", 720))
    review_threshold  = float(os.getenv("SCORE_THRESHOLD_REVIEW",  600))

    if score >= approve_threshold:
        return {'points': 0, 'target': 'approved', 'message': "You've reached approval level."}
    elif score >= review_threshold:
        gap = round(approve_threshold - score, 1)
        return {'points': gap, 'target': 'approve', 'message': f"You're {gap} points away from automatic approval."}
    else:
        gap = round(review_threshold - score, 1)
        return {'points': gap, 'target': 'review', 'message': f"You're {gap} points away from the review threshold."}


# ─── DYNAMIC RECOMMENDATION ENGINE ───────────────────────────────────────────

def generate_recommendations(shap_dict: dict, top_n: int = 3) -> list:
    """
    Produces actionable recommendations driven entirely by SHAP output.
    Negative SHAP = hurting score → recommend improvement.
    Positive SHAP = helping score → recommend specific maintenance action,
                    never generic "keep it at the current level".
    Advice text comes from RECOMMENDATION_RULES — keyword matched against
    the feature name, so no feature name is hardcoded in the logic.
    Capped at 3 unique recommendations.
    """
    if not shap_dict:
        return []

    top  = sorted(shap_dict.items(), key=lambda x: abs(x[1]), reverse=True)[:top_n]
    recs = []

    # Positive (maintaining) advice per keyword — specific, not generic
    POSITIVE_RULES = {
        'debt':        'Maintain your current debt levels to preserve your eligibility.',
        'income':      'Stable income is helping — consider diversifying income sources for even better offers.',
        'savings':     'Keep growing your savings buffer — it directly strengthens lender confidence.',
        'gambling':    'Avoiding gambling spend is working in your favour — keep it that way.',
        'housing':     'Your housing costs are well-managed — maintain this ratio.',
        'expenditure': 'Your spending discipline is positive — continue monitoring monthly outflows.',
        'tax':         'Consistent tax payments signal financial reliability — keep this up.',
        'credit_card': 'Your credit card usage is healthy — keep utilisation below 30%.',
        'mortgage':    'On-time mortgage payments are a strong positive signal — protect this record.',
        'health':      'Your healthcare spending is proportionate — no action needed.',
        'education':   'Education investment is viewed positively by lenders — maintain it.',
    }

    for feature, value in top:
        feature_lower = feature.lower()
        matched       = False

        for keyword, neg_advice in RECOMMENDATION_RULES:
            if keyword in feature_lower:
                if value < 0:
                    recs.append(neg_advice)
                else:
                    # Use specific positive advice if available, else build one
                    pos = next(
                        (v for k, v in POSITIVE_RULES.items() if k in feature_lower),
                        None,
                    )
                    if pos:
                        recs.append(pos)
                    else:
                        name = clean_feature_name(feature)
                        recs.append(
                            f"Your {name} is contributing positively — "
                            f"monitor it monthly to ensure it stays on track."
                        )
                matched = True
                break

        if not matched:
            name = clean_feature_name(feature)
            if value < 0:
                recs.append(
                    f"Improving your {name} could raise your credit score. "
                    f"Focus on it over the next 90 days."
                )
            else:
                recs.append(
                    f"Your {name} is a positive factor — "
                    f"review it monthly to ensure it stays on track."
                )

    # Deduplicate while preserving order, cap at 3
    seen        = set()
    unique_recs = []
    for r in recs:
        if r not in seen:
            seen.add(r)
            unique_recs.append(r)
        if len(unique_recs) == 3:
            break

    return unique_recs


# ─── SCORE → DECISION (thresholds from env, not hardcoded) ───────────────────

def _score_to_decision(score: float) -> tuple:
    approve_threshold = float(os.getenv("SCORE_THRESHOLD_APPROVE", 720))
    review_threshold  = float(os.getenv("SCORE_THRESHOLD_REVIEW",  600))

    if score >= approve_threshold:
        return "low",    "approve"
    elif score >= review_threshold:
        return "medium", "review"
    else:
        return "high",   "reject"


# ─── SINGLE CREDIT SCORE ──────────────────────────────────────────────────────

@credit_bp.route("/creditscore", methods=["POST"])
def creditscore():
    if model is None:
        return jsonify({"message": "Model not loaded on server."}), 503

    # ── AUTH ─────────────────────────────────────────────────────────────────
    email = email_from_token(request)
    # Allow unauthenticated calls but only save to DB when authenticated

    d = request.get_json(silent=True)
    if not d:
        return jsonify({"message": "Request body must be valid JSON."}), 400

    include_shap = d.pop("include_shap", True)
    client_id    = d.pop("client_id", None)
    client_name  = d.pop("name", None)

    if not d:
        return jsonify({"message": "No feature data provided after removing meta-fields."}), 400

    try:
        df    = prepare_input(d)
        score = float(model.predict(df)[0])
        risk, decision = _score_to_decision(score)

        response = {
            "score":      round(score, 2),
            "risk":       risk,
            "decision":   decision,
            "confidence": score_confidence(score),
            "delta":      score_delta(score),
        }

        if include_shap:
            shap_list = compute_shap(df)
            top_shap  = dict(
                sorted(shap_list[0].items(), key=lambda x: abs(x[1]), reverse=True)[:5]
            )
            response["shap"]            = top_shap
            response["reasons"]         = shap_to_reasons(top_shap, raw_features=d)
            response["recommendations"] = generate_recommendations(top_shap)

        # ── PERSIST TO DB (only when authenticated) ───────────────────────────
        if email:
            try:
                db = get_db()
                import uuid
                cid = client_id or f"client_{uuid.uuid4().hex[:8]}"
                db.credit_scores.insert_one({
                    "email":     email,
                    "client_id": cid,
                    "name":      client_name,
                    "score":     round(score, 2),
                    "risk":      risk,
                    "decision":  decision,
                    "ts":        utcnow(),
                    # FIX: previously only score/risk/decision were persisted,
                    # so nothing about a decision could ever be re-explained,
                    # audited, or used to compute real metrics later — despite
                    # this product advertising a "credit decision log with
                    # SHAP" and DPDP audit trail. Store the full inputs.
                    "features":  d,
                    "shap":      response.get("shap"),
                })
                db.api_logs.insert_one({
                    "email":    email,
                    "endpoint": "/creditscore",
                    "ts":       utcnow(),
                })
            except Exception:
                pass  # Never let DB write failure break the scoring response

        return jsonify(response)

    except RuntimeError as e:
        return jsonify({"message": str(e)}), 503
    except Exception as e:
        return jsonify({"message": f"Scoring failed: {e}"}), 500


# ─── BULK SCORING ─────────────────────────────────────────────────────────────

@credit_bp.route("/bulk-score", methods=["POST"])
def bulk_score():
    if model is None:
        return jsonify({"message": "Model not loaded on server."}), 503

    email = email_from_token(request)
    d     = request.get_json(silent=True)
    if not d:
        return jsonify({"message": "Request body must be valid JSON."}), 400

    applicants   = d.get("applicants", [])
    include_shap = d.get("include_shap", False)
    webhook_url  = d.get("webhook_url", "")
    policy_id    = d.get("policy_id", "default")

    if not isinstance(applicants, list) or not applicants:
        return jsonify({"message": '"applicants" must be a non-empty list.'}), 400

    limit = int(os.getenv("BULK_SCORE_LIMIT", 1000))
    if len(applicants) > limit:
        return jsonify({"message": f"Max {limit} applicants per request."}), 400

    job_id = f"job_{os.urandom(4).hex()}"

    # FIX: previously the insert_one() below ran unguarded (and get_db()
    # itself now also raises on connectivity failure) — if MongoDB was
    # unreachable, the whole endpoint crashed before any scoring happened,
    # even though scoring itself doesn't need the DB at all.
    db_ok = True
    db = None
    try:
        db = get_db()
        db.bulk_jobs.insert_one({
            "job_id":       job_id,
            "email":        email,
            "status":       "processing",
            "total":        len(applicants),
            "webhook_url":  webhook_url,
            "policy_id":    policy_id,
            "include_shap": include_shap,
            "created_at":   utcnow(),
        })
        if email:
            db.api_logs.insert_one({"email": email, "endpoint": "/bulk-score", "ts": utcnow()})
    except Exception as e:
        db_ok = False
        print(f"⚠️ bulk-score: job tracking DB write failed, continuing without it: {e}")

    try:
        applicant_ids = [a.get("id", f"row_{i}") for i, a in enumerate(applicants)]
        features_list = [{k: v for k, v in a.items() if k != "id"} for a in applicants]

        df     = prepare_input(features_list)
        scores = model.predict(df).tolist()

        shap_list = compute_shap(df) if include_shap else [None] * len(applicants)

        results = []
        for idx, score in enumerate(scores):
            score_val      = float(score)
            risk, decision = _score_to_decision(score_val)

            record = {
                "id":       applicant_ids[idx],
                "score":    round(score_val, 2),
                "risk":     risk,
                "decision": decision,
            }

            if include_shap and shap_list[idx]:
                top_shap = dict(
                    sorted(shap_list[idx].items(), key=lambda x: abs(x[1]), reverse=True)[:5]
                )
                record["shap"]            = top_shap
                record["reasons"]         = shap_to_reasons(top_shap)
                record["recommendations"] = generate_recommendations(top_shap)

            results.append(record)

        if db_ok:
            try:
                db.bulk_jobs.update_one(
                    {"job_id": job_id},
                    {"$set": {"status": "completed", "processed": len(results), "results": results}},
                )
            except Exception as e:
                print(f"⚠️ bulk-score: could not persist completed status: {e}")

        # FIX: webhook_url was accepted, validated, and even stored on the job
        # record — but nothing ever actually posted to it. The UI advertises
        # "Results delivered via webhook", which was simply not true. Fire it
        # (best-effort — a webhook failure must never fail the API response,
        # since the caller is already getting results synchronously below).
        if webhook_url:
            try:
                import requests as _req
                _req.post(webhook_url, json={
                    "event":   "bulk_score.completed",
                    "job_id":  job_id,
                    "total":   len(results),
                    "results": results,
                }, timeout=5)
            except Exception as e:
                print(f"⚠️ bulk-score: webhook delivery to {webhook_url} failed: {e}")

        return jsonify({"job_id": job_id, "results": results, "total": len(results)})

    except Exception as e:
        if db_ok:
            try:
                db.bulk_jobs.update_one(
                    {"job_id": job_id},
                    {"$set": {"status": "failed", "error": str(e)}},
                )
            except Exception:
                pass  # don't let a secondary DB failure mask the real error
        return jsonify({"message": f"Bulk processing failed: {e}"}), 500


# ─── BULK JOB STATUS ──────────────────────────────────────────────────────────

@credit_bp.route("/bulk-score/<job_id>", methods=["GET"])
def get_bulk_job(job_id):
    try:
        db  = get_db()
        job = db.bulk_jobs.find_one({"job_id": job_id}, {"_id": 0, "email": 0})
    except Exception as e:
        return jsonify({"message": f"Could not retrieve job status — database connection failed: {e}"}), 503
    if not job:
        return jsonify({"message": "Job not found."}), 404
    return jsonify(job)

# ─── TRAJECTORY ENGINE ────────────────────────────────────────────────────────
# The core differentiator for the hackathon.
# Runs 12 counterfactual simulations on the negative SHAP factors,
# projects score improvement over 30/60/90 days, and outputs a milestone roadmap.

# ── TRAJECTORY ACTIONS ───────────────────────────────────────────────────────
# Maps model feature name substrings → improvement action metadata.
# Keys are lowercase substrings matched against actual SHAP feature names.
# Priority order matters: more specific keys are checked first in _keyword_for_feature.

TRAJECTORY_ACTIONS = {
    # Gambling — highest priority, biggest score impact
    'gambling':      { 'action': 'Eliminate all gambling transactions',                        'days': 15, 'effort': 'Low',    'category': 'Risk'       },

    # Tax — R_TAX_DEBT is the #1 negative factor for most borrowers
    'tax_debt':      { 'action': 'Clear outstanding tax liabilities and file pending GST returns', 'days': 45, 'effort': 'Medium', 'category': 'Tax'        },
    'tax':           { 'action': 'File GST returns consistently for 6 months',                 'days': 60, 'effort': 'Low',    'category': 'Compliance' },

    # Expenditure ratios
    'expenditure_debt': { 'action': 'Reduce total expenditure below 50% of income',           'days': 30, 'effort': 'Medium', 'category': 'Spending'   },
    'expenditure_sav':  { 'action': 'Cut discretionary spend to grow savings by 15%',         'days': 45, 'effort': 'Low',    'category': 'Spending'   },
    'expenditure':   { 'action': 'Reduce discretionary spend by 20%',                         'days': 30, 'effort': 'Low',    'category': 'Spending'   },

    # Savings — appears in most profiles
    'savings':       { 'action': 'Maintain a 3-month income buffer in a savings account',     'days': 45, 'effort': 'Low',    'category': 'Savings'    },

    # Debt categories
    'travel_debt':   { 'action': 'Avoid taking on new travel-related debt or EMIs',           'days': 30, 'effort': 'Low',    'category': 'Debt'       },
    'housing_debt':  { 'action': 'Consolidate housing loans to reduce monthly outflow',       'days': 60, 'effort': 'High',   'category': 'Debt'       },
    'utilities_debt':{ 'action': 'Clear utility bill arrears and set up auto-pay',            'days': 15, 'effort': 'Low',    'category': 'Debt'       },
    'clothing_debt': { 'action': 'Stop using credit for clothing purchases',                  'days': 15, 'effort': 'Low',    'category': 'Debt'       },
    'health_debt':   { 'action': 'Obtain health insurance to avoid medical debt',             'days': 30, 'effort': 'Medium', 'category': 'Insurance'  },
    'education_debt':{ 'action': 'Restructure education loan repayment schedule',             'days': 60, 'effort': 'Medium', 'category': 'Debt'       },
    'fines_debt':    { 'action': 'Clear all outstanding fines and legal dues immediately',    'days': 15, 'effort': 'Low',    'category': 'Compliance' },
    'debt':          { 'action': 'Reduce total outstanding debt by 20%',                      'days': 30, 'effort': 'Medium', 'category': 'Debt'       },

    # Spending categories (as ratio of income/debt)
    'clothing_sav':  { 'action': 'Reduce clothing spend to below 3% of monthly income',      'days': 30, 'effort': 'Low',    'category': 'Spending'   },
    'clothing':      { 'action': 'Cap clothing and apparel spend to ₹3,000/month',           'days': 30, 'effort': 'Low',    'category': 'Spending'   },
    'education':     { 'action': 'Seek employer-sponsored training instead of self-funding',  'days': 60, 'effort': 'Medium', 'category': 'Education'  },
    'entertainment': { 'action': 'Reduce entertainment spend to below 5% of income',         'days': 30, 'effort': 'Low',    'category': 'Spending'   },
    'travel':        { 'action': 'Limit travel expenses to business-only and document them',  'days': 30, 'effort': 'Low',    'category': 'Spending'   },
    'groceries':     { 'action': 'Use digital grocery payments to establish spending record', 'days': 30, 'effort': 'Low',    'category': 'Digital'    },
    'health':        { 'action': 'Obtain health insurance to reduce out-of-pocket health spend','days': 45,'effort': 'Medium','category': 'Insurance'  },
    'housing':       { 'action': 'Refinance housing loan at a lower rate',                    'days': 60, 'effort': 'High',   'category': 'Debt'       },
    'utilities':     { 'action': 'Switch to digital utility payments for verifiable history', 'days': 15, 'effort': 'Low',    'category': 'Digital'    },
    'fines':         { 'action': 'Clear all pending fines to remove negative markers',        'days': 15, 'effort': 'Low',    'category': 'Compliance' },

    # Income and core financials
    'income':        { 'action': 'Formalise revenue through GST invoicing to increase documented income', 'days': 60, 'effort': 'Medium', 'category': 'Revenue' },
    'mortgage':      { 'action': 'Avoid new secured liabilities for 90 days',                'days': 90, 'effort': 'Low',    'category': 'Debt'       },
}

IMPROVEMENT_RATES = {
    'gambling': 1.0,  'tax_debt': 0.40, 'tax': 0.20,
    'expenditure_debt': 0.25, 'expenditure_sav': 0.20, 'expenditure': 0.20,
    'savings': 0.25,
    'travel_debt': 0.30, 'housing_debt': 0.15, 'utilities_debt': 0.50,
    'clothing_debt': 0.40, 'health_debt': 0.20, 'education_debt': 0.20,
    'fines_debt': 0.80, 'debt': 0.20,
    'clothing_sav': 0.30, 'clothing': 0.30, 'education': 0.20,
    'entertainment': 0.25, 'travel': 0.25, 'groceries': 0.10,
    'health': 0.15, 'housing': 0.10, 'utilities': 0.20, 'fines': 0.60,
    'income': 0.15, 'mortgage': 0.10,
}


def _keyword_for_feature(feature_name: str) -> str:
    name_lower = feature_name.lower()
    # Check longer (more specific) keys first to avoid 'debt' matching 'tax_debt' prematurely
    sorted_keys = sorted(TRAJECTORY_ACTIONS.keys(), key=len, reverse=True)
    for kw in sorted_keys:
        if kw in name_lower:
            return kw
    return None


def run_trajectory(features: dict, shap_dict: dict, current_score: float, ntc: bool = False) -> dict:
    """
    Given current features + SHAP values:
    1. Identify top 3 negative SHAP features (dragging score down)
    2. For each, simulate improving that feature by IMPROVEMENT_RATES[kw]
    3. Score each simulation, compute point gain
    4. Build a 30/60/90 day timeline projecting cumulative improvement
    5. Return milestone roadmap + trajectory chart data
    """
    if model is None:
        return {}

    approve_threshold = float(os.getenv('SCORE_THRESHOLD_APPROVE', 720))
    review_threshold  = float(os.getenv('SCORE_THRESHOLD_REVIEW',  600))
    ntc_threshold     = 600.0  # thin-file relaxed threshold

    # Step 1: top negative SHAP factors
    neg_factors = sorted(
        [(k, v) for k, v in shap_dict.items() if v < 0],
        key=lambda x: x[1]
    )[:5]

    milestones   = []
    point_gains  = {}
    used_actions = set()

    # Step 2+3: simulate each improvement
    for feat_name, shap_val in neg_factors:
        kw = _keyword_for_feature(feat_name)
        if not kw or kw in used_actions:
            continue

        action_meta  = TRAJECTORY_ACTIONS.get(kw)
        improve_rate = IMPROVEMENT_RATES.get(kw, 0.10)
        if not action_meta:
            continue

        # Build counterfactual: improve the offending feature
        sim_features = dict(features)
        feat_val = float(sim_features.get(feat_name, 0) or 0)

        if kw == 'gambling':
            sim_features[feat_name] = 0
            sim_features['R_GAMBLING']       = 0
            sim_features['R_GAMBLING_INCOME'] = 0
            sim_features['CAT_GAMBLING_No']   = 1
            sim_features['CAT_GAMBLING_Low']  = 0
        elif kw == 'debt':
            reduction = feat_val * improve_rate
            sim_features[feat_name] = max(0, feat_val - reduction)
            income = float(sim_features.get('INCOME', 1) or 1)
            sim_features['R_DEBT_INCOME']   = sim_features[feat_name] / income
            sim_features['R_DEBT_SAVINGS']  = sim_features[feat_name] / max(float(sim_features.get('SAVINGS', 1) or 1), 1)
        elif kw == 'income':
            gain = feat_val * improve_rate
            sim_features[feat_name] = feat_val + gain
            debt    = float(sim_features.get('DEBT', 0) or 0)
            savings = float(sim_features.get('SAVINGS', 0) or 0)
            new_inc = sim_features[feat_name]
            sim_features['R_DEBT_INCOME']        = debt    / max(new_inc, 1)
            sim_features['R_SAVINGS_INCOME']     = savings / max(new_inc, 1)
            sim_features['R_EXPENDITURE_INCOME'] = float(sim_features.get('T_EXPENDITURE_12', 0) or 0) / max(new_inc, 1)
        elif kw == 'savings':
            gain = (float(sim_features.get('INCOME', 600000) or 600000) * improve_rate)
            sim_features[feat_name] = feat_val + gain
            income = float(sim_features.get('INCOME', 1) or 1)
            sim_features['R_SAVINGS_INCOME'] = sim_features[feat_name] / income
            sim_features['R_DEBT_SAVINGS']   = float(sim_features.get('DEBT', 0) or 0) / max(sim_features[feat_name], 1)
        elif kw == 'expenditure':
            sim_features[feat_name] = feat_val * (1 - improve_rate)
            if 'T_EXPENDITURE_6' in sim_features:
                sim_features['T_EXPENDITURE_6'] = sim_features[feat_name] / 2
            income = float(sim_features.get('INCOME', 1) or 1)
            sim_features['R_EXPENDITURE']        = sim_features[feat_name] / income
            sim_features['R_EXPENDITURE_INCOME'] = sim_features[feat_name] / income
        else:
            # Don't guess direction from the keyword (increasing a spend-ratio
            # like R_TRAVEL_DEBT or R_CLOTHING to "improve" it is usually
            # backwards). Ask the model directly: nudge the feature both ways
            # and keep whichever direction it actually rewards.
            step = feat_val * improve_rate if feat_val != 0 else improve_rate
            probe_up   = dict(sim_features); probe_up[feat_name]   = max(0, feat_val + step)
            probe_down = dict(sim_features); probe_down[feat_name] = max(0, feat_val - step)
            try:
                score_up   = float(model.predict(prepare_input(probe_up))[0])
                score_down = float(model.predict(prepare_input(probe_down))[0])
            except Exception:
                score_up = score_down = current_score
            sim_features[feat_name] = (
                probe_up[feat_name] if score_up >= score_down else probe_down[feat_name]
            )

        try:
            sim_df    = prepare_input(sim_features)
            sim_score = float(model.predict(sim_df)[0])
            gain      = round(sim_score - current_score, 1)
            if gain <= 0:
                continue

            milestones.append({
                'action':    action_meta['action'],
                'category':  action_meta['category'],
                'effort':    action_meta['effort'],
                'days':      action_meta['days'],
                'gain':      gain,
                'new_score': round(current_score + gain, 1),
                'feature':   feat_name,
            })
            point_gains[kw] = gain
            used_actions.add(kw)
        except Exception:
            continue

    # Step 4: build 30/60/90 day trajectory
    milestones.sort(key=lambda m: (m['days'], -m['gain']))
    top3 = milestones[:3]

    # Project cumulative score at each checkpoint
    def cumulative_at_day(day_limit):
        total = sum(m['gain'] for m in top3 if m['days'] <= day_limit)
        return round(min(850, current_score + total), 1)

    trajectory = [
        { 'day': 0,  'score': round(current_score, 1), 'label': 'Today'   },
        { 'day': 30, 'score': cumulative_at_day(30),   'label': '30 days' },
        { 'day': 60, 'score': cumulative_at_day(60),   'label': '60 days' },
        { 'day': 90, 'score': cumulative_at_day(90),   'label': '90 days' },
    ]

    projected_90d = trajectory[-1]['score']
    approval_in   = None
    for t in trajectory:
        if t['score'] >= approve_threshold:
            approval_in = t['day']
            break

    # NTC adjustment note
    is_ntc       = ntc or (current_score < ntc_threshold)
    ntc_note     = "NTC/NTB profile detected — relaxed threshold of 600 applies." if is_ntc else None
    target_score = ntc_threshold if is_ntc else approve_threshold

    status = 'on_track' if projected_90d >= target_score else \
             'improving' if projected_90d > current_score + 20 else 'needs_work'

    return {
        'current_score':    round(current_score, 1),
        'target_score':     target_score,
        'projected_90d':    projected_90d,
        'points_needed':    max(0, round(target_score - current_score, 1)),
        'approval_in_days': approval_in,
        'status':           status,
        'trajectory':       trajectory,
        'milestones':       top3,
        'ntc_flag':         is_ntc,
        'ntc_note':         ntc_note,
    }


@credit_bp.route('/trajectory', methods=['POST'])
def trajectory():
    """
    POST body: same feature set as /creditscore
    Returns trajectory roadmap, milestone actions, and projected score at 30/60/90 days.
    Optionally accepts `shap` dict if caller already has it (avoids re-running SHAP).
    """
    if model is None:
        return jsonify({'message': 'Model not loaded.'}), 503

    d = request.get_json(silent=True)
    if not d:
        return jsonify({'message': 'Request body must be valid JSON.'}), 400

    precomputed_shap = d.pop('shap', None)
    ntc_flag = bool(d.pop('ntc', False))

    try:
        features = dict(d)
        df       = prepare_input(features)
        score    = float(model.predict(df)[0])

        # Use precomputed SHAP if provided, else compute fresh
        if precomputed_shap:
            shap_dict = precomputed_shap
        else:
            shap_list = compute_shap(df)
            shap_dict = dict(
                sorted(shap_list[0].items(), key=lambda x: abs(x[1]), reverse=True)[:8]
            )

        # FIX: pass ntc_flag directly to run_trajectory — no os.environ mutation
        result = run_trajectory(features, shap_dict, score, ntc=ntc_flag)
        # Include score + risk in response so frontend needs only 1 API call
        risk, decision = _score_to_decision(score)
        result['score']    = round(score, 2)
        result['risk']     = risk
        result['decision'] = decision
        result['shap']     = shap_dict
        return jsonify(result)

    except RuntimeError as e:
        return jsonify({'message': str(e)}), 503
    except Exception as e:
        return jsonify({'message': f'Trajectory failed: {e}'}), 500


# ─── MODEL METRICS (proof-of-calculation) ─────────────────────────────────────
# Every number below is measured live against the actual trained model and/or
# real stored data at request time — nothing here is a hardcoded marketing
# figure. This directly replaces the static "94% accuracy" / "0.7ms/rec" /
# "99.2%" strings that were previously hardcoded in the frontend.

# A single realistic, representative feature vector used purely to warm up /
# benchmark the model when no real applicant data exists yet. Clearly a
# synthetic profile, not a claim about any real borrower.
_BENCHMARK_FEATURES = {
    'INCOME': 720000, 'DEBT': 180000, 'SAVINGS': 108000,
    'R_DEBT_INCOME': 0.25, 'R_SAVINGS_INCOME': 0.15, 'R_DEBT_SAVINGS': 1.67,
    'T_HOUSING_12': 144000, 'R_HOUSING': 0.2, 'R_HOUSING_INCOME': 0.2,
    'T_GROCERIES_12': 96000, 'R_GROCERIES': 0.13, 'R_GROCERIES_INCOME': 0.13,
    'T_EXPENDITURE_12': 432000, 'R_EXPENDITURE': 0.6, 'R_EXPENDITURE_INCOME': 0.6,
    'R_GAMBLING': 0, 'R_GAMBLING_INCOME': 0,
    'CAT_DEBT': 1, 'CAT_CREDIT_CARD': 1, 'CAT_SAVINGS_ACCOUNT': 1,
    'CAT_GAMBLING_No': 1,
}

def _synthetic_rejected_sample():
    """
    8 representative thin-file / low-score profiles, used ONLY when there is
    no real stored applicant data to sample from (cold-start / fresh demo).
    Clearly labelled as synthetic in the API response — never presented as
    real applicant outcomes.
    """
    base = []
    for i in range(8):
        income = 250000 + i * 30000
        debt   = income * (0.55 - i * 0.02)
        savings = income * 0.03
        base.append({
            'features': {
                'INCOME': income, 'DEBT': debt, 'SAVINGS': savings,
                'R_DEBT_INCOME': debt / income, 'R_SAVINGS_INCOME': savings / income,
                'R_DEBT_SAVINGS': debt / max(savings, 1),
                'T_HOUSING_12': income * 0.35, 'R_HOUSING': 0.35, 'R_HOUSING_INCOME': 0.35,
                'T_EXPENDITURE_12': income * 0.75, 'R_EXPENDITURE': 0.75, 'R_EXPENDITURE_INCOME': 0.75,
                'R_GAMBLING': 0.01 * i, 'R_GAMBLING_INCOME': 0.01 * i,
                'CAT_DEBT': 1, 'CAT_CREDIT_CARD': 0, 'CAT_SAVINGS_ACCOUNT': 1,
                'CAT_GAMBLING_No': 1 if i == 0 else 0,
            }
        })
    return base


def _compute_ntc_uplift(db):
    approve_threshold = float(os.getenv('SCORE_THRESHOLD_APPROVE', 720))
    review_threshold  = float(os.getenv('SCORE_THRESHOLD_REVIEW', 600))

    samples = []
    source  = 'real stored applicant records (score < 600)'
    if db is not None:
        try:
            samples = list(
                db.credit_scores.find(
                    {'score': {'$lt': review_threshold}, 'features': {'$exists': True}},
                    {'_id': 0}
                ).limit(40)
            )
        except Exception:
            samples = []

    if len(samples) < 5:
        samples = _synthetic_rejected_sample()
        source  = 'synthetic representative thin-file profiles (fewer than 5 real scored+rejected applicants with stored feature vectors were found — score real applicants to replace this with a live number)'

    standard_pass, ntc_pass, n = 0, 0, 0
    for rec in samples:
        features = rec.get('features')
        if not features:
            continue
        try:
            df    = prepare_input(features)
            score = float(model.predict(df)[0])
            shap_list = compute_shap(df)
            shap_dict = dict(sorted(shap_list[0].items(), key=lambda x: abs(x[1]), reverse=True)[:8])

            traj_standard = run_trajectory(features, shap_dict, score, ntc=False)
            traj_ntc      = run_trajectory(features, shap_dict, score, ntc=True)

            if traj_standard.get('projected_90d', 0) >= approve_threshold:
                standard_pass += 1
            if traj_ntc.get('projected_90d', 0) >= traj_ntc.get('target_score', review_threshold):
                ntc_pass += 1
            n += 1
        except Exception:
            continue

    if n == 0:
        return {
            'available': False,
            'reason': 'No applicant records with usable feature vectors were available to simulate against.',
        }

    standard_rate = round(100 * standard_pass / n, 1)
    ntc_rate      = round(100 * ntc_pass / n, 1)
    return {
        'available': True,
        'sample_size': n,
        'sample_source': source,
        'standard_policy_90d_viability_pct': standard_rate,
        'ntc_relaxed_policy_90d_viability_pct': ntc_rate,
        'uplift_pct_points': round(ntc_rate - standard_rate, 1),
        'method': ('For each currently-rejected (score < 600) applicant, run the trajectory '
                   'engine twice — once against the standard 720-point target, once against '
                   'the relaxed 600-point NTC target — and compare the share who become '
                   'viable within 90 days under each policy.'),
    }


@credit_bp.route('/model/metrics', methods=['GET'])
def model_metrics():
    if model is None:
        return jsonify({'message': 'Model not loaded on server.'}), 503

    import time as _time
    import statistics as _stats

    db = None
    try:
        db = get_db()  # now actually raises if Mongo is unreachable — see db.py
    except Exception as e:
        print(f"⚠️ /model/metrics: MongoDB unreachable, skipping DB-backed sections: {e}")

    # ---- 1. Model latency — live-measured, not a hardcoded figure ----------
    n_runs = 25
    latencies_ms = []
    for _ in range(n_runs):
        t0 = _time.perf_counter()
        df = prepare_input(_BENCHMARK_FEATURES)
        model.predict(df)
        compute_shap(df)
        latencies_ms.append((_time.perf_counter() - t0) * 1000)
    latencies_ms.sort()

    def _pct(p):
        idx = min(len(latencies_ms) - 1, int(len(latencies_ms) * p))
        return round(latencies_ms[idx], 2)

    latency = {
        'unit': 'ms',
        'samples': n_runs,
        'mean': round(_stats.mean(latencies_ms), 2),
        'p50':  _pct(0.50),
        'p95':  _pct(0.95),
        'min':  round(min(latencies_ms), 2),
        'max':  round(max(latencies_ms), 2),
        'includes': 'model.predict() + full SHAP explanation, end to end, per request',
    }

    # ---- 2. Explainability coverage ----------------------------------------
    feature_count   = len(model.feature_names_in_)
    df0             = prepare_input(_BENCHMARK_FEATURES)
    shap_vec        = compute_shap(df0)[0]
    feature_level   = round(100.0 * len(shap_vec) / feature_count, 1)

    decision_level = None
    if db is not None:
        try:
            total = db.credit_scores.count_documents({})
            with_shap = db.credit_scores.count_documents({'shap': {'$exists': True, '$ne': None}})
            decision_level = {
                'total_scored_records': total,
                'records_with_stored_shap': with_shap,
                'coverage_pct': round(100.0 * with_shap / total, 1) if total else None,
                'note': ('Prior to this fix, credit_scores only persisted score/risk/decision — '
                         'SHAP factors were computed but discarded, so historical decisions '
                         'could not be re-explained or audited. Now persisted going forward; '
                         'older records will show as not covered.'),
            }
        except Exception:
            pass

    explainability = {
        'feature_level_coverage_pct': feature_level,
        'feature_count': feature_count,
        'method': 'TreeExplainer SHAP — every one of the model\'s features receives an individual attribution on every scored request',
        'decision_level': decision_level,
    }

    # ---- 3. NTC approval uplift --------------------------------------------
    ntc = _compute_ntc_uplift(db)

    # ---- 4. Scoring accuracy — HONEST: no ground-truth labels exist here ---
    accuracy = {
        'available': False,
        'reason': ('This deployment has no held-out labelled validation set (real loan '
                    'repayment/default outcomes) bundled with it, so a true accuracy, R², '
                    'or MAE figure cannot be computed or honestly claimed right now. Any '
                    '"94% accuracy" figure shown elsewhere in this app was a hardcoded '
                    'placeholder, not derived from real evaluation — it should be removed '
                    'or replaced with output from this endpoint.'),
        'how_to_get_a_real_number': 'POST {"records":[{"features":{...},"actual_score":NNN}, ...]} to /model/validate with real historical outcomes and this will return true R² and MAE against your model.',
    }

    return jsonify({
        'generated_at': utcnow().isoformat(),
        'model_latency': latency,
        'explainability_coverage': explainability,
        'ntc_approval_uplift': ntc,
        'scoring_accuracy': accuracy,
    })


@credit_bp.route('/model/validate', methods=['POST'])
def model_validate():
    """
    Computes REAL scoring accuracy against user-supplied ground truth —
    the only honest way to produce that number, since none exists on its own.
    Body: {"records": [{"features": {...}, "actual_score": 712.0}, ...]}
    (actual_score = the real, known-correct score/outcome for that applicant,
    e.g. from a backtest against actual repayment history.)
    """
    if model is None:
        return jsonify({'message': 'Model not loaded on server.'}), 503

    d = request.get_json(silent=True) or {}
    records = d.get('records') or []
    if len(records) < 2:
        return jsonify({'message': 'Provide at least 2 labelled records: [{"features": {...}, "actual_score": <number>}, ...]'}), 400

    preds, actuals = [], []
    skipped = 0
    for rec in records:
        feats = rec.get('features')
        actual = rec.get('actual_score')
        if not feats or actual is None:
            skipped += 1
            continue
        try:
            df = prepare_input(feats)
            preds.append(float(model.predict(df)[0]))
            actuals.append(float(actual))
        except Exception:
            skipped += 1

    if len(preds) < 2:
        return jsonify({'message': 'Not enough valid records to compute metrics.'}), 400

    n = len(preds)
    mean_actual = sum(actuals) / n
    ss_res = sum((a - p) ** 2 for a, p in zip(actuals, preds))
    ss_tot = sum((a - mean_actual) ** 2 for a in actuals) or 1e-9
    r2  = 1 - ss_res / ss_tot
    mae = sum(abs(a - p) for a, p in zip(actuals, preds)) / n
    rmse = (ss_res / n) ** 0.5

    # If actual_score values look like a binary/threshold outcome (0/1),
    # also report classification accuracy at the standard approve threshold.
    approve_threshold = float(os.getenv('SCORE_THRESHOLD_APPROVE', 720))
    is_binary = set(actuals) <= {0.0, 1.0}
    classification = None
    if is_binary:
        correct = sum(
            1 for a, p in zip(actuals, preds)
            if (p >= approve_threshold) == bool(a)
        )
        classification = {'accuracy_pct': round(100 * correct / n, 1), 'threshold_used': approve_threshold}

    return jsonify({
        'n_records': n,
        'skipped_records': skipped,
        'r2': round(r2, 4),
        'mae': round(mae, 2),
        'rmse': round(rmse, 2),
        'classification': classification,
        'method': 'Computed directly against the provided ground-truth records — no held-out set is fabricated or assumed.',
    })

