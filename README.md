# table-viewer

Mike, 2026-09-22 (project opened on ruling d33 a, session d6b31eed).

A browser-side module that takes one table, an array of row objects with an optional column spec, and gives it sections, enum filters, thresholds on metrics, sort by any column with a chosen direction, a column chooser, row folding instead of horizontal scroll, grouping by an enum column, and an action cell declared by the caller. No dependency, no build step.

Files:

- `table-viewer-v1.js` — the module. Exposes `mountTable(container, rows, spec)` and the `TableViewer` namespace (`mountTable`, `actionButton`, `inferColumns`, `inferKind`, `version`).
- `index.html` and `sample.json` — a demo page with two sample tables and no server: a metric table whose actions only log to the console, and a long-text registry. Serve the folder with any static server and open `index.html`.

Spec of record: `C:\dev\working_docs\projects\table-viewer\table-viewer-spec.md` (draft 2, approved 2026-09-23), with its changelog, the project brief and the build decisions log beside it.

Repo and site, public since 2026-09-24 (ruling d7 a): `https://github.com/mikegarton/table-viewer`; the demo page and the module are served at `https://mikegarton.github.io/table-viewer/`.

First instances: the five metric tables of the nugget ops page (`C:\dev\nugget-review\ops\index.html`), which loads the module from `https://mikegarton.github.io/table-viewer/table-viewer-v1.js`; the version in the file name pins the call shape, and the name takes the next number when the call changes.
