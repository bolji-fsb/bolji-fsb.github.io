#!/usr/bin/env python3
"""Builds ONE self-contained HTML file (dist/fsb-online.html) with everything inside it:
pages, news, notice boards, every group's timetable and the whole staff directory.
It works offline / from any folder / on any computer, but it's a snapshot - re-run this to update.

    python3 export.py            -> dist/fsb-online.html
    python3 export.py --site     -> also dist/site/ (data.json + fsb-online.html) for the "data" branch

The file pulls fresh data.json from GitHub whenever it's online."""
import json
import os
import sys
import time

import fsb

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "site")


def main():
    t0 = time.time()
    fsb.log("building pages, news and notice boards…")
    data = fsb.build(live_age=5 * 60)  # news + notice boards: always re-read (runs every 15 min)

    groups = data["timetable"]["groups"]
    data["timetables"] = {}
    for i, g in enumerate(groups, 1):
        data["timetables"][g] = fsb.timetable(g, data["timetable"], max_age=6 * 3600)
        if i % 20 == 0:
            fsb.log("timetables %d/%d" % (i, len(groups)))

    people = {}
    units = data["staffUnits"]
    for i, u in enumerate(units, 1):
        for p in fsb.staff("", u["id"]):
            key = p["email"] or (p["name"] + " " + p["surname"])
            if key in people:  # someone listed in several units: keep every unit they belong to
                if p["unitId"] and p["unitId"] not in people[key]["unitIds"]:
                    people[key]["unitIds"].append(p["unitId"])
            else:
                p["unitIds"] = [p["unitId"]] if p["unitId"] else []
                people[key] = p
        if i % 25 == 0:
            fsb.log("staff units %d/%d" % (i, len(units)))
    data["staff"] = sorted(people.values(), key=lambda p: (p["surname"], p["name"]))

    # where the file looks for fresh data: the repo's "data" branch, rebuilt hourly by GitHub Actions
    data["remote"] = os.environ.get("FSB_REMOTE", "https://raw.githubusercontent.com/TigerShark900/fsb-online/data/data.json")

    css = open(os.path.join(SITE, "style.css"), encoding="utf-8").read()
    js = open(os.path.join(SITE, "app.js"), encoding="utf-8").read()
    shell = open(os.path.join(SITE, "index.html"), encoding="utf-8").read()
    blob = json.dumps(data, ensure_ascii=False)
    page = shell.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "\n</style>")
    page = page.replace('<script src="app.js"></script>',
                        "<script>window.FSB_STATIC = " + blob.replace("</", "<\\/") + ";</script>\n<script>\n" +
                        js.replace("</script", "<\\/script") + "\n</script>")

    outs = [os.path.join(HERE, "dist", "fsb-online.html")]
    if "--site" in sys.argv:
        site = os.path.join(HERE, "dist", "site")
        outs += [os.path.join(site, "index.html"), os.path.join(site, "fsb-online.html")]
        os.makedirs(site, exist_ok=True)
        with open(os.path.join(site, "data.json"), "w", encoding="utf-8") as f:
            f.write(blob)
    for out in outs:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            f.write(page)
    fsb.log("wrote %s (%.1f MB, %d people, %d timetables) in %.0fs" % (
        ", ".join(outs), os.path.getsize(outs[0]) / 1e6, len(data["staff"]), len(data["timetables"]), time.time() - t0))


if __name__ == "__main__":
    main()
