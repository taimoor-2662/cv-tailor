const V = "cvt-v2", SHELL = ["/", "/manifest.json", "/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
const netFirst = req => new Promise((ok, no) => { const t = setTimeout(() => no("timeout"), 4000); fetch(req).then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); no(e); }); });
const keep = (req, res) => { if (res && res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(req, c)); } return res; };
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api")) return;
  const fresh = r.mode === "navigate" || /\.(html|json|js|xml)$/.test(u.pathname) || u.pathname === "/";
  // pages and data: network first (so new deployments show up at once), cache only as an offline/slow-network fallback
  if (fresh) return e.respondWith(netFirst(r).then(res => keep(r, res)).catch(() => caches.match(r).then(m => m || caches.match("/"))));
  // images and other static files: stale-while-revalidate
  e.respondWith(caches.match(r).then(m => { const f = fetch(r).then(res => keep(r, res)).catch(() => m); return m || f; }));
});
