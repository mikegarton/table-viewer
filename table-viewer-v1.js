/* table-viewer v1 — one table, any shape.
   Spec of record: C:\dev\working_docs\projects\table-viewer\table-viewer-spec.md
   (draft 2: Mike's rulings d1 to d39 of 2026-09-22 and the rulings of
   2026-09-23 cited by slug). Section letters below cite it.

   mountTable(container, rows, spec) -> { update(rows), state, destroy() }
     container: element. rows: array of row objects. spec (optional, section B):
       name, identity, sort {key, dir}, site, columns [{key, label, unit, decimals,
       kind, text, visible, render, mark}], actions [{label, when, route, method,
       payload, guard, done, input}], request(action, row, body), afterAction(...).
   TableViewer.actionButton(action, row, spec) -> button element, the same guard
   mechanics for a page's own rows (the ops page's Limits campaign rows).

   Build decisions beyond the spec are listed in
   projects\table-viewer\build-decisions-2026-09-22.md. No dependency; no build step. */
(function () {
  "use strict";
  const VERSION = "1";
  const STATE_VERSION = 1;
  // Section P lists every constant with its rule and effect; the ops page's
  // Code constants table lists the same rows.
  const ENUM_MAX_DISTINCT = 12;            // d8 a: the sheet_shape.py rule
  const IDENTITY_OWN_LINE_MIN_CHARS = 24;  // E9 case 2
  const ARM_SECONDS = 5;                   // E12: an armed button disarms after this
  const TEXT_FLOOR_PX = 16;                // G: Text is black and big enough
  const PHONE_LAYOUT_BELOW_PX = 600;       // E8 rule 3, E9 case 1: Android's compact window width class ends at 600 dp
  const IDENTITY_MIN_PERCENT_PHONE = 30;   // E8 rule 3; rule: none on record
  const IDENTITY_MIN_PX = 80;              // E8 rule 3; rule: none on record
  const TEXT_NEED_MAX_CHARS = 40;          // E8 rule 2; rule: none on record
  const CLIP_CHARS = 22;                   // E8 rule 2; rule: none on record
  const REDRAW_MIN_WIDTH_CHANGE_PX = 24;   // E8; rule: none on record

  // ---------- styles, injected once ----------
  const CSS = `
.tv { font-size: 16px; line-height: 1.4; color: var(--ink, #e8e8e6);
      --tv-mint: var(--mint, #7fe3b0); --tv-yellow: var(--yellow, #ffd166); --tv-sand: var(--faint, #ead9b0);
      --tv-line: var(--line, #2c3038); --tv-card: var(--card, #1a1c21); --tv-card2: var(--card2, #22252c);
      --tv-accent: var(--accent, #5aa8f0); --tv-gold: var(--gold, #e0b34e); --tv-bad: var(--bad, #e25555);
      --tv-good: var(--good, #6fc48d); --tv-dim: var(--dim, #bfe3ff); }
.tv * { box-sizing: border-box; }
.tv-row { display: flex; gap: 8px; align-items: flex-end; overflow-x: auto; scrollbar-width: none; padding: 4px 0; }
.tv-row::-webkit-scrollbar { display: none; }
.tv-ctl { display: flex; flex-direction: column; gap: 2px; flex: none; }
.tv-ctl label { font-size: 13px; color: var(--tv-dim); white-space: nowrap; }
.tv-ctl select { max-width: min(60vw, 18em); }
.tv select, .tv button, .tv input { font: inherit; color: var(--ink, #e8e8e6); background: var(--tv-card);
      border: 1px solid var(--tv-line); border-radius: 8px; padding: 6px 8px; min-height: 40px; }
.tv button { cursor: pointer; white-space: nowrap; }
.tv .user-set { border-color: var(--tv-mint); color: var(--tv-mint); }
.tv .side-effect { border-color: var(--tv-yellow); color: var(--tv-yellow); }
.tv .na { border-color: var(--tv-sand); color: var(--tv-sand); text-decoration: line-through; }
.tv-count { margin: 6px 0; font-size: 15px; }
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
.tv-table th { position: sticky; top: 0; background: var(--tv-card); color: var(--tv-dim); font-weight: 600; white-space: normal; }
.tv-table th.tv-sorted { color: var(--tv-accent); }
.tv-table td.tv-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.tv-table th.tv-ident, .tv-table td.tv-ident { text-align: left; }
.tv-table th.tv-text, .tv-table td.tv-wrap, .tv-table td.tv-clip, .tv-table td.tv-shrink { text-align: left; }
.tv-table td.tv-wrap { white-space: normal; overflow-wrap: break-word; }
.tv-table td.tv-clip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 14em; cursor: pointer; }
.tv-table td.tv-clip.open { white-space: normal; overflow: visible; max-width: none; }
.tv-table td.tv-shrink { white-space: normal; overflow-wrap: anywhere; font-size: ${TEXT_FLOOR_PX}px; }
.tv-table tr.tv-identline td { text-align: left; border-bottom: none; padding-bottom: 0; font-weight: 600; white-space: normal; overflow-wrap: break-word; }
.tv-table tr.tv-identline + tr td { padding-top: 2px; }
.tv-table tr.tv-group td { text-align: left; color: var(--tv-accent); font-weight: 700; padding-top: 14px; background: var(--tv-card2); }
.tv-table tr.tv-group td button { min-height: 32px; padding: 2px 8px; margin-right: 8px; }
.tv-table tr.tv-foldline td { text-align: left; white-space: normal; background: var(--tv-card2); border-bottom: 1px solid var(--tv-line); }
.tv-table tr.tv-foldline .tv-field { display: block; padding: 2px 0; overflow-wrap: break-word; }
.tv-table tr.tv-foldline .tv-field b { color: var(--tv-dim); font-weight: 600; margin-right: 6px; }
.tv-fold { min-height: 32px; padding: 2px 8px; font-size: 14px; margin-left: 6px; }
.tv-acts { white-space: normal; }
.tv-acts button { min-height: 34px; padding: 4px 8px; font-size: 14px; margin: 2px 4px 2px 0; }
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
    const st = { f: {}, n: {}, s_key: null, s_dir: null, hidden: new Set(), seen: new Set(), g_key: "none", expanded: new Set(), openCells: new Set(), foldMode: "open", foldExceptions: new Set(), panel: null };
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
    const persist = () => saveState(spec, st);

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
    const isLongIdent = (r, idk) => String(r[idk] ?? "").length > IDENTITY_OWN_LINE_MIN_CHARS;
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
      const needs = new Map(visible.map((c) => [c.key, columnNeed(c, shown, m)]));
      const actsW = actionsWidth(shown, m);
      const hasActs = actsW > 0;
      const besideRows = shown.filter((r) => !isLongIdent(r, idk));
      const identAll = !!identCol && shown.length > 0 && besideRows.length === 0;
      const identW = identCol && !identAll ? identityWidth(identCol, besideRows, width, phone, toggleWidth(visible.length, hasActs, m), m) : 0;
      // E8 rule 4: a contiguous prefix in display order, never reshuffled to fit
      const attempt = (iw) => {
        let used = iw, full = false; const inRow = [], folded = [];
        for (const c of visible) { const w = needs.get(c.key); if (!full && used + w <= width) { inRow.push(c); used += w; } else { full = true; folded.push(c); } }
        const actsInRow = hasActs && !folded.length && used + actsW <= width;
        return { inRow, folded, actsInRow, actsInFold: hasActs && !actsInRow };
      };
      let fit = attempt(identW), identLines = false;
      if (phone && identW && fit.folded.length) { fit = attempt(0); identLines = true; }   // E9 case 1
      return Object.assign(fit, { width, n: visible.length, needs, actsW, identAll, identLines, identW: identLines ? 0 : identW });
    }
    // The canvas measures at the CSS font size; a device that draws text larger
    // (a phone's text-size setting) shows up as drawn number cells wider than
    // the canvas says at the probe's font, and every width is scaled by that.
    // Runs once per table, on the first render that draws number cells.
    function calibrate() {
      const cells = [...el.querySelectorAll("div.tv-wrap td.tv-num")].filter((td) => { const s = td.textContent.trim(); return s && s !== "—"; });
      if (!cells.length) return false;
      const font = fontOf(el.querySelector(".tv-probe td.tv-num"));
      const range = document.createRange(); const ratios = [];
      for (const td of cells) {
        range.selectNodeContents(td);
        const drawn = range.getBoundingClientRect().width, est = canvasWidth(font, td.textContent);
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
      const sum = shares.reduce((a, b) => a + b, 0);
      const colgroup = "<colgroup>" + shares.map((w) => '<col style="width:' + (100 * w / sum).toFixed(3) + '%">').join("") + "</colgroup>";
      const th = (c, cls) => '<th class="' + cls + (c.key === st.s_key ? " tv-sorted" : "") + '">' + esc(headText(c)).replace(/\//g, "/<wbr>") + "</th>";
      const headCells = (identInRow ? th(identCol, "tv-ident") : "") + fit.inRow.map((c) => th(c, c.kind === "number" ? "tv-num" : "tv-text")).join("") + (fit.actsInRow ? "<th></th>" : "");
      let h = colgroup + (headCells ? "<thead><tr>" + headCells + "</tr></thead>" : "") + "<tbody>";
      const tdClass = (c) => c.kind === "number" ? "tv-num" : (c.text === "clip" ? "tv-clip" : c.text === "shrink" ? "tv-shrink" : "tv-wrap");
      const hasCellsRow = identInRow || fit.inRow.length > 0 || fit.actsInRow;
      const rowHtml = (r, i) => {
        const identHtml = identCol ? cellHtml(identCol, r) : "";
        const ownLine = !!identCol && (fit.identLines || fit.identAll || isLongIdent(r, idk));   // E9
        const actsHere = fit.actsInFold && (spec.actions || []).some((a) => matches(a, r));
        const hasFold = fit.folded.length > 0 || actsHere;
        const open = hasFold && st.expanded.has(i);
        const face = open ? "▾" : fit.folded.length ? "+" + fit.folded.length : "+ actions";        // E8 rule 6
        const toggle = hasFold ? '<button type="button" class="tv-fold" data-i="' + i + '" aria-expanded="' + open + '">' + face + "</button>" : "";
        let s = "";
        if (ownLine) s += '<tr class="tv-identline"><td colspan="' + ncols + '">' + identHtml + toggle + "</td></tr>";
        if (hasCellsRow) {
          s += "<tr>";
          if (identInRow) s += '<td class="tv-ident ' + tdClass(identCol) + '" data-i="' + i + '" data-k="' + esc(identCol.key) + '">' + (ownLine ? "" : identHtml + toggle) + "</td>";
          for (const c of fit.inRow) s += '<td class="' + tdClass(c) + (st.openCells.has(i + ":" + c.key) ? " open" : "") + '" data-i="' + i + '" data-k="' + esc(c.key) + '">' + cellHtml(c, r) + "</td>";
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
      t.querySelectorAll("td.tv-clip").forEach((td) => { td.onclick = () => { const k = td.dataset.i + ":" + td.dataset.k; if (st.openCells.has(k)) st.openCells.delete(k); else st.openCells.add(k); td.classList.toggle("open"); }; });
      t.querySelectorAll(".tv-acts").forEach((node) => { const r = shown[Number(node.dataset.i)]; for (const a of (spec.actions || [])) if (matches(a, r)) node.appendChild(actionButton(a, r, spec)); });
      return fit;
    }

    function renderCount(shown, fit) {
      const map = colByKey();
      const parts = ["<b>" + shown.length.toLocaleString() + "</b> shown of " + data.length.toLocaleString() + " rows"];
      for (const c of enumCols()) if (st.f[c.key] && st.f[c.key] !== "all") parts.push(esc(c.label) + " " + esc(st.f[c.key] === "" ? "(blank)" : st.f[c.key]));
      for (const c of numCols()) { const b = st.n[c.key]; if (!b) continue; if ((b.min ?? "") !== "") parts.push(esc(c.label) + " ≥ " + esc(b.min)); if ((b.max ?? "") !== "") parts.push(esc(c.label) + " ≤ " + esc(b.max)); }
      if (st.g_key !== "none" && map.has(st.g_key)) parts.push("by " + esc(map.get(st.g_key).label));
      // E11: the fit of the last render and its trigger, the table's width
      if (fit) {
        let f = fit.inRow.length + " of " + fit.n + " columns in the row at " + Math.round(fit.width) + " px";
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

    // Width changes re-render: a window resize, and the container itself
    // changing size, which is how a section hidden at mount (width 0) gets its
    // real width when its section is shown.
    const onResize = () => { const w = el.clientWidth || 0; if (w > 0 && Math.abs(w - lastWidth) > REDRAW_MIN_WIDTH_CHANGE_PX) render(); };
    window.addEventListener("resize", onResize);
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(onResize); ro.observe(el); }
    render();

    return {
      state: st,
      update(newRows) { data = Array.isArray(newRows) ? newRows.filter(Boolean) : []; cols = inferColumns(data, spec); for (const c of cols) if (!st.seen.has(c.key)) { st.seen.add(c.key); } st.expanded.clear(); st.openCells.clear(); persist(); render(); },
      destroy() { window.removeEventListener("resize", onResize); if (ro) ro.disconnect(); el.innerHTML = ""; el.classList.remove("tv"); },
    };
  }

  window.TableViewer = { version: VERSION, stateVersion: STATE_VERSION, mountTable, actionButton, inferColumns, inferKind };
  window.mountTable = mountTable;
})();
