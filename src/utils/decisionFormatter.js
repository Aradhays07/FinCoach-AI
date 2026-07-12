/**
 * decisionFormatter.js
 * Converts raw API responses into a standardized DecisionObject.
 *
 * DecisionObject: { status, confidence, risk, score, factors, actions, raw }
 */

function deriveStatus(risk) {
  if (risk === 'low')  return 'approve';
  if (risk === 'high') return 'reject';
  return 'review';
}

function deriveConfidence(score, risk) {
  if (score == null) return 65;
  // FIX: previously only capped the upper bound (Math.min), so a score/risk
  // pairing that shouldn't normally occur (e.g. via the fallback in
  // fromBulkRecord below) could drive this below 0 or above 100. Clamp both.
  const clamp = (v) => Math.max(0, Math.min(100, v));
  if (risk === 'low')    return Math.round(clamp(80 + Math.min(16, ((score - 700) / 150) * 16)));
  if (risk === 'high')   return Math.round(clamp(62 + Math.min(16, ((579 - score) / 279) * 16)));
  return Math.round(clamp(60 + Math.min(19, ((score - 580) / 119) * 19)));
}

/**
 * Clean a raw model feature key into a human-readable label.
 * Handles: ~R prefix, R_ prefix, T_ prefix, CAT_ prefix, underscores.
 * e.g. "~R DEBT_INCOME" → "Debt Income"
 *      "R_DEBT_INCOME"  → "Debt Income"
 *      "T_EXPENDITURE_12" → "Expenditure 12"
 *      "CAT_GAMBLING_No"  → "Gambling No"
 */
function cleanFeatureName(k) {
  return k
    .replace(/^~[A-Z]\s*/,  '')   // remove ~R / ~T etc prefix
    .replace(/^R_|^T_|^CAT_/, '') // remove R_ T_ CAT_ prefix
    .replace(/_/g, ' ')            // underscores → spaces
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase()); // title case
}

function extractFactors(shap) {
  if (!shap || typeof shap !== 'object') return { positive:[], negative:[] };
  const entries = Object.entries(shap);
  const positive = entries
    .filter(([, v]) => Number(v) > 0)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .map(([k]) => cleanFeatureName(k));
  const negative = entries
    .filter(([, v]) => Number(v) < 0)
    .sort(([, a], [, b]) => Number(a) - Number(b))
    .map(([k]) => cleanFeatureName(k));
  return { positive, negative };
}

const ACTIONS = {
  approve: [
    'Proceed with standard loan offer',
    'Apply preferred interest rate tier',
    'Initiate KYC verification',
  ],
  review: [
    'Verify employment and income documentation',
    'Check recent credit enquiries in the last 6 months',
    'Consider loan disbursement at 80% of requested amount',
  ],
  reject: [
    'Request additional collateral or guarantor',
    'Offer a secured loan product instead',
    'Recommend credit improvement plan and reassess in 90 days',
  ],
};

export function fromCreditScoreResponse(apiResponse) {
  if (!apiResponse || typeof apiResponse !== 'object') throw new Error('Invalid API response');
  const { score, risk, shap } = apiResponse;
  if (score == null || !risk) throw new Error('API response missing score or risk');
  const normRisk = ['low','medium','high'].includes(risk) ? risk : 'medium';
  const status   = deriveStatus(normRisk);
  return {
    status,
    confidence: deriveConfidence(score, normRisk),
    risk:       normRisk,
    score,
    factors:    extractFactors(shap),
    actions:    ACTIONS[status],
    raw:        apiResponse,
  };
}

export function fromBulkRecord(record) {
  if (!record || record.score == null) throw new Error('Invalid bulk record');
  // Fallback thresholds match the backend's real _score_to_decision bands
  // (720/600) — the API always returns `risk` in practice, so this only
  // matters for malformed/partial records, but it should still agree with
  // the actual system rather than a different, arbitrary pair of numbers.
  return fromCreditScoreResponse({
    score: record.score,
    risk:  record.risk ?? (record.score >= 720 ? 'low' : record.score >= 600 ? 'medium' : 'high'),
    shap:  record.shap ?? {},
  });
}

export function fromMatchRecord(match) {
  if (!match || match.match_pct == null) throw new Error('Invalid match record');
  const confidence = Math.round(match.match_pct);
  const risk       = confidence >= 85 ? 'low' : confidence >= 65 ? 'medium' : 'high';
  const status     = deriveStatus(risk);
  return {
    status, confidence, risk, score:null,
    factors:{ positive:[`Strong fit: ${match.type ?? 'NBFC'}`], negative:[] },
    actions:[`Proceed with ${match.name ?? 'lender'} — ref. fee applies on disbursal`],
    raw: match,
  };
}
