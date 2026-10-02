#!/usr/bin/env python3
"""Local FSB website. Run:  python3 server.py   then open http://localhost:8019

It keeps itself up to date by re-reading www.fsb.unizg.hr in the background:
  - news + notice boards every 15 minutes
  - every other page every 6 hours
The browser page checks every couple of minutes and shows what's new."""
import json
import os
import sys
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import fsb

PORT = int(os.environ.get("FSB_PORT", 8019))
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "site")
SNAPSHOT = os.path.join(HERE, "cache", "data.json")
LIVE_EVERY = 15 * 60
PAGES_EVERY = 6 * 3600

state = {"data": None, "json": b"", "refreshing": False, "error": ""}
lock = threading.Lock()
wake = threading.Event()


def publish(data):
    body = json.dumps(data, ensure_ascii=False).encode()
    with lock:
        state["data"], state["json"] = data, body
    with open(SNAPSHOT, "wb") as f:
        f.write(body)


def refresh(force=False):
    if state["refreshing"]:
        return
    state["refreshing"] = True
    try:
        t = time.time()
        live = 0 if force else LIVE_EVERY - 30
        data = fsb.build(page_age=PAGES_EVERY if not force else 3600, live_age=live)
        old = state["data"]
        if old:
            known = {n["id"] for n in old["news"]} | {b["id"] for b in old["boards"]}
            fresh = [x["title"] for x in data["news"] + data["boards"] if x["id"] not in known]
            if fresh:
                fsb.log("new posts:", *fresh[:5])
        publish(data)
        state["error"] = ""
        fsb.log("refreshed in %.0fs" % (time.time() - t))
    except Exception as e:
        state["error"] = str(e)
        fsb.log("refresh failed:", e)
    finally:
        state["refreshing"] = False


def updater():
    while True:
        refresh()
        wake.wait(LIVE_EVERY)
        wake.clear()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=SITE, **kw)

    def log_message(self, *a):
        pass

    def send_json(self, obj=None, raw=None, code=200):
        body = raw if raw is not None else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            if u.path == "/api/data":
                while state["data"] is None:
                    time.sleep(0.5)
                return self.send_json(raw=state["json"])
            if u.path == "/api/status":
                d = state["data"] or {}
                return self.send_json({"updated": d.get("updated"), "refreshing": state["refreshing"],
                                       "error": state["error"],
                                       "latest": [x["id"] for x in d.get("news", [])[:30]] +
                                                 [x["id"] for x in d.get("boards", [])[:30]]})
            if u.path == "/api/raspored":
                g = q.get("grupa", "")
                info = state["data"]["timetable"]
                if g not in info["groups"]:
                    return self.send_json({"error": "nepoznata grupa"}, code=400)
                return self.send_json({"group": g, "days": fsb.timetable(g, info),
                                       "semester": info["semester"], "year": info["year"]})
            if u.path == "/api/djelatnici":
                if len(q.get("q", "")) < 2 and not q.get("jedinica"):
                    return self.send_json([])
                return self.send_json(fsb.staff(q.get("q", ""), q.get("jedinica", "")))
        except Exception as e:
            return self.send_json({"error": str(e)}, code=502)
        if u.path.startswith("/api/"):
            return self.send_json({"error": "not found"}, code=404)
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/refresh":
            threading.Thread(target=refresh, kwargs={"force": True}, daemon=True).start()
            return self.send_json({"ok": True})
        self.send_json({"error": "not found"}, code=404)

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    if os.path.exists(SNAPSHOT):  # start instantly with the last known data
        with open(SNAPSHOT, "rb") as f:
            raw = f.read()
        state["data"], state["json"] = json.loads(raw), raw
    threading.Thread(target=updater, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    fsb.log("FSB site on http://localhost:%d" % PORT)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
