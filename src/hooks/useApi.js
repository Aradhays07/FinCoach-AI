import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';

const STRUCTURAL_MOCK = {
  tracker: {
    records: [
      { month:'Dec', score:668, calls:94,  bulk_jobs:3 },
      { month:'Jan', score:674, calls:118, bulk_jobs:4 },
      { month:'Feb', score:681, calls:142, bulk_jobs:5 },
      { month:'Mar', score:689, calls:163, bulk_jobs:6 },
      { month:'Apr', score:695, calls:187, bulk_jobs:7 },
      { month:'May', score:702, calls:211, bulk_jobs:8 },
    ],
    stats:    {
      avg_score: null, score_change: null,
      active_users: null, users_change: null,
      api_calls_today: null, calls_change: null,
      revenue_mtd: null, revenue_change: null,
    },
    segments: [],
    activity: [],
  },
  benchmarks: {
    platform_avg: null, your_avg: null, top_quartile: null,
    your_npa: null, platform_npa: null,
    peer_data: [], states: [],
  },
  quests:          [],
  zapier_webhooks: [],
  consent_log:     [],
};

function isNetworkError(msg = '') {
  return (
    msg.includes('fetch') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('ERR_') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Load failed')
  );
}

function isAuthError(msg = '') {
  return (
    msg.includes('Unauthorised') ||
    msg.includes('Unauthorized') ||
    msg.includes('401')
  );
}

async function withRetry(fn, maxRetries = 1) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isNetworkError(err.message)) throw err;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

export function useApi(apiFn, mockKey, deps = [], pollInterval = null) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const mounted      = useRef(true);
  const pollRef      = useRef(pollInterval);
  pollRef.current    = pollInterval;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await withRetry(apiFn);
      if (mounted.current) setData(res);
    } catch (err) {
      if (!mounted.current) return;
      const shouldUseMock =
        isNetworkError(err.message) &&
        mockKey &&
        STRUCTURAL_MOCK[mockKey] !== undefined;

      if (shouldUseMock) {
        setData(STRUCTURAL_MOCK[mockKey]);
      } else if (isAuthError(err.message)) {
        // fc:unauthorized was already dispatched by api/index.js; AuthContext
        // will log the user out and redirect. Just surface a clear message
        // in case this component is still visible for a moment.
        setError('Your session has expired. Please log in again.');
      } else {
        setError(err.message || 'Request failed');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mounted.current = true;
    run();
    let id = null;
    if (pollRef.current) id = setInterval(run, pollRef.current);
    return () => { mounted.current = false; if (id) clearInterval(id); };
  }, [run]);

  return { data, loading, error, refetch: run };
}

export function useMutation(apiFn) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [data,    setData]    = useState(null);

  const mutate = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFn(payload);
      setData(res);
      return res;
    } catch (err) {
      const msg = err.message || 'Mutation failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiFn]);

  const reset = useCallback(() => { setData(null); setError(null); }, []);

  return { mutate, loading, error, data, reset };
}

export const useTracker    = () => useApi(api.tracker,        'tracker', [], 30000);
export const useBenchmarks = () => useApi(api.benchmarks,     'benchmarks');
export const useQuests     = () => useApi(api.quests,          'quests');
export const useWebhooks   = () => useApi(api.zapierWebhooks,  'zapier_webhooks');
export const useConsentLog = () => useApi(api.consentLog,      'consent_log');
export const useComplianceStats = () => useApi(api.complianceStats, null);
export const useMatchLendersStats = () => useApi(api.matchLendersStats, null);
export const useModelMetrics = () => useApi(api.modelMetrics,  null);
