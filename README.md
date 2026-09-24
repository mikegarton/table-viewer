# table-viewer

Mike, 2026-09-22 (project opened on ruling d33 a, session d6b31eed).

A browser-side module that takes one table, an array of row objects with an optional column spec, and gives it sections, enum filters, thresholds on metrics, sort by any column with a chosen direction, a column chooser, row folding instead of horizontal scroll, grouping by an enum column, and an action cell declared by the caller. No dependency, no build step.

Files:

- `table-viewer-v1.js` — the module. Exposes `mountTable(container, rows, spec)` and the `TableViewer` namespace (`mountTable`, `actionButton`, `inferColumns`, `inferKind`, `version`).
- `index.html` and `sample.json` — a demo page with two sample tables and no server: a metric table whose actions only log to the console, and a long-text registry. Serve the folder with any static server and open `index.html`.

Spec of record: `C:\dev\working_docs\projects\table-viewer\table-viewer-spec.md` (draft 2, approved 2026-09-23), with its changelog, the project brief and the build decisions log beside it.

First instances: the five metric tables of the nugget ops page (`C:\dev\nugget-review\ops\index.html`), which loads a byte-identical copy of the module from its own folder until this repo has a GitHub remote and a Pages site; then the copy gives way to the Pages address with the version in the file name.
