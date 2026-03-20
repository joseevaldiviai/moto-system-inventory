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
  html, body, #root { min-height: 100%; }
  body { background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: var(--scroll-track); }
  ::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 3px; }
  input, select, textarea, button { font-family: inherit; }
  button { touch-action: manipulation; }
  input:focus, select:focus, textarea:focus { border-color: var(--accent) !important; }
  .react-datepicker { font-family: Georgia,serif; background: var(--card); border: 1px solid var(--border); color: var(--text); }
  .react-datepicker__header { background: var(--bg-2); border-bottom: 1px solid var(--border); }
  .react-datepicker__current-month, .react-datepicker-time__header, .react-datepicker-year-header { color: var(--text-strong); }
  .react-datepicker__day-name, .react-datepicker__day, .react-datepicker__time-name { color: var(--text-dim); }
  .react-datepicker__day--selected, .react-datepicker__day--keyboard-selected { background: var(--accent); color: var(--accent-contrast); }
  .react-datepicker__day:hover { background: var(--accent-weak); }
  .react-datepicker__triangle { display: none; }
  .manual-pair { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 12px; }
  .page-shell { padding: 32px; font-family: Georgia,serif; color: var(--text); }
  .page-header { margin-bottom: 18px; }
  .button-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .stack-sm { display: grid; gap: 10px; }
  .stack-md { display: grid; gap: 16px; }
  .grid-main-two { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr); gap: 16px; align-items: start; }
  .grid-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .grid-two-tight { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .grid-three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .grid-four { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .table-wrap { width: 100%; overflow-x: auto; }
  .list-scroll { max-height: 420px; overflow: auto; }
  .app-shell { display: flex; min-height: 100vh; background: var(--bg); font-family: Georgia,serif; }
  .app-sidebar { width: 220px; background: var(--bg-2); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .app-main { flex: 1; min-width: 0; overflow: auto; }
  .app-mobile-bar { display: none; }
  .app-overlay { display: none; }
  .app-nav-link { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; margin-bottom: 2px; text-decoration: none; font-size: 13px; }
  @media (max-width: 1200px) {
    .grid-four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 960px) {
    .page-shell { padding: 20px; }
    .grid-main-two, .grid-two, .grid-two-tight, .grid-three, .grid-four { grid-template-columns: minmax(0, 1fr); }
    .app-shell { min-height: 100dvh; }
    .app-mobile-bar { display: flex; position: sticky; top: 0; z-index: 15; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bg-2) 88%, transparent); backdrop-filter: blur(10px); }
    .app-sidebar { position: fixed; top: 0; left: 0; bottom: 0; z-index: 30; width: min(82vw, 320px); transform: translateX(-100%); transition: transform .2s ease; box-shadow: 0 24px 80px var(--shadow); }
    .app-sidebar.is-open { transform: translateX(0); }
    .app-overlay { display: block; position: fixed; inset: 0; z-index: 20; background: rgba(0, 0, 0, .45); opacity: 0; pointer-events: none; transition: opacity .2s ease; }
    .app-overlay.is-open { opacity: 1; pointer-events: auto; }
    .app-main { overflow: visible; }
  }
  @media (max-width: 640px) {
    .page-shell { padding: 16px; }
    .page-header h1 { font-size: 20px !important; }
    .button-row > * { flex: 1 1 100%; }
  }
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
