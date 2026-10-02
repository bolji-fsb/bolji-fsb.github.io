# Bolji FSB (neslužbeno)

A cleaner, easier-to-use front end for the [FSB](https://www.fsb.unizg.hr/index.php?fsbonline) website
(Fakultet strojarstva i brodogradnje, Sveučilište u Zagrebu). **Unofficial** — a student project, not made by
or affiliated with FSB. All content is read from fsb.unizg.hr.

**Open it:** https://bolji-fsb.github.io/ — on a phone, use *Add to Home Screen* to install it like an app.
**Offline file:** [bolji-fsb.html](https://bolji-fsb.github.io/bolji-fsb.html) — works without internet and pulls fresh data when online.

Updated every 15 minutes by GitHub Actions (`.github/workflows/publish.yml`).

## Running it yourself
- `python3 server.py` — live version on http://localhost:8019 (re-reads FSB every 15 min)
- `python3 export.py` — the single offline HTML file in `dist/`
- `python3 export.py --site` — the website in `dist/site/`
