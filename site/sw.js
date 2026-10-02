/* Offline support for the installed app: always try the network first (so new
   obavijesti show up), and fall back to the last saved copy when offline. */
const CACHE = "bolji-fsb-v2";
const SHELL = ["./", "index.html", "app.js", "style.css", "manifest.webmanifest", "icon-192.png", "icon-512.png", "data.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // FSB images, Moodle etc. go straight through
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname.endsWith("/") ? "./" : e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("./")))
  );
});

/* Tapping a notification: bring the app to the front on that post (or open it if it was closed). */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
    const win = list.find((c) => "focus" in c);
    if (!win) return self.clients.openWindow(url);
    await win.focus();
    return win.navigate ? win.navigate(url) : win;
  }));
});
