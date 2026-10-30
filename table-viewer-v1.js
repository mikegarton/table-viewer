/* table-viewer v1 — one table, any shape.
   Spec of record: C:\dev\working_docs\projects\table-viewer\table-viewer-spec.md
   (draft 10: Mike's rulings d1 to d39 of 2026-09-22 and the later rulings
   cited by slug). Section letters below cite it.

   mountTable(container, rows, spec, meta) -> { update(rows, meta), state, destroy(), shownRowsTblVwr() }
     container: element. rows: array of row objects. spec (optional, section B):
       name, identity, sort {key, dir}, site, columns [{key, label, unit, decimals,
       kind, text, visible, render, mark}], actions [{label, when, route, method,
       payload, guard, done, input}], request(action, row, body), afterAction(...).
     meta (optional): { sourceCount }, the rows the source holds, so the count
       line shows a read that came back short (ruling read-paging b, 2026-10-28).
     shownRowsTblVwr() returns the row objects that pass the table's filters and
       bounds, in the order the table shows them under its sort, then-sort and
       grouping, rows in folded groups included at their group's place (the
       ops page's play in table order, 2026-10-29).
   Group and then-group offer every column (rulings group-by-scope-reach c and
   group-viability a of 2026-10-27): groupingOf picks each column's form, by
   value, letter ranges, value bands or periods, and grades it by the number of
   groups and the rows per group; Sort carries a then-sort for ties (d17 b).
   Groups by letters, period or bands take their own order, whatever the Sort
   (0–9, A to Z, "other scripts", "#"; periods oldest first; bands low to high;
   the blank group last), at both levels, rows inside keeping the table's sort;
   groups by value order by their extreme row under the Sort (rulings
   letter-group-order b and group-other-scripts a of 2026-10-29).
   A text column sorts, and its letter groups form, on one key (sortKeyTblVwr):
   the text from its first letter or digit, accents folded and Latin letters
   NFD leaves whole (Ø, Æ, Œ, Ł, ß, Đ, Þ, Ħ, ı ...) folded to their base letters,
   so " Neurosurgical" sorts under N and "@ Ascent" under A; a value with no
   letter or digit sorts after the lettered values and before the blanks
   (rulings text-sort-symbols a and latin-fold-extended a of 2026-10-29).
   Filters, display and the find box keep the raw text.
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
  // The category test no longer caps the distinct values (group-viability a,
  // 2026-10-27, retiring d8 a's 12): a column whose values repeat is a category.
  const GROUPS_GOOD_MIN = 5;               // group-viability a: 5 to 20 groups is the useful range (Mike's figures)
  const GROUPS_GOOD_MAX = 20;              // group-viability a; also the most groups a form aims at
  const ROWS_PER_GROUP_MIN = 2;            // group-viability a: fewer rows a group than this is one row per group
  const FINER_FACTOR = 10;                 // d4 a: the finer entry aims at groups one order of magnitude smaller
  const FINER_ABOVE_ROWS = 100;            // d4 a: the finer entry is offered above this many rows (Mike's n > 100)
  const ZERO_BAND_MIN_SHARE = 0.1;         // d4 a: zero gets its own band when it holds this share of the values
  const FOLD_CLOSED_ABOVE_ROWS = 100;      // d5 b: a grouping applied to more rows than this opens folded
  const FILTER_FIND_ABOVE = 20;            // group-viability a: a filter dropdown longer than this gets a find box
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
.tv-table tr.tv-group2 td { padding-left: 28px; padding-top: 8px; font-weight: 600; background: var(--tv-card); }   /* the inner level (d9 a), indented under its outer group */
.tv-find { margin-top: 4px; max-width: min(60vw, 18em); }
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
  // A json or array value reads as compact JSON, never "[object Object]".
  const asText = (v) => v !== null && typeof v === "object" ? JSON.stringify(v) : String(v);
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
    const distinct = new Set(filled.map(asText)).size;
    // bool, date and number come before id: a metric column with all-distinct
    // values is a metric, not a key (found in the first browser test).
    if (filled.every((v) => asBool(v) !== null)) return "bool";
    if (filled.every((v) => asDate(v) !== null)) return "date";
    if (filled.every((v) => asNumber(v) !== null)) return "number";
    if (filled.length === values.length && distinct === filled.length && filled.every((v) => KEYLIKE.test(String(v)))) return "id";
    if (distinct <= values.length / 2 && filled.length >= 3) return "enum"; // d18 b; no cap on the count (group-viability a)
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
    try { localStorage.setItem(stateKey(spec), JSON.stringify({ v: STATE_VERSION, f: st.f, n: st.n, s_key: st.s_key, s_dir: st.s_dir, hidden: [...st.hidden], seen: [...st.seen], g_key: st.g_key,
      g_fine: st.g_fine, g2_key: st.g2_key, g2_fine: st.g2_fine, s2_key: st.s2_key, s2_dir: st.s2_dir })); } catch (e) {}   // the second five are additive (2026-10-28): a state without them reads as none
  }

  // ---------- formatting ----------
  function fmtCell(col, v) {
    if (isBlank(v)) return "—";
    if (col.kind === "number") { const n = asNumber(v); return n === null ? esc(v) : n.toLocaleString(undefined, { minimumFractionDigits: col.decimals, maximumFractionDigits: col.decimals }); }
    if (col.kind === "date") { const s = String(v); return esc(s.length > 10 && /T/.test(s) ? s.slice(0, 10) : s); }
    if (col.kind === "bool") { const b = asBool(v); return b === null ? esc(v) : b ? "yes" : "no"; }
    return esc(asText(v));
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
    return asText(v);
  }
  // The one key a text column sorts and groups on (rulings text-sort-symbols a
  // and latin-fold-extended a, 2026-10-29): the text from its first letter or
  // digit, accents folded as NFD decomposes them, and the Latin letters NFD
  // leaves whole folded to their base letters. null when the value holds no
  // letter or digit. Display, filters and the find box keep the raw text.
  const LETTER = /[\p{L}\p{N}]/u;
  const LATIN_FOLD = {
    "Ø": "O", "ø": "o", "Æ": "AE", "æ": "ae", "Œ": "OE", "œ": "oe", "Ł": "L", "ł": "l",
    "ß": "SS", "ẞ": "SS", "Đ": "D", "đ": "d", "Ð": "D", "ð": "d", "Þ": "TH", "þ": "th",
    "Ħ": "H", "ħ": "h", "ı": "i", "Ŧ": "T", "ŧ": "t", "Ŋ": "N", "ŋ": "n", "ĸ": "k",
    "Ŀ": "L", "ŀ": "l", "ŉ": "n", "ſ": "s", "Ĳ": "IJ", "ĳ": "ij",
    "Ɓ": "B", "ƀ": "b", "Ƀ": "B", "Ƈ": "C", "ƈ": "c", "Ɗ": "D", "Ɖ": "D", "Ƒ": "F", "ƒ": "f",
    "Ɠ": "G", "Ǥ": "G", "ǥ": "g", "Ɨ": "I", "Ƙ": "K", "ƙ": "k", "Ƚ": "L", "ƚ": "l", "Ɲ": "N",
    "Ƥ": "P", "ƥ": "p", "Ƭ": "T", "ƭ": "t", "Ʈ": "T", "Ʋ": "V", "Ƴ": "Y", "ƴ": "y", "Ƶ": "Z", "ƶ": "z",
    "Ⱥ": "A", "ⱥ": "a", "Ȼ": "C", "ȼ": "c", "Ɇ": "E", "ɇ": "e", "Ɉ": "J", "ɉ": "j", "Ɍ": "R", "ɍ": "r", "Ɏ": "Y", "ɏ": "y"
  };
  const LATIN_FOLD_RE = new RegExp("[" + Object.keys(LATIN_FOLD).join("") + "]", "g");
  const sortKeyCache = new Map();
  function sortKeyTblVwr(v) {
    const raw = asText(v);
    if (sortKeyCache.has(raw)) return sortKeyCache.get(raw);
    const s = raw.normalize("NFD").replace(/\p{M}/gu, "").replace(LATIN_FOLD_RE, (c) => LATIN_FOLD[c]);   // É sorts as E, Ø as O
    const i = s.search(LETTER);
    const key = i < 0 ? null : s.slice(i);
    if (sortKeyCache.size > 20000) sortKeyCache.clear();
    sortKeyCache.set(raw, key);
    return key;
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
      // text: by the shared key (leading spaces, punctuation, symbols and emoji
      // ignored); a value with no letter or digit after every lettered one, in both
      // directions, before the blanks (text-sort-symbols a)
      const kx = sortKeyTblVwr(x), ky = sortKeyTblVwr(y), opt = { numeric: true, sensitivity: "base" };
      if (kx === null && ky === null) return String(x).localeCompare(String(y), undefined, opt);
      if (kx === null) return 1; if (ky === null) return -1;
      return sign * kx.localeCompare(ky, undefined, opt);
    };
  }

  // ---------- grouping (E6; rulings group-by-scope-reach c, group-viability a,
  // d3 b, d4 a, d11 c of 2026-10-27 and 2026-10-28) ----------
  // groupingOf(col, rows, finer) -> { words, groups, grade, of(row) -> group label }
  // Every column groups; the form follows the column:
  //   by value     2 to GROUPS_GOOD_MAX values that repeat, and every bool;
  //   periods      dates and YYYY or YYYY-MM strings, by day, month or year, the
  //                finest grain at GROUPS_GOOD_MAX groups or fewer (d11 c);
  //   value bands  numbers: equal-count bands of a 1, 2 or 5 x 10^k row count,
  //                tied values kept in one band, zero a band of its own when it
  //                holds ZERO_BAND_MIN_SHARE of the values (d4 a);
  //   letters      text and ids by the first letter or digit (the sort key, so
  //                the groups and the rows' sort agree), accents and leading
  //                punctuation, symbols and emoji set aside, Ø, Æ, Œ, Ł, ß, Đ, Þ,
  //                Ħ, ı and kin folded to their base letters (d39 latin-fold-extended
  //                a), thin neighbours merged into
  //                ranges so no more than GROUPS_GOOD_MAX groups (d3 b); letters
  //                that are not Latin A to Z form one group, "other scripts"
  //                (d32 group-other-scripts a).
  // Group order (d31 letter-group-order b, 2026-10-29): letters, periods and
  // bands order their own groups, whatever the Sort: 0–9, A to Z, other scripts,
  // "#"; periods oldest first; bands low to high; the blank group last. Groups
  // by value order by their extreme row under the Sort (group-order-rule a).
  // finer aims at FINER_FACTOR times the groups (d4 a: an order of magnitude
  // smaller groups). The grade reads the group count and the rows per group.
  const BLANK_GROUP = "(blank)";
  const OTHER_SCRIPTS_GROUP = "other scripts";   // d32 group-other-scripts a: every letter that is not Latin A to Z, one group
  const PERIODLIKE = /^\d{4}(-\d{2})?$/;
  function gradeOf(groups, rows) {
    if (groups >= GROUPS_GOOD_MIN && groups <= GROUPS_GOOD_MAX && rows / groups >= ROWS_PER_GROUP_MIN) return "good";
    if (groups >= 2 && rows / groups >= ROWS_PER_GROUP_MIN) return "possible";
    return "useless";
  }
  function fmtNumber(col, n) { return n.toLocaleString(undefined, { minimumFractionDigits: col.decimals, maximumFractionDigits: col.decimals }); }
  function byValue(col, rows) {
    const label = (v) => isBlank(v) ? BLANK_GROUP : col.kind === "bool" ? (asBool(v) === null ? asText(v) : asBool(v) ? "yes" : "no") : col.kind === "number" && asNumber(v) !== null ? fmtNumber(col, asNumber(v)) : asText(v);
    return { words: "by value", of: (r) => label(r[col.key]) };
  }
  function periodOf(v, grain) {
    let s;
    if (typeof v === "string" && PERIODLIKE.test(v.trim())) s = v.trim();
    else { const t = asDate(v); if (t === null) return null; s = new Date(t).toISOString(); }
    const len = grain === "year" ? 4 : grain === "month" ? 7 : 10;
    return s.length >= len ? s.slice(0, len) : null;
  }
  function byPeriod(col, rows, maxGroups) {
    const vals = rows.map((r) => r[col.key]).filter((v) => !isBlank(v));
    const grains = ["day", "month", "year"].filter((g) => vals.some((v) => periodOf(v, g) !== null) && vals.every((v) => periodOf(v, g) !== null));
    let grain = grains[grains.length - 1] || "year";
    for (const g of grains) { if (new Set(vals.map((v) => periodOf(v, g))).size <= maxGroups) { grain = g; break; } }
    // periods run oldest first, the blank group last (d31 letter-group-order b)
    const order = (a, b) => (a === BLANK_GROUP) - (b === BLANK_GROUP) || a.localeCompare(b, undefined, { numeric: true });
    return { words: "by " + grain, order, of: (r) => { const v = r[col.key]; return isBlank(v) ? BLANK_GROUP : periodOf(v, grain) || asText(v); } };
  }
  function byBands(col, rows, maxGroups) {
    const nums = rows.map((r) => asNumber(r[col.key])).filter((n) => n !== null).sort((a, b) => a - b);
    const zeros = nums.filter((n) => n === 0).length;
    const zeroBand = zeros > 0 && zeros < nums.length && zeros >= ZERO_BAND_MIN_SHARE * nums.length;
    const rest = zeroBand ? nums.filter((n) => n !== 0) : nums;
    const room = Math.max(1, maxGroups - (zeroBand ? 1 : 0) - (nums.length < rows.length ? 1 : 0));   // the zero and blank groups count toward the most
    let size = 1;
    for (let k = 1; Math.ceil(rest.length / size) > room; k++) size = [1, 2, 5][k % 3] * Math.pow(10, Math.floor(k / 3));
    const bands = [];
    for (let i = 0; i < rest.length;) {
      let j = Math.min(i + size, rest.length) - 1;
      while (j + 1 < rest.length && rest[j + 1] === rest[j]) j++;   // a tie stays in one band
      bands.push({ lo: rest[i], hi: rest[j] }); i = j + 1;
    }
    const name = (b) => b.lo === b.hi ? fmtNumber(col, b.lo) : fmtNumber(col, b.lo) + " – " + fmtNumber(col, b.hi);
    const of = (r) => {
      const n = asNumber(r[col.key]); if (n === null) return BLANK_GROUP;
      if (zeroBand && n === 0) return fmtNumber(col, 0);
      let lo = 0, hi = bands.length - 1;                          // the first band whose top is at or above n
      while (lo < hi) { const m = (lo + hi) >> 1; if (bands[m].hi >= n) hi = m; else lo = m + 1; }
      return bands.length ? name(bands[lo]) : BLANK_GROUP;
    };
    // bands run low to high, the zero band at zero, the blank group last (d31 letter-group-order b)
    const place = new Map(bands.map((b) => [name(b), b.lo]));
    if (zeroBand) place.set(fmtNumber(col, 0), 0);
    const order = (a, b) => (a === BLANK_GROUP) - (b === BLANK_GROUP) || (place.get(a) ?? 0) - (place.get(b) ?? 0);
    return { words: "bands of ~" + size.toLocaleString() + (size === 1 ? " row" : " rows"), order, of };
  }
  function letterUnit(v, len) {
    const s = sortKeyTblVwr(v); if (s === null) return "#";        // the shared sort key: É is E, Ø is O, leading symbols skipped
    const i = 0;
    if (/\p{N}/u.test(s[i])) return "0–9";
    const u = s[i].toUpperCase();
    if (!/^[A-Z]$/.test(u)) return OTHER_SCRIPTS_GROUP;            // Cyrillic, Han, Greek, Arabic ... (d32 group-other-scripts a)
    const n = s[i + 1];                                            // a second letter must itself be a digit or Latin A to Z
    if (len > 1 && n && LETTER.test(n) && (/\p{N}/u.test(n) || /^[A-Za-z]$/.test(n))) return u + n.toLowerCase();
    return u;
  }
  const unitRank = (u) => u === "0–9" ? 0 : u === "#" ? 3 : u === OTHER_SCRIPTS_GROUP ? 2 : 1;
  function byLetters(col, rows, maxGroups, finer) {
    const vals = rows.map((r) => r[col.key]).filter((v) => !isBlank(v));
    const countUnits = (len) => { const m = new Map(); for (const v of vals) { const u = letterUnit(v, len); m.set(u, (m.get(u) || 0) + 1); } return m; };
    let len = finer ? 2 : 1, counts = countUnits(len);
    // every value starting alike (one letter holds more than half, or fewer
    // than GROUPS_GOOD_MIN letters in all): the second letter separates them
    if (!finer && vals.length >= 2 * GROUPS_GOOD_MIN && (counts.size < GROUPS_GOOD_MIN || Math.max(...counts.values()) > vals.length / 2)) { len = 2; counts = countUnits(len); }
    const units = [...counts.keys()].sort((a, b) => unitRank(a) - unitRank(b) || a.localeCompare(b));
    // phone-book merge: walk the units in order and close a range once it holds
    // its share of the rows; a unit holding a share by itself stands alone, and
    // ranges never join digits, letters and symbols
    const target = vals.length / Math.max(1, maxGroups - (vals.length < rows.length ? 1 : 0));   // the blank group counts toward the most
    const groupOf = new Map(); let run = [], acc = 0;
    const close = () => { if (!run.length) return; const lab = run.length === 1 ? run[0] : run[0] + "–" + run[run.length - 1]; for (const u of run) groupOf.set(u, lab); run = []; acc = 0; };
    units.forEach((u, i) => {
      if (run.length && (unitRank(run[0]) !== unitRank(u) || counts.get(u) >= target)) close();
      run.push(u); acc += counts.get(u);
      if (acc >= target || i === units.length - 1) close();
    });
    // the groups' own order: 0–9, the letters A to Z, other scripts, "#", the blank group last (d31 letter-group-order b)
    const place = new Map(); units.forEach((u, i) => { if (!place.has(groupOf.get(u))) place.set(groupOf.get(u), i); });
    const at = (g) => g === BLANK_GROUP ? units.length + 1 : place.has(g) ? place.get(g) : units.length;
    return { words: len > 1 ? "two letters" : "letters", order: (a, b) => at(a) - at(b), of: (r) => { const v = r[col.key]; return isBlank(v) ? BLANK_GROUP : groupOf.get(letterUnit(v, len)) || "#"; } };
  }
  function groupingOf(col, rows, finer) {
    const vals = rows.map((r) => r[col.key]).filter((v) => !isBlank(v));
    // the most groups a form aims at, never so many that a group holds fewer
    // than ROWS_PER_GROUP_MIN rows on average
    const maxGroups = Math.max(1, Math.min(finer ? GROUPS_GOOD_MAX * FINER_FACTOR : GROUPS_GOOD_MAX, Math.floor(rows.length / ROWS_PER_GROUP_MIN)));
    const distinct = new Set(vals.map(asText)).size;
    const period = col.kind === "date" || (vals.length > 0 && vals.every((v) => typeof v === "string" && PERIODLIKE.test(v.trim())));
    let g;
    if (col.kind === "bool") g = finer ? null : byValue(col, rows);
    else if (period) g = byPeriod(col, rows, maxGroups);
    else if (distinct >= 2 && distinct <= GROUPS_GOOD_MAX && rows.length / distinct >= ROWS_PER_GROUP_MIN) g = finer ? null : byValue(col, rows);
    else if (col.kind === "number") g = byBands(col, rows, maxGroups);
    else g = byLetters(col, rows, maxGroups, finer);
    if (!g) return null;
    const groups = new Set(rows.map(g.of)).size;
    return Object.assign(g, { groups, grade: gradeOf(groups, rows.length) });
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
    const g_key = v.g_key && v.g_key !== "none" && map.has(v.g_key) ? v.g_key : "none";
    const g2_key = g_key !== "none" && v.g2_key && v.g2_key !== "none" && v.g2_key !== g_key && map.has(v.g2_key) ? v.g2_key : "none";
    const s_key = map.has(v.s_key) ? v.s_key : null;
    const s2_key = v.s2_key && v.s2_key !== "none" && v.s2_key !== s_key && map.has(v.s2_key) ? v.s2_key : "none";
    return JSON.stringify({ f, n, s_key, s_dir: v.s_dir === "asc" ? "asc" : "desc", hidden, g_key, g_fine: g_key !== "none" && !!v.g_fine,
      g2_key, g2_fine: g2_key !== "none" && !!v.g2_fine, s2_key, s2_dir: s2_key !== "none" && v.s2_dir === "desc" ? "desc" : "asc" });
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
  function mountTable(container, rows, spec, meta) {
    ensureCss();
    spec = spec || {};
    let sourceCount = meta && Number.isFinite(meta.sourceCount) ? meta.sourceCount : null;   // read-paging b
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
      g_fine: false, g2_key: "none", g2_fine: false, s2_key: "none", s2_dir: "asc",   // then-group (d9 a) and then-sort (d17 b); fine = the finer entry (d4 a)
      innerOpen: new Set(),                                                // inner groups opened by a tap; closed otherwise (d16 a)
      view: null, viewDropped: [] };                                       // E15: the chosen view and the settings of it not applied (missing-column a)
    const handle = { element: el, tableName: spec.name || "table" };
    if (saved) {
      st.f = saved.f || {}; st.n = saved.n || {}; st.s_key = saved.s_key; st.s_dir = saved.s_dir;
      st.hidden = new Set(saved.hidden || []); st.seen = new Set(saved.seen || []); st.g_key = saved.g_key || "none";
      st.g_fine = !!saved.g_fine; st.g2_key = saved.g2_key || "none"; st.g2_fine = !!saved.g2_fine;
      st.s2_key = saved.s2_key || "none"; st.s2_dir = saved.s2_dir === "desc" ? "desc" : "asc";
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
    // d5 b: a grouping opens folded over more than FOLD_CLOSED_ABOVE_ROWS rows,
    // open otherwise; set when the grouping is chosen, restored or loaded.
    const resetFold = () => { st.foldMode = data.length > FOLD_CLOSED_ABOVE_ROWS ? "closed" : "open"; st.foldExceptions.clear(); st.innerOpen.clear(); };
    if (st.g_key !== "none") resetFold();
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
    // The table's order: the sort, then the then-sort on its ties (d17 b).
    function rowCompare() {
      const map = colByKey();
      const first = compareBy(map.get(st.s_key), st.s_dir);
      const c2 = st.s2_key !== "none" && st.s2_key !== st.s_key ? map.get(st.s2_key) : null;
      if (!c2) return first;
      const second = compareBy(c2, st.s2_dir);
      return (a, b) => first(a, b) || second(a, b);
    }

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
    // The Group and then-group entries (group-viability a): every column, its
    // form and group count over the rows shown, the good ones first, then the
    // possible ones, then a divider and the rest; above FINER_ABOVE_ROWS rows a
    // column whose groups can be an order of magnitude smaller has a second,
    // finer entry (d4 a). An entry's value is the key, or the key and FINE_TAG.
    const FINE_TAG = "\u001ffine";
    let groupCache = new Map();
    function groupingFor(key, fine, shown) {
      const ck = key + (fine ? FINE_TAG : "");
      if (!groupCache.has(ck)) { const c = colByKey().get(key); groupCache.set(ck, c ? groupingOf(c, shown, fine) : null); }
      return groupCache.get(ck);
    }
    function groupEntries(shown, exceptKey) {
      const plural = (n) => n.toLocaleString() + (n === 1 ? " group" : " groups");
      const out = [];
      for (const c of cols) {
        if (c.key === exceptKey) continue;
        const g = groupingFor(c.key, false, shown); if (!g) continue;
        out.push({ value: c.key, label: c.label + " · " + g.words + " · " + plural(g.groups), grade: g.grade });
        if (shown.length > FINER_ABOVE_ROWS) {
          const f = groupingFor(c.key, true, shown);
          if (f && f.words !== g.words && f.groups > g.groups) out.push({ value: c.key + FINE_TAG, label: c.label + " · " + f.words + " · " + plural(f.groups), grade: f.grade });
        }
      }
      const rank = { good: 0, possible: 1, useless: 2 };
      return out.map((e, i) => [e, i]).sort((a, b) => rank[a[0].grade] - rank[b[0].grade] || a[1] - b[1]).map(([e]) => e);
    }
    function groupSelect(id, label, entries, value, fill, disabled) {
      let opts = '<option value="none"' + (value === "none" ? " selected" : "") + ">None</option>", divided = false;
      for (const e of entries) {
        if (e.grade === "useless" && !divided) { opts += '<option disabled value="">— less useful —</option>'; divided = true; }
        opts += '<option value="' + esc(e.value) + '"' + (e.value === value ? " selected" : "") + ">" + esc(e.label) + "</option>";
      }
      return '<div class="tv-ctl"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '" class="' + fill + '"' + (disabled ? " disabled" : "") + ">" + opts + "</select></div>";
    }
    const groupValue = (key, fine) => key === "none" ? "none" : key + (fine ? FINE_TAG : "");
    const parseGroup = (v) => { const fine = String(v).endsWith(FINE_TAG); return { key: fine ? String(v).slice(0, -FINE_TAG.length) : String(v), fine }; };

    function renderControls(shown) {
      const map = colByKey();
      // row 1: enum filters in display order, then the narrow chip (F.2); a
      // dropdown longer than FILTER_FIND_ABOVE carries a find box that narrows
      // its entries as you type (group-viability a)
      let h = ""; const filterOpts = new Map();
      for (const c of enumCols()) {
        const counts = new Map();
        for (const r of data) if (passesFilters(r, c.key)) { const k = String(r[c.key] ?? ""); counts.set(k, (counts.get(k) || 0) + 1); }
        const opts = [["all", "All"]].concat([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => [k, (k === "" ? "(blank)" : k) + " (" + n + ")"]));
        const val = st.f[c.key] || "all";
        let s = selectCtl("tvf-" + c.key, c.label, opts, val, val === "all" ? "" : "user-set");
        if (opts.length - 1 > FILTER_FIND_ABOVE) { s = s.slice(0, -"</div>".length) + '<input type="search" class="tv-find" id="tvff-' + esc(c.key) + '" placeholder="find" aria-label="find in ' + esc(c.label) + '"></div>'; filterOpts.set(c.key, opts); }
        h += s;
      }
      const anyBound = numCols().some((c) => st.n[c.key] && ((st.n[c.key].min ?? "") !== "" || (st.n[c.key].max ?? "") !== ""));
      h += '<div class="tv-ctl"><label>&nbsp;</label><button type="button" id="tvNarrow" class="' + (numCols().length ? (anyBound ? "user-set" : "") : "na") + '"' + (numCols().length ? "" : " disabled") + '>narrow' + (st.panel === "narrow" ? " ▴" : "") + "</button></div>";
      q(".tv-row1").innerHTML = h;
      for (const c of enumCols()) q("#tvf-" + CSS_escape(c.key)).onchange = (e) => { st.f[c.key] = e.target.value; persist(); render(); };
      for (const [k, opts] of filterOpts) {
        const box = q("#tvff-" + CSS_escape(k)), sel = q("#tvf-" + CSS_escape(k));
        box.oninput = () => {
          const t = box.value.trim().toLowerCase(), val = sel.value;
          sel.innerHTML = opts.filter((o, i) => i === 0 || o[0] === val || o[1].toLowerCase().includes(t))
            .map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("");
        };
      }
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

      // row 2: Group, Then group, Sort, Dir, Then sort, its Dir, Headers fold (F.3;
      // d9 a, d17 b). Then group is inapplicable until Group is set; neither
      // second control offers the first one's column.
      const grouped = st.g_key !== "none";
      const g1 = groupEntries(shown, null), g2 = grouped ? groupEntries(shown, st.g_key) : [];
      const sOpts = cols.map((c) => [c.key, c.label]);
      const s2Opts = [["none", "None"]].concat(cols.filter((c) => c.key !== st.s_key).map((c) => [c.key, c.label]));
      const sorted2 = st.s2_key !== "none";
      let h2 = groupSelect("tvGroup", "Group", g1, groupValue(st.g_key, st.g_fine), grouped ? "user-set" : "", false) +
        groupSelect("tvGroup2", "Then group", g2, groupValue(st.g2_key, st.g2_fine), grouped ? (st.g2_key !== "none" ? "user-set" : "") : "na", !grouped) +
        selectCtl("tvSort", "Sort", sOpts, st.s_key, "") +
        '<div class="tv-ctl"><label>Dir</label><button type="button" id="tvDir">' + (st.s_dir === "asc" ? "▲ asc" : "▼ desc") + "</button></div>" +
        selectCtl("tvSort2", "Then sort", s2Opts, st.s2_key, sorted2 ? "user-set" : "") +
        '<div class="tv-ctl"><label>Dir</label><button type="button" id="tvDir2" class="' + (sorted2 ? "" : "na") + '"' + (sorted2 ? "" : " disabled") + ">" + (st.s2_dir === "asc" ? "▲ asc" : "▼ desc") + "</button></div>";
      if (grouped) h2 += '<div class="tv-ctl"><label>&nbsp;</label><button type="button" id="tvFold" class="' + (st.foldMode === "closed" ? "user-set" : "") + '">' + (st.foldMode === "closed" ? "expand" : "collapse") + "</button></div>";
      q(".tv-row2").innerHTML = h2;
      q("#tvGroup").onchange = (e) => {
        const g = parseGroup(e.target.value); st.g_key = g.key; st.g_fine = g.fine;
        if (st.g_key === "none" || st.g2_key === st.g_key) { st.g2_key = "none"; st.g2_fine = false; }
        if (st.g_key !== "none") resetFold();
        persist(); render();
      };
      q("#tvGroup2").onchange = (e) => { const g = parseGroup(e.target.value); st.g2_key = g.key; st.g2_fine = g.fine; st.innerOpen.clear(); persist(); render(); };
      q("#tvSort").onchange = (e) => { st.s_key = e.target.value; const c = map.get(st.s_key); st.s_dir = c && c.kind === "number" ? "desc" : "asc"; if (st.s2_key === st.s_key) st.s2_key = "none"; persist(); render(); };
      q("#tvDir").onclick = () => { st.s_dir = st.s_dir === "asc" ? "desc" : "asc"; persist(); render(); };
      q("#tvSort2").onchange = (e) => { st.s2_key = e.target.value; const c = map.get(st.s2_key); st.s2_dir = c && c.kind === "number" ? "desc" : "asc"; persist(); render(); };
      q("#tvDir2").onclick = () => { if (st.s2_key === "none") return; st.s2_dir = st.s2_dir === "asc" ? "desc" : "asc"; persist(); render(); };
      // the chip flips the outer level and closes every inner group (d9 a, d16 a)
      const fb = q("#tvFold"); if (fb) fb.onclick = () => { st.foldMode = st.foldMode === "closed" ? "open" : "closed"; st.foldExceptions.clear(); st.innerOpen.clear(); render(); };

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
    // the sort's arrow solid, the then-sort's hollow (d17 b)
    const headText = (c) => c.label + (c.unit ? " " + c.unit : "") + (c.key === st.s_key ? (st.s_dir === "asc" ? " ▴" : " ▾") : c.key === st.s2_key ? (st.s2_dir === "asc" ? " ▵" : " ▿") : "");
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

    // ----- grouped order (E6, d9 a) -----
    // The groups of the rows shown, in the order the table draws them: outer
    // groups, and inside each the inner groups, both in the order of their form
    // (letters 0–9, A to Z, other scripts, "#"; periods oldest first; bands low
    // to high; the blank group last: d31 letter-group-order b), or, grouped
    // by value, by their extreme row under the sort and then-sort, a group with
    // no sort value last (group-order-rule a). Each
    // entry holds the group's label, its row indexes into shown, and its inner
    // groups as [label, indexes] pairs (null with no then-group). null when the
    // table is not grouped. renderTable and shownRowsTblVwr both read it.
    function groupLayout(shown) {
      const map = colByKey();
      if (!(st.g_key !== "none" && map.has(st.g_key) && groupingFor(st.g_key, st.g_fine, shown))) return null;
      const outerG = groupingFor(st.g_key, st.g_fine, shown);
      const innerG = st.g2_key !== "none" && st.g2_key !== st.g_key && map.has(st.g2_key) ? groupingFor(st.g2_key, st.g2_fine, shown) : null;
      const cmp = rowCompare();
      const collect = (idx, g) => { const m = new Map(); for (const i of idx) { const k = g.of(shown[i]); if (!m.has(k)) m.set(k, []); m.get(k).push(i); } return m; };
      const extreme = (idx) => { let best = null; for (const i of idx) { if (isBlank(shown[i][st.s_key])) continue; if (best === null || cmp(shown[i], shown[best]) < 0) best = i; } return best; };
      // letters, periods and bands take their own order, whatever the Sort; by value orders by the extreme row
      const ordered = (m, g) => [...m.entries()].sort((a, b) => { if (g.order) return g.order(a[0], b[0]); const x = extreme(a[1]), y = extreme(b[1]); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return cmp(shown[x], shown[y]); });
      return ordered(collect(shown.map((_, i) => i), outerG), outerG).map(([gk, idx]) => ({ gk, idx, inner: innerG ? ordered(collect(idx, innerG), innerG) : null }));
    }
    // The rows that pass the filters and bounds, in the order the table shows
    // them (tts-audio-ops, 2026-10-29): the sort and then-sort, or, grouped, the
    // groups' order with the sort inside each; rows in a folded group are
    // included, at their group's place. A page plays or exports "the table as
    // it stands" from this.
    function shownRowsTblVwr() {
      const map = colByKey();
      if (!map.has(st.s_key)) return [];
      const shown = data.filter((r) => passesFilters(r, null)).sort(rowCompare());
      const layout = groupLayout(shown);
      if (!layout) return shown;
      return layout.flatMap(({ idx, inner }) => (inner ? inner.flatMap(([, iidx]) => iidx) : idx).map((i) => shown[i]));
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
      const layout = groupLayout(shown);
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
      else if (layout) {
        // E6 with the then-group (d9 a): outer headers fold as before; under an
        // open outer group the inner headers sit indented, each closed until
        // tapped (d16 a). The groups' order is groupLayout's.
        const rowsWord = (n) => n.toLocaleString() + (n === 1 ? " row" : " rows");
        for (const { gk, idx, inner } of layout) {
          const closed = st.foldMode === "closed" ? !st.foldExceptions.has(gk) : st.foldExceptions.has(gk);
          h += '<tr class="tv-group"><td colspan="' + ncols + '"><button type="button" data-g="' + esc(gk) + '" aria-expanded="' + !closed + '">' + (closed ? "▸" : "▾") + "</button>" + esc(gk) +
            ' <span style="font-weight:400">· ' + rowsWord(idx.length) + (inner ? " · " + inner.length + (inner.length === 1 ? " group" : " groups") : "") + "</span></td></tr>";
          if (closed) continue;
          if (!inner) { for (const i of idx) h += rowHtml(shown[i], i); continue; }
          for (const [ik, iidx] of inner) {
            const ikey = gk + "\u0001" + ik, open = st.innerOpen.has(ikey);
            h += '<tr class="tv-group tv-group2"><td colspan="' + ncols + '"><button type="button" data-g2="' + esc(ikey) + '" aria-expanded="' + open + '">' + (open ? "▾" : "▸") + "</button>" + esc(ik) +
              ' <span style="font-weight:400">· ' + rowsWord(iidx.length) + "</span></td></tr>";
            if (open) for (const i of iidx) h += rowHtml(shown[i], i);
          }
        }
      } else shown.forEach((r, i) => { h += rowHtml(r, i); });
      h += "</tbody>";
      wrap.innerHTML = '<table class="tv-table">' + h + "</table>";
      const t = wrap.querySelector("table.tv-table");
      t.querySelectorAll("button.tv-fold").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const i = Number(b.dataset.i); if (st.expanded.has(i)) st.expanded.delete(i); else st.expanded.add(i); renderTable(shown); }; });
      t.querySelectorAll("tr.tv-group button[data-g]").forEach((b) => { b.onclick = () => { const g = b.dataset.g; if (st.foldExceptions.has(g)) st.foldExceptions.delete(g); else st.foldExceptions.add(g); renderTable(shown); }; });
      t.querySelectorAll("tr.tv-group2 button[data-g2]").forEach((b) => { b.onclick = () => { const g = b.dataset.g2; if (st.innerOpen.has(g)) st.innerOpen.delete(g); else st.innerOpen.add(g); renderTable(shown); }; });
      t.querySelectorAll("td.tv-clip, td.tv-over").forEach((td) => { td.onclick = (e) => { if (e.target.closest("button")) return; const k = td.dataset.i + ":" + td.dataset.k; if (st.openCells.has(k)) st.openCells.delete(k); else st.openCells.add(k); td.classList.toggle("open"); }; });
      t.querySelectorAll(".tv-acts").forEach((node) => { const r = shown[Number(node.dataset.i)]; for (const a of (spec.actions || [])) if (matches(a, r)) node.appendChild(actionButton(a, r, spec)); });
      return fit;
    }

    function renderCount(shown, fit) {
      const map = colByKey();
      const parts = [];
      if (st.view && matchesView(st.view)) parts.push("view " + esc(st.view.name));   // E15.1 post: while the table shows the chosen view
      parts.push("<b>" + shown.length.toLocaleString() + "</b> shown of " + data.length.toLocaleString() + " rows");
      // read-paging b: what the source holds, warn-coloured when fewer rows came
      if (sourceCount !== null) parts.push((data.length < sourceCount ? '<span class="tv-mark-warn">' : "<span>") + data.length.toLocaleString() + " of " + sourceCount.toLocaleString() + " in the database</span>");
      for (const c of enumCols()) if (st.f[c.key] && st.f[c.key] !== "all") parts.push(esc(c.label) + " " + esc(st.f[c.key] === "" ? "(blank)" : st.f[c.key]));
      for (const c of numCols()) { const b = st.n[c.key]; if (!b) continue; if ((b.min ?? "") !== "") parts.push(esc(c.label) + " ≥ " + esc(b.min)); if ((b.max ?? "") !== "") parts.push(esc(c.label) + " ≤ " + esc(b.max)); }
      if (st.view && st.viewDropped.length) parts.push("view " + esc(st.view.name) + ": not applied: " + st.viewDropped.map(esc).join(", "));   // missing-column a, named once
      if (st.g_key !== "none" && map.has(st.g_key)) {
        const named = (k, fine) => { const g = groupCache.get(k + (fine ? FINE_TAG : "")); return esc(map.get(k).label) + (g ? " (" + esc(g.words) + ")" : ""); };
        let by = "by " + named(st.g_key, st.g_fine);
        if (st.g2_key !== "none" && st.g2_key !== st.g_key && map.has(st.g2_key)) by += ", then " + named(st.g2_key, st.g2_fine);
        parts.push(by);
      }
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
      if (st.s2_key !== "none" && (!map.has(st.s2_key) || st.s2_key === st.s_key)) st.s2_key = "none";
      const shown = data.filter((r) => passesFilters(r, null)).sort(rowCompare());
      groupCache = new Map();                                          // groupings follow the rows shown
      renderControls(shown);
      let fit = renderTable(shown);
      if (fit && !calibrated && calibrate()) fit = renderTable(shown);
      renderCount(shown, fit);
    }

    // ----- saved views (E15): this table's side -----
    const stateView = () => ({ f: st.f, n: st.n, s_key: st.s_key, s_dir: st.s_dir, hidden: [...st.hidden], g_key: st.g_key,
      g_fine: st.g_fine, g2_key: st.g2_key, g2_fine: st.g2_fine, s2_key: st.s2_key, s2_dir: st.s2_dir });
    const matchesView = (v) => !!v && canonicalView(v, colByKey()) === canonicalView(stateView(), colByKey());
    // What save view writes: the table's name and section, the module's state
    // version, and every saved variable of section D over the columns present.
    function snapshotView() {
      const map = colByKey();
      const f = {}; for (const k of Object.keys(st.f)) if (st.f[k] && st.f[k] !== "all" && map.has(k)) f[k] = st.f[k];
      const n = {}; for (const k of Object.keys(st.n)) { const b = st.n[k] || {}; if (!map.has(k)) continue; const min = b.min == null ? "" : String(b.min), max = b.max == null ? "" : String(b.max); if (min !== "" || max !== "") n[k] = { min, max }; }
      return { table: handle.tableName, section: spec.section, state_version: STATE_VERSION, f, n, s_key: st.s_key, s_dir: st.s_dir, hidden: [...st.hidden].filter((k) => map.has(k)), g_key: st.g_key || "none",
        g_fine: !!st.g_fine, g2_key: st.g2_key || "none", g2_fine: !!st.g2_fine, s2_key: st.s2_key || "none", s2_dir: st.s2_dir || "asc" };
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
      // every column groups now (group-by-scope-reach c); a view saved before the
      // then-group and then-sort restores them as None
      const g = v.g_key || "none";
      if (g === "none") st.g_key = "none"; else if (map.has(g)) st.g_key = g; else { st.g_key = "none"; dropped.push("group by " + nameOf(g)); }
      st.g_fine = st.g_key !== "none" && !!v.g_fine;
      const g2 = v.g2_key || "none";
      if (g2 === "none" || st.g_key === "none" || g2 === st.g_key) st.g2_key = "none"; else if (map.has(g2)) st.g2_key = g2; else { st.g2_key = "none"; dropped.push("then group by " + nameOf(g2)); }
      st.g2_fine = st.g2_key !== "none" && !!v.g2_fine;
      const s2 = v.s2_key || "none";
      if (s2 === "none" || s2 === st.s_key) st.s2_key = "none"; else if (map.has(s2)) st.s2_key = s2; else { st.s2_key = "none"; dropped.push("then sort by " + nameOf(s2)); }
      st.s2_dir = v.s2_dir === "desc" ? "desc" : "asc";
      if (st.g_key !== "none") resetFold(); else { st.foldExceptions.clear(); st.innerOpen.clear(); }
      st.expanded.clear(); st.openCells.clear(); st.panel = null;
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
      update(newRows, newMeta) { if (newMeta && Number.isFinite(newMeta.sourceCount)) sourceCount = newMeta.sourceCount; data = Array.isArray(newRows) ? newRows.filter(Boolean) : []; cols = inferColumns(data, spec); for (const c of cols) if (!st.seen.has(c.key)) { st.seen.add(c.key); } st.expanded.clear(); st.openCells.clear(); persist(true); render(); },
      destroy() { window.removeEventListener("resize", onResize); if (ro) ro.disconnect(); renderers.delete(render); if (mounts.get(handle.tableName) === handle) mounts.delete(handle.tableName); el.innerHTML = ""; el.classList.remove("tv"); },
      snapshotView, applyView, markView, forgetView, matchesView, shownRowsTblVwr,
    });
  }

  window.TableViewer = { version: VERSION, stateVersion: STATE_VERSION, mountTable, actionButton, mountTextSize, mountViewsTblVwr, inferColumns, inferKind, groupingOf };
  window.mountTable = mountTable;
  window.mountViewsTblVwr = mountViewsTblVwr;
})();
