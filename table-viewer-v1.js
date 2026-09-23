/* table-viewer v1 — one table, any shape.
   Spec of record: C:\dev\working_docs\projects\table-viewer\table-viewer-spec.md
   (Mike's rulings d1 to d39, 2026-09-22). Section letters below cite it.

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
  const ENUM_MAX_DISTINCT = 12;          // d8 a: the sheet_shape.py rule
  const IDENTITY_OWN_LINE_MIN_CHARS = 24; // E9; measured on the phone at build
  const ARM_SECONDS = 5;                  // E12: an armed button disarms after this
  const TEXT_FLOOR_PX = 16;               // G: Text is black and big enough
  const ACTIONS_IN_ROW_MIN_PX = 600;      // below this width the action buttons sit in the fold line
  const FOLD_W = 110, ACTS_W = 150;       // fit reserve for the fold button column and the action column
  const FOLD_W_NARROW = 64;               // the compact fold button ("+22") below ACTIONS_IN_ROW_MIN_PX

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

    // dom skeleton
    el.innerHTML = '<div class="tv-row tv-row1"></div><div class="tv-panel tv-narrow"></div>' +
      '<div class="tv-row tv-row2"></div><div class="tv-row tv-row3"></div><div class="tv-panel tv-columns"></div>' +
      '<div class="tv-count"></div><div class="tv-wrap"></div>';
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

      // row 3: columns chip (F.4) and its panel (E5)
      q(".tv-row3").innerHTML = '<div class="tv-ctl"><label>&nbsp;</label><button type="button" id="tvCols" class="' + (st.hidden.size ? "user-set" : "") + '">columns' + (st.panel === "columns" ? " ▴" : "") + "</button></div>";
      q("#tvCols").onclick = () => { st.panel = st.panel === "columns" ? null : "columns"; render(); };
      const cp = q(".tv-columns"); cp.classList.toggle("open", st.panel === "columns");
      const idk = identityKey();
      cp.innerHTML = cols.filter((c) => c.key !== idk).map((c) => '<label class="tv-check"><input type="checkbox" data-k="' + esc(c.key) + '"' + (st.hidden.has(c.key) ? "" : " checked") + "> " + esc(c.label) + (c.unit ? " " + esc(c.unit) : "") + "</label>").join("");
      cp.querySelectorAll("input").forEach((inp) => { inp.onchange = () => { if (inp.checked) st.hidden.delete(inp.dataset.k); else st.hidden.add(inp.dataset.k); persist(); render(); }; });
    }
    function CSS_escape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/([^\w-])/g, "\\$1"); }

    // ----- fit (E8): character estimate per column, recomputed on resize -----
    const isLongIdent = (r, idk) => String(r[idk] ?? "").length > IDENTITY_OWN_LINE_MIN_CHARS;
    function fitColumns(shown, width) {
      const idk = identityKey(); const map = colByKey();
      const charW = 9.6, pad = 20;                     // 16 px font on this page
      const CLIP_CHARS = 22;                           // a clip column shows one line of about this many characters
      const need = (c, rows) => { let m = c.label.length + (c.unit ? c.unit.length + 1 : 0); for (const r of rows) { const s = String(c.kind === "number" ? fmtCell(c, r[c.key]) : (r[c.key] ?? "")); if (s.length > m) m = s.length; if (m > 40) break; } return Math.min(m, c.text === "clip" ? CLIP_CHARS : 40) * charW + pad; };
      const identCol = map.get(idk);
      // E9 per row: a long identity gets its own line; the identity column's
      // width is sized by the short identities only, and dropped when every
      // identity is long.
      const shortRows = shown.filter((r) => !isLongIdent(r, idk));
      const identAll = !!identCol && shown.length > 0 && shortRows.length === 0;
      // Narrow widths: the identity may wrap inside 30% of the width and the
      // fold button is compact, so a metric or two still sits in the row.
      const narrow = width < ACTIONS_IN_ROW_MIN_PX;
      // The identity column: at least its longest word (no mid-word breaks),
      // at least 30% when narrow, at most 45% of the width or its own need.
      const longestWordPx = identCol ? Math.max(0, ...shortRows.map((r) => Math.max(0, ...String(r[idk] ?? "").split(/\s+/).map((w) => w.length)))) * charW + pad : 0;
      const identW = identAll || !identCol ? 0
        : Math.min(Math.max(longestWordPx, width * (narrow ? 0.30 : 0)), Math.max(longestWordPx, Math.min(need(identCol, shortRows), width * 0.45)));
      const hasActs = (spec.actions || []).length > 0;
      const actsInRow = hasActs && !narrow;
      const foldW = narrow ? FOLD_W_NARROW : FOLD_W;
      const base = identW + (actsInRow ? ACTS_W : 0);
      const needs = new Map();
      const attempt = (reserve) => {
        let used = base + reserve; const inRow = [], folded = []; let full = false;
        for (const c of visibleCols()) {
          if (c.key === idk) continue;
          const w = need(c, shown); needs.set(c.key, w);
          // contiguous prefix in display order: the first column that does not
          // fit folds, and every column after it folds too (display order is
          // the insight order and is never reshuffled to fit).
          if (!full && used + w <= width) { inRow.push(c); used += w; } else { full = true; folded.push(c); }
        }
        return { identAll, identW, inRow, folded, needs, actsInRow, actsInFold: hasActs && !actsInRow, narrow, foldW };
      };
      const first = attempt(hasActs && !actsInRow ? foldW : 0);
      return first.folded.length ? attempt(foldW) : first;
    }

    // ----- table (E6, E8, E9, E10, E12) -----
    let lastWidth = 0;
    function renderTable(shown) {
      const map = colByKey(); const idk = identityKey(); const identCol = map.get(idk);
      const width = el.clientWidth || 360; lastWidth = width;
      const fit = fitColumns(shown, width);
      const sortCol = map.get(st.s_key);
      const hasActs = (spec.actions || []).length > 0;
      const identInRow = !!identCol && !fit.identAll;
      const hasFoldCol = fit.folded.length > 0 || fit.actsInFold;
      const ncols = (identInRow ? 1 : 0) + fit.inRow.length + (hasFoldCol ? 1 : 0) + (fit.actsInRow ? 1 : 0);
      // Fixed layout with computed shares: the table can never be wider than
      // its container, so the page never scrolls sideways (d9 a).
      const shares = [];
      if (identInRow) shares.push(Math.max(fit.identW, 80));
      for (const c of fit.inRow) shares.push(fit.needs.get(c.key) || 60);
      if (hasFoldCol) shares.push(fit.foldW);
      if (fit.actsInRow) shares.push(ACTS_W);
      const sum = shares.reduce((a, b) => a + b, 0) || 1;
      const colgroup = "<colgroup>" + shares.map((w) => '<col style="width:' + (100 * w / sum).toFixed(2) + '%">').join("") + "</colgroup>";
      const th = (c, cls) => '<th class="' + cls + (c.key === st.s_key ? " tv-sorted" : "") + '">' + esc(c.label) + (c.unit ? " " + esc(c.unit) : "") + (c.key === st.s_key ? (st.s_dir === "asc" ? " ▴" : " ▾") : "") + "</th>";
      let h = colgroup + "<thead><tr>" + (identInRow ? th(identCol, "tv-ident") : "") + fit.inRow.map((c) => th(c, c.kind === "number" ? "tv-num" : "tv-text")).join("") +
        (hasFoldCol ? "<th></th>" : "") + (fit.actsInRow ? "<th></th>" : "") + "</tr></thead><tbody>";
      const tdClass = (c) => c.kind === "number" ? "tv-num" : (c.text === "clip" ? "tv-clip" : c.text === "shrink" ? "tv-shrink" : "tv-wrap");
      const rowHtml = (r, i) => {
        let s = "";
        const identHtml = identCol ? cellHtml(identCol, r) : "";
        const longIdent = !!identCol && isLongIdent(r, idk);
        const foldLabel = st.expanded.has(i) ? (fit.narrow ? "▾" : "▾ less") : (fit.folded.length ? (fit.narrow ? "+" + fit.folded.length : "▸ " + fit.folded.length + " more") : (fit.narrow ? "▸" : "▸ actions"));
        const foldBtn = hasFoldCol ? '<button type="button" class="tv-fold" data-i="' + i + '">' + foldLabel + "</button>" : "";
        if (longIdent) s += '<tr class="tv-identline"><td colspan="' + ncols + '">' + identHtml + foldBtn + "</td></tr>";
        s += "<tr>" + (identInRow ? '<td class="tv-ident ' + tdClass(identCol) + '" data-i="' + i + '" data-k="' + esc(identCol.key) + '">' + (longIdent ? "" : identHtml) + "</td>" : "");
        for (const c of fit.inRow) s += '<td class="' + tdClass(c) + (st.openCells.has(i + ":" + c.key) ? " open" : "") + '" data-i="' + i + '" data-k="' + esc(c.key) + '">' + cellHtml(c, r) + "</td>";
        if (hasFoldCol) s += '<td class="tv-num">' + (longIdent ? "" : foldBtn) + "</td>";
        if (fit.actsInRow) s += '<td class="tv-acts" data-i="' + i + '"></td>';
        s += "</tr>";
        if (hasFoldCol && st.expanded.has(i)) s += '<tr class="tv-foldline"><td colspan="' + ncols + '">' + fit.folded.map((c) => '<span class="tv-field"><b>' + esc(c.label) + (c.unit ? " " + esc(c.unit) : "") + "</b>" + cellHtml(c, r) + "</span>").join("") + (fit.actsInFold ? '<div class="tv-acts tv-acts-line" data-i="' + i + '"></div>' : "") + "</td></tr>";
        return s;
      };
      if (!shown.length) h += '<tr><td colspan="' + Math.max(ncols, 1) + '" class="tv-empty">Nothing here.</td></tr>';
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
      q(".tv-wrap").innerHTML = '<table class="tv-table">' + h + "</table>";
      const t = q(".tv-table");
      t.querySelectorAll("button.tv-fold").forEach((b) => { b.onclick = () => { const i = Number(b.dataset.i); if (st.expanded.has(i)) st.expanded.delete(i); else st.expanded.add(i); renderTable(shown); }; });
      t.querySelectorAll("tr.tv-group button").forEach((b) => { b.onclick = () => { const g = b.dataset.g; if (st.foldExceptions.has(g)) st.foldExceptions.delete(g); else st.foldExceptions.add(g); renderTable(shown); }; });
      t.querySelectorAll("td.tv-clip").forEach((td) => { td.onclick = () => { const k = td.dataset.i + ":" + td.dataset.k; if (st.openCells.has(k)) st.openCells.delete(k); else st.openCells.add(k); td.classList.toggle("open"); }; });
      if (hasActs) t.querySelectorAll(".tv-acts").forEach((td) => { const r = shown[Number(td.dataset.i)]; for (const a of spec.actions) if (matches(a, r)) td.appendChild(actionButton(a, r, spec)); });
    }

    function renderCount(shown) {
      const map = colByKey();
      const parts = ["<b>" + shown.length.toLocaleString() + "</b> shown of " + data.length.toLocaleString() + " rows"];
      for (const c of enumCols()) if (st.f[c.key] && st.f[c.key] !== "all") parts.push(esc(c.label) + " " + esc(st.f[c.key] === "" ? "(blank)" : st.f[c.key]));
      for (const c of numCols()) { const b = st.n[c.key]; if (!b) continue; if ((b.min ?? "") !== "") parts.push(esc(c.label) + " ≥ " + esc(b.min)); if ((b.max ?? "") !== "") parts.push(esc(c.label) + " ≤ " + esc(b.max)); }
      if (st.g_key !== "none" && map.has(st.g_key)) parts.push("by " + esc(map.get(st.g_key).label));
      q(".tv-count").innerHTML = parts.join(" · ");
    }

    function render() {
      const map = colByKey();
      if (!map.has(st.s_key)) { const d = defaultSort(); st.s_key = d.key; st.s_dir = d.dir; }
      renderControls();
      const shown = data.filter((r) => passesFilters(r, null)).sort(compareBy(map.get(st.s_key), st.s_dir));
      renderCount(shown);
      renderTable(shown);
    }

    // Width changes re-render: a window resize, and the container itself
    // changing size, which is how a section hidden at mount (width 0) gets its
    // real width when its section is shown.
    const onResize = () => { const w = el.clientWidth || 0; if (w > 0 && Math.abs(w - lastWidth) > 24) render(); };
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
