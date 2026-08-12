# GithubCommitTracker

A **desktop dashboard for faculty** to track student activity on GitHub — built
from a CSV roster of students and their GitHub profile links. It scrapes each
student's public contribution calendar and shows per-cohort and per-student
commit stats, streaks, and trends, with no API token required.

> Originally a one-off Python script (`GithubExtract.py`) that subtracted
> contributions on every re-run. This app replaces it with an idempotent,
> Electron + React + TypeScript desktop application that **stores absolute
> per-day counts**, so re-running a refresh corrects a day instead of
> double-counting it.

---

## Features

- **Cohorts as the top-level unit.** Create a cohort (e.g. *2026 Batch — CSE B*),
  import its roster, and refresh it. The home screen shows one card per cohort
  with its totals and a sparkline.
- **Idempotent scraping.** Per-day contribution counts are upserted
  (`student + date`), so a re-run overwrites rather than accumulates. Verified
  stable across repeated runs.
- **Dashboard.** KPI strip, a contribution trend chart (bar/area, auto-picked by
  granularity), and a *Most active* leaderboard (top 10; long names are
  truncated with an ellipsis and single-letter initials are dropped, e.g.
  `M Karthikeyan` → `Karthike…`). Hovering a leaderboard bar shows the full name
  and department.
- **Range presets.** 28 days · 3 months · 6 months · This year · Total, plus
  Daily/Weekly/Monthly/Yearly granularity.
- **Student table.** Sortable, searchable (name / register number / handle /
  department), and filterable by department. Click a row for the per-student
  detail: a GitHub-style contribution heatmap, monthly chart, streaks, and stats.
- **CSV import with column auto-detection.** Works with plain `.csv` files
  (header row + data rows). Columns are auto-mapped by header name; if a column
  can't be detected, a **mapping popup** lets you assign each field by hand.
  Recognised headers: `Name`, `Register Number` / `Reg No`, `Email`,
  `Department` / `Dept`, `GitHub Profile Link` / `Link`.
- **Live table updates.** During a refresh, each student's row updates in the
  table as soon as its scrape finishes — you don't wait for the whole cohort.
- **Edits.** Add/edit/archive/delete students, move a student between cohorts,
  edit/delete a cohort (cascade). Export the table or a daily matrix to CSV.
- **Dark + light themes**, persisted. Monochrome design system, custom frameless
  title bar.
- **GitHub auto-update (Windows).** On launch (and hourly) the Windows build
  checks GitHub Releases for a newer version. Nothing downloads without your
  consent — an *Update* badge appears in the title bar; click it to download,
  then click again to restart and install.

---

## Repository layout

```
PythonGithubExtraction/        # repo root
├── app/                       # the application
│   ├── src/
│   │   ├── main/              # Electron main process: DB, IPC, services, updater
│   │   ├── preload/           # contextBridge between renderer and main
│   │   ├── renderer/          # React UI (App, components, hooks)
│   │   ├── database/          # better-sqlite3 schema, migrations, repositories
│   │   └── shared/            # types + pure logic (dates, streaks, parsing)
│   ├── scripts/               # verify.cjs integration harness
│   ├── tests/                 # vitest unit tests
│   ├── electron-builder.config.cjs
│   ├── package.json
│   └── vite.*.config.ts       # per-target Vite builds (main/preload/verify/shot)
└── GithubExtract.py           # the original script, kept for reference
```

## Data model

- `cohorts` — top-level grouping (name, batch, dept, section).
- `students` — `cohort_id`, `name`, `reg_no` (optional register number), `email`
  (optional), `dept`, `link`, `username`, `active`.
- `contributions` — one row per `(student_id, date)` with an absolute `count`.
  This is what makes re-runs safe.
- `metadata` / `refresh_runs` — persisted theme and a log of refresh runs.

The database lives next to the app data (`committracker.db`). No network calls
except to `github.com` for scraping and, on Windows, to GitHub Releases for
updates.

---

## CSV roster format

A plain `.csv` with a header row. Column order does not matter — headers are
matched by name (case-insensitive, fuzzy). Example:

```csv
Timestamp,Email Address,Name,Department,GitHub Profile Link
2026-08-01,as_ha@clg.edu,Asha R,CSSE,https://github.com/asha
,bala@clg.edu,Bala K,CSE,github.com/bala
,chitra@clg.edu,Chitra M,ECE,@chitra
```

- `Timestamp` is ignored (kept so exported sheets paste back cleanly).
- `Email` and `Register Number` are optional.
- The GitHub link may be a full URL, a `github.com/…` path, or a bare `@handle` /
  `handle`; the username is derived automatically.
- If detection fails for any required column, the import shows a **mapping
  screen** so you can point each field at the right column.

---

## Development

Requires Node 18+ and Electron's build prerequisites.

```bash
cd app
npm install

npm run dev              # Vite dev server (renderer only)
npm run electron:dev     # full app (Vite + Electron) for live development

npm test                # vitest unit tests (parsing / streaks / dates)
npm run verify          # integration harness: real SQLite + idempotency + migrations
npm run build           # type-check + build the renderer
npm run build:electron  # build main + preload
```

> The repo intentionally ships **no seed data**. Import a real roster via
> *Import CSV* inside a cohort.

## Distribution

```bash
# Windows installer (.exe / NSIS) — the primary target
npm run electron:build:win

# Linux (AppImage / deb) and macOS (dmg) are also configured
npm run electron:build:linux
```

The Windows build publishes to GitHub Releases (`publish` in
`electron-builder.config.cjs`). Tag a release and the auto-updater picks it up.

---

## Privacy & credentials

- **No API token** is needed or stored — public contribution calendars are
  scraped directly.
- **No student data leaves the machine** except what you choose to export to a
  CSV you save yourself.
- The app writes only to its own local SQLite database.

---

## License

For faculty/institutional use. See the repository owner for terms.
