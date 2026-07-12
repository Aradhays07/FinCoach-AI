/**
 * api/index.js
 *
 * Fixes applied:
 *  - 401 responses now throw 'Unauthorised' explicitly (was throwing data.message
 *    which could be undefined, making isAuthError() miss it in useApi)
 *  - All other error handling unchanged
 */
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function req(path, opts = {}) {
  const token = localStorage.getItem('fc_token');
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  const data = await res.json();
  // FIX: explicit 401 message so isAuthError() in useApi always catches it
  if (res.status === 401) {
    // JWTs expire after 7 days; previously nothing told the rest of the app
    // this happened, so every protected screen would just render blank/'—'
    // after expiry. Broadcast so AuthContext can log out + redirect to
    // /login with a clear explanation.
    window.dispatchEvent(new CustomEvent('fc:unauthorized'));
    throw new Error('Unauthorised');
  }
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export const api = {
  signup:             (b)  => req('/signup',                    { method: 'POST', body: JSON.stringify(b) }),
  login:              (b)  => req('/login',                     { method: 'POST', body: JSON.stringify(b) }),
  profile:            ()   => req('/home'),
  creditScore:        (b)  => req('/creditscore',               { method: 'POST', body: JSON.stringify(b) }),
  tracker:            ()   => req('/tracker'),
  quests:             ()   => req('/quest'),
  updateQuest:        (b)  => req('/quest',                     { method: 'POST', body: JSON.stringify(b) }),
  playbook:           (b)  => req('/playbook',                  { method: 'POST', body: JSON.stringify(b) }),
  bulkScore:          (b)  => req('/bulk-score',                { method: 'POST', body: JSON.stringify(b) }),
  matchLenders:       (b)  => req('/match-lenders',             { method: 'POST', body: JSON.stringify(b) }),
  matchLendersStats:  ()   => req('/match-lenders/stats'),
  zapierWebhooks:     ()   => req('/zapier/webhooks'),
  addZapierWebhook:   (b)  => req('/zapier/webhooks',           { method: 'POST', body: JSON.stringify(b) }),
  deleteZapierWebhook:(id) => req(`/zapier/webhooks/${id}`,     { method: 'DELETE' }),
  testZapierWebhook:  (id) => req(`/zapier/webhooks/${id}/test`,{ method: 'POST' }),
  consentLog:         ()   => req('/consent/log'),
  complianceStats:    ()   => req('/compliance/stats'),
  benchmarks:         ()   => req('/benchmarks'),
  recentPlaybooks:    ()   => req('/playbook/history'),
  trajectory:         (b)  => req('/trajectory',        { method: 'POST', body: JSON.stringify(b) }),
  modelMetrics:       ()   => req('/model/metrics'),
  validateModel:      (b)  => req('/model/validate',            { method: 'POST', body: JSON.stringify(b) }),
  complianceExport:   ()   => req('/compliance/export',         { method: 'POST' }),
};
