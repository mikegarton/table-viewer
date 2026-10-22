/* table-viewer v1 — one table, any shape.
   Spec of record: C:\dev\working_docs\projects\table-viewer\table-viewer-spec.md
   (draft 10: Mike's rulings d1 to d39 of 2026-09-22 and the later rulings
   cited by slug). Section letters below cite it.

   mountTable(container, rows, spec) -> { update(rows), state, destroy() }
     container: element. rows: array of row objects. spec (optional, section B):
       name, identity, sort {key, dir}, site, columns [{key, label, unit, decimals,
       kind, text, visible, render, mark}], actions [{label, when, route, method,
       payload, guard, done, input}], request(action, row, body), afterAction(...).
   TableViewer.actionButton(action, row, spec) -> button element, the same guard
   mechanics for a page's own rows (the ops page's Limits campaign rows).
   TableViewer.mountTextSize(container) -> the A− A+ text-size pair (E14), once
   per page; container is an empty element in the page's pinned row 0, which
   becomes the pair. The pair sizes the whole page.
   TableViewer.mountViewsTblVwr(container, { site, showSectionTblVwr, viewsStoreTblVwr })
     -> the three saved-view widgets (E15: the View dropdown, save view, delete
     view), once per page, in an empty element of the page's pinned row 0. A
     saved view names its table (the spec's name) and the page's section for it
     (the spec's section); choosing one calls showSectionTblVwr(section) and
     restores that table's saved variables at once (the one named exception to
     section D's single-writer rule). Views live per device under
     tv:<site>:views behind the small store interface (listViewsTblVwr,
     getViewTblVwr, saveViewTblVwr, removeViewTblVwr, currentViewTblVwr,
     setCurrentViewTblVwr), which viewsStoreTblVwr replaces (ruling view-storage c).

   Build decisions beyond the spec are listed in
   projects\table-viewer\build-decisions-2026-09-22.md. No dependency; no build step. */
(function () {
  "use strict";
  const VERSION = "1";
  const STATE_VERSION = 1;
  // Section P lists every constant with its rule and effect; the ops page's
  // Code constants table lists the same rows.
  const ENUM_MAX_DISTINCT = 12;            // d8 a: the sheet_shape.py rule
  const IDENTITY_OWN_LINE_ABOVE_PERCENT = 50; // E9 case 2; rule: section P (retires IDENTITY_OWN_LINE_MIN_CHARS)
  const ARM_SECONDS = 5;                   // E12: an armed button disarms after this
  const TEXT_FLOOR_PX = 16;                // G: Text is black and big enough
  const PHONE_LAYOUT_BELOW_PX = 600;       // E8 rule 3, E9 case 1: Android's compact window width class ends at 600 dp
  const IDENTITY_MIN_PERCENT_PHONE = 30;   // E8 rule 3; rule: section P
  const IDENTITY_MIN_PX = 80;              // E8 rule 3; rule: section P
  const TEXT_NEED_MAX_CHARS = 40;          // E8 rule 2; rule: section P
  const CLIP_CHARS = 22;                   // E8 rule 2; rule: section P
  const COLUMN_MAX_PERCENT = 35;           // E8 rule 2, the ceiling (long-column b); rule: section P
  const REDRAW_MIN_WIDTH_CHANGE_PX = 24;   // E8; rule: section P
  const TEXT_SCALE_STEP_FACTOR = 1.2;      // E14: the nugget viewer's zoom step
  const TEXT_SCALE_MIN_FACTOR = 0.58;      // E14: the nugget viewer's zoom floor
  const TEXT_SCALE_MAX_FACTOR = 2.5;       // E14: the nugget viewer's zoom ceiling

  // ---------- styles, injected once ----------
  const CSS = `
.tv { font-size: 16px; line-height: 1.4; color: var(--ink, #e8e8e6);
      --tv-mint: var(--mint, #7fe3b0); --tv-yellow: var(--yellow, #ffd166); --tv-sand: var(--faint, #ead9b0);
      --tv-line: var(--line, #2c3038); --tv-card: var(--card, #1a1c21); --tv-card2: var(--card2, #22252c);
      --tv-accent: var(--accent, #5aa8f0); --tv-gold: var(--gold, #e0b34e); --tv-bad: var(--bad, #e25555);
      --tv-good: var(--good, #6fc48d); --tv-dim: var(--dim, #bfe3ff); }
.tv * { box-sizing: border-box; }
.tv-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; padding: 4px 0; }   /* wraps, never scrolls sideways (spec F, G) */
.tv-ctl { display: flex; flex-direction: column; gap: 2px; flex: none; }
.tv-ctl label { font-size: 16px; color: var(--tv-dim); white-space: nowrap; }
.tv-ctl select { max-width: min(60vw, 18em); }
.tv select, .tv button, .tv input { font: inherit; color: var(--ink, #e8e8e6); background: var(--tv-card);
      border: 1px solid var(--tv-line); border-radius: 8px; padding: 6px 8px; min-height: 40px; }
.tv button { cursor: pointer; white-space: nowrap; }
.tv .user-set { border-color: var(--tv-mint); color: var(--tv-mint); }
.tv .side-effect { border-color: var(--tv-yellow); color: var(--tv-yellow); }
.tv .na { border-color: var(--tv-sand); color: var(--tv-sand); text-decoration: line-through; }
.tv-count { margin: 6px 0; font-size: 16px; }
.tv-count b { color: var(--tv-accent); }
.tv-panel { display: none; border: 1px solid var(--tv-line); border-radius: 10px; padding: 8px 10px; margin: 6px 0; background: var(--tv-card); }
.tv-panel.open { display: block; }
.tv-panel .tv-prow { display: flex; gap: 8px; align-items: center; padding: 4px 0; flex-wrap: wrap; }
.tv-panel .tv-prow span.tv-plabel { min-width: 9em; }
.tv-panel input[type=number] { width: 7em; }
.tv-panel label.tv-check { display: flex; gap: 8px; align-items: center; padding: 4px 0; min-height: 40px; }
.tv-panel label.tv-all { font-weight: 600; border-bottom: 1px solid var(--tv-line); }
.tv-panel input[type=checkbox] { width: 22px; height: 22px; min-height: 0; }
.tv-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.tv-table th, .tv-table td { overflow-wrap: break-word; }
.tv-table th, .tv-table td { padding: 7px 8px; border-bottom: 1px solid var(--tv-line); text-align: right; vertical-align: top; }
.tv-table th { position: sticky; top: var(--tv-sticky-top, 0px); z-index: 1; background: var(--tv-card); color: var(--tv-dim); font-weight: 600; white-space: normal; overflow-wrap: anywhere; }   /* parks under the host's pinned bar (header-offset a) */
.tv-table th.tv-sorted { color: var(--tv-accent); }
.tv-table td.tv-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.tv-table th.tv-ident, .tv-table td.tv-ident { text-align: left; }
.tv-table th.tv-text, .tv-table td.tv-wrap, .tv-table td.tv-clip, .tv-table td.tv-shrink { text-align: left; }
.tv-table td.tv-wrap { white-space: normal; overflow-wrap: break-word; }
.tv-table td.tv-clip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 14em; cursor: pointer; }
.tv-table td.tv-clip.open { white-space: normal; overflow: visible; max-width: none; }
.tv-table td.tv-over { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }          /* a value over the ceiling (E8 rule 2, E10) */
.tv-table td.tv-over.open { white-space: normal; overflow: visible; overflow-wrap: anywhere; }
.tv-table td.tv-shrink { white-space: normal; overflow-wrap: anywhere; font-size: ${TEXT_FLOOR_PX}px; }
.tv-table tr.tv-identline td { text-align: left; border-bottom: none; padding-bottom: 0; font-weight: 600; white-space: normal; overflow-wrap: break-word; }
.tv-table tr.tv-identline + tr td { padding-top: 2px; }
.tv-table tr.tv-group td { text-align: left; color: var(--tv-accent); font-weight: 700; padding-top: 14px; background: var(--tv-card2); }
.tv-table tr.tv-group td button { min-height: 32px; padding: 2px 8px; margin-right: 8px; }
.tv-table tr.tv-foldline td { text-align: left; white-space: normal; background: var(--tv-card2); border-bottom: 1px solid var(--tv-line); }
.tv-table tr.tv-foldline .tv-field { display: block; padding: 2px 0; overflow-wrap: break-word; }
.tv-table tr.tv-foldline .tv-field b { color: var(--tv-dim); font-weight: 600; margin-right: 6px; }
.tv-fold { min-height: 32px; padding: 2px 8px; font-size: 16px; margin-left: 6px; }
.tv-acts { white-space: normal; }
.tv-acts button { min-height: 34px; padding: 4px 8px; font-size: 16px; margin: 2px 4px 2px 0; }
.tv-acts-line { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 4px; }
.tv-acts button.armed { border-color: var(--tv-bad); color: var(--tv-bad); }
.tv-acts button.done { border-color: var(--tv-good); color: var(--tv-good); }
.tv-acts button:disabled { color: var(--tv-sand); border-color: var(--tv-sand); cursor: default; }
.tv-empty { padding: 20px; text-align: center; }
.tv-mark-hot { color: var(--tv-gold); }
.tv-mark-warn { color: var(--tv-yellow); }
.tv-mark-bad { color: var(--tv-bad); }
.tv-mark-good { color: var(--tv-good); }
.tv-probe { position: absolute; left: 0; top: 0; height: 0; overflow: hidden; visibility: hidden; pointer-events: none; }
.tv-textsize { display: inline-flex; gap: 6px; align-items: center; margin-left: auto; flex: none; }
.tv-textsize button { min-width: 44px; }
.tv-views { display: contents; }   /* E15: the label and the three widgets are the page's row 0's own items, at its height, wrapping one by one, never scrolling (G) */
.tv-views select { max-width: min(60vw, 18em); }
.tv-views button.armed { border-color: var(--tv-bad); color: var(--tv-bad); }
`;
  let cssDone = false;
  function ensureCss() {
    if (cssDone || typeof document === "undefined") return;
    const s = document.createElement("style");
    s.id = "tv-styles"; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
  }

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isBlank = (v) => v === null || v === undefined || v === "";
  const KEYLIKE = /^[A-Za-z0-9_.:-]{1,80}$/;
  const DATELIKE = /^\d{4}-\d{2}-\d{2}/;
  const NUMLIKE = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?([eE][-+]?\d+)?$/;
  function asNumber(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string" && NUMLIKE.test(v.trim())) return Number(v.replace(/,/g, ""));
    return null;
  }
  function asBool(v) {
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    return s === "true" || s === "yes" ? true : s === "false" || s === "no" ? false : null;
  }
  function asDate(v) {
    if (v instanceof Date) return v.getTime();
    if (typeof v === "string" && DATELIKE.test(v)) { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
    return null;
  }

  // ---------- inference (section C) ----------
  function inferKind(values) {
    const filled = values.filter((v) => !isBlank(v));
    if (!filled.length) return "empty";
    const distinct = new Set(filled.map((v) => String(v))).size;
    // bool, date and number come before id: a metric column with all-distinct
    // values is a metric, not a key (found in the first browser test).
    if (filled.every((v) => asBool(v) !== null)) return "bool";
    if (filled.every((v) => asDate(v) !== null)) return "date";
    if (filled.every((v) => asNumber(v) !== null)) return "number";
    if (filled.length === values.length && distinct === filled.length && filled.every((v) => KEYLIKE.test(String(v)))) return "id";
    if (distinct <= ENUM_MAX_DISTINCT && distinct <= values.length / 2 && filled.length >= 3) return "enum"; // d18 b
    return "text";
  }
  function inferDecimals(values) {
    let d = 0;
    for (const v of values) { const n = asNumber(v); if (n === null) continue; const s = String(v); const i = s.indexOf("."); if (i >= 0) d = Math.max(d, Math.min(4, s.length - i - 1)); }
    return d;
  }
  function inferColumns(rows, spec) {
    const keys = []; const seen = new Set();
    for (const c of (spec.columns || [])) if (c.key && !seen.has(c.key)) { keys.push(c.key); seen.add(c.key); }
    for (const r of rows) for (const k of Object.keys(r || {})) if (!seen.has(k)) { keys.push(k); seen.add(k); }
    const byKey = new Map((spec.columns || []).map((c) => [c.key, c]));
    const cols = [];
    for (const key of keys) {
      const given = byKey.get(key) || {};
      const values = rows.map((r) => (r ? r[key] : undefined));
      const kind = given.kind || inferKind(values);
      if (kind === "empty" && !given.kind) continue;              // never shown, never offered
      cols.push({
        key,
        label: given.label || key.replace(/_/g, " "),
        unit: given.unit || "",
        decimals: given.decimals != null ? given.decimals : (kind === "number" ? inferDecimals(values) : 0),
        kind,
        text: given.text || "wrap",                                 // d34 b
        visible: given.visible !== false,                           // d23 b; unlisted columns visible
        listed: byKey.has(key),
        render: typeof given.render === "function" ? given.render : null,
        mark: typeof given.mark === "function" ? given.mark : null,
      });
    }
    return cols;
  }

  // ---------- state (section D, H) ----------
  function stateKey(spec) {
    const site = spec.site || (typeof location !== "undefined" ? location.pathname : "page");
    return "tv:" + site + ":" + (spec.name || "table");
  }
  function loadState(spec) {
    try {
      const raw = localStorage.getItem(stateKey(spec));
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.v !== STATE_VERSION) { console.log("table-viewer: saved state discarded, version", s && s.v, "module", STATE_VERSION); return null; }
      return s;
    } catch (e) { return null; }
  }
  function saveState(spec, st) {
    try { localStorage.setItem(stateKey(spec), JSON.stringify({ v: STATE_VERSION, f: st.f, n: st.n, s_key: st.s_key, s_dir: st.s_dir, hidden: [...st.hidden], seen: [...st.seen], g_key: st.g_key })); } catch (e) {}
  }

  // ---------- formatting ----------
  function fmtCell(col, v) {
    if (isBlank(v)) return "—";
    if (col.kind === "number") { const n = asNumber(v); return n === null ? esc(v) : n.toLocaleString(undefined, { minimumFractionDigits: col.decimals, maximumFractionDigits: col.decimals }); }
    if (col.kind === "date") { const s = String(v); return esc(s.length > 10 && /T/.test(s) ? s.slice(0, 10) : s); }
    if (col.kind === "bool") { const b = asBool(v); return b === null ? esc(v) : b ? "yes" : "no"; }
    return esc(v);
  }
  function cellHtml(col, row) {
    const v = row[col.key];
    let inner = col.render ? col.render(v, row) : fmtCell(col, v);
    const m = col.mark ? col.mark(v, row) : null;
    if (m) inner = '<span class="tv-mark-' + esc(m) + '">' + inner + "</span>";
    return inner;
  }
  // The text a cell shows, for measuring (E8 rule 1). A render hook's HTML is
  // read through an inert template, so nothing in it loads or runs.
  const inert = typeof document !== "undefined" ? document.createElement("template") : null;
  function plainCell(col, row) {
    const v = row[col.key];
    if (col.render) { inert.innerHTML = String(col.render(v, row) ?? ""); return inert.content.textContent || ""; }
    if (isBlank(v)) return "—";
    if (col.kind === "number") { const n = asNumber(v); return n === null ? String(v) : n.toLocaleString(undefined, { minimumFractionDigits: col.decimals, maximumFractionDigits: col.decimals }); }
    if (col.kind === "date") { const s = String(v); return s.length > 10 && /T/.test(s) ? s.slice(0, 10) : s; }
    if (col.kind === "bool") { const b = asBool(v); return b === null ? String(v) : b ? "yes" : "no"; }
    return String(v);
  }
  function compareBy(col, dir) {
    const sign = dir === "asc" ? 1 : -1;
    return (a, b) => {
      const x = a[col.key], y = b[col.key];
      const xb = isBlank(x), yb = isBlank(y);
      if (xb && yb) return 0; if (xb) return 1; if (yb) return -1;   // nulls last, both directions
      if (col.kind === "number") return sign * ((asNumber(x) ?? 0) - (asNumber(y) ?? 0));
      if (col.kind === "date") return sign * ((asDate(x) ?? 0) - (asDate(y) ?? 0));
      if (col.kind === "bool") return sign * ((asBool(x) ? 1 : 0) - (asBool(y) ? 1 : 0));
      return sign * String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
    };
  }

  // ---------- measurement (E8 rule 1) ----------
  // Widths come from a canvas at the computed fonts of a hidden probe table
  // inside the container, times a per-table scale taken from drawn number
  // cells (see calibrate), so a device that draws text larger than its CSS
  // size is measured as drawn.
  let canvasCtx = null;
  const canvasWidths = new Map();                                 // raw canvas widths by font and text
  function canvasWidth(font, s) {
    const k = font + "\u0001" + s;
    let v = canvasWidths.get(k);
    if (v === undefined) {
      if (!canvasCtx) canvasCtx = document.createElement("canvas").getContext("2d");
      canvasCtx.font = font; v = canvasCtx.measureText(s).width; canvasWidths.set(k, v);
    }
    return v;
  }
  function fontOf(node) { const s = getComputedStyle(node); return s.fontStyle + " " + s.fontWeight + " " + s.fontSize + " " + s.fontFamily; }
  function sideSpace(node, withMargins) {
    const s = getComputedStyle(node);
    const parts = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"].concat(withMargins ? ["marginLeft", "marginRight"] : []);
    return parts.reduce((a, p) => a + (parseFloat(s[p]) || 0), 0);
  }
  // A header breaks at spaces and after a slash (E8 rule 2); an identity at spaces.
  const headerWords = (s) => String(s).split(/\s+/).flatMap((w) => w.replace(/\//g, "/\u0001").split("\u0001")).filter(Boolean);
  const spaceWords = (s) => String(s).split(/\s+/).filter(Boolean);

  // ---------- actions (E12, E13) ----------
  function matches(action, row) {
    const w = action.when;
    if (!w) return true;
    if (typeof w === "function") return !!w(row);
    if (Array.isArray(w.value)) return w.value.includes(row[w.column]);
    return row[w.column] === w.value;
  }
  function actionButton(action, row, spec) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = action.label;
    let armed = null;
    const restore = () => { b.textContent = action.label; b.classList.remove("armed"); b.disabled = false; armed = null; };
    const fire = async () => {
      const body = Object.assign({}, action.body || {});             // static fields first
      for (const k of (action.payload || [])) body[k] = row[k];        // then the row's columns
      if (action.side) body.side = action.side;
      if (action.input) {
        const col = action.input.column;
        const next = prompt(action.input.prompt || ("New value for " + col + " (current: " + row[col] + ")"), row[col]);
        if (next == null || String(next).trim() === "" || String(next) === String(row[col])) { restore(); return; }
        body[action.input.key || col] = String(next).trim();
      }
      b.disabled = true; b.textContent = "…";
      try {
        const res = await spec.request(action, row, body);
        let data = null; try { data = await res.json(); } catch (e) {}
        if (!res.ok) { alert("Rejected: " + ((data && data.error) || res.status)); restore(); return; }
        b.textContent = action.done || "✓"; b.classList.remove("armed"); b.classList.add("done"); b.disabled = true;
        if (typeof spec.afterAction === "function") spec.afterAction(action, row, data);
      } catch (e) { alert("Network error: " + e); restore(); }
    };
    b.onclick = () => {
      if (action.guard === "arm") {
        if (armed) { clearTimeout(armed); fire(); return; }
        b.textContent = "sure? " + action.label; b.classList.add("armed");
        armed = setTimeout(restore, ARM_SECONDS * 1000);
        return;
      }
      fire();
    };
    return b;
  }

  // ---------- text-size pair (E14, section H) ----------
  // One size per page, saved per device under its own key, apart from the
  // tables' keys and outside STATE_VERSION; applied as the zoom of the page's
  // body, as the nugget viewer applies it, when this file loads, so the first
  // fit of every table is taken at the saved size.
  const renderers = new Set();                                    // every mounted table's render
  const textScaleKey = () => "tv:" + (typeof location !== "undefined" ? location.pathname : "page") + ":text_scale";
  let textScale = 1;
  function loadTextScale() {
    try {
      const v = Number(localStorage.getItem(textScaleKey()));
      return Number.isFinite(v) && v >= TEXT_SCALE_MIN_FACTOR && v <= TEXT_SCALE_MAX_FACTOR ? v : 1;   // absent or unreadable reads as 1
    } catch (e) { return 1; }
  }
  function applyTextScale() { if (document.body) document.body.style.zoom = String(textScale); }
  if (typeof document !== "undefined") {
    textScale = loadTextScale();
    if (document.body) applyTextScale(); else document.addEventListener("DOMContentLoaded", applyTextScale);
  }
  function mountTextSize(container) {
    ensureCss();
    // The container, an empty element in the page's row 0, becomes the pair,
    // so it is the row's own flex item and sits at the row's right end.
    const box = typeof container === "string" ? document.querySelector(container) : container;
    if (!box) throw new Error("table-viewer: text-size container not found");
    box.classList.add("tv", "tv-textsize");
    box.innerHTML = '<button type="button" title="smaller text">A−</button><button type="button" title="larger text">A+</button>';
    const [minus, plus] = box.querySelectorAll("button");
    const paint = () => {                                         // at a limit the button is inapplicable (section G)
      const atMin = textScale <= TEXT_SCALE_MIN_FACTOR, atMax = textScale >= TEXT_SCALE_MAX_FACTOR;
      minus.disabled = atMin; minus.classList.toggle("na", atMin);
      plus.disabled = atMax; plus.classList.toggle("na", atMax);
    };
    const step = (dir) => {
      const z = textScale * (dir > 0 ? TEXT_SCALE_STEP_FACTOR : 1 / TEXT_SCALE_STEP_FACTOR);
      textScale = Math.round(Math.min(TEXT_SCALE_MAX_FACTOR, Math.max(TEXT_SCALE_MIN_FACTOR, z)) * 100) / 100;   // as the viewer rounds
      try { localStorage.setItem(textScaleKey(), String(textScale)); } catch (e) {}
      applyTextScale(); paint();
      for (const r of renderers) r();                             // every mounted table's fit recomputed (E8)
    };
    minus.onclick = () => step(-1);
    plus.onclick = () => step(1);
    paint();
    return box;
  }

  // ---------- saved views (E15, sections D and H; rulings of 2026-10-22) ----------
  // One view = one table's saved variables under a name, plus the table's name
  // and the page's section for it. Every mounted table registers under its
  // spec name so a view can find it; the widgets repaint when any table's
  // state is written (viewListeners), which is how the dropdown's fill shows
  // whether the table still shows the chosen view (ruling view-drift-mark a).
  const mounts = new Map();                                       // spec name -> mount handle
  const viewListeners = new Set();
  let lastTouched = null;                                         // the mount whose control was used last
  // The store interface (ruling view-storage c): per device now, under one key
  // per page holding every view by name; a page may pass another object with
  // the same six methods, so a server store replaces this one without touching
  // the widgets. Methods may return promises. The names carry the scope part
  // (Mike, 2026-10-22, d13 a).
  function localViewsStore(site) {
    const key = "tv:" + site + ":views", curKey = "tv:" + site + ":view";
    const read = () => { try { const o = JSON.parse(localStorage.getItem(key) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
    const write = (o) => { try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) {} };
    return {
      listViewsTblVwr() { return Object.values(read()).filter((v) => v && typeof v.name === "string"); },
      getViewTblVwr(name) { return read()[name] || null; },
      saveViewTblVwr(view) { const o = read(); o[view.name] = view; write(o); },
      removeViewTblVwr(name) { const o = read(); delete o[name]; write(o); },
      currentViewTblVwr() { try { return localStorage.getItem(curKey) || ""; } catch (e) { return ""; } },
      setCurrentViewTblVwr(name) { try { if (name) localStorage.setItem(curKey, name); else localStorage.removeItem(curKey); } catch (e) {} },
    };
  }
  // The settings a view holds, in one canonical string over the columns a table
  // has now, so a view and a table's state compare as equal when the table
  // shows the view (E15.1 post). Filters at All, blank bounds and keys of
  // columns the table no longer has fall out on both sides.
  function canonicalView(v, map) {
    const f = {}; for (const k of Object.keys(v.f || {}).sort()) { const x = v.f[k]; if (x && x !== "all" && map.has(k)) f[k] = String(x); }
    const n = {};
    for (const k of Object.keys(v.n || {}).sort()) {
      const b = v.n[k]; if (!b || !map.has(k)) continue;
      const min = b.min == null ? "" : String(b.min), max = b.max == null ? "" : String(b.max);
      if (min !== "" || max !== "") n[k] = { min, max };
    }
    const hidden = [...new Set(v.hidden || [])].filter((k) => map.has(k)).sort();
    return JSON.stringify({ f, n, s_key: map.has(v.s_key) ? v.s_key : null, s_dir: v.s_dir === "asc" ? "asc" : "desc", hidden, g_key: v.g_key && v.g_key !== "none" && map.has(v.g_key) ? v.g_key : "none" });
  }
  function mountViewsTblVwr(container, opts) {
    ensureCss(); opts = opts || {};
    const box = typeof container === "string" ? document.querySelector(container) : container;
    if (!box) throw new Error("table-viewer: views container not found");
    const site = opts.site || (typeof location !== "undefined" ? location.pathname : "page");
    const store = opts.viewsStoreTblVwr || localViewsStore(site);
    const showSection = typeof opts.showSectionTblVwr === "function" ? opts.showSectionTblVwr : null;
    box.classList.add("tv", "tv-views");
    // Four row items, the label beside its dropdown as the page's own Section
    // label sits, so the widgets stand at the row's height (Mike, 2026-10-22).
    box.innerHTML = '<label for="tvView">View</label><select id="tvView"></select>' +
      '<button type="button" id="tvViewSave">save view</button><button type="button" id="tvViewDel">delete view</button>';
    const sel = box.querySelector("#tvView"), saveBtn = box.querySelector("#tvViewSave"), delBtn = box.querySelector("#tvViewDel");
    let current = "", armed = null, views = [];
    const disarm = () => { delBtn.textContent = "delete view"; delBtn.classList.remove("armed"); armed = null; };
    // The table a save is of: the one whose control was used last while it is
    // on screen, else the first table on screen (a section may hold two).
    const onScreen = (m) => m && m.element.clientWidth > 0 && mounts.get(m.tableName) === m;
    const pickMount = () => onScreen(lastTouched) ? lastTouched : ([...mounts.values()].find(onScreen) || null);
    async function paint() {
      views = (await store.listViewsTblVwr()).slice().sort((a, b) => String(b.saved_at || "").localeCompare(String(a.saved_at || ""))); // ruling view-order a: newest save first
      if (!views.some((v) => v.name === current)) current = "";
      const cur = views.find((v) => v.name === current) || null;
      const live = cur && mounts.has(cur.table) ? mounts.get(cur.table) : null;
      // ruling view-list-scope a: every view of the page, "name · table"; a view
      // whose table is not mounted stays listed and deletable (missing-table a)
      sel.innerHTML = '<option value="">—</option>' + views.map((v) => '<option value="' + esc(v.name) + '">' + esc(v.name) + " · " + esc(v.table || "?") + (mounts.has(v.table) ? "" : " (not on this page)") + "</option>").join("");
      sel.value = current;
      sel.disabled = !views.length;
      sel.classList.toggle("na", !views.length || !!(cur && !live));                  // inapplicable (G)
      sel.classList.toggle("user-set", !!(live && live.matchesView(cur)));            // mint while the table shows the view (view-drift-mark a)
      delBtn.disabled = !cur; delBtn.classList.toggle("na", !cur);
      if (!cur) disarm();
    }
    sel.onchange = async () => {
      current = sel.value; await store.setCurrentViewTblVwr(current); disarm();
      const v = current ? await store.getViewTblVwr(current) : null;
      if (v && mounts.has(v.table)) {
        if (v.section != null && showSection) showSection(v.section);               // the view's section first
        mounts.get(v.table).applyView(v);                                           // then its settings, as a restore
      }
      paint();
    };
    saveBtn.onclick = async () => {
      const m = pickMount();
      if (!m) { alert("No table is on screen to save a view of."); return; }
      const answer = prompt("Name this view", current || "");                       // prefilled with the chosen view, so a re-save overwrites it
      if (answer == null) return;
      const name = String(answer).trim(); if (!name) return;
      const v = Object.assign({ name, saved_at: new Date().toISOString() }, m.snapshotView());
      await store.saveViewTblVwr(v);                                                            // a held name is overwritten (his words)
      current = name; await store.setCurrentViewTblVwr(name);
      m.markView(v);
      paint();
    };
    delBtn.onclick = async () => {
      if (!current) return;
      if (armed) {                                                                    // the arm guard of E12: free but not reversible (d31 a)
        clearTimeout(armed); const name = current;
        await store.removeViewTblVwr(name); current = ""; await store.setCurrentViewTblVwr("");
        for (const m of mounts.values()) m.forgetView(name);                          // the table's settings stay as they are
        disarm(); paint(); return;
      }
      delBtn.textContent = "sure? delete view"; delBtn.classList.add("armed");
      armed = setTimeout(disarm, ARM_SECONDS * 1000);
    };
    (async () => { current = (await store.currentViewTblVwr()) || ""; paint(); })();
    viewListeners.add(paint);
    return box;
  }

  // ---------- mount ----------
  function mountTable(container, rows, spec) {
    ensureCss();
    spec = spec || {};
    const el = typeof container === "string" ? document.querySelector(container) : container;
    if (!el) throw new Error("table-viewer: container not found");
    el.classList.add("tv");
    let data = Array.isArray(rows) ? rows.filter(Boolean) : [];
    let cols = inferColumns(data, spec);
    const colByKey = () => new Map(cols.map((c) => [c.key, c]));
    const identityKey = () => spec.identity && colByKey().has(spec.identity) ? spec.identity : (cols.find((c) => c.kind === "id") || cols[0] || {}).key;

    // state
    const saved = loadState(spec);
    const st = { f: {}, n: {}, s_key: null, s_dir: null, hidden: new Set(), seen: new Set(), g_key: "none", expanded: new Set(), openCells: new Set(), foldMode: "open", foldExceptions: new Set(), panel: null,
      view: null, viewDropped: [] };                                       // E15: the chosen view and the settings of it not applied (missing-column a)
    const handle = { element: el, tableName: spec.name || "table" };
    if (saved) {
      st.f = saved.f || {}; st.n = saved.n || {}; st.s_key = saved.s_key; st.s_dir = saved.s_dir;
      st.hidden = new Set(saved.hidden || []); st.seen = new Set(saved.seen || []); st.g_key = saved.g_key || "none";
    } else {
      for (const c of cols) if (!c.visible) st.hidden.add(c.key);        // d23 b at first open
    }
    for (const c of cols) st.seen.add(c.key);                             // d24 a: unseen columns show
    function defaultSort() {
      const map = colByKey();
      if (spec.sort && map.has(spec.sort.key)) return spec.sort;
      const idk = identityKey();
      return { key: idk, dir: map.get(idk) && map.get(idk).kind === "number" ? "desc" : "asc" };
    }
    if (!st.s_key || !colByKey().has(st.s_key)) { const d = defaultSort(); st.s_key = d.key; st.s_dir = d.dir; }
    if (!st.s_dir) st.s_dir = defaultSort().dir;
    // A control's write clears the view's not-applied list (named once, until the
    // next change), marks this table as the one touched last, saves, and tells
    // the saved-view widgets so the dropdown's fill follows the state.
    const persist = (keepDropped) => { if (!keepDropped) st.viewDropped = []; lastTouched = handle; saveState(spec, st); for (const l of viewListeners) l(); };

    // dom skeleton; the probe at the end carries the fonts and paddings the
    // fit measures with (E8 rule 1)
    el.innerHTML = '<div class="tv-row tv-row1"></div><div class="tv-panel tv-narrow"></div>' +
      '<div class="tv-row tv-row2"></div><div class="tv-row tv-row3"></div><div class="tv-panel tv-columns"></div>' +
      '<div class="tv-count"></div><div class="tv-wrap"></div>' +
      '<div class="tv-probe" aria-hidden="true"><table class="tv-table"><thead><tr><th>M</th></tr></thead><tbody><tr>' +
      '<td class="tv-num">0</td><td class="tv-wrap">x<button type="button" class="tv-fold" tabindex="-1">+0</button></td>' +
      '<td class="tv-acts"><button type="button" tabindex="-1">x</button></td></tr></tbody></table></div>';
    const q = (s) => el.querySelector(s);

    const enumCols = () => cols.filter((c) => c.kind === "enum");
    const numCols = () => cols.filter((c) => c.kind === "number");
    const visibleCols = () => cols.filter((c) => !st.hidden.has(c.key));

    function passesFilters(row, exceptKey) {
      for (const c of enumCols()) {
        const want = st.f[c.key];
        if (!want || want === "all" || c.key === exceptKey) continue;
        if (String(row[c.key] ?? "") !== want) return false;
      }
      for (const c of numCols()) {
        const b = st.n[c.key]; if (!b) continue;
        const lo = b.min == null || b.min === "" ? null : Number(b.min);
        const hi = b.max == null || b.max === "" ? null : Number(b.max);
        if (lo === null && hi === null) continue;
        const v = asNumber(row[c.key]);
        if (v === null) return false;
        if (lo !== null && v < lo) return false;
        if (hi !== null && v > hi) return false;
      }
      return true;
    }

    // ----- controls -----
    function selectCtl(id, label, options, value, fill) {
      return '<div class="tv-ctl"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '" class="' + fill + '">' +
        options.map((o) => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select></div>";
    }
    function renderControls() {
      const map = colByKey();
      // row 1: enum filters in display order, then the narrow chip (F.2)
      let h = "";
      for (const c of enumCols()) {
        const counts = new Map();
        for (const r of data) if (passesFilters(r, c.key)) { const k = String(r[c.key] ?? ""); counts.set(k, (counts.get(k) || 0) + 1); }
        const opts = [["all", "All"]].concat([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => [k, (k === "" ? "(blank)" : k) + " (" + n + ")"]));
        const val = st.f[c.key] || "all";
        h += selectCtl("tvf-" + c.key, c.label, opts, val, val === "all" ? "" : "user-set");
      }
      const anyBound = numCols().some((c) => st.n[c.key] && ((st.n[c.key].min ?? "") !== "" || (st.n[c.key].max ?? "") !== ""));
      h += '<div class="tv-ctl"><label>&nbsp;</label><button type="button" id="tvNarrow" class="' + (numCols().length ? (anyBound ? "user-set" : "") : "na") + '"' + (numCols().length ? "" : " disabled") + '>narrow' + (st.panel === "narrow" ? " ▴" : "") + "</button></div>";
      q(".tv-row1").innerHTML = h;
      for (const c of enumCols()) q("#tvf-" + CSS_escape(c.key)).onchange = (e) => { st.f[c.key] = e.target.value; persist(); render(); };
      q("#tvNarrow").onclick = () => { st.panel = st.panel === "narrow" ? null : "narrow"; render(); };

      // narrow panel (E3)
      const np = q(".tv-narrow"); np.classList.toggle("open", st.panel === "narrow");
      np.innerHTML = numCols().map((c) => {
        const b = st.n[c.key] || {};
        return '<div class="tv-prow"><span class="tv-plabel">' + esc(c.label) + (c.unit ? " " + esc(c.unit) : "") + '</span>' +
          '<input type="number" step="any" inputmode="decimal" placeholder="min" data-k="' + esc(c.key) + '" data-b="min" value="' + esc(b.min ?? "") + '">' +
          '<input type="number" step="any" inputmode="decimal" placeholder="max" data-k="' + esc(c.key) + '" data-b="max" value="' + esc(b.max ?? "") + '"></div>';
      }).join("") || '<div class="tv-empty">No metric columns.</div>';
      np.querySelectorAll("input").forEach((inp) => { inp.onchange = () => { const k = inp.dataset.k; st.n[k] = st.n[k] || {}; st.n[k][inp.dataset.b] = inp.value; persist(); render(); }; });

      // row 2: Group, Sort, Dir, Headers fold (F.3)
      const gOpts = [["none", "None"]].concat(enumCols().map((c) => [c.key, c.label]));
      const sOpts = cols.map((c) => [c.key, c.label]);
      let h2 = selectCtl("tvGroup", "Group", gOpts, st.g_key, enumCols().length ? (st.g_key !== "none" ? "user-set" : "") : "na") +
        selectCtl("tvSort", "Sort", sOpts, st.s_key, "") +
        '<div class="tv-ctl"><label>Dir</label><button type="button" id="tvDir">' + (st.s_dir === "asc" ? "▲ asc" : "▼ desc") + "</button></div>";
      if (st.g_key !== "none") h2 += '<div class="tv-ctl"><label>&nbsp;</label><button type="button" id="tvFold" class="' + (st.foldMode === "closed" ? "user-set" : "") + '">' + (st.foldMode === "closed" ? "expand" : "collapse") + "</button></div>";
      q(".tv-row2").innerHTML = h2;
      q("#tvGroup").onchange = (e) => { st.g_key = e.target.value; st.foldExceptions.clear(); persist(); render(); };
      q("#tvSort").onchange = (e) => { st.s_key = e.target.value; const c = map.get(st.s_key); st.s_dir = c && c.kind === "number" ? "desc" : "asc"; persist(); render(); };
      q("#tvDir").onclick = () => { st.s_dir = st.s_dir === "asc" ? "desc" : "asc"; persist(); render(); };
      const fb = q("#tvFold"); if (fb) fb.onclick = () => { st.foldMode = st.foldMode === "closed" ? "open" : "closed"; st.foldExceptions.clear(); render(); };

      // row 3: columns chip (F.4) and its panel with the All line (E5)
      const idk = identityKey();
      const listed = cols.filter((c) => c.key !== idk);
      const atDefault = listed.every((c) => st.hidden.has(c.key) === !c.visible);   // grey at the default set, mint otherwise
      q(".tv-row3").innerHTML = '<div class="tv-ctl"><label>&nbsp;</label><button type="button" id="tvCols" class="' + (atDefault ? "" : "user-set") + '">columns' + (st.panel === "columns" ? " ▴" : "") + "</button></div>";
      q("#tvCols").onclick = () => { st.panel = st.panel === "columns" ? null : "columns"; render(); };
      const cp = q(".tv-columns"); cp.classList.toggle("open", st.panel === "columns");
      const onCount = listed.filter((c) => !st.hidden.has(c.key)).length;
      cp.innerHTML = (listed.length ? '<label class="tv-check tv-all"><input type="checkbox" data-all="1"' + (onCount === listed.length ? " checked" : "") + "> All</label>" : "") +
        listed.map((c) => '<label class="tv-check"><input type="checkbox" data-k="' + esc(c.key) + '"' + (st.hidden.has(c.key) ? "" : " checked") + "> " + esc(c.label) + (c.unit ? " " + esc(c.unit) : "") + "</label>").join("");
      const allBox = cp.querySelector("input[data-all]");
      if (allBox) {
        allBox.indeterminate = onCount > 0 && onCount < listed.length;   // the dash
        allBox.onchange = () => {                                         // columns-all-row a
          if (onCount > 0) for (const c of listed) st.hidden.add(c.key);  // checked or dash: every column off
          else for (const c of listed) st.hidden.delete(c.key);           // empty: every column on
          persist(); render();
        };
      }
      cp.querySelectorAll("input[data-k]").forEach((inp) => { inp.onchange = () => { if (inp.checked) st.hidden.delete(inp.dataset.k); else st.hidden.add(inp.dataset.k); persist(); render(); }; });
    }
    function CSS_escape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/([^\w-])/g, "\\$1"); }

    // ----- fit (E8, E9): measured widths, recomputed at every render -----
    let scale = 1, calibrated = false;
    // E9 case 2: an identity is long when its drawn width passes this share of the table's width
    const isLongIdent = (r, idkCol, width, m) => !!idkCol && m.w(m.f.txt, plainCell(idkCol, r)) > width * IDENTITY_OWN_LINE_ABOVE_PERCENT / 100;
    const headText = (c) => c.label + (c.unit ? " " + c.unit : "") + (c.key === st.s_key ? (st.s_dir === "asc" ? " ▴" : " ▾") : "");
    function measurer() {
      const p = (s) => el.querySelector(".tv-probe " + s);
      const num = p("td.tv-num"), fold = p("button.tv-fold"), act = p("td.tv-acts button");
      return {
        f: { th: fontOf(p("th")), num: fontOf(num), txt: fontOf(p("td.tv-wrap")), fold: fontOf(fold), act: fontOf(act) },
        cellPad: sideSpace(num, false),
        foldSpace: sideSpace(fold, true),
        actSpace: sideSpace(act, true),
        w: (font, s) => canvasWidth(font, s) * scale,
      };
    }
    // E8 rule 2: the larger of the longest header word and the longest value
    function columnNeed(c, shown, m) {
      let px = 0;
      for (const w of headerWords(headText(c))) px = Math.max(px, m.w(m.f.th, w));
      const cap = c.kind === "number" ? Infinity : c.text === "clip" ? CLIP_CHARS : TEXT_NEED_MAX_CHARS;
      const font = c.kind === "number" ? m.f.num : m.f.txt;
      const seen = new Set();
      for (const r of shown) {
        let s = plainCell(c, r); if (s.length > cap) s = s.slice(0, cap);
        if (seen.has(s)) continue; seen.add(s);
        px = Math.max(px, m.w(font, s));
      }
      return Math.ceil(px + m.cellPad);
    }
    // E8 rule 2, the ceiling (long-column b): no column claims more than
    // COLUMN_MAX_PERCENT of the table's width; a value wider than its cell then
    // shows as one line ending in an ellipsis that a tap opens (E10).
    const ceilingPx = (width) => Math.floor(width * COLUMN_MAX_PERCENT / 100);
    // E8 rule 6: the widest fold toggle face this table can show
    function toggleWidth(nCols, withActs, m) {
      const faces = ["▾", "+" + nCols].concat(withActs ? ["+ actions"] : []);
      return Math.max(...faces.map((s) => m.w(m.f.fold, s))) + m.foldSpace;
    }
    // E8 rule 3
    function identityWidth(c, besideRows, width, phone, toggleW, m) {
      let word = 0, whole = 0;
      for (const w of headerWords(headText(c))) word = Math.max(word, m.w(m.f.th, w));
      const seen = new Set();
      for (const r of besideRows) {
        const s = plainCell(c, r);
        if (seen.has(s)) continue; seen.add(s);
        whole = Math.max(whole, m.w(m.f.txt, s));
        for (const w of spaceWords(s)) word = Math.max(word, m.w(m.f.txt, w));
      }
      let px = word + m.cellPad;
      if (phone) px = Math.max(px, Math.min(width * IDENTITY_MIN_PERCENT_PHONE / 100, whole + m.cellPad));
      return Math.ceil(Math.max(px, toggleW + m.cellPad, IDENTITY_MIN_PX));
    }
    // E8 rule 5: the widest set of buttons any shown row carries
    function actionsWidth(shown, m) {
      let best = 0;
      for (const r of shown) { let w = 0; for (const a of (spec.actions || [])) if (matches(a, r)) w += m.w(m.f.act, a.label) + m.actSpace; if (w > best) best = w; }
      return best ? Math.ceil(best + m.cellPad) : 0;
    }
    function fitColumns(shown, width) {
      const m = measurer();
      const idk = identityKey(); const identCol = colByKey().get(idk);
      const phone = width < PHONE_LAYOUT_BELOW_PX;
      const visible = visibleCols().filter((c) => c.key !== idk);
      const ceiling = ceilingPx(width);
      const needs = new Map(visible.map((c) => [c.key, Math.min(columnNeed(c, shown, m), ceiling)]));
      const actsW = actionsWidth(shown, m);
      const hasActs = actsW > 0;
      const longRows = new Set(identCol ? shown.filter((r) => isLongIdent(r, identCol, width, m)) : []);
      const besideRows = shown.filter((r) => !longRows.has(r));
      const identAll = !!identCol && shown.length > 0 && besideRows.length === 0;
      const identW = identCol && !identAll ? Math.max(IDENTITY_MIN_PX, Math.min(identityWidth(identCol, besideRows, width, phone, toggleWidth(visible.length, hasActs, m), m), ceiling)) : 0;
      // E8 rule 4: a contiguous prefix in display order, never reshuffled to fit
      const attempt = (iw) => {
        let used = iw, full = false; const inRow = [], folded = [];
        for (const c of visible) { const w = needs.get(c.key); if (!full && used + w <= width) { inRow.push(c); used += w; } else { full = true; folded.push(c); } }
        const actsInRow = hasActs && !folded.length && used + actsW <= width;
        return { inRow, folded, actsInRow, actsInFold: hasActs && !actsInRow };
      };
      let fit = attempt(identW), identLines = false;
      if (phone && identW && fit.folded.length) {                    // E9 case 1: only when the move puts at least one more column in the row
        const moved = attempt(0);
        if (moved.inRow.length > fit.inRow.length) { fit = moved; identLines = true; }
      }
      return Object.assign(fit, { width, n: visible.length, needs, actsW, identAll, identLines, longRows, identW: identLines ? 0 : identW, m });
    }
    // The canvas measures at the CSS font size; a device that draws text larger
    // (a phone's text-size setting) shows up as drawn number cells wider than
    // the canvas says at the probe's font, and every width is scaled by that.
    // Runs once per table, on the first render that draws number cells.
    // Drawn widths come back zoomed by the page's text size (E14) while the
    // container's clientWidth does not, so the drawn width is divided by the
    // table's effective zoom; the page's size then acts once, through the
    // narrower clientWidth (measured in Chrome 152, 2026-09-25).
    function calibrate() {
      const cells = [...el.querySelectorAll("div.tv-wrap td.tv-num")].filter((td) => { const s = td.textContent.trim(); return s && s !== "—"; });
      if (!cells.length) return false;
      const font = fontOf(el.querySelector(".tv-probe td.tv-num"));
      const zoom = el.currentCSSZoom || 1;
      const range = document.createRange(); const ratios = [];
      for (const td of cells) {
        range.selectNodeContents(td);
        const drawn = range.getBoundingClientRect().width / zoom, est = canvasWidth(font, td.textContent);
        if (drawn > 0 && est > 0) ratios.push(drawn / est);
      }
      if (!ratios.length) return false;
      ratios.sort((a, b) => a - b);
      scale = ratios[Math.floor(ratios.length / 2)];
      calibrated = true;
      return true;
    }

    // ----- table (E6, E8, E9, E10, E12) -----
    let lastWidth = 0;
    function renderTable(shown) {
      const wrap = q("div.tv-wrap");
      const width = el.clientWidth;
      if (!width) { wrap.innerHTML = ""; lastWidth = 0; return null; }   // hidden: drawn when shown, by the resize observer
      lastWidth = width;
      const map = colByKey(); const idk = identityKey(); const identCol = map.get(idk);
      const fit = fitColumns(shown, width);
      const sortCol = map.get(st.s_key);
      const identInRow = !!identCol && !fit.identAll && !fit.identLines;
      const ncols = Math.max(1, (identInRow ? 1 : 0) + fit.inRow.length + (fit.actsInRow ? 1 : 0));
      // E8 rule 7: fixed layout with shares of the measured widths; the table
      // fills its container and is never wider, so the page never scrolls
      // sideways (d9 a).
      const shares = [];
      if (identInRow) shares.push(fit.identW);
      for (const c of fit.inRow) shares.push(fit.needs.get(c.key));
      if (fit.actsInRow) shares.push(fit.actsW);
      if (!shares.length) shares.push(1);
      // The ceiling holds after the sharing too (long-column b): a cell that rule 7
      // would widen past COLUMN_MAX_PERCENT stays at the ceiling and the width it
      // declines goes to the other cells, in proportion, until none passes it.
      if (shares.length > 1) {
        const cap = ceilingPx(width);
        for (let pass = 0; pass < shares.length; pass++) {
          const total = shares.reduce((a, b) => a + b, 0);
          const px = shares.map((w) => width * w / total);
          const i = px.findIndex((v) => v > cap + 0.5);
          if (i < 0) break;
          const rest = total - shares[i];                                    // the other cells' claims
          const want = cap * rest / (width - cap);                           // the claim that lands this cell on the ceiling
          shares[i] = want;
        }
      }
      const sum = shares.reduce((a, b) => a + b, 0);
      const colgroup = "<colgroup>" + shares.map((w) => '<col style="width:' + (100 * w / sum).toFixed(3) + '%">').join("") + "</colgroup>";
      const th = (c, cls) => '<th class="' + cls + (c.key === st.s_key ? " tv-sorted" : "") + '">' + esc(headText(c)).replace(/\//g, "/<wbr>") + "</th>";
      const headCells = (identInRow ? th(identCol, "tv-ident") : "") + fit.inRow.map((c) => th(c, c.kind === "number" ? "tv-num" : "tv-text")).join("") + (fit.actsInRow ? "<th></th>" : "");
      let h = colgroup + (headCells ? "<thead><tr>" + headCells + "</tr></thead>" : "") + "<tbody>";
      const tdClass = (c) => c.kind === "number" ? "tv-num" : (c.text === "clip" ? "tv-clip" : c.text === "shrink" ? "tv-shrink" : "tv-wrap");
      // E10, the ceiling: a value drawn wider than the ceiling gets the clipped
      // treatment whatever the column's policy, measured as the fit measures;
      // a value under the ceiling wraps inside its cell as before.
      const cellPx = new Map(); { let k = 0; if (identInRow) cellPx.set(identCol.key, width * shares[k++] / sum); for (const c of fit.inRow) cellPx.set(c.key, width * shares[k++] / sum); }
      const over = (c, r) => { if (c.text === "clip" || c.text === "shrink" || !cellPx.has(c.key)) return false; return fit.m.w(c.kind === "number" ? fit.m.f.num : fit.m.f.txt, plainCell(c, r)) + fit.m.cellPad > ceilingPx(width); };
      const overClass = (c, r, i) => over(c, r) ? " tv-over" + (st.openCells.has(i + ":" + c.key) ? " open" : "") : "";
      const hasCellsRow = identInRow || fit.inRow.length > 0 || fit.actsInRow;
      const rowHtml = (r, i) => {
        const identHtml = identCol ? cellHtml(identCol, r) : "";
        const ownLine = !!identCol && (fit.identLines || fit.identAll || fit.longRows.has(r));   // E9
        const actsHere = fit.actsInFold && (spec.actions || []).some((a) => matches(a, r));
        const hasFold = fit.folded.length > 0 || actsHere;
        const open = hasFold && st.expanded.has(i);
        const face = open ? "▾" : fit.folded.length ? "+" + fit.folded.length : "+ actions";        // E8 rule 6
        const toggle = hasFold ? '<button type="button" class="tv-fold" data-i="' + i + '" aria-expanded="' + open + '">' + face + "</button>" : "";
        let s = "";
        if (ownLine) s += '<tr class="tv-identline"><td colspan="' + ncols + '">' + identHtml + toggle + "</td></tr>";
        if (hasCellsRow) {
          s += "<tr>";
          if (identInRow) s += '<td class="tv-ident ' + tdClass(identCol) + (ownLine ? "" : overClass(identCol, r, i)) + '" data-i="' + i + '" data-k="' + esc(identCol.key) + '">' + (ownLine ? "" : identHtml + toggle) + "</td>";
          for (const c of fit.inRow) s += '<td class="' + tdClass(c) + (st.openCells.has(i + ":" + c.key) && c.text === "clip" ? " open" : "") + overClass(c, r, i) + '" data-i="' + i + '" data-k="' + esc(c.key) + '">' + cellHtml(c, r) + "</td>";
          if (fit.actsInRow) s += '<td class="tv-acts" data-i="' + i + '"></td>';
          s += "</tr>";
        }
        if (open) s += '<tr class="tv-foldline"><td colspan="' + ncols + '">' + fit.folded.map((c) => '<span class="tv-field"><b>' + esc(c.label) + (c.unit ? " " + esc(c.unit) : "") + "</b>" + cellHtml(c, r) + "</span>").join("") + (actsHere ? '<div class="tv-acts tv-acts-line" data-i="' + i + '"></div>' : "") + "</td></tr>";
        return s;
      };
      if (!shown.length) h += '<tr><td colspan="' + ncols + '" class="tv-empty">Nothing here.</td></tr>';
      else if (st.g_key !== "none" && map.has(st.g_key)) {
        const gcol = map.get(st.g_key);
        const groups = new Map();
        shown.forEach((r, i) => { const k = String(r[gcol.key] ?? ""); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
        const extreme = (idx) => { let best = null; for (const i of idx) { const v = shown[i][st.s_key]; if (isBlank(v)) continue; if (best === null || compareBy(sortCol, st.s_dir)(shown[i], shown[best]) < 0) best = i; } return best; };
        const order = [...groups.entries()].sort((a, b) => { const x = extreme(a[1]), y = extreme(b[1]); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return compareBy(sortCol, st.s_dir)(shown[x], shown[y]); });
        for (const [gk, idx] of order) {
          const closed = st.foldMode === "closed" ? !st.foldExceptions.has(gk) : st.foldExceptions.has(gk);
          h += '<tr class="tv-group"><td colspan="' + ncols + '"><button type="button" data-g="' + esc(gk) + '">' + (closed ? "▸" : "▾") + "</button>" + esc(gk === "" ? "(blank)" : gk) + ' <span style="font-weight:400">· ' + idx.length + (idx.length === 1 ? " row" : " rows") + "</span></td></tr>";
          if (!closed) for (const i of idx) h += rowHtml(shown[i], i);
        }
      } else shown.forEach((r, i) => { h += rowHtml(r, i); });
      h += "</tbody>";
      wrap.innerHTML = '<table class="tv-table">' + h + "</table>";
      const t = wrap.querySelector("table.tv-table");
      t.querySelectorAll("button.tv-fold").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const i = Number(b.dataset.i); if (st.expanded.has(i)) st.expanded.delete(i); else st.expanded.add(i); renderTable(shown); }; });
      t.querySelectorAll("tr.tv-group button").forEach((b) => { b.onclick = () => { const g = b.dataset.g; if (st.foldExceptions.has(g)) st.foldExceptions.delete(g); else st.foldExceptions.add(g); renderTable(shown); }; });
      t.querySelectorAll("td.tv-clip, td.tv-over").forEach((td) => { td.onclick = (e) => { if (e.target.closest("button")) return; const k = td.dataset.i + ":" + td.dataset.k; if (st.openCells.has(k)) st.openCells.delete(k); else st.openCells.add(k); td.classList.toggle("open"); }; });
      t.querySelectorAll(".tv-acts").forEach((node) => { const r = shown[Number(node.dataset.i)]; for (const a of (spec.actions || [])) if (matches(a, r)) node.appendChild(actionButton(a, r, spec)); });
      return fit;
    }

    function renderCount(shown, fit) {
      const map = colByKey();
      const parts = [];
      if (st.view && matchesView(st.view)) parts.push("view " + esc(st.view.name));   // E15.1 post: while the table shows the chosen view
      parts.push("<b>" + shown.length.toLocaleString() + "</b> shown of " + data.length.toLocaleString() + " rows");
      for (const c of enumCols()) if (st.f[c.key] && st.f[c.key] !== "all") parts.push(esc(c.label) + " " + esc(st.f[c.key] === "" ? "(blank)" : st.f[c.key]));
      for (const c of numCols()) { const b = st.n[c.key]; if (!b) continue; if ((b.min ?? "") !== "") parts.push(esc(c.label) + " ≥ " + esc(b.min)); if ((b.max ?? "") !== "") parts.push(esc(c.label) + " ≤ " + esc(b.max)); }
      if (st.view && st.viewDropped.length) parts.push("view " + esc(st.view.name) + ": not applied: " + st.viewDropped.map(esc).join(", "));   // missing-column a, named once
      if (st.g_key !== "none" && map.has(st.g_key)) parts.push("by " + esc(map.get(st.g_key).label));
      // E11: the fit of the last render and its trigger, the table's width
      if (fit) {
        // E11: with every column cleared the fit reads as a plain statement, not "0 of 0"
        let f = fit.n === 0 ? "no columns chosen; identity only" : fit.inRow.length + " of " + fit.n + " columns in the row at " + Math.round(fit.width) + " px";
        if (fit.folded.length) f += ", " + fit.folded.length + " in the fold";
        if (fit.actsInFold) f += ", actions in the fold";
        parts.push(f);
        if (fit.identLines) { const ic = map.get(identityKey()); parts.push(esc(ic ? ic.label : "identity") + " on its own line"); }
      }
      q(".tv-count").innerHTML = parts.join(" · ");
    }

    function render() {
      const map = colByKey();
      if (!map.has(st.s_key)) { const d = defaultSort(); st.s_key = d.key; st.s_dir = d.dir; }
      renderControls();
      const shown = data.filter((r) => passesFilters(r, null)).sort(compareBy(map.get(st.s_key), st.s_dir));
      let fit = renderTable(shown);
      if (fit && !calibrated && calibrate()) fit = renderTable(shown);
      renderCount(shown, fit);
    }

    // ----- saved views (E15): this table's side -----
    const stateView = () => ({ f: st.f, n: st.n, s_key: st.s_key, s_dir: st.s_dir, hidden: [...st.hidden], g_key: st.g_key });
    const matchesView = (v) => !!v && canonicalView(v, colByKey()) === canonicalView(stateView(), colByKey());
    // What save view writes: the table's name and section, the module's state
    // version, and every saved variable of section D over the columns present.
    function snapshotView() {
      const map = colByKey();
      const f = {}; for (const k of Object.keys(st.f)) if (st.f[k] && st.f[k] !== "all" && map.has(k)) f[k] = st.f[k];
      const n = {}; for (const k of Object.keys(st.n)) { const b = st.n[k] || {}; if (!map.has(k)) continue; const min = b.min == null ? "" : String(b.min), max = b.max == null ? "" : String(b.max); if (min !== "" || max !== "") n[k] = { min, max }; }
      return { table: handle.tableName, section: spec.section, state_version: STATE_VERSION, f, n, s_key: st.s_key, s_dir: st.s_dir, hidden: [...st.hidden].filter((k) => map.has(k)), g_key: st.g_key || "none" };
    }
    // Restoring a view (ruling missing-column a): every setting naming a column
    // the table has applies; the rest are dropped and named once in the count
    // line; the sort and the group fall to their defaults; a column the view
    // never saw shows (d24 a); another state_version is applied the same way and
    // never discarded. Writes every saved variable at once, as a reload does.
    function applyView(v) {
      const map = colByKey(); const dropped = [];
      const nameOf = (k) => map.has(k) ? map.get(k).label : String(k).replace(/_/g, " ");
      st.f = {};
      for (const [k, x] of Object.entries(v.f || {})) { if (!x || x === "all") continue; const c = map.get(k); if (c && c.kind === "enum") st.f[k] = String(x); else dropped.push(nameOf(k) + " filter"); }
      st.n = {};
      for (const [k, b] of Object.entries(v.n || {})) {
        if (!b) continue; const min = b.min == null ? "" : String(b.min), max = b.max == null ? "" : String(b.max); if (min === "" && max === "") continue;
        const c = map.get(k); if (c && c.kind === "number") st.n[k] = { min, max }; else dropped.push(nameOf(k) + " bound");
      }
      if (v.s_key && map.has(v.s_key)) { st.s_key = v.s_key; st.s_dir = v.s_dir === "asc" ? "asc" : "desc"; }
      else { if (v.s_key) dropped.push("sort by " + nameOf(v.s_key)); const d = defaultSort(); st.s_key = d.key; st.s_dir = d.dir; }
      st.hidden = new Set();
      for (const k of (v.hidden || [])) { if (map.has(k)) st.hidden.add(k); else dropped.push(nameOf(k) + " hidden"); }
      for (const c of cols) st.seen.add(c.key);
      const g = v.g_key || "none"; const gc = map.get(g);
      if (g === "none") st.g_key = "none"; else if (gc && gc.kind === "enum") st.g_key = g; else { st.g_key = "none"; dropped.push("group by " + nameOf(g)); }
      st.foldExceptions.clear(); st.expanded.clear(); st.openCells.clear(); st.panel = null;
      st.view = v; st.viewDropped = dropped;
      persist(true); render();
      return dropped;
    }
    const markView = (v) => { st.view = v; st.viewDropped = []; render(); };           // after save view: the table now shows this view
    const forgetView = (name) => { if (st.view && st.view.name === name) { st.view = null; st.viewDropped = []; render(); } };

    // Width changes re-render: a window resize, and the container itself
    // changing size, which is how a section hidden at mount (width 0) gets its
    // real width when its section is shown.
    const onResize = () => { const w = el.clientWidth || 0; if (w > 0 && Math.abs(w - lastWidth) > REDRAW_MIN_WIDTH_CHANGE_PX) render(); };
    window.addEventListener("resize", onResize);
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(onResize); ro.observe(el); }
    renderers.add(render);
    mounts.set(handle.tableName, handle);                                 // E15: a view finds its table by the spec's name
    for (const l of viewListeners) l();                                   // the widgets, mounted before the tables, list this one as present
    render();

    return Object.assign(handle, {
      state: st,
      update(newRows) { data = Array.isArray(newRows) ? newRows.filter(Boolean) : []; cols = inferColumns(data, spec); for (const c of cols) if (!st.seen.has(c.key)) { st.seen.add(c.key); } st.expanded.clear(); st.openCells.clear(); persist(true); render(); },
      destroy() { window.removeEventListener("resize", onResize); if (ro) ro.disconnect(); renderers.delete(render); if (mounts.get(handle.tableName) === handle) mounts.delete(handle.tableName); el.innerHTML = ""; el.classList.remove("tv"); },
      snapshotView, applyView, markView, forgetView, matchesView,
    });
  }

  window.TableViewer = { version: VERSION, stateVersion: STATE_VERSION, mountTable, actionButton, mountTextSize, mountViewsTblVwr, inferColumns, inferKind };
  window.mountTable = mountTable;
  window.mountViewsTblVwr = mountViewsTblVwr;
})();
