# FSB Online (neslužbeno)

A cleaner, easier-to-use front end for the [FSB](https://www.fsb.unizg.hr/index.php?fsbonline) website
(Fakultet strojarstva i brodogradnje, Sveučilište u Zagrebu). **Unofficial** — not made by or affiliated with FSB.
All content is read from fsb.unizg.hr.

- `python3 server.py` — local live version on http://localhost:8019 (re-reads FSB every 15 min)
- `python3 export.py` — one offline HTML file in `dist/` (snapshot)
- GitHub Actions (`.github/workflows/publish.yml`) rebuilds `data.json` + the offline file every 15 minutes into the [`data` branch](https://github.com/TigerShark900/fsb-online/tree/data).

**Download:** [fsb-online.html](https://github.com/TigerShark900/fsb-online/blob/data/fsb-online.html) (click the download icon). It works offline and pulls fresh data from GitHub whenever you are online.
