/* Bolji FSB. One-page app: every "page" is a #/route.
   Runs three ways: with the local server (server.py, /api/...), as one offline HTML file with the data
   inside (FSB_STATIC), or as the hosted site that loads data.json next to it (FSB_DATA_URL). */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s || "").toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");
const ORIGIN = "https://www.fsb.unizg.hr/index.php?fsbonline&";
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

const ICON = {
  chev: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  board: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h6M12 18v3"/></svg>',
  exam: '<svg viewBox="0 0 24 24"><path d="M9 4h6l1 2h3v15H5V6h3z"/><path d="m9 13 2 2 4-4"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.6.2 4.5 2 5.2 4.9"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
  login: '<svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  brief: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/></svg>',
  desk: '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M10 21v-6h4v6"/></svg>',
  news: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
};

/* Pages on the FSB site that we replace with our own, nicer versions. */
const SPECIAL = {
  "studiranje_i_nastava/nastava/raspored_predavanja": "#/raspored",
  "studiranje_i_nastava/nastava/oglasne_ploce": "#/oglasne-ploce",
  "o_fakultetu/ustrojstvo/djelatnici": "#/djelatnici",
};

let D = null;          // all data from the server
// Set when this page was exported as a single offline file (export.py): no server, everything is inside.
const EMBEDDED = window.FSB_STATIC || null;   // offline file: all data is inside the page
const DATA_URL = window.FSB_DATA_URL || null;   // hosted site: data.json sits next to the page
const STATIC = !!(EMBEDDED || DATA_URL);        // either way there is no local server to ask
let IDX = {};          // path -> {node, parent, section, trail}
let SEARCH = [];       // search index
let seen = new Set(store.get("seen", []));
const firstVisit = !store.get("seenInit", false);

/* ------------------------------------------------------------ data */
function indexData() {
  IDX = {};
  const walk = (nodes, parent, section, trail) => {
    for (const n of nodes) {
      const sec = section || n;
      const t = [...trail, n];
      if (n.path && !IDX[n.path]) IDX[n.path] = { node: n, parent, section: sec, trail: t };
      walk(n.children, n, sec, t);
    }
  };
  walk(D.tree, null, null, []);
  for (const [path, x] of Object.entries(D.extra || {})) {
    const par = IDX[x.parent];
    if (!par || IDX[path]) continue;
    const node = { title: x.title, path, ext: null, children: [], extra: true };
    IDX[path] = { node, parent: par.node, section: par.section, trail: [...par.trail, node] };
  }

  if (firstVisit) {
    D.news.forEach((x) => seen.add(x.id));
    D.boards.forEach((x) => seen.add(x.id));
    store.set("seen", [...seen]);
    store.set("seenInit", true);
  }

  BOARD_IDS = new Set(D.boards.map((x) => x.id));
  for (const n of [...D.news, ...D.boards]) n._txt = norm(n.title + " " + plainText(n.html));
  resetRules();

  SEARCH = [];
  for (const [path, e] of Object.entries(IDX)) {
    const txt = plainText(D.content[path] || "");
    SEARCH.push({ type: "Stranice", title: e.node.title, sub: e.trail.slice(0, -1).map((x) => x.title).join(" › ") || "Sekcija", url: linkFor(e.node), t: norm(e.node.title), b: norm(txt) });
  }
  for (const n of D.news) SEARCH.push({ type: "Vijesti", title: n.title, sub: `${fmtDate(n.date)} · ${n.cat}`, url: "#/vijesti/" + n.id, t: norm(n.title), b: norm(plainText(n.html)), date: n.date });
  for (const n of D.boards) SEARCH.push({ type: "Oglasne ploče", title: n.title, sub: `${fmtDate(n.date)} · ${(n.units || []).join(", ") || n.cat}`, url: "#/oglasne-ploce/" + n.id, t: norm(n.title), b: norm(plainText(n.html)), date: n.date });
  for (const q of QUICK) SEARCH.push({ type: "Brzi linkovi", title: q.title, sub: q.sub, url: q.url, t: norm(q.title + " " + (q.alias || "")), b: "" });
}

const _pt = document.createElement("div");
function plainText(h) { _pt.innerHTML = h; return _pt.textContent.replace(/\s+/g, " ").trim(); }
function excerpt(path, n = 120) {
  const t = plainText(D.content[path] || "");
  return t.length > n ? t.slice(0, n).replace(/\s\S*$/, "") + "…" : t;
}
function linkFor(n) {
  if (!n.path) return n.ext;
  return SPECIAL[n.path] || "#/" + n.path;
}
function isExt(n) { return !n.path && n.ext && !n.ext.startsWith("#"); }
const MONTHS = ["siječnja", "veljače", "ožujka", "travnja", "svibnja", "lipnja", "srpnja", "kolovoza", "rujna", "listopada", "studenoga", "prosinca"];
function fmtDate(d) {
  if (!d) return "";
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd}. ${MONTHS[m - 1]} ${y}.`;
}
function ago(d) {
  if (!d) return "";
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d + "T00:00:00")) / 864e5);
  if (days <= 0) return "danas";
  if (days === 1) return "jučer";
  if (days < 7) return `prije ${days} dana`;
  return fmtDate(d);
}
const isNew = (id) => !seen.has(id);
function markSeen(ids) {
  let ch = false;
  for (const id of ids) if (!seen.has(id)) { seen.add(id); ch = true; }
  if (ch) { store.set("seen", [...seen]); drawNav(); }
}

/* ------------------------------------------------------------ following ("Praćeno") */
// What you follow: departments (the ⭐ on notice boards, stored as "myUnits"), keywords,
// news categories, and optionally every course from your timetable group.
const FOLLOW_DEFAULT = { keywords: [], cats: [], myCourses: true, notify: false };
const follow = () => ({ ...FOLLOW_DEFAULT, ...store.get("follow", {}) });
function setFollow(patch) { store.set("follow", { ...follow(), ...patch }); resetRules(); }
const KEYWORD_IDEAS = ["kolokvij", "ispitni rok", "rezultati", "početak nastave", "konzultacije", "demonstrator", "stipendija", "natječaj", "praksa"];

// course names from a timetable, without the " - S I" style suffixes
function courseNames(days) {
  return [...new Set(days.flat().map((e) => e.name.replace(/\s+-\s+.*$/, "").trim()).filter((n) => n.length > 3))];
}
function myCourses() {
  const g = store.get("group", "");
  if (!g) return [];
  if (D.timetables && D.timetables[g]) return courseNames(D.timetables[g]);
  const saved = store.get("groupCourses", null);  // local-server mode: remembered when the timetable was opened
  return saved && saved.group === g ? saved.list : [];
}
// whole-word match on accent-free lowercase text, so "termodinamika i" doesn't hit "termodinamika ii"
const wordRx = (t) => new RegExp("(^|[^a-z0-9])" + norm(t).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") + "(?![a-z0-9])");

let _rules = null;
const _why = new Map();
function resetRules() { _rules = null; _why.clear(); }
function rules() {
  if (!_rules) {
    const f = follow();
    _rules = {
      units: store.get("myUnits", []),
      cats: f.cats,
      words: f.keywords.map((k) => [k, wordRx(k)]),
      courses: f.myCourses ? myCourses().map((c) => [c, wordRx(c)]) : [],
    };
  }
  return _rules;
}
// rules changed in another tab (or another window of the installed app): re-match and redraw
window.addEventListener("storage", (e) => {
  if (!D || !["follow", "myUnits", "group", "groupCourses", "seen"].includes(e.key)) return;
  if (e.key === "seen") seen = new Set(store.get("seen", []));
  resetRules();
  if (!/INPUT|SELECT/.test(document.activeElement?.tagName || "")) render(); else drawNav();
});
let BOARD_IDS = new Set();
const isBoardItem = (n) => BOARD_IDS.has(n.id);
/* Why is this post followed? [] = it isn't. Each reason: {t: "unit" | "cat" | "course" | "word", v: label} */
function whyFollowed(n) {
  if (_why.has(n.id)) return _why.get(n.id);
  const r = rules(), why = [];
  for (const u of n.units || []) if (r.units.includes(u)) why.push({ t: "unit", v: u });
  if (!isBoardItem(n) && r.cats.includes(n.cat)) why.push({ t: "cat", v: n.cat });
  const text = n._txt || norm(n.title + " " + plainText(n.html));
  for (const [c, rx] of r.courses) if (rx.test(text)) why.push({ t: "course", v: c });
  for (const [k, rx] of r.words) if (rx.test(text)) why.push({ t: "word", v: k });
  _why.set(n.id, why);
  return why;
}
const WHY_ICON = { unit: "⭐", cat: "📰", course: "📘", word: "🔎" };
const whyChips = (n) => whyFollowed(n).map((w) => `<span class="chip follow">${WHY_ICON[w.t]} ${esc(w.v)}</span>`).join("");
const postKey = (x) => x.date + String(x.id).padStart(8, "0");
function followedItems() {
  return [...D.boards, ...D.news].filter((n) => whyFollowed(n).length).sort((a, b) => postKey(b).localeCompare(postKey(a)));
}
const unseenFollowed = () => followedItems().filter((n) => isNew(n.id));
function updateBadge() {
  const c = unseenFollowed().length;
  try { if (navigator.setAppBadge) (c ? navigator.setAppBadge(c) : navigator.clearAppBadge()).catch(() => {}); } catch (e) {}
  return c;
}

/* System notifications for newly arrived followed posts. Each post notifies once, even with several tabs open. */
const canNotify = () => "Notification" in window && Notification.permission === "granted" && follow().notify;
function notifyFollowed(fresh) {
  const sent = new Set(store.get("notified", []));
  const todo = fresh.filter((n) => whyFollowed(n).length && !sent.has(n.id));
  if (!todo.length) return [];
  todo.forEach((n) => sent.add(n.id));
  store.set("notified", [...sent].slice(-800));
  if (canNotify()) {
    todo.slice(0, 3).forEach((n) => showNote(n));
    if (todo.length > 3) showNote(null, todo.length - 3);
  }
  return todo;
}
async function showNote(n, more) {
  const title = n ? `${isBoardItem(n) ? "Nova obavijest" : "Nova vijest"} · ${whyFollowed(n)[0]?.v || "praćeno"}` : `Još ${more} praćenih objava`;
  const url = n ? (isBoardItem(n) ? "#/oglasne-ploce/" : "#/vijesti/") + n.id : "#/pracenje";
  const opts = { body: n ? n.title : "Otvori Praćeno za sve.", tag: "bolji-fsb-" + (n ? n.id : "more"), data: { url } };
  if (!EMBEDDED) opts.icon = "icon-192.png";
  try {
    const reg = DATA_URL && "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) return await reg.showNotification(title, opts);  // phones only allow notifications through the service worker
    const note = new Notification(title, opts);
    note.onclick = () => { window.focus(); location.hash = url; note.close(); };
  } catch (e) { /* notifications not available here */ }
}

/* ------------------------------------------------------------ quick links */
const QUICK = [
  { title: "Raspored predavanja", sub: "Tjedni raspored po grupi", url: "#/raspored", icon: "clock", alias: "satnica" },
  { title: "Oglasne ploče", sub: "Obavijesti katedri i kolegija", url: "#/oglasne-ploce", icon: "board", badge: "boards" },
  { title: "Praćeno", sub: "Tvoji kolegiji, katedre i obavijesti", url: "#/pracenje", icon: "star", badge: "follow", alias: "obavijesti notifikacije favoriti" },
  { title: "Raspored ispita", sub: "Ispitni rokovi i kolokviji", url: "#/studiranje_i_nastava/nastava/raspored_ispita", icon: "exam", alias: "rokovi kolokviji" },
  { title: "Akademski kalendar", sub: "Semestri, praznici, rokovi", url: "#/studiranje_i_nastava/nastava/akademski_kalendar", icon: "cal" },
  { title: "Studomat", sub: "Upis, prijava ispita", url: "https://www.isvu.hr/studomat/hr/prijava", icon: "login", ext: true, alias: "isvu" },
  { title: "E-učenje (Moodle)", sub: "Materijali kolegija", url: "https://e-ucenje.fsb.hr/", icon: "book", ext: true, alias: "moodle" },
  { title: "Djelatnici", sub: "Imenik, e-mail, katedre", url: "#/djelatnici", icon: "people", alias: "profesori imenik" },
  { title: "Studentska služba", sub: "Referada, potvrde, FAQ", url: "#/studiranje_i_nastava/studentska_sluzba", icon: "desk", alias: "referada" },
  { title: "Upisi", sub: "Prijediplomski, diplomski, usmjerenja", url: "#/studiranje_i_nastava/upisi", icon: "pen" },
  { title: "Erasmus+", sub: "Studijski boravak u inozemstvu", url: "#/medunarodna_suradnja/studenti/studijski_boravak_-_erasmus", icon: "globe" },
  { title: "Prakse i karijere", sub: "Stručna praksa, poslovi", url: "https://prakse.fsb.hr/", icon: "brief", ext: true },
];

/* ------------------------------------------------------------ chrome */
function drawNav() {
  const cur = location.hash;
  const nNews = D.news.filter((x) => isNew(x.id)).length;
  const nBoards = D.boards.filter((x) => isNew(x.id)).length;
  const items = [
    `<div class="nav-item ${/^#\/(vijesti)/.test(cur) ? "on" : ""}"><a href="#/vijesti">Vijesti${nNews ? `<span class="badge">${nNews}</span>` : ""}</a></div>`,
    `<div class="nav-item ${/^#\/oglasne/.test(cur) ? "on" : ""}"><a href="#/oglasne-ploce">Oglasne ploče${nBoards ? `<span class="badge">${nBoards}</span>` : ""}</a></div>`,
  ];
  for (const s of D.tree) {
    const on = cur.startsWith("#/" + s.path) || (routeSection() === s);
    const cols = s.children.map((c) => `<div class="mega-col"><b><a href="${esc(linkFor(c))}" ${isExt(c) ? 'target="_blank" rel="noopener"' : ""}>${esc(c.title)}</a></b>${c.children.length ? `<ul>${c.children.slice(0, 6).map((g) => `<li><a href="${esc(linkFor(g))}" ${isExt(g) ? 'target="_blank" rel="noopener"' : ""}>${esc(g.title)}</a></li>`).join("")}</ul>` : ""}</div>`).join("");
    items.push(`<div class="nav-item ${on ? "on" : ""}"><a href="#/${s.path}">${esc(s.title)}</a><div class="mega"><div class="mega-in">${cols}</div></div></div>`);
  }
  $("#mainnav").innerHTML = items.join("");
  const nF = updateBadge();
  $("#followBtn").innerHTML = ICON.star + (nF ? `<span class="badge">${nF}</span>` : "");
  $("#followBtn").classList.toggle("on", /^#\/pracenje/.test(cur));
  $("#drawerBody").innerHTML = `<ul class="tree">
      <li><div class="row"><a href="#/">${ICON.home} Početna</a></div></li>
      <li><div class="row"><a href="#/vijesti">${ICON.news} Vijesti ${nNews ? `<span class="badge">${nNews}</span>` : ""}</a></div></li>
      <li><div class="row"><a href="#/oglasne-ploce">${ICON.board} Oglasne ploče ${nBoards ? `<span class="badge">${nBoards}</span>` : ""}</a></div></li>
      <li><div class="row"><a href="#/pracenje">${ICON.star} Praćeno ${nF ? `<span class="badge">${nF}</span>` : ""}</a></div></li>
      <li><div class="row"><a href="#/raspored">${ICON.clock} Raspored predavanja</a></div></li>
      <li><div class="row"><a href="#/djelatnici">${ICON.people} Djelatnici</a></div></li>
      <li><div class="row"><a href="#/karta">${ICON.map} Karta stranica</a></div></li>
    </ul><hr style="border:0;border-top:1px solid var(--line);margin:10px 0">` + treeHTML(D.tree, currentPath(), true);
  bindTree($("#drawerBody"));
}

function routeSection() {
  const p = currentPath();
  return p && IDX[p] ? IDX[p].section : null;
}
function currentPath() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  if (h === "raspored") return "studiranje_i_nastava/nastava/raspored_predavanja";
  if (h.startsWith("oglasne-ploce")) return "studiranje_i_nastava/nastava/oglasne_ploce";
  if (h === "djelatnici") return "o_fakultetu/ustrojstvo/djelatnici";
  return h;
}

function treeHTML(nodes, cur, top = false) {
  const trail = new Set((IDX[cur]?.trail || []).map((n) => n));
  const li = (n, depth) => {
    const kids = n.children.length;
    const open = trail.has(n) || (top && depth === 0 && false);
    const ext = isExt(n);
    return `<li class="${open ? "open" : ""} ${depth === 0 && top ? "sec-top" : ""}"><div class="row">
      <a href="${esc(linkFor(n))}" class="${n.path && n.path === cur ? "cur" : ""} ${ext ? "ext" : ""}" ${ext ? 'target="_blank" rel="noopener"' : ""}>${esc(n.title)}</a>
      ${kids ? `<button class="tog" aria-label="Proširi">${ICON.chev}</button>` : ""}</div>
      ${kids ? `<ul>${n.children.map((c) => li(c, depth + 1)).join("")}</ul>` : ""}</li>`;
  };
  return `<ul class="tree">${nodes.map((n) => li(n, 0)).join("")}</ul>`;
}
function bindTree(root) {
  $$(".tog", root).forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); b.closest("li").classList.toggle("open"); }));
}

function crumbs(trail, extra) {
  const parts = [`<a href="#/">${ICON.home}</a>`];
  for (const n of trail) parts.push(isExt(n) ? esc(n.title) : `<a href="${esc(linkFor(n))}">${esc(n.title)}</a>`);
  if (extra) parts.push(`<span>${esc(extra)}</span>`);
  return `<nav class="crumbs" aria-label="Putanja">${parts.join(ICON.chev)}</nav>`;
}

function withSide(path, body, sideOverride) {
  const e = IDX[path];
  const side = sideOverride ?? (e ? `<div class="side-title">${esc(e.section.title)}</div>${treeHTML([e.section].flatMap((s) => s.children), path)}` : "");
  return `<div class="page"><aside class="side">${side}</aside><div>${body}</div></div>`;
}

/* ------------------------------------------------------------ views */
function viewHome() {
  const nB = D.boards.filter((x) => isNew(x.id)).length;
  const nN = D.news.filter((x) => isNew(x.id)).length;
  const nF = unseenFollowed().length;
  const badgeFor = (q) => { const n = q.badge === "boards" ? nB : q.badge === "news" ? nN : q.badge === "follow" ? nF : 0; return n ? `<span class="badge">${n}</span>` : ""; };
  const quick = QUICK.map((q) => `<a class="card q ${q.ext ? "ext" : ""}" href="${esc(q.url)}" ${q.ext ? 'target="_blank" rel="noopener"' : ""}>
      ${badgeFor(q)}<span class="ic">${ICON[q.icon]}</span><span><b>${esc(q.title)}</b><br><small>${esc(q.sub)}</small></span></a>`).join("");
  const myUnits = store.get("myUnits", []);
  const followed = followedItems();
  const boardsShown = (followed.length ? followed : D.boards).slice(0, 6);
  const feed = (arr, base, metaFn) => arr.map((x) => `<a class="item" href="${base}${x.id}"><div class="t">${isNew(x.id) ? '<span class="new-dot">NOVO</span>' : ""}${esc(x.title)}</div><div class="meta">${metaFn(x)}</div></a>`).join("") || `<div class="empty">Nema obavijesti.</div>`;
  const secs = D.tree.map((s) => `<div class="card sec"><h3><a href="#/${s.path}">${esc(s.title)}</a></h3><ul>${s.children.slice(0, 7).map((c) => `<li><a href="${esc(linkFor(c))}" ${isExt(c) ? 'target="_blank" rel="noopener"' : ""}>${esc(c.title)}</a></li>`).join("")}${s.children.length > 7 ? `<li><a href="#/${s.path}"><b>+ još ${s.children.length - 7}</b></a></li>` : ""}</ul></div>`).join("");
  return `
  <section class="hero">
    <h1>FSB, ali pregledno.</h1>
    <p>Raspored, oglasne ploče, vijesti i sve stranice Fakulteta strojarstva i brodogradnje na jednom mjestu — ${STATIC ? "s fsb.unizg.hr, osvježava se svakih 15 minuta" : "uživo s fsb.unizg.hr"}.</p>
    <button class="hero-search" id="heroSearch"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Što tražiš? npr. „upisi", „erasmus", „termodinamika"…</span><kbd>Ctrl K</kbd></button>
    <div class="hero-meta"><span>${Object.keys(IDX).length} stranica</span><span>${D.news.length} vijesti</span><span>${D.boards.length} obavijesti na pločama</span></div>
  </section>
  <div class="quick">${quick}</div>
  <div class="two">
    <div>
      <div class="section-h"><h2>${followed.length ? "Praćeno" : "Oglasne ploče"}</h2><a href="${followed.length ? "#/pracenje" : "#/oglasne-ploce"}">${followed.length ? "Sve praćeno →" : "Sve obavijesti →"}</a></div>
      <div class="card feed">${followed.length
        ? boardsShown.map((x) => `<a class="item" href="${isBoardItem(x) ? "#/oglasne-ploce/" : "#/vijesti/"}${x.id}"><div class="t">${isNew(x.id) ? '<span class="new-dot">NOVO</span>' : ""}${esc(x.title)}</div><div class="meta"><span>${ago(x.date)}</span>${whyChips(x)}</div></a>`).join("")
        : feed(boardsShown, "#/oglasne-ploce/", (x) => `<span>${ago(x.date)}</span>${(x.units || []).slice(0, 1).map((u) => `<span class="chip">${esc(u)}</span>`).join("")}`)}</div>
      ${followed.length ? "" : `<p class="legend"><a href="#/pracenje">★ Odaberi što pratiš</a> — kolegije, katedre ili riječi poput „kolokvij" — i dobivaj obavijesti.</p>`}
    </div>
    <div>
      <div class="section-h"><h2>Vijesti</h2><a href="#/vijesti">Sve vijesti →</a></div>
      <div class="card feed">${feed(D.news.slice(0, 6), "#/vijesti/", (x) => `<span>${ago(x.date)}</span><span class="chip">${esc(x.cat)}</span>`)}</div>
    </div>
  </div>
  <div class="section-h"><h2>Sve o Fakultetu</h2><a href="#/karta">Karta stranica →</a></div>
  <div class="sections">${secs}</div>`;
}

function viewPage(path) {
  const e = IDX[path];
  const html = D.content[path];
  if (!e && html === undefined) return viewNotFound();
  const node = e ? e.node : { title: path, children: [] };
  const trail = e ? e.trail.slice(0, -1) : [];
  const kids = node.children || [];
  const childCards = kids.length ? `
    <div class="section-h"><h2>${html && plainText(html).length > 40 ? "U ovoj cjelini" : "Odaberi"}</h2></div>
    <div class="children">${kids.map((c) => {
      const ext = isExt(c);
      return `<a class="card child" href="${esc(linkFor(c))}" ${ext ? 'target="_blank" rel="noopener"' : ""}>
        <b>${esc(c.title)}${ext ? " ↗" : ""}</b>
        <small>${ext ? esc(new URL(c.ext, location.href).hostname) : esc(excerpt(c.path, 95))}</small>
        ${c.children.length ? `<span class="more">${c.children.length} podstranica</span>` : ""}</a>`;
    }).join("")}</div>` : "";
  const related = Object.entries(D.extra || {}).filter(([, x]) => x.parent === path && IDX[x.parent]);
  const relatedCards = related.length ? `
    <div class="section-h"><h2>Povezane stranice</h2></div>
    <div class="children">${related.map(([p, x]) => `<a class="card child" href="#/${esc(p)}"><b>${esc(x.title)}</b><small>${esc(excerpt(p, 95))}</small></a>`).join("")}</div>` : "";
  // previous / next among siblings so you can read a section front to back
  let pager = "";
  if (e && !node.extra) {
    const sib = (e.parent ? e.parent.children : D.tree).filter((n) => n.path);
    const i = sib.indexOf(node);
    const prev = sib[i - 1], next = sib[i + 1];
    if (prev || next) pager = `<div class="pager">
      ${prev ? `<a class="card" href="${esc(linkFor(prev))}"><small>← Prethodno</small>${esc(prev.title)}</a>` : "<span></span>"}
      ${next ? `<a class="card next" href="${esc(linkFor(next))}"><small>Sljedeće →</small>${esc(next.title)}</a>` : ""}</div>`;
  }
  const hasText = html && plainText(html).length > 0;
  const body = `
    ${crumbs(trail)}
    <h1 class="title">${esc(node.title)}</h1>
    <div class="page-tools">
      ${e && e.parent ? `<span class="chip brand">${esc(e.section.title)}</span>` : ""}
      <a class="orig" href="${ORIGIN}${esc(path.replace(/\//g, "&"))}" target="_blank" rel="noopener">${ICON.ext} Original na fsb.unizg.hr</a>
    </div>
    ${hasText ? `<article class="card prose">${html}</article>` : kids.length ? "" : `<div class="card empty">Ova stranica na FSB webu nema teksta. <a href="${ORIGIN}${esc(path.replace(/\//g, "&"))}" target="_blank" rel="noopener">Otvori original ↗</a></div>`}
    ${childCards}
    ${relatedCards}
    ${pager}`;
  return withSide(path, body);
}

/* ---- news ---- */
let newsState = { cat: "", q: "", shown: 20 };
function viewNews() {
  const cats = [...new Set(D.news.map((n) => n.cat).filter(Boolean))];
  const body = `
    ${crumbs([], "Vijesti")}
    <h1 class="title">Vijesti</h1>
    <p class="subtitle">Sve objave s fsb.unizg.hr, najnovije prve. Automatski se osvježava.</p>
    <div class="toolbar">
      <input class="input grow" id="newsQ" placeholder="Pretraži vijesti…" value="${esc(newsState.q)}">
      <button class="btn" id="markAllNews">Označi sve pročitanim</button>
    </div>
    <div class="pills" style="margin-bottom:16px">${["", ...cats].map((c) => `<button class="pill ${newsState.cat === c ? "on" : ""}" data-cat="${esc(c)}">${esc(c || "Sve")}</button>`).join("")}</div>
    <div class="posts" id="newsList"></div>`;
  return body;
}
function drawNewsList() {
  const q = norm(newsState.q);
  const list = D.news.filter((n) => (!newsState.cat || n.cat === newsState.cat) && (!q || norm(n.title + " " + plainText(n.html)).includes(q)));
  const el = $("#newsList");
  el.innerHTML = list.slice(0, newsState.shown).map((n) => postCard(n, "#/vijesti/", `<span class="chip">${esc(n.cat)}</span>`)).join("") +
    (list.length > newsState.shown ? `<button class="btn more-btn" id="moreNews">Prikaži još (${list.length - newsState.shown})</button>` : "") +
    (list.length ? "" : `<div class="card empty">Nema rezultata.</div>`);
  $("#moreNews")?.addEventListener("click", () => { newsState.shown += 20; drawNewsList(); });
}
function postCard(n, base, extraMeta) {
  return `<div class="card post ${n.img ? "with-img" : ""}"><div>
    <h3><a href="${base}${n.id}">${isNew(n.id) ? '<span class="new-dot">NOVO</span>' : ""}${esc(n.title)}</a></h3>
    <div class="meta"><span>${fmtDate(n.date)}</span>${n.author ? `<span>· ${esc(n.author)}</span>` : ""}${extraMeta}${whyChips(n)}</div>
    <div class="excerpt">${esc(plainText(n.html))}</div></div>
    ${n.img ? `<a href="${base}${n.id}"><img src="${esc(n.img)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></a>` : ""}</div>`;
}
function bindNews() {
  $$(".pill[data-cat]").forEach((b) => b.addEventListener("click", () => { newsState.cat = b.dataset.cat; newsState.shown = 20; $$(".pill[data-cat]").forEach((x) => x.classList.toggle("on", x === b)); drawNewsList(); }));
  let t; $("#newsQ").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { newsState.q = e.target.value; newsState.shown = 20; drawNewsList(); }, 150); });
  $("#markAllNews").addEventListener("click", () => { markSeen(D.news.map((n) => n.id)); drawNewsList(); });
  drawNewsList();
}

function viewArticle(kind, id) {
  const isBoard = kind === "board";
  const list = isBoard ? D.boards : D.news;
  const n = list.find((x) => x.id === id);
  if (!n) {
    if (!isBoard && D.boards.some((x) => x.id === id)) { location.replace("#/oglasne-ploce/" + id); return ""; }
    return `<div class="card empty" style="padding:50px"><h2 style="margin-top:0">Starija objava</h2>
      <p>Ova objava (br. ${esc(id)}) nije među zadnjima koje se prate, pa nije učitana ovdje.</p>
      <p><a class="btn primary" href="${ORIGIN}aktualno&id=${esc(id)}" target="_blank" rel="noopener">${ICON.ext} Otvori na fsb.unizg.hr</a> <a class="btn" href="#/vijesti">Sve vijesti</a></p></div>`;
  }
  markSeen([id]);
  const base = isBoard ? "#/oglasne-ploce/" : "#/vijesti/";
  const related = list.filter((x) => x.id !== id && (isBoard ? (x.units || []).some((u) => (n.units || []).includes(u)) : x.cat === n.cat)).slice(0, 6);
  const origUrl = isBoard ? `${ORIGIN}studiranje_i_nastava&nastava&oglasne_ploce&id=${id}` : `${ORIGIN}aktualno&id=${id}`;
  const body = `
    ${crumbs([], "")}
    <h1 class="title">${esc(n.title)}</h1>
    <div class="page-tools meta" style="font-size:14px">
      <span>${ICON.cal}</span><span>${fmtDate(n.date)}</span>
      ${n.author ? `<span>· ${esc(n.author)}</span>` : ""}
      ${(isBoard ? n.units || [] : [n.cat]).map((u) => `<a class="chip brand" href="${isBoard ? "#/oglasne-ploce?u=" + encodeURIComponent(u) : "#/vijesti"}">${esc(u)}</a>`).join("")}
      ${whyChips(n)}
      <a class="orig" href="${origUrl}" target="_blank" rel="noopener">${ICON.ext} Original</a>
    </div>
    ${n.img ? `<img class="article-img" src="${esc(n.img)}" alt="" onerror="this.remove()">` : ""}
    <article class="card prose">${n.html || "<p><i>Bez teksta.</i></p>"}</article>
    ${related.length ? `<div class="section-h"><h2>${isBoard ? "Još s iste ploče" : "Još iz kategorije " + esc(n.cat)}</h2></div>
      <div class="card feed">${related.map((x) => `<a class="item" href="${base}${x.id}"><div class="t">${isNew(x.id) ? '<span class="new-dot">NOVO</span>' : ""}${esc(x.title)}</div><div class="meta">${fmtDate(x.date)}</div></a>`).join("")}</div>` : ""}`;
  const c = crumbsFix(body, isBoard ? [["#/oglasne-ploce", "Oglasne ploče"]] : [["#/vijesti", "Vijesti"]], n.title);
  return isBoard ? withSide("studiranje_i_nastava/nastava/oglasne_ploce", c) : c;
}
function crumbsFix(body, links, last) {
  const parts = [`<a href="#/">${ICON.home}</a>`, ...links.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`), `<span>${esc(last.length > 60 ? last.slice(0, 60) + "…" : last)}</span>`];
  return body.replace(/<nav class="crumbs"[\s\S]*?<\/nav>/, `<nav class="crumbs">${parts.join(ICON.chev)}</nav>`);
}

/* ---- notice boards ---- */
let boardState = { unit: "", q: "", mine: false };
function viewBoards(params) {
  if (params.get("u")) { boardState.unit = params.get("u"); boardState.mine = false; }
  const my = store.get("myUnits", []);
  const counts = {};
  D.boards.forEach((b) => (b.units || []).forEach((u) => (counts[u] = (counts[u] || 0) + 1)));
  const unitBtn = (u) => `<button data-unit="${esc(u)}" class="${boardState.unit === u && !boardState.mine ? "on" : ""}">
      <span class="star ${my.includes(u) ? "on" : ""}" data-star="${esc(u)}" title="Dodaj u moje katedre" role="button" tabindex="0">${ICON.star}</span>
      <span>${esc(u)}</span><span class="n">${counts[u] || ""}</span></button>`;
  const units = D.boardUnits.slice().sort((a, b) => (my.includes(b) - my.includes(a)) || a.localeCompare(b, "hr"));
  const side = `<div class="side-title">Ploče</div><div class="unit-list">
      <button data-unit="" class="${!boardState.unit && !boardState.mine ? "on" : ""}"><span>Sve obavijesti</span><span class="n">${D.boards.length}</span></button>
      <button data-mine="1" class="${boardState.mine ? "on" : ""}"><span class="star on">${ICON.star}</span><span>Moje katedre</span><span class="n">${my.length || ""}</span></button>
      <div class="side-title" style="margin-top:14px">Katedre i zavodi</div>
      ${units.map(unitBtn).join("")}</div>`;
  const body = `
    ${crumbsFix(`<nav class="crumbs"></nav>`, [["#/studiranje_i_nastava", "Studiranje i nastava"], ["#/studiranje_i_nastava/nastava", "Nastava"]], "Oglasne ploče")}
    <h1 class="title">Oglasne ploče</h1>
    <p class="subtitle">Obavijesti katedri i kolegija. Označi zvjezdicom katedre koje te zanimaju pa ih vidi na početnoj.</p>
    <div class="toolbar">
      <input class="input grow" id="boardQ" placeholder="Pretraži obavijesti (kolegij, profesor, dvorana…)" value="${esc(boardState.q)}">
      <select class="input only-mobile-sel" id="boardSel" style="max-width:100%">
        <option value="">Sve ploče</option><option value="__mine" ${boardState.mine ? "selected" : ""}>★ Moje katedre</option>
        ${units.map((u) => `<option ${boardState.unit === u ? "selected" : ""}>${esc(u)}</option>`).join("")}
      </select>
      <button class="btn" id="markAllBoards">Označi sve pročitanim</button>
    </div>
    <div class="posts" id="boardList"></div>`;
  return withSide("studiranje_i_nastava/nastava/oglasne_ploce", body, side);
}
function drawBoards() {
  const my = store.get("myUnits", []);
  const q = norm(boardState.q);
  const list = D.boards.filter((b) => {
    if (boardState.mine && !(b.units || []).some((u) => my.includes(u))) return false;
    if (!boardState.mine && boardState.unit && !(b.units || []).includes(boardState.unit)) return false;
    return !q || norm(b.title + " " + plainText(b.html) + " " + b.author).includes(q);
  });
  $("#boardList").innerHTML = list.map((b) => postCard(b, "#/oglasne-ploce/", (b.units || []).map((u) => `<span class="chip">${esc(u)}</span>`).join(""))).join("") ||
    `<div class="card empty">${boardState.mine && !my.length ? "Još nisi označio/la nijednu katedru — klikni zvjezdicu pokraj katedre." : "Nema obavijesti."}</div>`;
}
function bindBoards() {
  const rerender = () => render();
  $$(".unit-list button").forEach((b) => b.addEventListener("click", (e) => {
    const star = e.target.closest("[data-star]");
    if (star) {
      e.stopPropagation();
      const u = star.dataset.star, my = store.get("myUnits", []);
      store.set("myUnits", my.includes(u) ? my.filter((x) => x !== u) : [...my, u]);
      resetRules();
      return rerender();
    }
    boardState.mine = !!b.dataset.mine; boardState.unit = b.dataset.unit || "";
    history.replaceState(null, "", "#/oglasne-ploce"); rerender();
  }));
  $("#boardSel").addEventListener("change", (e) => {
    boardState.mine = e.target.value === "__mine"; boardState.unit = boardState.mine ? "" : e.target.value;
    history.replaceState(null, "", "#/oglasne-ploce"); rerender();
  });
  let t; $("#boardQ").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { boardState.q = e.target.value; drawBoards(); }, 150); });
  $("#markAllBoards").addEventListener("click", () => { markSeen(D.boards.map((n) => n.id)); drawBoards(); });
  drawBoards();
}

/* ---- timetable ---- */
const DAYS = ["Ponedjeljak", "Utorak", "Srijeda", "Četvrtak", "Petak"];
const PALETTE = ["#2f7de1", "#e2683c", "#1f9d6b", "#9b59d0", "#d4a017", "#d6457a", "#1aa3b8", "#6d7f2a", "#c0504d", "#4a63c9"];
function colorFor(name) { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
function viewTimetable() {
  const tt = D.timetable;
  const g = store.get("group", "");
  const byYear = {};
  tt.groups.forEach((x) => (byYear[x[0]] = byYear[x[0]] || []).push(x));
  const body = `
    ${crumbsFix(`<nav class="crumbs"></nav>`, [["#/studiranje_i_nastava", "Studiranje i nastava"], ["#/studiranje_i_nastava/nastava", "Nastava"]], "Raspored predavanja")}
    <h1 class="title">Raspored predavanja</h1>
    <p class="subtitle">Ak. god. ${tt.year}./${tt.year + 1}. · ${tt.semester} semestar · podaci uživo iz FSB sustava rezervacija.</p>
    <div class="toolbar">
      <select class="input" id="ttGroup" aria-label="Grupa">
        <option value="">— odaberi svoju grupu —</option>
        ${Object.entries(byYear).map(([y, gs]) => `<optgroup label="${y}. godina">${gs.map((x) => `<option ${x === g ? "selected" : ""}>${esc(x)}</option>`).join("")}</optgroup>`).join("")}
      </select>
      <a class="btn" href="#/studiranje_i_nastava/nastava/raspored_ispita">${ICON.exam} Raspored ispita</a>
      <a class="btn" href="#/studiranje_i_nastava/nastava/akademski_kalendar">${ICON.cal} Akademski kalendar</a>
    </div>
    <div id="tt">${g ? '<div class="loading"><div class="spinner"></div>Učitavam raspored…</div>' : '<div class="card empty">Odaberi grupu (npr. <b>1-stroj-05</b>) — zapamtit ću je za idući put.</div>'}</div>`;
  return withSide("studiranje_i_nastava/nastava/raspored_predavanja", body);
}
async function loadTimetable(g) {
  const box = $("#tt");
  if (!g) return;
  box.innerHTML = '<div class="loading"><div class="spinner"></div>Učitavam raspored…</div>';
  try {
    const r = STATIC ? { days: D.timetables[g] || [[], [], [], [], []] } : await fetch("/api/raspored?grupa=" + encodeURIComponent(g)).then((r) => r.json());
    if (r.error) throw new Error(r.error);
    if (!$("#tt")) return;
    const days = r.days;
    const total = days.reduce((a, d) => a + d.length, 0);
    if (!total) { box.innerHTML = `<div class="card empty">Za grupu <b>${esc(g)}</b> trenutno nema unesenih termina.</div>`; return; }
    const toH = (t) => { const [h, m] = t.split(":").map(Number); return h + m / 60; };
    let lo = 8, hi = 18;
    days.flat().forEach((e) => { lo = Math.min(lo, Math.floor(toH(e.start))); hi = Math.max(hi, Math.ceil(toH(e.end))); });
    const H = 58, today = new Date().getDay();
    const hours = []; for (let h = lo; h <= hi; h++) hours.push(`<div style="top:${(h - lo) * H}px">${h}:00</div>`);
    const cols = days.map((d, i) => `<div class="tt-day ${today === i + 1 ? "today" : ""}" style="height:${(hi - lo) * H}px">${d.map((e) => {
      const top = (toH(e.start) - lo) * H, ht = (toH(e.end) - toH(e.start)) * H - 3;
      return `<div class="ev" style="--c:${colorFor(e.name)};top:${top}px;height:${ht}px" title="${esc(e.name)} ${esc(e.kind)} · ${esc(e.room)} · ${e.start}–${e.end}"><b>${esc(e.name)}</b>${esc(e.kind)} · <span class="r">${esc(e.room)}</span><br><span class="r">${e.start}–${e.end}</span></div>`;
    }).join("")}</div>`);
    const grid = `<div class="card tt-wrap" style="--hour:${H}px"><div class="tt">
      <div class="tt-head"></div>${DAYS.map((d, i) => `<div class="tt-head ${today === i + 1 ? "today" : ""}">${d}</div>`).join("")}
      <div class="tt-hours" style="height:${(hi - lo) * H}px">${hours.join("")}</div>${cols.join("")}</div></div>`;
    const list = `<div class="tt-list">${days.map((d, i) => `<div class="card dayblock"><h3 style="${today === i + 1 ? "color:var(--brand)" : ""}">${DAYS[i]}${today === i + 1 ? " · danas" : ""}</h3>${d.length ? d.map((e) => `<div class="row"><span class="time">${e.start}–${e.end}</span><span><b style="color:${colorFor(e.name)}">●</b> <b>${esc(e.name)}</b> <span class="chip">${esc(e.kind)}</span><br><small class="r" style="color:var(--muted)">${esc(e.room)}</small></span></div>`).join("") : '<div style="color:var(--muted)">Slobodno 🎉</div>'}</div>`).join("")}</div>`;
    const courses = [...new Set(days.flat().map((e) => e.name))];
    store.set("groupCourses", { group: g, list: courseNames(days) });
    resetRules();
    const legend = `<div class="legend">${courses.map((c) => `<span><b style="color:${colorFor(c)}">●</b> ${esc(c)}</span>`).join("")}</div>
      <p class="legend">pred. = predavanje · a.vj. = auditorne vježbe · lab.vj. = laboratorijske vježbe · konst.vj. = konstrukcijske vježbe</p>`;
    box.innerHTML = grid + list + legend;
  } catch (e) {
    box.innerHTML = `<div class="card empty">Ne mogu dohvatiti raspored (${esc(e.message)}). FSB server možda ne odgovara — pokušaj ponovno.</div>`;
  }
}
function bindTimetable() {
  const sel = $("#ttGroup");
  sel.addEventListener("change", () => { store.set("group", sel.value); history.replaceState(null, "", "#/raspored" + (sel.value ? "?g=" + encodeURIComponent(sel.value) : "")); loadTimetable(sel.value); });
  loadTimetable(sel.value);
}

/* ---- staff ---- */
let staffState = { q: "", unit: "" };
function viewStaff() {
  const body = `
    ${crumbsFix(`<nav class="crumbs"></nav>`, [["#/o_fakultetu", "O Fakultetu"], ["#/o_fakultetu/ustrojstvo", "Ustrojstvo"]], "Djelatnici")}
    <h1 class="title">Djelatnici</h1>
    <p class="subtitle">Pretraži profesore, asistente i službe po imenu ili po zavodu / katedri.</p>
    <div class="toolbar">
      <input class="input grow" id="staffQ" placeholder="Ime ili prezime (min. 2 slova)…" value="${esc(staffState.q)}" autofocus>
      <select class="input" id="staffUnit" style="max-width:100%">
        <option value="">Svi zavodi i službe</option>
        ${D.staffUnits.map((u) => `<option value="${esc(u.id)}" ${staffState.unit === u.id ? "selected" : ""}>${"  ".repeat(u.depth).replace(/ /g, " ")}${esc(u.name)}</option>`).join("")}
      </select>
    </div>
    <div id="staffList"><div class="card empty">Upiši ime ili odaberi zavod.</div></div>`;
  return withSide("o_fakultetu/ustrojstvo/djelatnici", body);
}
let staffReq = 0;
function staffLocal(q, unit) {
  // offline version: the unit plus everything nested under it (the list is in tree order)
  let ids = null;
  if (unit) {
    const i = D.staffUnits.findIndex((u) => u.id === unit);
    ids = new Set([unit]);
    for (let k = i + 1; i >= 0 && k < D.staffUnits.length && D.staffUnits[k].depth > D.staffUnits[i].depth; k++) ids.add(D.staffUnits[k].id);
  }
  const terms = norm(q).split(/\s+/).filter(Boolean);
  return D.staff.filter((p) => (!ids || p.unitIds.some((u) => ids.has(u))) &&
    (unit || terms.every((t) => norm(p.name + " " + p.surname).includes(t))));
}
async function drawStaff() {
  const box = $("#staffList");
  const { q, unit } = staffState;
  if (q.length < 2 && !unit) { box.innerHTML = '<div class="card empty">Upiši ime ili odaberi zavod.</div>'; return; }
  const my = ++staffReq;
  box.innerHTML = '<div class="loading"><div class="spinner"></div>Tražim…</div>';
  try {
    const people = STATIC ? staffLocal(q, unit) : await fetch(`/api/djelatnici?q=${encodeURIComponent(unit ? "" : q)}&jedinica=${encodeURIComponent(unit)}`).then((r) => r.json());
    if (my !== staffReq) return;
    const filt = unit && q ? people.filter((p) => norm(p.name + " " + p.surname).includes(norm(q))) : people;
    box.innerHTML = filt.length ? `<p class="subtitle">${filt.length} ${filt.length === 1 ? "osoba" : "osoba"}</p><div class="people">${filt.map((p) => `
      <div class="card person"><div class="avatar">${esc((p.name[0] || "") + (p.surname[0] || ""))}</div><div>
        <b>${esc(p.title ? p.title + " " : "")}${esc(p.name)} ${esc(p.surname)}</b>
        <div class="role">${esc(p.role)}</div>
        ${p.unit ? `<a class="chip brand" href="#/djelatnici" data-unit="${esc(p.unitId)}" style="margin-top:6px">${esc(p.unit)}</a>` : ""}
        <div class="acts">${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ""}${p.profile ? `<a href="${esc(p.profile)}" target="_blank" rel="noopener">Profil ↗</a>` : ""}</div>
      </div></div>`).join("")}</div>` : '<div class="card empty">Nitko nije pronađen.</div>';
    $$("[data-unit]", box).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); staffState = { q: "", unit: a.dataset.unit }; $("#staffQ").value = ""; $("#staffUnit").value = a.dataset.unit; drawStaff(); scrollTo({ top: 0, behavior: "smooth" }); }));
  } catch (e) {
    box.innerHTML = `<div class="card empty">Greška pri dohvaćanju (${esc(e.message)}).</div>`;
  }
}
function bindStaff() {
  let t;
  $("#staffQ").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { staffState.q = e.target.value.trim(); drawStaff(); }, 300); });
  $("#staffUnit").addEventListener("change", (e) => { staffState.unit = e.target.value; drawStaff(); });
  drawStaff();
}


/* ---- Praćeno: what you follow + everything that matches ---- */
function notifCard() {
  const f = follow();
  const supported = "Notification" in window;
  const perm = supported ? Notification.permission : "unsupported";
  const where = STATIC ? "svakih 10 minuta" : "svake 2 minute";
  let state, btns = "";
  if (!supported) {
    state = `Ovaj preglednik ne podržava obavijesti.${/iPhone|iPad/.test(navigator.userAgent) ? " Na iPhoneu: Dijeli → <b>Dodaj na početni zaslon</b>, pa otvori odande." : ""}`;
  } else if (perm === "denied") {
    state = "Obavijesti su <b>blokirane</b> u postavkama preglednika. Dopusti ih za ovu stranicu (ikona lokota pokraj adrese) pa osvježi.";
  } else if (perm === "granted" && f.notify) {
    state = `<b style="color:var(--ok)">✓ Obavijesti su uključene.</b> Javit ću ti kad stigne nova praćena objava.`;
    btns = `<button class="btn" id="noteTest">Pošalji probnu</button><button class="btn" id="noteOff">Isključi</button>`;
  } else {
    state = "Uključi obavijesti da ti se javi kad stigne nova objava koju pratiš.";
    btns = `<button class="btn primary" id="noteOn">${ICON.star} Uključi obavijesti</button>`;
  }
  return `<div class="card fcard"><h3>🔔 Obavijesti na uređaju</h3><p>${state}</p>${btns ? `<div class="btns">${btns}</div>` : ""}
    <p class="hint">Stižu dok je stranica ili aplikacija otvorena (može i u pozadini). Nove objave provjeravam ${where}${STATIC ? "; FSB se čita svakih 15 minuta" : ""}.</p></div>`;
}
function viewFollow() {
  const f = follow(), units = store.get("myUnits", []), g = store.get("group", ""), courses = myCourses();
  const cats = [...new Set(D.news.map((n) => n.cat).filter(Boolean))];
  const x = (attr, v) => `<button class="x" data-${attr}="${esc(v)}" aria-label="Makni">×</button>`;
  const coursesBox = !g
    ? `<p>Prvo <a href="#/raspored">odaberi svoju grupu u rasporedu</a> — onda mogu pratiti sve tvoje kolegije.</p>`
    : courses.length
      ? `<label class="check"><input type="checkbox" id="fCourses" ${f.myCourses ? "checked" : ""}> Prati sve kolegije iz grupe <b>${esc(g)}</b></label>
         <div class="chips ${f.myCourses ? "" : "dim"}">${courses.map((c) => `<span class="chip">📘 ${esc(c)}</span>`).join("")}</div>
         <p class="hint"><a href="#/raspored">Promijeni grupu</a></p>`
      : `<p>Učitavam kolegije za grupu <b>${esc(g)}</b>… (ili <a href="#/raspored">otvori raspored</a>)</p>`;
  const settings = `
    ${notifCard()}
    <div class="card fcard"><h3>📘 Moji kolegiji</h3>${coursesBox}</div>
    <div class="card fcard"><h3>🔎 Ključne riječi</h3>
      <p class="hint">Npr. ime kolegija, profesora, „kolokvij", „ispitni rok"…</p>
      <form class="addrow" id="kwForm"><input class="input" id="kwInput" placeholder="Dodaj riječ…" autocomplete="off"><button class="btn primary">Dodaj</button></form>
      <div class="chips">${f.keywords.map((k) => `<span class="chip brand">🔎 ${esc(k)} ${x("kw", k)}</span>`).join("") || '<span class="hint">Još nijedna.</span>'}</div>
      <div class="chips ideas">${KEYWORD_IDEAS.filter((k) => !f.keywords.includes(k)).map((k) => `<button class="pill" data-idea="${esc(k)}">+ ${esc(k)}</button>`).join("")}</div>
    </div>
    <div class="card fcard"><h3>⭐ Katedre i zavodi</h3>
      <div class="chips">${units.map((u) => `<span class="chip brand">⭐ ${esc(u)} ${x("unit", u)}</span>`).join("") || '<span class="hint">Još nijedna.</span>'}</div>
      <select class="input" id="unitAdd" style="width:100%;margin-top:10px"><option value="">+ Dodaj katedru ili zavod…</option>
        ${D.boardUnits.filter((u) => !units.includes(u)).sort((a, b) => a.localeCompare(b, "hr")).map((u) => `<option>${esc(u)}</option>`).join("")}</select>
    </div>
    <div class="card fcard"><h3>📰 Vijesti iz kategorija</h3>
      <div class="pills">${cats.map((c) => `<button class="pill ${f.cats.includes(c) ? "on" : ""}" data-fcat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    </div>`;
  const items = followedItems();
  const nNew = items.filter((n) => isNew(n.id)).length;
  const list = items.length
    ? items.slice(0, 60).map((n) => postCard(n, isBoardItem(n) ? "#/oglasne-ploce/" : "#/vijesti/", `<span class="chip">${isBoardItem(n) ? "Oglasna ploča" : "Vijest"}</span>`)).join("")
    : `<div class="card empty">Ništa još ne odgovara tvojim pravilima.<br>Dodaj kolegij, katedru ili ključnu riječ lijevo${innerWidth < 960 ? " (gore)" : ""}.</div>`;
  return `${crumbsFix(`<nav class="crumbs"></nav>`, [], "Praćeno")}
    <h1 class="title">Praćeno</h1>
    <p class="subtitle">Odaberi što te zanima — ovdje se skupljaju samo te objave, a za nove ti stiže obavijest.</p>
    <div class="follow-grid">
      <div class="follow-settings">${settings}</div>
      <div>
        <div class="section-h" style="margin-top:0"><h2>${items.length} praćenih objava${nNew ? ` <span class="badge">${nNew} novo</span>` : ""}</h2>
          ${nNew ? '<button class="btn" id="followSeen">Označi pročitanim</button>' : ""}</div>
        <div class="posts">${list}</div>
      </div>
    </div>`;
}
function bindFollow() {
  const rerender = () => { const y = scrollY; render(); scrollTo(0, y); };
  const f = follow();
  $("#noteOn")?.addEventListener("click", async () => {
    let p = Notification.permission;
    if (p !== "granted") p = await Notification.requestPermission();
    if (p === "granted") {
      setFollow({ notify: true });
      if (DATA_URL && "serviceWorker" in navigator) await navigator.serviceWorker.ready.catch(() => {});
      showNote({ id: "test", title: "Obavijesti rade! Ovako će izgledati nova praćena objava.", html: "", units: [] });
    }
    rerender();
  });
  $("#noteTest")?.addEventListener("click", () => showNote(followedItems()[0] || { id: "test", title: "Probna obavijest iz Boljeg FSB-a", html: "", units: [] }));
  $("#noteOff")?.addEventListener("click", () => { setFollow({ notify: false }); rerender(); });
  $("#fCourses")?.addEventListener("change", (e) => { setFollow({ myCourses: e.target.checked }); rerender(); });
  $("#kwForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#kwInput").value.trim().replace(/\s+/g, " ");
    if (v.length >= 2 && !f.keywords.some((k) => norm(k) === norm(v))) setFollow({ keywords: [...f.keywords, v] });
    rerender(); $("#kwInput").focus();
  });
  $$("[data-idea]").forEach((b) => b.addEventListener("click", () => { setFollow({ keywords: [...f.keywords, b.dataset.idea] }); rerender(); }));
  $$("[data-kw]").forEach((b) => b.addEventListener("click", () => { setFollow({ keywords: f.keywords.filter((k) => k !== b.dataset.kw) }); rerender(); }));
  $$("[data-unit]").forEach((b) => b.addEventListener("click", () => { store.set("myUnits", store.get("myUnits", []).filter((u) => u !== b.dataset.unit)); resetRules(); rerender(); }));
  $("#unitAdd").addEventListener("change", (e) => { if (e.target.value) { store.set("myUnits", [...store.get("myUnits", []), e.target.value]); resetRules(); rerender(); } });
  $$("[data-fcat]").forEach((b) => b.addEventListener("click", () => { const c = b.dataset.fcat; setFollow({ cats: f.cats.includes(c) ? f.cats.filter((x) => x !== c) : [...f.cats, c] }); rerender(); }));
  $("#followSeen")?.addEventListener("click", () => { markSeen(followedItems().map((n) => n.id)); rerender(); });
  // local-server mode: we only know a group's courses after fetching its timetable once
  const g = store.get("group", "");
  if (g && !myCourses().length && !STATIC) {
    fetch("/api/raspored?grupa=" + encodeURIComponent(g)).then((r) => r.json()).then((r) => {
      if (r.days) { store.set("groupCourses", { group: g, list: courseNames(r.days) }); resetRules(); if (location.hash.startsWith("#/pracenje")) rerender(); }
    }).catch(() => {});
  }
}

/* ---- sitemap ---- */
function viewSitemap() {
  const all = (nodes) => nodes.map((n) => { const c = { ...n, children: all(n.children) }; return c; });
  return `${crumbsFix(`<nav class="crumbs"></nav>`, [], "Karta stranica")}
    <h1 class="title">Karta stranica</h1>
    <p class="subtitle">Sve stranice na jednom mjestu. ↗ znači da vodi na vanjsku stranicu.</p>
    <div class="sitemap">
      <div class="card"><ul class="tree"><li class="open sec-top"><div class="row"><a href="#/">Brzi pristup</a></div><ul>
        <li><div class="row"><a href="#/vijesti">Vijesti</a></div></li><li><div class="row"><a href="#/oglasne-ploce">Oglasne ploče</a></div></li>
        <li><div class="row"><a href="#/raspored">Raspored predavanja</a></div></li><li><div class="row"><a href="#/djelatnici">Djelatnici</a></div></li>
        ${QUICK.filter((q) => q.ext).map((q) => `<li><div class="row"><a class="ext" href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.title)}</a></div></li>`).join("")}
      </ul></li></ul></div>
      ${D.tree.map((s) => `<div class="card">${treeHTML([s], "").replace('<li class=" sec-top">', '<li class="open sec-top">').replace(/<li class="([^"]*)"/g, (m, c) => `<li class="${c} open"`)}</div>`).join("")}
    </div>`;
}

function viewNotFound() {
  return `<div class="card empty" style="padding:60px"><h2 style="margin-top:0">Ova stranica ne postoji</h2><p>Možda je premještena na FSB webu.</p>
    <p><a class="btn primary" href="#/">Na početnu</a> <button class="btn" onclick="openSearch()">Pretraži</button> <a class="btn" href="#/karta">Karta stranica</a></p></div>`;
}

/* ------------------------------------------------------------ router */
function render() {
  if (!D) return;
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, qs] = raw.split("?");
  const path = decodeURIComponent(pathPart).replace(/\/$/, "");
  const params = new URLSearchParams(qs || "");
  let html, bind, title = "FSB";
  let m;
  if (!path) { html = viewHome(); title = "FSB — početna"; bind = () => $("#heroSearch").addEventListener("click", openSearch); }
  else if (path === "vijesti") { html = viewNews(); bind = bindNews; title = "Vijesti"; }
  else if ((m = path.match(/^vijesti\/(\d+)$/))) { html = viewArticle("news", m[1]); title = D.news.find((x) => x.id === m[1])?.title || "Vijest"; }
  else if (path === "oglasne-ploce") { html = viewBoards(params); bind = bindBoards; title = "Oglasne ploče"; }
  else if ((m = path.match(/^oglasne-ploce\/(\d+)$/))) { html = viewArticle("board", m[1]); title = D.boards.find((x) => x.id === m[1])?.title || "Obavijest"; }
  else if (path === "raspored") { if (params.get("g")) store.set("group", params.get("g")); html = viewTimetable(); bind = bindTimetable; title = "Raspored predavanja"; }
  else if (path === "djelatnici") { if (params.get("j")) staffState = { q: "", unit: params.get("j") }; if (params.get("q")) staffState = { q: params.get("q"), unit: "" }; html = viewStaff(); bind = bindStaff; title = "Djelatnici"; }
  else if (path === "karta") { html = viewSitemap(); title = "Karta stranica"; }
  else if (path === "pracenje") { html = viewFollow(); bind = bindFollow; title = "Praćeno"; }
  else if (SPECIAL[path]) { location.replace(SPECIAL[path]); return; }
  else { html = viewPage(path); title = IDX[path]?.node.title || "FSB"; }
  const main = $("#main");
  main.innerHTML = html;
  $$(".side", main).forEach(bindTree);
  if (bind) bind();
  document.title = title + " · Bolji FSB";
  drawNav();
  $(".side .cur")?.scrollIntoView({ block: "nearest" });
}
let lastPath = null;
window.addEventListener("hashchange", () => {
  const p = location.hash.split("?")[0];
  render();
  if (p !== lastPath) { scrollTo(0, 0); lastPath = p; }
  closeDrawer();
});

/* ------------------------------------------------------------ search */
let sel = 0, results = [];
function openSearch() {
  $("#search").hidden = false;
  const i = $("#searchInput"); i.value = ""; i.focus(); doSearch("");
}
function closeSearch() { $("#search").hidden = true; }
function doSearch(q) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const box = $("#searchResults");
  if (!terms.length) {
    box.innerHTML = `<div class="grp">Brzi linkovi</div>` + QUICK.map((x) => `<a href="${esc(x.url)}" ${x.ext ? 'target="_blank" rel="noopener"' : ""}>${esc(x.title)}<small>${esc(x.sub)}</small></a>`).join("");
    results = $$("a", box); sel = 0; hl(); return;
  }
  const scored = [];
  for (const e of SEARCH) {
    let s = 0, ok = true;
    for (const t of terms) {
      if (e.t.includes(t)) s += e.t.startsWith(t) || e.t.includes(" " + t) ? 12 : 8;
      else if (e.b.includes(t)) s += 2;
      else { ok = false; break; }
    }
    if (!ok) continue;
    if (e.type === "Brzi linkovi") s += 6;
    if (e.type === "Stranice") s += 2;
    if (e.date) s += Math.max(0, 3 - (Date.now() - new Date(e.date)) / 864e5 / 60);
    scored.push([s, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const groups = {};
  for (const [, e] of scored) { (groups[e.type] = groups[e.type] || []); if (groups[e.type].length < 7) groups[e.type].push(e); }
  const mark = (s) => { let o = esc(s); for (const t of terms) { const rx = new RegExp(`(${[...t].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[̀-ͯ]?").join("")})`, "gi"); o = o.replace(rx, "<mark>$1</mark>"); } return o; };
  const order = ["Brzi linkovi", "Stranice", "Oglasne ploče", "Vijesti"];
  box.innerHTML = order.filter((g) => groups[g]).map((g) => `<div class="grp">${g}</div>` + groups[g].map((e) => `<a href="${esc(e.url)}" ${/^https?:/.test(e.url) ? 'target="_blank" rel="noopener"' : ""}>${mark(e.title)}<small>${esc(e.sub)}</small></a>`).join("")).join("")
    || `<div class="search-hint">Ništa za „${esc(q)}". Probaj drugu riječ ili <a href="#/djelatnici">traži djelatnike</a>.</div>`;
  results = $$("a", box); sel = 0; hl();
}
function hl() { results.forEach((a, i) => a.classList.toggle("sel", i === sel)); results[sel]?.scrollIntoView({ block: "nearest" }); }
$("#searchInput").addEventListener("input", (e) => doSearch(e.target.value));
$("#searchInput").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { sel = Math.min(sel + 1, results.length - 1); hl(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); hl(); e.preventDefault(); }
  else if (e.key === "Enter" && results[sel]) { results[sel].click(); closeSearch(); }
});
$("#searchResults").addEventListener("click", (e) => { if (e.target.closest("a")) closeSearch(); });
$("#search").addEventListener("click", (e) => { if (e.target.id === "search") closeSearch(); });
$("#searchBtn").addEventListener("click", openSearch);
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
  else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  else if (e.key === "Escape") { closeSearch(); closeDrawer(); }
});
window.openSearch = openSearch;

/* ------------------------------------------------------------ drawer + theme */
function closeDrawer() { $("#drawer").hidden = true; }
$("#menuBtn").addEventListener("click", () => { $("#drawer").hidden = false; });
$("#drawerClose").addEventListener("click", closeDrawer);
$("#drawer").addEventListener("click", (e) => { if (e.target.id === "drawer") closeDrawer(); });
$("#themeBtn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  store.set("theme", document.documentElement.dataset.theme);
  try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch (e) {}
});

/* ------------------------------------------------------------ live updates */
function toast(html, ms = 8000) {
  const t = $("#toast"); t.innerHTML = html; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
function setStatus(s) {
  const d = new Date(s.updated);
  const mins = Math.round((Date.now() - d) / 60000);
  $("#status").textContent = s.refreshing ? "Osvježavam s fsb.unizg.hr…" : `Ažurirano ${mins < 1 ? "upravo" : mins < 60 ? `prije ${mins} min` : d.toLocaleString("hr")}` + (s.error ? " (zadnji pokušaj nije uspio)" : "");
}
async function load() {
  D = EMBEDDED || await fetch(DATA_URL || "/api/data", { cache: "no-cache" }).then((r) => r.json());
  indexData();
  render();
  const waiting = unseenFollowed().filter((n) => !new Set(store.get("notified", [])).has(n.id));
  if (waiting.length) {
    notifyFollowed(waiting);  // remember them so they don't pop up again later
    toast(`★ ${waiting.length === 1 ? "1 nova praćena objava" : waiting.length + " novih praćenih objava"} otkad si zadnji put bio/la ovdje. <a href="#/pracenje">Pogledaj</a>`, 12000);
  }
  if (STATIC) {
    $("#status").textContent = "Snimka od " + new Date(D.updated).toLocaleString("hr") + " — provjeravam ima li novijeg…";
    $("#refreshBtn").textContent = "Provjeri novosti";
    $("#refreshBtn").onclick = () => pullRemote(false);
    if (D.download) { $("#dlLink").href = D.download; $("#dlLink").hidden = false; }
    if (EMBEDDED) pullRemote(true); else $("#status").textContent = "Ažurirano " + new Date(D.updated).toLocaleString("hr");
    if (DATA_URL && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  } else setStatus({ updated: D.updated });
}
async function poll() {
  try {
    const s = await fetch("/api/status").then((r) => r.json());
    setStatus(s);
    if (s.updated && s.updated !== D.updated && !s.refreshing) {
      const before = new Set([...D.news, ...D.boards].map((x) => x.id));
      const onInput = /INPUT|SELECT/.test(document.activeElement?.tagName || "");
      D = await fetch("/api/data").then((r) => r.json());
      indexData();
      const fresh = [...D.boards, ...D.news].filter((x) => !before.has(x.id));
      if (!onInput) render(); else drawNav();
      announce(fresh);
    }
  } catch (e) { $("#status").textContent = "Lokalni server ne odgovara."; }
}
$("#refreshBtn").addEventListener("click", async () => {
  if (STATIC) return;
  await fetch("/api/refresh", { method: "POST" });
  $("#status").textContent = "Osvježavam s fsb.unizg.hr…";
  toast("Povlačim najnovije s fsb.unizg.hr — traje oko minutu.", 4000);
  const iv = setInterval(async () => { const s = await fetch("/api/status").then((r) => r.json()); if (!s.refreshing) { clearInterval(iv); poll(); } }, 3000);
});
/* New posts arrived: system notification for followed ones, a toast for the rest. */
function announce(fresh) {
  if (!fresh.length) return;
  const hits = notifyFollowed(fresh);
  const f = hits[0] || fresh[0];
  const link = `<a href="${isBoardItem(f) ? "#/oglasne-ploce/" : "#/vijesti/"}${f.id}">${esc(f.title.slice(0, 70))}</a>`;
  if (hits.length) toast(`★ ${hits.length === 1 ? "Nova praćena objava" : hits.length + " novih praćenih objava"}: ${link}`, 12000);
  else toast(`${fresh.length === 1 ? "Nova objava" : fresh.length + " novih objava"}: ${link}`);
}
/* Exported file: fetch the newest data.json from the repo's "data" branch (GitHub rebuilds it every 15 min).
   On the hosted site the same function re-reads data.json next to the page.
   Falls back silently to the snapshot inside the file when there's no internet. */
async function pullRemote(quiet) {
  if (!STATIC || !(DATA_URL || D.remote)) return;
  const urls = [DATA_URL || D.remote];
  for (const u of urls) {
    try {
      const fresh = await fetch(u, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      if (!fresh.tree || !fresh.news) throw new Error("bad data");
      const before = new Set([...D.news, ...D.boards].map((x) => x.id));
      const changed = new Date(fresh.updated) > new Date(D.updated);
      if (changed) {
        D = fresh;
        indexData();
        const onInput = /INPUT|SELECT/.test(document.activeElement?.tagName || "");
        if (!onInput) render(); else drawNav();
        const nw = [...D.boards, ...D.news].filter((x) => !before.has(x.id));
        if (nw.length) announce(nw);
        else if (!quiet) toast("Podaci osvježeni s interneta.", 3000);
      }
      $("#status").textContent = "Ažurirano " + new Date(D.updated).toLocaleString("hr") + " (online)";
      return;
    } catch (e) { /* try the next URL, then stay on the snapshot */ }
  }
  $("#status").textContent = "Offline — snimka od " + new Date(D.updated).toLocaleString("hr");
}
if (STATIC) {
  setInterval(() => pullRemote(true), 600000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && D) pullRemote(true); });
}
if (!STATIC) {
  setInterval(poll, 120000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && D) poll(); });
}

load().catch((e) => { $("#main").innerHTML = `<div class="card empty">Ne mogu učitati podatke s lokalnog servera (${esc(e.message)}). Je li <code>server.py</code> pokrenut?</div>`; });
