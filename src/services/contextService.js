/**
 * contextService.js
 * Stores user profile and last credit decision in localStorage (persists
 * across browser sessions, consistent with AuthContext's own token storage).
 * deriveFeatures() now maps to the ACTUAL model feature names.
 */

const KEY = 'fc_context';

const DEFAULT = {
  profile: {
    name: null, email: null, company: null,
    monthly_income: null, existing_debt: null,
    employment_type: null, credit_history_length: null, loan_purpose: null,
  },
  lastScore: null,
  lastDecision: null,
  lastUpdated: null,
};

function _read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { ...DEFAULT };
  } catch { return { ...DEFAULT }; }
}

function _write(ctx) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...ctx, lastUpdated: new Date().toISOString() }));
  } catch {}
}

export const contextService = {
  getContext()          { return _read(); },
  setContext(ctx)       { _write({ ...DEFAULT, ...ctx }); },
  updateContext(patch)  { _write({ ..._read(), ...patch }); },
  updateProfile(patch)  {
    const ctx = _read();
    _write({ ...ctx, profile: { ...ctx.profile, ...patch } });
  },
  recordDecision(score, decision) {
    const ctx = _read();
    _write({ ...ctx, lastScore: score, lastDecision: decision });
  },
  clear() { localStorage.removeItem(KEY); },

  /**
   * Maps stored profile → actual model feature names.
   * Missing fields default to 0 so the backend always gets a valid payload.
   * The backend's prepare_input() fills remaining columns with 0 via pd.get_dummies.
   */
  deriveFeatures() {
    const { profile } = _read();
    const monthlyIncome  = Number(profile.monthly_income)  || 0;
    const annualIncome   = monthlyIncome * 12 || 600000;
    const totalDebt      = Number(profile.existing_debt)   || 0;
    const annualSavings  = annualIncome * 0.15; // conservative 15% savings rate
    const annualExpend   = annualIncome * 0.6;

    // Derive spending category estimates from total expenditure
    const housing   = annualExpend * 0.30;
    const groceries = annualExpend * 0.15;
    const utilities = annualExpend * 0.05;
    const clothing  = annualExpend * 0.05;
    const health    = annualExpend * 0.08;
    const education = annualExpend * 0.06;
    const travel    = annualExpend * 0.08;
    const entertain = annualExpend * 0.04;
    const taxExpend = annualIncome * 0.08;

    return {
      INCOME:  annualIncome,
      SAVINGS: annualSavings,
      DEBT:    totalDebt,

      R_DEBT_INCOME:        totalDebt    / (annualIncome  || 1),
      R_SAVINGS_INCOME:     annualSavings / (annualIncome || 1),
      R_DEBT_SAVINGS:       totalDebt    / (annualSavings || 1),
      R_EXPENDITURE_INCOME: annualExpend / (annualIncome  || 1),
      R_EXPENDITURE:        annualExpend / (annualIncome  || 1),
      R_EXPENDITURE_DEBT:   annualExpend / (totalDebt     || 1),

      T_EXPENDITURE_12: annualExpend,     T_EXPENDITURE_6:  annualExpend / 2,
      T_HOUSING_12:     housing,          T_HOUSING_6:      housing / 2,
      T_GROCERIES_12:   groceries,        T_GROCERIES_6:    groceries / 2,
      T_UTILITIES_12:   utilities,        T_UTILITIES_6:    utilities / 2,
      T_CLOTHING_12:    clothing,         T_CLOTHING_6:     clothing / 2,
      T_HEALTH_12:      health,           T_HEALTH_6:       health / 2,
      T_EDUCATION_12:   education,        T_EDUCATION_6:    education / 2,
      T_TRAVEL_12:      travel,           T_TRAVEL_6:       travel / 2,
      T_ENTERTAINMENT_12: entertain,      T_ENTERTAINMENT_6: entertain / 2,
      T_TAX_12:         taxExpend,        T_TAX_6:          taxExpend / 2,
      T_GAMBLING_12:    0,                T_GAMBLING_6:     0,

      R_HOUSING_INCOME:   housing   / (annualIncome  || 1),
      R_GROCERIES_INCOME: groceries / (annualIncome  || 1),
      R_UTILITIES_INCOME: utilities / (annualIncome  || 1),
      R_CLOTHING_INCOME:  clothing  / (annualIncome  || 1),
      R_HEALTH_INCOME:    health    / (annualIncome  || 1),
      R_EDUCATION_INCOME: education / (annualIncome  || 1),
      R_TRAVEL_INCOME:    travel    / (annualIncome  || 1),
      R_ENTERTAINMENT:    entertain / (annualIncome  || 1),
      R_TAX_INCOME:       taxExpend / (annualIncome  || 1),
      R_EDUCATION:        education / (annualIncome  || 1),
      R_GAMBLING_INCOME:  0,

      R_HOUSING_DEBT:     housing   / (totalDebt || 1),
      R_TRAVEL_DEBT:      travel    / (totalDebt || 1),
      R_CLOTHING_DEBT:    clothing  / (totalDebt || 1),
      R_UTILITIES_DEBT:   utilities / (totalDebt || 1),
      R_TAX_DEBT:         taxExpend / (totalDebt || 1),

      R_HOUSING_SAVINGS:  housing   / (annualSavings || 1),
      R_CLOTHING_SAVINGS: clothing  / (annualSavings || 1),
      R_GAMBLING_SAVINGS: 0,
      R_GAMBLING:         0,
      R_GAMBLING_DEBT:    0,

      CAT_DEBT:           totalDebt > 0      ? 1 : 0,
      CAT_CREDIT_CARD:    1,
      CAT_SAVINGS_ACCOUNT:annualSavings > 0  ? 1 : 0,
      CAT_MORTGAGE:       0,
      CAT_DEPENDENTS:     0,
      CAT_GAMBLING_No:    1,
      CAT_GAMBLING_Low:   0,
    };
  },
};
