import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import 'react-datepicker/dist/react-datepicker.css'

const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0f;
    --bg-2: #0d1520;
    --bg-3: #080c12;
    --card: #0d1520;
    --border: #1e2d3d;
    --border-strong: #2a3f55;
    --divider: #16202c;
    --nav-active: #162030;
    --text: #e8e6f0;
    --text-strong: #fffffe;
    --text-muted: #4a6070;
    --text-soft: #6b7f90;
    --text-faint: #7a93a6;
    --text-dim: #8898a8;
    --note: #3a5060;
    --accent: #f59e0b;
    --accent-contrast: #000;
    --accent-weak: rgba(245, 158, 11, 0.13);
    --accent-loading: #7a5010;
    --info: #3b82f6;
    --success: #10b981;
    --danger: #ef4444;
    --shadow: rgba(0,0,0,.6);
    --scroll-track: #0a0a0f;
    --scroll-thumb: #1e2d3d;
  }
  :root[data-theme='light'] {
    --bg: #f5f7fb;
    --bg-2: #ffffff;
    --bg-3: #f1f5f9;
    --card: #ffffff;
    --border: #cbd5e1;
    --border-strong: #b6c3d1;
    --divider: #e2e8f0;
    --nav-active: #ffe9bf;
    --text: #1f2937;
    --text-strong: #0f172a;
    --text-muted: #64748b;
    --text-soft: #6b7280;
    --text-faint: #94a3b8;
    --text-dim: #475569;
    --note: #64748b;
    --accent: #f59e0b;
    --accent-contrast: #1f2937;
    --accent-weak: rgba(245, 158, 11, 0.18);
    --accent-loading: #d48806;
    --info: #2563eb;
    --success: #16a34a;
    --danger: #dc2626;
    --shadow: rgba(15, 23, 42, 0.12);
    --scroll-track: #e2e8f0;
    --scroll-thumb: #cbd5e1;
  }
  body { background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: var(--scroll-track); }
  ::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 3px; }
  input, select, textarea, button { font-family: inherit; }
  input:focus, select:focus, textarea:focus { border-color: var(--accent) !important; }
  .react-datepicker { font-family: Georgia,serif; background: var(--card); border: 1px solid var(--border); color: var(--text); }
  .react-datepicker__header { background: var(--bg-2); border-bottom: 1px solid var(--border); }
  .react-datepicker__current-month, .react-datepicker-time__header, .react-datepicker-year-header { color: var(--text-strong); }
  .react-datepicker__day-name, .react-datepicker__day, .react-datepicker__time-name { color: var(--text-dim); }
  .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected { background: var(--accent); color: var(--accent-contrast); }
  .react-datepicker__day:hover { background: var(--accent-weak); }
  .react-datepicker__triangle { display: none; }
  .manual-pair { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 12px; }
  @media print {
    html, body, #root { height: auto !important; }
    body { background: #fff !important; color: #000 !important; }
    div { box-shadow: none !important; }
    aside { display: none !important; }
    main { overflow: visible !important; height: auto !important; }
    .manual-page { padding: 0 !important; }
    .manual-page img { max-width: 100% !important; page-break-inside: avoid; break-inside: avoid; }
    .manual-page .manual-pair { page-break-inside: avoid; break-inside: avoid; }
    button { display: none !important; }
    .manual-annex { page-break-before: always; }
    .manual-pair { page-break-after: always; }
  }
`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
