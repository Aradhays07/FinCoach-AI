# FineasyAI — Enterprise Financial Intelligence Platform

Built by **Aradhay Saxena**

## Features
- Bulk Decisioning API (100K records/job + SHAP audit trails)
- Lender–Borrower Matching Marketplace
- Cohort Benchmarking Dashboard
- Zapier Integration (8 triggers, 4 actions, live webhook management)
- DPDP-compliant Consent Management + RBI Audit Export
- ML Credit Score Predictor (ensemble + SHAP explainability)
- AI Financial Playbook (Gemini Pro)
- Quest System with XP progression

## Quick Start

### Frontend
```bash
npm install
npm run dev   # http://localhost:5173
```
Demo mode works without backend — any credentials accepted.

### Backend
```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
python app.py   # http://localhost:5000
```

## Stack
Frontend: React 18, Vite, React Router v6, Recharts, Lucide Icons, CSS Modules
Backend: Flask 3, MongoDB, PyJWT, Werkzeug, scikit-learn, NumPy, Google Gemini
Fonts: Instrument Serif + Geist
