// Shared service worker for Ember apps. Each app's sw.js sets self.EMBER_SW then imports this.
(function () {
  const CFG = self.EMBER_SW || { cache: "ember-app-v1", shell: ["./"] };

  self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CFG.cache).then((c) => c.addAll(CFG.shell)).catch(() => {}).then(() => self.skipWaiting()));
  });

  self.addEventListener("activate", (e) => {
    e.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CFG.cache.replace(/-v\d+$/, "")) && k !== CFG.cache).map((k) => caches.delete(k))))
        .then(() => self.clients.claim())
    );
  });

  // Network first so updates show straight away; the saved copy is used offline.
  self.addEventListener("fetch", (e) => {
    const req = e.request;
    if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
    e.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CFG.cache).then((c) => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("./") : undefined)))
    );
  });

  self.addEventListener("push", (e) => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
    e.waitUntil(self.registration.showNotification(d.title || CFG.name || "Ember", {
      body: d.body || "", tag: d.tag || undefined, icon: "icons/icon-192.png", badge: "icons/icon-192.png",
      data: { id: d.task || d.note || "", day: d.day || "" },
    }));
  });

  self.addEventListener("notificationclick", (e) => {
    e.notification.close();
    const id = (e.notification.data && e.notification.data.id) || "";
    const url = new URL("./" + (id ? "?open=" + encodeURIComponent(id) : ""), self.registration.scope).href;
    e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) { c.postMessage({ type: "open", id }); return c.focus(); }
      return self.clients.openWindow(url);
    }));
  });
})();
