"""Everything that talks to the real FSB website (www.fsb.unizg.hr).

The site has no API, so we download its pages and pick out the useful bits:
the menu tree, page contents, news, notice boards (oglasne ploče),
the lecture timetable and the staff directory.
Downloads are cached on disk in ./cache so we don't hammer their server."""
import html
import json
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

BASE = "https://www.fsb.unizg.hr/index.php"
ORIGIN = "https://www.fsb.unizg.hr/"
UA = {"User-Agent": "Mozilla/5.0 (fsb-bolji local viewer)"}
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
os.makedirs(CACHE, exist_ok=True)

SECTIONS = [
    ("o_fakultetu", "O Fakultetu"),
    ("studiranje_i_nastava", "Studiranje i nastava"),
    ("znanost_i_suradnja", "Znanost i suradnja"),
    ("medunarodna_suradnja", "Međunarodna suradnja"),
    ("zivot_na_fsb", "Život na FSB"),
]
NEWS_CATS = ["586", "630", "631", "632", "633", "634", "635", "636", "642"]
BOARDS_PATH = "studiranje_i_nastava/nastava/oglasne_ploce"

_net_lock = threading.Lock()  # one request at a time, to be polite


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, file=sys.stderr, flush=True)


def _http(url, data=None):
    req = urllib.request.Request(url, headers=UA, data=data)
    with _net_lock:
        body = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
        time.sleep(0.3)
    return body


def fetch(query, max_age, post=None, url=None):
    """Download BASE?query (or url), reusing the cached copy if it's younger than max_age seconds.
    If the download fails we fall back to whatever old copy we have."""
    key = (url or "") + query + (json.dumps(post, sort_keys=True) if post else "")
    fn = os.path.join(CACHE, re.sub(r"[^a-zA-Z0-9_=-]", "_", key)[-180:] + ".html")
    if os.path.exists(fn) and time.time() - os.path.getmtime(fn) < max_age:
        return open(fn, encoding="utf-8").read()
    target = url or (BASE + "?" + urllib.parse.quote(query, safe="&=_-.%"))
    data = urllib.parse.urlencode(post).encode() if post else None
    for attempt in range(3):
        try:
            body = _http(target, data)
            with open(fn, "w", encoding="utf-8") as f:
                f.write(body)
            return body
        except Exception as e:
            log("fetch failed", target, e)
            time.sleep(2)
    return open(fn, encoding="utf-8").read() if os.path.exists(fn) else ""


def plain(h):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", h)).split())


def query_to_path(q):
    """'?fsbonline&a&b&lang=hr' -> 'a/b'  (None when it isn't a normal page)"""
    q = q.replace("&amp;", "&").split("#")[0].split("?", 1)[-1]
    parts = [p for p in q.split("&") if p and "=" not in p and p != "fsbonline"]
    return "/".join(parts) if parts else None


# ---------------------------------------------------------------- menu tree
class MenuParser(HTMLParser):
    """Turns the nested <ul class=izbornik> left-hand menu into a tree."""

    def __init__(self):
        super().__init__()
        self.root = {"children": []}
        self.stack = [self.root]
        self.divs = []
        self.a = None
        self.last = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "div":
            is_sub = a.get("id", "").endswith("_sub")
            self.divs.append(is_sub)
            if is_sub:
                self.stack.append(self.last or self.stack[-1])
        elif tag == "a" and "href" in a:
            self.a = {"href": a["href"], "title": ""}

    def handle_endtag(self, tag):
        if tag == "div" and self.divs:
            if self.divs.pop():
                self.stack.pop()
        elif tag == "a" and self.a is not None:
            node = {"title": " ".join(self.a["title"].split()), "href": self.a["href"], "children": []}
            self.stack[-1]["children"].append(node)
            self.last = node
            self.a = None

    def handle_data(self, d):
        if self.a is not None:
            self.a["title"] += d


def parse_menu(page):
    start = '<div id="tijelo_izbornik_lijevo">'
    i = page.find(start)
    if i < 0:
        return []
    p = MenuParser()
    p.feed(page[i + len(start):page.find('<div id="tijelo_sadrzaj"', i)])
    return p.root["children"]


# ---------------------------------------------------------------- HTML cleaning
KEEP = {"p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a", "strong", "b", "em", "i",
        "u", "table", "thead", "tbody", "tr", "td", "th", "img", "blockquote", "hr", "sup", "sub", "div"}
VOID = {"br", "img", "hr"}


class Linker:
    """Rewrites links from the FSB site so they point inside our site when we have that page."""

    def __init__(self, known=()):
        self.known = set(known)

    # the HTML parser turns "&centri" into "¢ri" etc. (old entities without ';') - undo that in URLs
    LEGACY = {"\u00a2": "&cent", "\u00b6": "&para", "\u00ac": "&not", "\u00a7": "&sect",
              "\u00ae": "&reg", "\u00a9": "&copy", "\u00b5": "&micro", "\u00b7": "&middot"}

    def __call__(self, u):
        u = html.unescape(u.strip())
        for ch, ent in self.LEGACY.items():
            u = u.replace(ch, ent)
        if not u or u.startswith("javascript:"):
            return ""
        if u.startswith(("mailto:", "tel:", "#")):
            return u
        m = re.match(r"https?://(?:www\.)?fsb\.(?:unizg\.)?hr/(?:index\.php)?(\?.*)$", u)
        if m:
            u = m.group(1)
        elif u.startswith("http"):
            return u
        if u.startswith("index.php?"):
            u = u[len("index.php"):]
        if u.startswith("?"):
            m = re.search(r"[?&]id=(\d+)", u)
            if m and "oglasne_ploce" in u:
                return "#/oglasne-ploce/" + m.group(1)
            if m and "djelatnici" not in u:
                return "#/vijesti/" + m.group(1)
            tr = re.search(r"djelatnici.*[?&]trazi=([^&]+)", u)
            if tr:
                return "#/djelatnici?q=" + tr.group(1)
            j = re.search(r"djelatnici.*[?&]jedinica=(\d+)", u)
            if j:
                return "#/djelatnici?j=" + j.group(1)
            if "raspored" in u and "ispit" not in u:
                return "#/raspored"
            p = query_to_path(u)
            if p and "=" not in u.replace("lang=", ""):
                if p in self.known:
                    return "#/" + p
                last = p.split("/")[-1]
                hits = [k for k in self.known if k.split("/")[-1] == last]
                if len(hits) == 1:
                    return "#/" + hits[0]
            return BASE + u
        return ORIGIN + u.lstrip("/")


class Cleaner(HTMLParser):
    """Keeps only simple formatting tags, drops all the inline styles / scripts / layout junk."""

    def __init__(self, link):
        super().__init__(convert_charrefs=True)
        self.link, self.out, self.skip, self.open = link, [], 0, []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "form", "select", "input", "button"):
            self.skip += tag not in ("input",)
            return
        if self.skip or tag not in KEEP:
            return
        a = dict(attrs)
        s = "<" + tag
        if tag == "a" and a.get("href"):
            href = self.link(a["href"])
            if href:
                s += ' href="%s"' % html.escape(href)
                if href.startswith("http"):
                    s += ' target="_blank" rel="noopener"'
        elif tag == "img":
            src = self.link(a.get("src", ""))
            if not src:
                return
            s += ' src="%s" loading="lazy" alt="%s"' % (html.escape(src), html.escape(a.get("alt", "")))
        elif tag in ("td", "th"):
            for k in ("colspan", "rowspan"):
                if a.get(k):
                    s += ' %s="%s"' % (k, html.escape(a[k]))
        self.out.append(s + ">")
        if tag not in VOID:
            self.open.append(tag)

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "form", "select", "button"):
            self.skip = max(0, self.skip - 1)
            return
        if self.skip or tag not in self.open:
            return
        while self.open:
            x = self.open.pop()
            self.out.append("</%s>" % x)
            if x == tag:
                break

    def handle_data(self, d):
        if not self.skip:
            self.out.append(html.escape(d, quote=False))

    def result(self):
        while self.open:
            self.out.append("</%s>" % self.open.pop())
        s = "".join(self.out).replace("\xa0", " ")
        s = re.sub(r"[ \t]*\n\s*", "\n", s)
        for _ in range(8):
            s = re.sub(r"<(div|p|span|strong|b|em|li|ul|h\d|td|tr)>(?:\s|<br>)*</\1>", "", s)
            s = re.sub(r"<div>\s*(<div>(?:(?!<div>).)*?</div>)\s*</div>", r"\1", s, flags=re.S)
        s = re.sub(r"(<br>\s*){3,}", "<br><br>", s)
        return s.strip()


def clean(fragment, link):
    c = Cleaner(link)
    c.feed(re.sub(r"<!--.*?-->", "", fragment, flags=re.S))
    return c.result()


def page_content(page, link):
    i = page.find('<div id="tijelo_sadrzaj">')
    if i < 0:
        return ""
    k = page.find('id="podnozje"', i)
    h = clean(page[i + len('<div id="tijelo_sadrzaj">'):k if k > 0 else None], link)
    h = re.sub(r"^\s*<h1>.*?</h1>", "", h, flags=re.S)  # our page draws its own title
    return h.strip()


def page_title(page):
    i = page.find('<div id="tijelo_sadrzaj">')
    m = re.search(r"<h1[^>]*>(.*?)</h1>", page[i:] if i >= 0 else "", re.S)
    if m and plain(m.group(1)):
        return plain(m.group(1))
    crumbs = re.findall(r'<div style="padding: 0px 5px;margin-top:2px;">\s*([^<]+?)\s*</div>', page)
    return plain(crumbs[-1]) if crumbs else ""


# ---------------------------------------------------------------- news & notice boards
MONTHS = {"siječnja": 1, "veljače": 2, "ožujka": 3, "travnja": 4, "svibnja": 5, "lipnja": 6, "srpnja": 7,
          "kolovoza": 8, "rujna": 9, "listopada": 10, "studenoga": 11, "studenog": 11, "prosinca": 12}


def hr_date(s):
    m = re.search(r"(\d+)\.\s*(\w+)\s+(\d{4})", s)
    return "%s-%02d-%02d" % (m.group(3), MONTHS.get(m.group(2).lower(), 1), int(m.group(1))) if m else ""


def parse_posts(page, link, into, extra=None):
    """News and notice-board posts share the same 'vijest' markup."""
    for m in re.finditer(r'<div class="vijest"\s+idnews="(\d+)".*?(?=<div class="vijest"\s+idnews=|<div id="podnozje"|$)',
                         page, re.S):
        nid, block = m.group(1), m.group(0)
        if nid in into:
            if extra:
                for k, v in extra.items():
                    into[nid].setdefault(k, [])
                    if v not in into[nid][k]:
                        into[nid][k].append(v)
            continue
        t = re.search(r"<h3><a[^>]*>(.*?)</a></h3>", block, re.S)
        body = re.search(r'<div class="vijestTekst">(.*?)</div><div kategorija', block, re.S)
        cat = re.search(r'kategorija="[^"]*cat=(\d+)"[^>]*>(.*?)</div>', block, re.S)
        aut = re.search(r'class="linkAutor[^"]*">(.*?)</div>', block, re.S)
        dat = re.search(r'class="linkDatum[^"]*">(.*?)</div>', block, re.S)
        raw = body.group(1) if body else ""
        img = re.search(r'<img src="([^"]+)"', raw)
        raw = re.sub(r"<a[^>]*>\s*<img[^>]*>\s*</a>", "", raw, flags=re.S)
        item = {
            "id": nid,
            "title": plain(t.group(1)) if t else "",
            "html": clean(raw, link),
            "cat": plain(cat.group(2)) if cat else "",
            "author": plain(aut.group(1)).rstrip(",").strip() if aut else "",
            "date": hr_date(plain(dat.group(1))) if dat else "",
            "img": link(html.unescape(img.group(1))) if img else "",
        }
        if extra:
            for k, v in extra.items():
                item[k] = [v]
        into[nid] = item


def board_units(page):
    """The notice board's department picker: [(cat_id, name), ...]"""
    return [(c, plain(n)) for c, n in re.findall(
        r"oglasne_ploce&cat=(\d+)'\">(.*?)</div>", page) if plain(n) != "Sve"]


# ---------------------------------------------------------------- timetable
def timetable_info(page):
    groups = re.findall(r'<option value="([^"]+)">', page[page.find('name="grupa"'):page.find("</select>", page.find('name="grupa"'))])
    sem = re.search(r"semestar:'(\w+)'", page)
    year = re.search(r"ak_godina:(\d+)", page)
    return {"groups": groups, "semester": sem.group(1) if sem else "zimski",
            "year": int(year.group(1)) if year else int(time.strftime("%Y"))}


def timetable(group, info, max_age=1800):
    url = ORIGIN + "atlantis/wms/modules/rezervacije/rezervacije_raspored_ajax.php"
    days = []
    for dan in range(1, 6):
        body = fetch("", max_age, url=url, post={"dan": dan, "semestar": info["semester"],
                                               "ak_godina": info["year"], "time_iterator": "0.25",
                                               "grupa": group, "sitetype": ""})
        items = []
        for b in re.findall(r'<div class="tab_rezervacija"[^>]*>(.*?)</div>\s*</div>', body, re.S):
            name = re.search(r"<b>(.*?)</b>", b, re.S)
            room = re.search(r"<span[^>]*>(.*?)</span>", b, re.S)
            tm = re.search(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", b)
            if not tm:
                continue
            nm = plain(name.group(1)) if name else ""
            kind = ""
            km = re.search(r",\s*([^,]+)$", nm)
            if km and len(km.group(1)) < 14:
                kind, nm = km.group(1).strip(), nm[:km.start()].strip()
            items.append({"name": nm, "kind": kind, "room": plain(room.group(1)) if room else "",
                          "start": tm.group(1), "end": tm.group(2)})
        days.append(items)
    return days


# ---------------------------------------------------------------- staff directory
def staff_units(page):
    out = []
    for v, n in re.findall(r'<option\s+class=\'optionWrap\'\s+value="(\d+)">(.*?)</option>', page):
        raw = html.unescape(n)
        depth = (len(raw) - len(raw.lstrip("\xa0 "))) // 6
        out.append({"id": v, "name": re.sub(r"^\(\d+\)\s*", "", raw.strip("\xa0 ")), "depth": depth})
    return out


def _profile(page):
    i = page.find("fsblocator_profile_content")
    blk = re.sub(r"<!--.*?-->", "", page[i:page.find('id="podnozje"', i)], flags=re.S)
    head = plain(re.search(r"font-weight:bold;[^>]*>(.*?)</div>", blk, re.S).group(1))
    fields = {plain(k).rstrip(":").strip(): v for k, v in
              re.findall(r'<div class="nazivpolja"><b>(.*?)</b></div>\s*<div class="podacipolja"[^>]*>(.*?)</div>', blk, re.S)}
    units = re.findall(r"jedinica=(\d+)\">(.*?)</a>", fields.get("Odjel", ""))
    mail = re.search(r"mailto:([^\"]+)", fields.get("E-mail", ""))
    m = re.match(r"((?:(?:Prof|Izv|Doc|Dr|Mr)\.\s*(?:sc\.|dr\.\s*sc\.)?\s*)*)(.*)", head)
    title, rest = (m.group(1).strip(), m.group(2)) if m else ("", head)
    namepart, _, deg = rest.partition(",")
    bits = namepart.split()
    role = ", ".join(x for x in [deg.strip(), plain(fields.get("Zvanje", "")), plain(fields.get("Funkcija", ""))] if x)
    return {"title": title, "name": " ".join(bits[:-1]), "surname": bits[-1] if bits else "", "role": role,
            "email": mail.group(1) if mail else "", "unitId": units[-1][0] if units else "",
            "unit": plain(units[-1][1]) if units else "", "profile": ""}


def staff(q="", unit=""):
    query = "fsbonline&o_fakultetu&ustrojstvo&djelatnici"
    if unit:
        query += "&jedinica=" + urllib.parse.quote(unit)
    else:
        query += "&trazi=" + urllib.parse.quote(q) + "&trazenje=Trazi"
    page = fetch(query, 6 * 3600)
    if "fsblocator_profile_content" in page:  # exactly one hit: FSB jumps straight to the profile
        return [_profile(page)]
    people = []
    for blk in re.split(r'<div style="position:relative;border-bottom:dotted 1px #ccc', page)[1:]:
        blk = re.sub(r"<!--.*?-->", "", blk, flags=re.S)
        name = re.search(r'<div style="float:left;">\s*(.*?)<span class="footer"', blk, re.S)
        if not name:
            continue
        title = re.search(r'class="titula">\s*(.*?)<div', blk, re.S)
        mail = re.search(r'href="mailto:([^"]+)"', blk)
        un = re.search(r'jedinica=(\d+)">(.*?)</a>', blk, re.S)
        user = re.search(r"djelatnici&user=(\w+)", blk)
        full = plain(name.group(1))
        surname, _, rest = full.partition(",")
        given, _, role = rest.strip().partition(",")
        people.append({"title": plain(title.group(1)) if title else "", "surname": surname.strip(),
                       "name": given.strip(), "role": role.strip(), "email": mail.group(1) if mail else "",
                       "unitId": un.group(1) if un else "", "unit": plain(un.group(2)) if un else "",
                       "profile": BASE + "?fsbonline&o_fakultetu&ustrojstvo&djelatnici&user=" + user.group(1) if user else ""})
    return people


# ---------------------------------------------------------------- the whole site
def build(page_age=6 * 3600, live_age=15 * 60):
    """Builds the full data bundle the website runs on.
    page_age: how old normal pages may be before re-downloading.
    live_age: same for news + notice boards (they change often)."""
    tree, raw_pages = [], {}
    for slug, title in SECTIONS:
        page = fetch("fsbonline&%s&lang=hr" % slug, page_age)
        raw_pages[slug] = page

        def conv(nodes):
            res = []
            for n in nodes:
                p = query_to_path(n["href"]) if n["href"].startswith("?") else None
                ext = None if p else Linker()(n["href"])
                if ext and ext.startswith("#/"):
                    p, ext = ext[2:], None
                res.append({"title": n["title"], "path": p, "ext": ext, "children": conv(n["children"])})
            return res

        tree.append({"title": title, "path": slug, "ext": None, "children": conv(parse_menu(page))})

    def walk(nodes):
        for n in nodes:
            if n["path"] and n["path"] not in raw_pages:
                raw_pages[n["path"]] = fetch("fsbonline&" + n["path"].replace("/", "&") + "&lang=hr", page_age)
            walk(n["children"])

    walk(tree)
    link = Linker(raw_pages.keys())
    content = {p: page_content(pg, link) for p, pg in raw_pages.items()}

    # Pages that no menu points to but other pages link to: pull those in too (2 levels deep),
    # so clicking around keeps you inside this site instead of bouncing to the old one.
    extra = {}
    for _round in range(2):
        found = {}
        for p, h in list(content.items()):
            for u in re.findall(r'href="https://www\.fsb\.unizg\.hr/index\.php\?([^"]+)"', h):
                u = html.unescape(u)
                q = query_to_path("?" + u)
                if q and q not in raw_pages and q not in found and "=" not in re.sub(r"&?lang=\w+", "", u) \
                        and q not in ("login", "novosti", "aktualno") and len(found) < 80:
                    found[q] = p
        if not found:
            break
        for q, parent in found.items():
            pg = fetch("fsbonline&" + q.replace("/", "&") + "&lang=hr", page_age)
            raw_pages[q] = pg
            t = page_title(pg)
            if t and t != "Početna" and "tijelo_sadrzaj" in pg:
                extra[q] = {"title": t, "parent": parent}
        link = Linker(set(raw_pages) - (set(found) - set(extra)))
        content = {p: page_content(pg, link) for p, pg in raw_pages.items() if p not in found or p in extra}
    content = {p: h for p, h in content.items() if h.strip() or p in raw_pages}

    news = {}
    parse_posts(fetch("fsbonline&aktualno&lang=hr", live_age), link, news)
    for c in NEWS_CATS:
        parse_posts(fetch("fsbonline&aktualno&cat=%s" % c, live_age), link, news)

    board_page = fetch("fsbonline&" + BOARDS_PATH.replace("/", "&") + "&lang=hr", live_age)
    raw_pages[BOARDS_PATH] = board_page
    units = board_units(board_page)
    boards = {}
    parse_posts(board_page, link, boards)
    for cid, name in units:
        pg = fetch("fsbonline&%s&cat=%s" % (BOARDS_PATH.replace("/", "&"), cid), live_age)
        parse_posts(pg, link, boards, extra={"units": name})

    tt = timetable_info(raw_pages.get("studiranje_i_nastava/nastava/raspored_predavanja", ""))
    su = staff_units(raw_pages.get("o_fakultetu/ustrojstvo/djelatnici", ""))

    key = lambda x: (x["date"], int(x["id"]))
    return {
        "tree": tree,
        "extra": extra,
        "content": content,
        "news": sorted(news.values(), key=key, reverse=True),
        "boards": sorted(boards.values(), key=key, reverse=True),
        "boardUnits": [n for _, n in units],
        "timetable": tt,
        "staffUnits": su,
        "updated": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
