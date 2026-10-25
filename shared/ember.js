/* Ember core — shared by every Ember app.
   Password screen, sync with your server, settings, notifications, sheets, date picker, little helpers. */
(function () {
  "use strict";
  const cfg = window.EMBER_CONFIG || {};
  const API = (cfg.serverUrl || "").trim().replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const key = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOWS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const fmt12 = (t) => { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return h + (m ? ":" + pad(m) : "") + ap; };
  const dmy = (k) => { const d = parse(k); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); };
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = () => window.matchMedia("(max-width:640px)").matches;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ""; } })();
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  const svg = (d, w) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
  const ICONS = {
    plus: svg('<path d="M12 5v14M5 12h14"/>', 2.4),
    left: svg('<path d="M15 6l-6 6 6 6"/>', 2.4),
    right: svg('<path d="M9 6l6 6-6 6"/>', 2.4),
    chev: svg('<path d="M6 9l6 6 6-6"/>', 2.4),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
    cal: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    bell: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    sync: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', 2.2),
    pin: svg('<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>'),
    flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 2.4),
    apps: svg('<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>'),
    gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  };
  const TAGS = { ember: "var(--tag-ember)", amber: "var(--tag-amber)", ash: "var(--tag-ash)", slate: "var(--tag-slate)" };
  const APPS = [
    { id: "calendar", name: "Calendar", href: "../", icon: "../icons/icon-192.png" },
    { id: "todo", name: "To-do", href: "../todo/", icon: "../todo/icons/icon-192.png" },
    { id: "weather", name: "Weather", href: "../weather/", icon: "../weather/icons/icon-192.png" },
  ];

  /* ---------- small UI helpers ---------- */
  let toastT;
  function toast(m) {
    let t = $("e-toast");
    if (!t) { t = document.createElement("div"); t.id = "e-toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = m; t.hidden = true; void t.offsetWidth; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200);
  }
  function burst(el, n) {
    if (reduced() || !el) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const cols = ["#f04e1e", "#ff9452", "#4a5361", "#eeeff0", "#a7acb3"];
    for (let i = 0; i < (n || 18); i++) {
      const b = document.createElement("span"); b.className = "bit"; b.style.background = cols[i % cols.length];
      b.style.left = cx + "px"; b.style.top = cy + "px"; document.body.appendChild(b);
      const a = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 80, dx = Math.cos(a) * dist, dy = Math.sin(a) * dist - 30;
      const anim = b.animate([{ transform: "translate(-50%,-50%) rotate(0) scale(1)", opacity: 1 }, { transform: "translate(calc(-50% + " + dx + "px),calc(-50% + " + (dy + 60) + "px)) rotate(" + (Math.random() * 540 - 270) + "deg) scale(.4)", opacity: 0 }], { duration: 650 + Math.random() * 400, easing: "cubic-bezier(.15,.7,.3,1)" });
      anim.onfinish = () => b.remove();
    }
  }
  function rollTitle(el, main, hl) {
    let i = 0;
    const chars = (t) => [...t].map((c) => '<span class="ch" style="--i:' + i++ + '">' + (c === " " ? "&nbsp;" : c.replace(/[<>&]/g, "")) + "</span>").join("");
    el.innerHTML = chars(main) + (hl ? ' <span class="hl">' + chars(hl) + "</span>" : "");
  }

  /* ---------- sheets ---------- */
  const openSheets = [];
  function sheet(scrim, panel, opts) {
    opts = opts || {};
    let anims = [], isOpen = false;
    function animate(open) {
      anims.forEach((a) => a.cancel()); anims = [];
      if (reduced()) return Promise.resolve();
      const from = phone() ? "translateY(100%)" : "translateY(16px) scale(.97)";
      const o = phone() ? 1 : 0;
      const k = open ? [{ transform: from, opacity: o }, { transform: "none", opacity: 1 }] : [{ transform: "none", opacity: 1 }, { transform: from, opacity: o }];
      const opt = { duration: open ? 320 : 220, easing: open ? "cubic-bezier(.2,.85,.25,1)" : "cubic-bezier(.4,0,1,1)", fill: "both" };
      const a1 = panel.animate(k, opt), a2 = scrim.animate(open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: opt.duration, fill: "both" });
      anims = [a1, a2];
      return a1.finished.catch(() => {});
    }
    const api = {
      get isOpen() { return isOpen; },
      open() {
        if (isOpen) return; isOpen = true; scrim.hidden = false; panel.scrollTop = 0; openSheets.push(api);
        animate(true).then(() => { if (isOpen && opts.focus && !window.matchMedia("(pointer:coarse)").matches) opts.focus.focus({ preventScroll: true }); });
      },
      close() {
        if (!isOpen) return; isOpen = false; const i = openSheets.indexOf(api); if (i > -1) openSheets.splice(i, 1);
        if (document.activeElement && panel.contains(document.activeElement)) document.activeElement.blur();
        if (opts.onClose) opts.onClose();
        animate(false).then(() => { if (!isOpen) { scrim.hidden = true; anims.forEach((a) => a.cancel()); anims = []; } });
      },
    };
    scrim.addEventListener("click", (e) => { if (e.target === scrim) api.close(); });
    return api;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !openSheets.length) return;
    const top = openSheets[openSheets.length - 1];
    if (top.onEscape && top.onEscape() === false) return;
    top.close();
  });

  /* ---------- date picker (dd/mm/yyyy, keycap mini calendar) ---------- */
  function datePicker(host, opts) {
    opts = opts || {};
    const id = "dp" + Math.random().toString(36).slice(2, 7);
    host.innerHTML =
      '<button type="button" class="in pickbtn" aria-expanded="false"><span class="pv"><b class="dpv"></b><small class="dpd"></small></span><span class="pi">' + ICONS.cal + "</span></button>" +
      '<div class="collapse"><div><div class="dp">' +
      '<div class="dp-head"><button type="button" class="dp-nav dpp" aria-label="Previous month">' + ICONS.left + '</button><span class="dpt"></span><button type="button" class="dp-nav dpn" aria-label="Next month">' + ICONS.right + "</button></div>" +
      '<div class="dp-dow"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>' +
      '<div class="dp-grid" id="' + id + '"></div>' +
      '<div class="dp-quick">' + (opts.allowNone ? '<button type="button" data-q="none">No date</button>' : "") + '<button type="button" data-q="0">Today</button><button type="button" data-q="1">Tomorrow</button><button type="button" data-q="7">Next week</button></div>' +
      "</div></div></div>";
    const btn = host.querySelector(".pickbtn"), wrap = host.querySelector(".collapse"), grid = host.querySelector(".dp-grid");
    let value = "", view = new Date(today().getFullYear(), today().getMonth(), 1);
    function label() {
      host.querySelector(".dpv").textContent = value ? dmy(value) : opts.noneLabel || "No date";
      host.querySelector(".dpd").textContent = value ? DOWS[parse(value).getDay()] : "";
    }
    function draw(dir) {
      host.querySelector(".dpt").textContent = MONTHS[view.getMonth()] + " " + view.getFullYear();
      grid.textContent = ""; grid.classList.remove("slide-next", "slide-prev");
      if (dir) { void grid.offsetWidth; grid.classList.add("slide-" + dir); }
      const off = (view.getDay() + 6) % 7, st = new Date(view); st.setDate(1 - off);
      for (let i = 0; i < 42; i++) {
        const d = new Date(st); d.setDate(st.getDate() + i); const k = key(d);
        const b = document.createElement("button"); b.type = "button"; b.textContent = d.getDate();
        b.setAttribute("aria-label", d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear());
        if (d.getMonth() !== view.getMonth()) b.classList.add("out");
        if (d.getDay() === 0 || d.getDay() === 6) b.classList.add("we");
        if (+d === +today()) b.classList.add("now");
        if (k === value) { b.classList.add("on"); b.setAttribute("aria-pressed", "true"); }
        b.addEventListener("click", () => { set(k, true); setTimeout(close, 180); });
        grid.appendChild(b);
      }
    }
    function set(k, fromUser) {
      value = k || "";
      if (value && (!fromUser || parse(value).getMonth() !== view.getMonth())) { const d = parse(value); view = new Date(d.getFullYear(), d.getMonth(), 1); }
      label(); draw();
      if (fromUser && opts.onChange) opts.onChange(value);
    }
    function close() { btn.setAttribute("aria-expanded", "false"); wrap.classList.remove("open"); }
    function open() {
      if (opts.onOpen) opts.onOpen();
      const d = value ? parse(value) : today(); view = new Date(d.getFullYear(), d.getMonth(), 1); draw();
      btn.setAttribute("aria-expanded", "true"); wrap.classList.add("open");
    }
    btn.addEventListener("click", () => (btn.getAttribute("aria-expanded") === "true" ? close() : open()));
    host.querySelector(".dpp").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); draw("prev"); });
    host.querySelector(".dpn").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); draw("next"); });
    host.querySelectorAll(".dp-quick button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.q === "none") set("", true);
      else { const d = today(); d.setDate(d.getDate() + Number(b.dataset.q)); set(key(d), true); }
      setTimeout(close, 180);
    }));
    set(opts.value || "");
    return { get value() { return value; }, set: (k) => set(k, false), close, get isOpen() { return wrap.classList.contains("open"); } };
  }

  /* ---------- server + sync ---------- */
  let app = null, pw = LS.get("ember-pw", ""), verifying = false;
  const colls = {};
  async function api(method, path, body) {
    let r;
    try {
      r = await fetch(API + path, { method, cache: "no-store", headers: Object.assign({ authorization: "Bearer " + pw }, body ? { "content-type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw { code: "network", message: "Can't reach your server. Check your connection." }; }
    let data = {}; try { data = await r.json(); } catch (e) {}
    if (r.status === 401) throw { code: "auth", message: data.error || "Wrong password." };
    if (!r.ok) throw { code: r.status, message: data.error || "The server had a problem (" + r.status + ")." };
    return data;
  }
  const hhmm = (d) => { let h = d.getHours(); const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return h + ":" + pad(d.getMinutes()) + ap; };
  function setSync(on, txt) {
    const s = $("sync"), st = $("syncTxt"), ss = $("e-sStatus");
    if (s) s.classList.toggle("on", on); if (st) st.textContent = txt; if (ss) ss.textContent = txt;
  }
  function coll(name) {
    if (!colls[name]) colls[name] = { items: LS.get("ember-c-" + name, {}) || {}, sig: "", pending: 0 };
    return colls[name];
  }
  const cache = (name) => LS.set("ember-c-" + name, coll(name).items);
  function notify(name, why) { if (app && app.onData) app.onData(name, coll(name).items, why); }

  async function pull(force) {
    if (!API || !pw || verifying) return;
    try {
      for (const name of app.collections) {
        const c = coll(name); if (c.pending) continue;
        const d = await api("GET", "/api/c/" + name);
        if (c.pending) continue;
        const next = d.items || {}, sig = JSON.stringify(next);
        if (force || sig !== c.sig) { c.sig = sig; c.items = next; cache(name); notify(name, "sync"); }
      }
      setSync(true, "Synced " + hhmm(new Date()));
    } catch (e) {
      if (e.code === "auth") { lock(); return; }
      setSync(false, navigator.onLine === false ? "Offline, showing your saved copy" : "Can't reach the server right now");
    }
  }
  async function save(name, id, item) {
    const c = coll(name), prev = c.items[id];
    c.items[id] = item; cache(name); notify(name, "local");
    c.pending++;
    try { await api("PUT", "/api/c/" + name + "/" + id, item); c.sig = ""; }
    catch (e) {
      if (prev) c.items[id] = prev; else delete c.items[id];
      cache(name); notify(name, "revert");
      if (e.code === "auth") lock(); else toast(e.code === "network" ? "Couldn't save. Check your connection." : e.message);
      throw e;
    } finally { c.pending--; }
  }
  async function remove(name, id) {
    const c = coll(name), prev = c.items[id];
    delete c.items[id]; cache(name); notify(name, "local");
    c.pending++;
    try { await api("DELETE", "/api/c/" + name + "/" + id); c.sig = ""; }
    catch (e) {
      if (prev) c.items[id] = prev; cache(name); notify(name, "revert");
      if (e.code === "auth") lock(); else toast("Couldn't delete. Check your connection.");
      throw e;
    } finally { c.pending--; }
  }
  const newId = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- password gate ---------- */
  function injectChrome() {
    const me = APPS.find((a) => a.id === app.id) || { name: app.name, icon: "icons/icon-192.png" };
    const wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="gate" id="e-gate" hidden><form class="gate-card" id="e-gateForm" autocomplete="on">' +
      '<img class="gate-logo" src="icons/icon-192.png" alt="">' +
      "<h1>" + app.name + "</h1>" +
      '<p id="e-gMsg"></p>' +
      '<div class="setup" id="e-gSetup" hidden>This app isn\'t linked to your server yet. Open <code>config.js</code> in your GitHub repo and paste your server address into <code>serverUrl</code>.</div>' +
      '<input class="in" type="password" id="e-gPw" name="password" autocomplete="current-password" placeholder="Password" aria-label="Password">' +
      '<div class="err" id="e-gErr" hidden></div>' +
      '<button class="btn primary" type="submit" id="e-gGo">Unlock</button></form></div>' +
      '<div class="scrim" id="e-setScrim" hidden><div class="sheet" id="e-setSheet" role="dialog" aria-modal="true" aria-labelledby="e-setTitle">' +
      '<h2 id="e-setTitle">Settings</h2>' +
      (app.push ?
        '<div class="setcard"><div class="sc-head"><span class="ibox" id="e-nIcon">' + ICONS.bell + '</span><div><b>Reminder notifications</b><small id="e-nStatus">Checking…</small></div></div>' +
        '<div class="hint" id="e-nHint"></div>' +
        '<ol class="steps" id="e-nSteps" hidden><li>Tap the Share button in Safari.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open ' + me.name + ' from your Home Screen and come back here.</li></ol>' +
        '<div class="sc-actions"><button type="button" class="btn primary" id="e-nOn" hidden>Turn on notifications</button><button type="button" class="btn" id="e-nTest" hidden>Send a test</button><button type="button" class="btn del" id="e-nOff" hidden>Turn off</button></div></div>' : "") +
      '<div class="setcard"><div class="sc-head"><span class="ibox">' + ICONS.sync + '</span><div><b>Sync</b><small id="e-sStatus">Checking…</small></div></div>' +
      '<div class="sc-actions"><button type="button" class="btn" id="e-syncNow">Sync now</button><button type="button" class="btn del" id="e-signOut">Sign out of this device</button></div></div>' +
      '<div class="setcard"><div class="sc-head"><span class="ibox">' + ICONS.apps + '</span><div><b>Your Ember apps</b><small>Open one, then add it to your Home Screen</small></div></div>' +
      '<div class="applinks">' + APPS.map((a) => '<a href="' + a.href + '"' + (a.id === app.id ? ' aria-current="page"' : "") + '><img src="' + a.icon + '" alt="">' + a.name + "</a>").join("") + "</div></div>" +
      '<div class="actions"><div class="r"><button type="button" class="btn dark" id="e-setClose">Done</button></div></div>' +
      "</div></div>";
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }
  function showGate(msg) {
    const g = $("e-gate"); g.classList.remove("leaving"); g.hidden = false;
    $("e-gSetup").hidden = !!API; $("e-gPw").hidden = !API; $("e-gGo").hidden = !API;
    $("e-gMsg").textContent = msg || "Enter your Ember password to unlock " + app.name + " on this device.";
    $("e-gErr").hidden = true;
  }
  function lock(msg) { pw = ""; LS.del("ember-pw"); setSync(false, "Locked"); showGate(msg || "Your password didn't work. Enter it again to keep syncing."); }
  function bindGate() {
    $("e-gateForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const val = $("e-gPw").value; if (!val) return;
      const btn = $("e-gGo"); btn.disabled = true; btn.textContent = "Unlocking…"; $("e-gErr").hidden = true;
      const prev = pw; pw = val; verifying = true;
      try {
        await api("GET", "/api/c/" + app.collections[0]);
        verifying = false; LS.set("ember-pw", pw); $("e-gPw").value = "";
        const g = $("e-gate"); if (document.activeElement) document.activeElement.blur();
        if (reduced()) g.hidden = true; else { g.classList.add("leaving"); setTimeout(() => { g.hidden = true; g.classList.remove("leaving"); }, 430); }
        await pull(true); postTz(); refreshNotif();
        if (app.onUnlock) app.onUnlock();
      } catch (err) {
        verifying = false; pw = prev; const ge = $("e-gErr");
        ge.textContent = err.code === "auth" ? "That password isn't right. Try again." : err.message;
        ge.hidden = true; void ge.offsetWidth; ge.hidden = false;
      } finally { btn.disabled = false; btn.textContent = "Unlock"; }
    });
  }
  function postTz() { if (!TZ || LS.get("ember-tz", "") === TZ) return; api("POST", "/api/timezone", { tz: TZ }).then(() => LS.set("ember-tz", TZ)).catch(() => {}); }

  /* ---------- notifications ---------- */
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let swReg = null, pushOn = false;
  const unb64u = (s) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  async function currentSub() { try { const r = swReg || (await navigator.serviceWorker.ready); return await r.pushManager.getSubscription(); } catch (e) { return null; } }
  async function refreshNotif() {
    if (!app.push) return;
    const st = $("e-nStatus"), hint = $("e-nHint"), on = $("e-nOn"), test = $("e-nTest"), off = $("e-nOff"), steps = $("e-nSteps"), icon = $("e-nIcon");
    on.hidden = test.hidden = off.hidden = steps.hidden = true; hint.textContent = "";
    if (!pushSupported()) {
      pushOn = false; LS.set("ember-push-" + app.id, false); icon.classList.remove("on");
      if (isIOS && !standalone) { st.textContent = "Needs the Home Screen app"; hint.textContent = "On iPhone, notifications only work when " + app.name + " is opened from your Home Screen."; steps.hidden = false; }
      else { st.textContent = "Not supported in this browser"; hint.textContent = "Reminders will still pop up inside the app while it's open."; }
      return;
    }
    const sub = await currentSub();
    pushOn = !!sub && Notification.permission === "granted"; LS.set("ember-push-" + app.id, pushOn); icon.classList.toggle("on", pushOn);
    if (Notification.permission === "denied") { st.textContent = "Blocked"; hint.textContent = isIOS ? "Open the iPhone Settings app, then Notifications, then " + app.name + ", and turn on Allow Notifications." : "Notifications are blocked for this site. Allow them in your browser's site settings."; return; }
    if (pushOn) { st.textContent = "On for this device"; hint.textContent = "You'll get a notification at your reminder time, even when the app is closed."; test.hidden = off.hidden = false; }
    else { st.textContent = "Off on this device"; hint.textContent = app.pushHint || "Turn these on to get your reminders as real notifications."; on.hidden = false; }
  }
  function bindNotif() {
    if (!app.push) return;
    $("e-nOn").addEventListener("click", async () => {
      const b = $("e-nOn");
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { toast("Notifications weren't allowed"); refreshNotif(); return; }
        b.disabled = true; b.textContent = "Turning on…";
        const reg = swReg || (await navigator.serviceWorker.ready);
        const { publicKey } = await api("GET", "/api/vapid");
        const old = await reg.pushManager.getSubscription(); if (old) await old.unsubscribe();
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(publicKey) });
        await api("POST", "/api/subscribe", { subscription: sub.toJSON(), tz: TZ, app: app.id, device: isIOS ? "iPhone" : "Computer" });
        LS.set("ember-subday-" + app.id, key(today())); toast("Notifications on");
      } catch (e) { toast((e && e.message) || "Couldn't turn on notifications. Try again."); if (e && e.code === "auth") lock(); }
      finally { b.disabled = false; b.textContent = "Turn on notifications"; refreshNotif(); }
    });
    $("e-nOff").addEventListener("click", async () => {
      const sub = await currentSub();
      try { if (sub) { api("POST", "/api/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } toast("Notifications off"); }
      catch (e) { toast("Couldn't turn them off. Try again."); }
      refreshNotif();
    });
    $("e-nTest").addEventListener("click", async () => {
      const sub = await currentSub(); if (!sub) { refreshNotif(); return; }
      const b = $("e-nTest"); b.disabled = true; b.textContent = "Sending…";
      try { const r = await api("POST", "/api/test", { endpoint: sub.endpoint }); toast(r.sent ? "Test sent. It should arrive in a few seconds." : "The notification service didn't accept it. Turn notifications off and on again."); }
      catch (e) { toast(e.message || "Couldn't send a test."); }
      finally { b.disabled = false; b.textContent = "Send a test"; }
    });
  }
  async function keepSubFresh() {
    if (!app.push || !pushOn || !pw || LS.get("ember-subday-" + app.id, "") === key(today())) return;
    const sub = await currentSub(); if (!sub) return;
    api("POST", "/api/subscribe", { subscription: sub.toJSON(), tz: TZ, app: app.id, device: isIOS ? "iPhone" : "Computer" }).then(() => LS.set("ember-subday-" + app.id, key(today()))).catch(() => {});
  }

  /* ---------- settings ---------- */
  let settings;
  function bindSettings() {
    settings = sheet($("e-setScrim"), $("e-setSheet"));
    $("e-setClose").addEventListener("click", () => settings.close());
    $("e-syncNow").addEventListener("click", async () => { const b = $("e-syncNow"); b.disabled = true; b.textContent = "Syncing…"; await pull(true); b.disabled = false; b.textContent = "Sync now"; });
    $("e-signOut").addEventListener("click", async () => {
      const b = $("e-signOut");
      if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Tap again to sign out"; return; }
      const sub = app.push ? await currentSub() : null;
      if (sub) { try { await api("POST", "/api/unsubscribe", { endpoint: sub.endpoint }); } catch (e) {} try { await sub.unsubscribe(); } catch (e) {} }
      for (const n of app.collections) { LS.del("ember-c-" + n); coll(n).items = {}; coll(n).sig = ""; notify(n, "signout"); }
      settings.close(); lock("Signed out. Enter your password to unlock this device again.");
    });
  }
  function openSettings() {
    const b = $("e-signOut"); b.classList.remove("armed"); b.textContent = "Sign out of this device";
    const st = $("syncTxt"); $("e-sStatus").textContent = st ? st.textContent : pw ? "Signed in" : "Locked";
    refreshNotif(); settings.open();
  }

  /* ---------- start ---------- */
  function start(opts) {
    app = Object.assign({ push: false }, opts);
    pushOn = LS.get("ember-push-" + app.id, false);
    injectChrome(); bindGate(); bindNotif(); bindSettings();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").then((r) => { swReg = r; refreshNotif().then(keepSubFresh); }).catch(() => {});
      navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "open" && app.onOpenItem) app.onOpenItem(e.data.id); });
    }
    for (const n of app.collections) notify(n, "cache");
    setInterval(() => { if (!document.hidden) pull(); }, 20000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
    window.addEventListener("online", () => pull());
    if (!API) { setSync(false, "Not linked to a server"); showGate(); }
    else if (!pw) { setSync(false, "Locked"); showGate(); }
    else { setSync(false, "Connecting…"); pull(); postTz(); }
  }

  window.Ember = {
    start, save, remove, pull, newId, toast, burst, rollTitle, sheet, datePicker, openSettings,
    items: (n) => coll(n).items,
    get pushOn() { return pushOn; },
    util: { $, pad, key, parse, MONTHS, DOWS, today, fmt12, dmy, reduced, phone, LS },
    ICONS, TAGS,
  };
})();
