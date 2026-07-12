/**
 * PDFReport.jsx
 * Generates a clean PDF report for a scored borrower.
 * Uses browser print API with a print-specific stylesheet — no external libs needed.
 */
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from './UI';
import s from './PDFReport.module.css';

function formatDate(ts) {
  try { return new Date(ts).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' }); }
  catch { return new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' }); }
}

export default function PDFReport({ borrower }) {
  const [generating, setGenerating] = useState(false);

  if (!borrower) return null;

  const generate = () => {
    // Open window SYNCHRONOUSLY before any async work — prevents popup blocker
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      alert('Please allow popups for this site to download the PDF report.');
      return;
    }
    // Detect Safari/iOS — use blob URL instead of window.open
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setGenerating(true);

    const RISK_COLOR = { low: '#2de08a', medium: '#f5b942', high: '#f0484e' };
    const STATUS_COLOR = { approve: '#2de08a', reject: '#f0484e', review: '#f5b942' };
    const riskColor   = RISK_COLOR[borrower.risk]     || '#9ba3b8';
    const statusColor = STATUS_COLOR[borrower.decision] || '#f5b942';

    const posFactors = borrower.factors?.positive?.slice(0,5) || [];
    const negFactors = borrower.factors?.negative?.slice(0,5) || [];
    const actions    = borrower.actions || [];

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Credit Report — ${borrower.name || 'Borrower'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'DM Sans',sans-serif;background:#fff;color:#111;font-size:13px;line-height:1.6;padding:48px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:20px;border-bottom:2px solid #f0f0f0;}
    .brand{font-family:'DM Serif Display',serif;font-size:22px;color:#111;}
    .brand span{color:#f5b942;}
    .meta{text-align:right;font-size:11px;color:#888;font-family:'JetBrains Mono',monospace;}
    .title{font-family:'DM Serif Display',serif;font-size:28px;margin-bottom:4px;}
    .date{font-size:11px;color:#888;font-family:'JetBrains Mono',monospace;}
    .scoreSection{display:flex;gap:24px;margin-bottom:28px;padding:20px;background:#f8f8f8;border-radius:10px;}
    .scoreBox{text-align:center;padding:16px 24px;background:#fff;border-radius:8px;border:2px solid ${statusColor};}
    .scoreNum{font-family:'JetBrains Mono',monospace;font-size:48px;font-weight:700;color:#111;line-height:1;}
    .scoreLabel{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-top:4px;}
    .badges{display:flex;flex-direction:column;gap:8px;justify-content:center;}
    .badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;}
    .badge-status{background:${statusColor}22;color:${statusColor};}
    .badge-risk{background:${riskColor}22;color:${riskColor};}
    .badge-conf{background:#f0f0f0;color:#555;}
    .section{margin-bottom:24px;}
    .sectionTitle{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;font-family:'JetBrains Mono',monospace;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f0f0f0;}
    .factorRow{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;}
    .dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
    .dot-pos{background:#2de08a;}
    .dot-neg{background:#f0484e;}
    .action{padding:6px 0;font-size:12px;color:#333;border-bottom:1px solid #f5f5f5;}
    .action::before{content:'→ ';}
    .footer{margin-top:36px;padding-top:16px;border-top:1px solid #f0f0f0;font-size:10px;color:#aaa;display:flex;justify-content:space-between;}
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">Fineasy<span>AI</span></div>
    <div class="meta">
      <div>Generated: ${formatDate(borrower.ts)}</div>
      <div>Report ID: RPT-${Math.random().toString(36).slice(2,8).toUpperCase()}</div>
    </div>
  </div>

  <h1 class="title">${borrower.name || 'Borrower'}</h1>
  <div class="date">Credit Assessment Report · ${formatDate(borrower.ts)}</div>

  <div class="scoreSection" style="margin-top:20px;">
    <div class="scoreBox">
      <div class="scoreNum">${Math.round(borrower.score)}</div>
      <div class="scoreLabel">Credit Score</div>
    </div>
    <div class="badges">
      <div class="badge badge-status">${(borrower.decision || 'review').toUpperCase()}</div>
      <div class="badge badge-risk">${(borrower.risk || 'medium').toUpperCase()} RISK</div>
      <div class="badge badge-conf">${Math.round(borrower.confidence || 0)}% CONFIDENCE</div>
    </div>
  </div>

  ${posFactors.length ? `
  <div class="section">
    <div class="sectionTitle">Positive factors</div>
    ${posFactors.map(f => `<div class="factorRow"><div class="dot dot-pos"></div>${f}</div>`).join('')}
  </div>` : ''}

  ${negFactors.length ? `
  <div class="section">
    <div class="sectionTitle">Negative factors</div>
    ${negFactors.map(f => `<div class="factorRow"><div class="dot dot-neg"></div>${f}</div>`).join('')}
  </div>` : ''}

  ${actions.length ? `
  <div class="section">
    <div class="sectionTitle">Recommended actions</div>
    ${actions.map(a => `<div class="action">${a}</div>`).join('')}
  </div>` : ''}

  <div class="footer">
    <span>FineasyAI · Confidential credit assessment</span>
    <span>This report is generated by an ML model and should be reviewed by a qualified credit officer.</span>
  </div>
</body>
</html>`);

    win.document.close();
    if (isSafari || isMobile) {
      // Capture the document BEFORE closing the window — reading
      // win.document after win.close() returns empty/throws in most
      // browsers, which was silently producing an empty downloaded file.
      const html2 = win.document.documentElement?.outerHTML || '';
      win.close();
      const blob  = new Blob([html2], { type:'text/html' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href = url; a.download = `credit-report-${borrower.name||'borrower'}.html`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
      setGenerating(false);
    } else {
      setTimeout(() => { win.print(); setGenerating(false); }, 800);
    }
  };

  return (
    <Button variant="outline" size="sm" loading={generating} onClick={generate}>
      <Download size={12}/> Download PDF
    </Button>
  );
}
