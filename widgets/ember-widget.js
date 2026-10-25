// Ember Widget for Scriptable
// Keyboard-styled Home Screen and Lock Screen widgets for your Ember apps.
//
// Set up: run this script once inside Scriptable and enter your Ember password.
// Then add a Scriptable widget, choose this script, and (optionally) type a Parameter:
//   today    your day: date, weather, next events, tasks (default)
//   weather  current weather and the next few days
//   next     what's coming up next
// Works in Small, Medium, Large and the Lock Screen sizes.

const SERVER = "https://ember-calendar.efn-calendar.workers.dev";
const APP = "https://tommysevdalis-cell.github.io/ember-calendar/";
const KEY = "ember-widget-password";
const DEFAULT_PLACE = { name: "Melbourne", lat: -37.814, lon: 144.9633 };

const C = {
  bgTop: new Color("#e6e8ea"), bgBottom: new Color("#cdd0d4"),
  key: new Color("#eeeff0"), keyEdge: new Color("#bfc3c8"),
  slate: new Color("#4a5361"), slateEdge: new Color("#30363f"),
  orange: new Color("#f04e1e"), orangeEdge: new Color("#b8380f"),
  fg: new Color("#2c323c"), muted: new Color("#69707a"), onDark: new Color("#eef0f2"), onOrange: new Color("#fff6f1"),
  amber: new Color("#ff9452"), ash: new Color("#a7acb3"),
};
const TAG = { ember: C.orange, amber: C.amber, ash: C.ash, slate: C.slate };
const DOWS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ---------------- helpers ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmt12 = (t) => { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return h + (m ? ":" + pad(m) : "") + ap; };
const dm = (d) => pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
const r0 = (n) => Math.round(n);

function text(stack, str, size, opts) {
  opts = opts || {};
  const t = stack.addText(String(str));
  const w = opts.weight || "semibold";
  const fonts = {
    regular: opts.mono ? Font.regularMonospacedSystemFont : opts.round ? Font.regularRoundedSystemFont : Font.regularSystemFont,
    medium: opts.mono ? Font.mediumMonospacedSystemFont : opts.round ? Font.mediumRoundedSystemFont : Font.mediumSystemFont,
    semibold: opts.mono ? Font.semiboldMonospacedSystemFont : opts.round ? Font.semiboldRoundedSystemFont : Font.semiboldSystemFont,
    bold: opts.mono ? Font.boldMonospacedSystemFont : opts.round ? Font.boldRoundedSystemFont : Font.boldSystemFont,
    heavy: opts.round ? Font.heavyRoundedSystemFont : Font.heavySystemFont,
    black: opts.round ? Font.blackRoundedSystemFont : Font.blackSystemFont,
  };
  t.font = fonts[w](size);
  t.textColor = opts.color || C.fg;
  t.lineLimit = opts.lines || 1;
  if (opts.scale) t.minimumScaleFactor = opts.scale;
  if (opts.center) t.centerAlignText();
  return t;
}
function label(stack, str, color) { return text(stack, str.toUpperCase(), 9, { mono: true, weight: "medium", color: color || C.muted }); }

// A keycap: a stack sitting on a slightly darker edge, so it looks pressed into the plate.
function keycap(parent, opts) {
  opts = opts || {};
  const outer = parent.addStack();
  outer.backgroundColor = opts.edge || C.keyEdge;
  outer.cornerRadius = opts.radius || 9;
  outer.setPadding(0, 0, opts.depth == null ? 2.5 : opts.depth, 0);
  const inner = outer.addStack();
  inner.backgroundColor = opts.color || C.key;
  inner.cornerRadius = opts.radius || 9;
  const p = opts.pad || [5, 8, 5, 8];
  inner.setPadding(p[0], p[1], p[2], p[3]);
  if (opts.w || opts.h) { inner.size = new Size(opts.w || 0, opts.h || 0); }
  if (opts.center) inner.centerAlignContent();
  if (opts.vertical) inner.layoutVertically();
  if (opts.url) outer.url = opts.url;
  return inner;
}
function symbol(stack, name, size, color) {
  const s = SFSymbol.named(name) || SFSymbol.named("circle");
  s.applyFont(Font.semiboldSystemFont(size));
  const img = stack.addImage(s.image);
  img.imageSize = new Size(size, size);
  img.tintColor = color;
  return img;
}

/* ---------------- weather ---------------- */
const CODES = {
  0: ["Clear", "clear"], 1: ["Mostly clear", "clear"], 2: ["Partly cloudy", "partly"], 3: ["Overcast", "cloud"], 45: ["Fog", "fog"], 48: ["Icy fog", "fog"],
  51: ["Light drizzle", "drizzle"], 53: ["Drizzle", "drizzle"], 55: ["Heavy drizzle", "drizzle"], 56: ["Freezing drizzle", "drizzle"], 57: ["Freezing drizzle", "drizzle"],
  61: ["Light rain", "rain"], 63: ["Rain", "rain"], 65: ["Heavy rain", "heavy"], 66: ["Freezing rain", "rain"], 67: ["Freezing rain", "heavy"],
  71: ["Light snow", "snow"], 73: ["Snow", "snow"], 75: ["Heavy snow", "snow"], 77: ["Snow grains", "snow"],
  80: ["Light showers", "rain"], 81: ["Showers", "rain"], 82: ["Heavy showers", "heavy"], 85: ["Snow showers", "snow"], 86: ["Snow showers", "snow"],
  95: ["Thunderstorm", "storm"], 96: ["Storm with hail", "storm"], 99: ["Storm with hail", "storm"],
};
const cond = (c) => CODES[c] || ["Unknown", "cloud"];
function wxSymbol(c, day) {
  const k = cond(c)[1];
  return { clear: day ? "sun.max.fill" : "moon.stars.fill", partly: day ? "cloud.sun.fill" : "cloud.moon.fill", cloud: "cloud.fill", fog: "cloud.fog.fill",
    drizzle: "cloud.drizzle.fill", rain: "cloud.rain.fill", heavy: "cloud.heavyrain.fill", snow: "cloud.snow.fill", storm: "cloud.bolt.rain.fill" }[k];
}

/* ---------------- data ---------------- */
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "ember-widget-cache.json");
function readCache() { try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : {}; } catch (e) { return {}; } }
function writeCache(c) { try { fm.writeString(cachePath, JSON.stringify(c)); } catch (e) {} }

async function api(path, pw) {
  const r = new Request(SERVER + path);
  r.headers = { authorization: "Bearer " + pw };
  r.timeoutInterval = 12;
  const j = await r.loadJSON();
  const code = r.response && r.response.statusCode;
  if (code === 401) throw new Error("auth");
  if (code >= 400) throw new Error("Server error " + code);
  return j;
}

async function getPlace(places) {
  try {
    Location.setAccuracyToThreeKilometers();
    const loc = await Location.current();
    let name = "Here";
    try { const g = await Location.reverseGeocode(loc.latitude, loc.longitude); if (g && g[0]) name = g[0].locality || g[0].subLocality || g[0].name || name; } catch (e) {}
    return { name, lat: loc.latitude, lon: loc.longitude };
  } catch (e) {}
  const list = Object.values(places || {}).sort((a, b) => (a.order || 0) - (b.order || 0) || (a.created || 0) - (b.created || 0));
  return list[0] || DEFAULT_PLACE;
}

async function getWeather(place) {
  const q = "latitude=" + place.lat + "&longitude=" + place.lon + "&timezone=auto&forecast_days=6" +
    "&current=temperature_2m,apparent_temperature,weather_code,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";
  const r = new Request("https://api.open-meteo.com/v1/forecast?" + q);
  r.timeoutInterval = 12;
  const d = await r.loadJSON();
  if (!d.current || !d.daily) throw new Error("No forecast");
  return { place: place.name, cur: d.current, daily: d.daily };
}

function occurs(ev, day) {
  if (day < ev.date) return false;
  const dn = (k) => parseDay(k).getTime() / 864e5;
  switch (ev.repeat) {
    case "weekly": return Math.round(dn(day) - dn(ev.date)) % 7 === 0;
    case "monthly": return day.slice(8) === ev.date.slice(8);
    case "yearly": return day.slice(5) === ev.date.slice(5);
    default: return day === ev.date;
  }
}
function upcoming(events, limit) {
  const now = new Date(), out = [];
  const nowHM = pad(now.getHours()) + ":" + pad(now.getMinutes());
  for (let i = 0; i < 21 && out.length < limit; i++) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
    const k = dayKey(d);
    const todays = Object.values(events || {}).filter((e) => occurs(e, k))
      .filter((e) => i > 0 || !e.start || (e.end ? e.end > nowHM : e.start >= nowHM) || (!e.end && e.start >= nowHM))
      .sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    for (const e of todays) if (out.length < limit) out.push({ ...e, day: k, offset: i });
  }
  return out;
}
function tasksToday(tasks) {
  const t = dayKey(new Date());
  return Object.values(tasks || {}).filter((x) => !x.done && x.due && x.due <= t)
    .sort((a, b) => (b.flag - a.flag) || (a.due || "").localeCompare(b.due || "") || (a.time || "99").localeCompare(b.time || "99"));
}
function whenLabel(e) {
  const t = e.start ? fmt12(e.start) : "All day";
  if (e.offset === 0) return t;
  if (e.offset === 1) return "Tmrw " + (e.start ? fmt12(e.start) : "");
  const d = parseDay(e.day);
  return DOWS[d.getDay()].slice(0, 3) + " " + (e.start ? fmt12(e.start) : dm(d));
}

async function loadAll(pw, wantWeather) {
  const cache = readCache();
  const out = { events: cache.events || {}, tasks: cache.tasks || {}, places: cache.places || {}, weather: cache.weather || null, stale: false, authError: false };
  try {
    const [ev, tk, pl] = await Promise.all([api("/api/events", pw), api("/api/c/tasks", pw), api("/api/c/places", pw)]);
    out.events = ev.events || {}; out.tasks = tk.items || {}; out.places = pl.items || {};
  } catch (e) { if (e.message === "auth") out.authError = true; else out.stale = true; }
  if (wantWeather) {
    try { out.weather = await getWeather(await getPlace(out.places)); } catch (e) { out.stale = true; }
  }
  writeCache({ events: out.events, tasks: out.tasks, places: out.places, weather: out.weather, at: Date.now() });
  return out;
}

/* ---------------- widget pieces ---------------- */
function baseWidget(url) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [C.bgTop, C.bgBottom]; g.locations = [0, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
  w.backgroundGradient = g;
  w.setPadding(12, 12, 12, 12);
  w.url = url;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

function weatherKey(parent, wx, size) {
  const day = !!wx.cur.is_day, k = cond(wx.cur.weather_code)[1];
  const sunny = day && (k === "clear" || k === "partly");
  const key = keycap(parent, { color: sunny ? C.orange : day ? C.key : C.slate, edge: sunny ? C.orangeEdge : day ? C.keyEdge : C.slateEdge, radius: size * 0.32, pad: [0, 0, 0, 0], w: size, h: size, center: true });
  symbol(key, wxSymbol(wx.cur.weather_code, day), size * 0.56, sunny ? C.onOrange : day ? C.slate : C.onDark);
  return key;
}

function eventRow(parent, e, compact) {
  const row = parent.addStack(); row.centerAlignContent(); row.spacing = 7;
  const tk = keycap(row, { color: e.offset === 0 ? C.slate : C.key, edge: e.offset === 0 ? C.slateEdge : C.keyEdge, radius: 7, pad: [3, 6, 3, 6] });
  text(tk, whenLabel(e), compact ? 9 : 10, { mono: true, weight: "semibold", color: e.offset === 0 ? C.onDark : C.fg });
  const dot = row.addStack(); dot.size = new Size(4, compact ? 12 : 14); dot.cornerRadius = 2; dot.backgroundColor = TAG[e.tag] || C.orange;
  text(row, e.title, compact ? 12 : 13, { weight: "semibold", scale: 0.8 });
  row.addSpacer();
  return row;
}

function taskRow(parent, t) {
  const row = parent.addStack(); row.centerAlignContent(); row.spacing = 7;
  const box = keycap(row, { radius: 5, pad: [0, 0, 0, 0], w: 14, h: 14, depth: 1.5 });
  box.addSpacer();
  const late = t.due < dayKey(new Date());
  text(row, t.title, 12, { weight: "semibold", color: C.fg, scale: 0.8 });
  if (t.flag || late) { row.addSpacer(4); text(row, late ? "LATE" : "!", 9, { mono: true, weight: "bold", color: C.orange }); }
  row.addSpacer();
  return row;
}

function dateHeader(parent, big) {
  const now = new Date();
  const s = parent.addStack(); s.layoutVertically();
  label(s, DOWS[now.getDay()].slice(0, 3) + " " + dm(now) + "/" + now.getFullYear(), C.orange);
  if (big) text(s, DOWS[now.getDay()], 22, { weight: "heavy", round: true, color: C.slate });
  return s;
}

function messageWidget(title, body, url) {
  const w = baseWidget(url || APP);
  const k = keycap(w, { color: C.orange, edge: C.orangeEdge, radius: 8, pad: [4, 7, 4, 7] });
  text(k, "EMBER", 9, { mono: true, weight: "bold", color: C.onOrange });
  w.addSpacer(8);
  text(w, title, 15, { weight: "bold", round: true, color: C.slate, lines: 2, scale: 0.8 });
  w.addSpacer(3);
  text(w, body, 11, { weight: "medium", color: C.muted, lines: 4, scale: 0.8 });
  w.addSpacer();
  return w;
}

/* ---------------- layouts ---------------- */
function smallToday(d) {
  const w = baseWidget(APP);
  const top = w.addStack(); top.centerAlignContent();
  dateHeader(top, false); top.addSpacer();
  w.addSpacer(4);
  if (d.weather) {
    const row = w.addStack(); row.centerAlignContent();
    text(row, r0(d.weather.cur.temperature_2m) + "°", 34, { weight: "heavy", round: true, color: C.slate });
    row.addSpacer(); weatherKey(row, d.weather, 34);
  }
  w.addSpacer();
  const next = upcoming(d.events, 1)[0];
  if (next) {
    label(w, "Up next");
    w.addSpacer(2);
    text(w, next.title, 13, { weight: "bold", color: C.fg, lines: 1, scale: 0.75 });
    text(w, whenLabel(next), 10, { mono: true, weight: "medium", color: C.orange });
  } else { label(w, "Nothing coming up"); }
  const n = tasksToday(d.tasks).length;
  if (n) { w.addSpacer(4); const k = keycap(w, { color: C.orange, edge: C.orangeEdge, radius: 6, pad: [2, 6, 2, 6] }); text(k, n + (n === 1 ? " task today" : " tasks today"), 9, { mono: true, weight: "bold", color: C.onOrange }); }
  return w;
}

function smallWeather(d) {
  const w = baseWidget(APP + "weather/");
  if (!d.weather) return messageWidget("No weather yet", "Check your connection. It will update by itself.", APP + "weather/");
  const wx = d.weather, c = wx.cur;
  const top = w.addStack(); top.topAlignContent();
  const nm = top.addStack(); nm.layoutVertically();
  label(nm, wx.place, C.orange);
  top.addSpacer(); weatherKey(top, wx, 36);
  w.addSpacer();
  text(w, r0(c.temperature_2m) + "°", 44, { weight: "heavy", round: true, color: C.slate });
  text(w, cond(c.weather_code)[0], 12, { weight: "bold", color: C.fg, scale: 0.8 });
  text(w, "H " + r0(wx.daily.temperature_2m_max[0]) + "°  L " + r0(wx.daily.temperature_2m_min[0]) + "°", 10, { mono: true, weight: "medium", color: C.muted });
  return w;
}

function smallNext(d) {
  const w = baseWidget(APP);
  const list = upcoming(d.events, 3);
  label(w, "Up next", C.orange);
  w.addSpacer(6);
  if (!list.length) { text(w, "Nothing on", 16, { weight: "heavy", round: true, color: C.slate }); text(w, "Your next 3 weeks are clear.", 11, { color: C.muted, lines: 2 }); w.addSpacer(); return w; }
  const e = list[0];
  text(w, e.title, 16, { weight: "heavy", round: true, color: C.slate, lines: 2, scale: 0.75 });
  w.addSpacer(3);
  const k = keycap(w, { color: C.slate, edge: C.slateEdge, radius: 7, pad: [3, 7, 3, 7] });
  text(k, whenLabel(e), 10, { mono: true, weight: "bold", color: C.onDark });
  w.addSpacer();
  list.slice(1, 3).forEach((x) => text(w, whenLabel(x) + "  " + x.title, 10, { weight: "medium", color: C.muted, scale: 0.8 }));
  return w;
}

function mediumToday(d) {
  const w = baseWidget(APP);
  w.setPadding(12, 13, 12, 13);
  const row = w.addStack(); row.spacing = 12;
  // left: date + weather
  const left = row.addStack(); left.layoutVertically(); left.size = new Size(112, 0);
  dateHeader(left, false);
  left.addSpacer(6);
  if (d.weather) {
    const wr = left.addStack(); wr.centerAlignContent(); wr.spacing = 6;
    weatherKey(wr, d.weather, 34);
    text(wr, r0(d.weather.cur.temperature_2m) + "°", 30, { weight: "heavy", round: true, color: C.slate });
    left.addSpacer(4);
    text(left, cond(d.weather.cur.weather_code)[0], 11, { weight: "bold", color: C.fg, scale: 0.8 });
    text(left, "H " + r0(d.weather.daily.temperature_2m_max[0]) + "°  L " + r0(d.weather.daily.temperature_2m_min[0]) + "°", 9, { mono: true, weight: "medium", color: C.muted });
  }
  left.addSpacer();
  const n = tasksToday(d.tasks).length;
  const tk = keycap(left, { color: n ? C.orange : C.key, edge: n ? C.orangeEdge : C.keyEdge, radius: 6, pad: [3, 7, 3, 7], url: APP + "todo/" });
  text(tk, n ? n + (n === 1 ? " task today" : " tasks today") : "No tasks today", 9, { mono: true, weight: "bold", color: n ? C.onOrange : C.muted });
  // right: agenda on a plate
  const plate = row.addStack(); plate.layoutVertically(); plate.backgroundColor = new Color("#c4c7cc"); plate.cornerRadius = 12; plate.setPadding(8, 8, 8, 8); plate.spacing = 6;
  label(plate, "Up next");
  const list = upcoming(d.events, 3);
  if (!list.length) text(plate, "Nothing coming up", 12, { weight: "semibold", color: C.muted });
  list.forEach((e) => eventRow(plate, e, true));
  plate.addSpacer();
  return w;
}

function mediumWeather(d) {
  if (!d.weather) return messageWidget("No weather yet", "Check your connection. It will update by itself.", APP + "weather/");
  const w = baseWidget(APP + "weather/");
  const wx = d.weather, c = wx.cur, dl = wx.daily;
  const top = w.addStack(); top.centerAlignContent(); top.spacing = 10;
  weatherKey(top, wx, 46);
  const mid = top.addStack(); mid.layoutVertically();
  label(mid, wx.place, C.orange);
  text(mid, cond(c.weather_code)[0], 13, { weight: "bold", color: C.fg, scale: 0.8 });
  text(mid, "Feels " + r0(c.apparent_temperature) + "°  H " + r0(dl.temperature_2m_max[0]) + "°  L " + r0(dl.temperature_2m_min[0]) + "°", 9, { mono: true, weight: "medium", color: C.muted, scale: 0.8 });
  top.addSpacer();
  text(top, r0(c.temperature_2m) + "°", 42, { weight: "heavy", round: true, color: C.slate });
  w.addSpacer();
  const days = w.addStack(); days.spacing = 5;
  for (let i = 1; i < Math.min(6, dl.time.length); i++) {
    const k = keycap(days, { radius: 8, pad: [4, 2, 4, 2], vertical: true });
    const d0 = parseDay(dl.time[i]);
    const a = k.addStack(); a.addSpacer(); label(a, DOWS[d0.getDay()].slice(0, 3)); a.addSpacer();
    const b = k.addStack(); b.addSpacer(); symbol(b, wxSymbol(dl.weather_code[i], true), 14, C.slate); b.addSpacer();
    const t = k.addStack(); t.addSpacer(); text(t, r0(dl.temperature_2m_max[i]) + "°", 11, { weight: "bold", round: true }); text(t, " " + r0(dl.temperature_2m_min[i]) + "°", 10, { weight: "medium", color: C.muted }); t.addSpacer();
  }
  return w;
}

function largeToday(d) {
  const w = baseWidget(APP);
  w.setPadding(14, 14, 14, 14);
  const top = w.addStack(); top.centerAlignContent();
  dateHeader(top, true); top.addSpacer();
  if (d.weather) {
    const wr = top.addStack(); wr.centerAlignContent(); wr.spacing = 6;
    const tcol = wr.addStack(); tcol.layoutVertically();
    const tr = tcol.addStack(); tr.addSpacer(); text(tr, r0(d.weather.cur.temperature_2m) + "°", 30, { weight: "heavy", round: true, color: C.slate });
    const cr = tcol.addStack(); cr.addSpacer(); text(cr, cond(d.weather.cur.weather_code)[0], 10, { weight: "semibold", color: C.muted });
    weatherKey(wr, d.weather, 40);
  }
  w.addSpacer(10);
  const plate = w.addStack(); plate.layoutVertically(); plate.backgroundColor = new Color("#c4c7cc"); plate.cornerRadius = 13; plate.setPadding(9, 9, 9, 9); plate.spacing = 7;
  label(plate, "Up next");
  const list = upcoming(d.events, 4);
  if (!list.length) text(plate, "Nothing coming up", 12, { weight: "semibold", color: C.muted });
  list.forEach((e) => eventRow(plate, e, false));
  w.addSpacer(10);
  const tasks = tasksToday(d.tasks);
  const th = w.addStack(); th.centerAlignContent(); th.url = APP + "todo/";
  label(th, "Today's tasks"); th.addSpacer();
  if (tasks.length) { const k = keycap(th, { color: C.orange, edge: C.orangeEdge, radius: 6, pad: [1, 6, 1, 6] }); text(k, String(tasks.length), 9, { mono: true, weight: "bold", color: C.onOrange }); }
  w.addSpacer(6);
  const tl = w.addStack(); tl.layoutVertically(); tl.spacing = 6; tl.url = APP + "todo/";
  if (!tasks.length) text(tl, "All clear. Nice.", 12, { weight: "semibold", color: C.muted });
  tasks.slice(0, 4).forEach((t) => taskRow(tl, t));
  if (tasks.length > 4) text(tl, "+" + (tasks.length - 4) + " more", 10, { mono: true, color: C.muted });
  w.addSpacer();
  if (d.weather) {
    const dl = d.weather.daily, row = w.addStack(); row.spacing = 5; row.url = APP + "weather/";
    for (let i = 1; i < Math.min(6, dl.time.length); i++) {
      const k = keycap(row, { radius: 7, pad: [3, 2, 3, 2] });
      k.centerAlignContent(); k.addSpacer();
      label(k, DOWS[parseDay(dl.time[i]).getDay()].slice(0, 2)); k.addSpacer(3);
      symbol(k, wxSymbol(dl.weather_code[i], true), 11, C.slate); k.addSpacer(3);
      text(k, r0(dl.temperature_2m_max[i]) + "°", 10, { weight: "bold", round: true }); k.addSpacer();
    }
  }
  return w;
}

function lockRect(d, kind) {
  const w = new ListWidget();
  if (kind === "weather" && d.weather) {
    const c = d.weather.cur, dl = d.weather.daily;
    const r = w.addStack(); r.centerAlignContent(); r.spacing = 4;
    symbol(r, wxSymbol(c.weather_code, !!c.is_day), 14, Color.white());
    text(r, r0(c.temperature_2m) + "°  " + d.weather.place, 14, { weight: "bold", round: true, color: Color.white(), scale: 0.7 });
    text(w, cond(c.weather_code)[0], 12, { weight: "medium", color: Color.white(), scale: 0.8 });
    text(w, "H " + r0(dl.temperature_2m_max[0]) + "°  L " + r0(dl.temperature_2m_min[0]) + "°", 11, { weight: "medium", color: Color.white() });
    w.url = APP + "weather/";
    return w;
  }
  const e = upcoming(d.events, 1)[0], n = tasksToday(d.tasks).length;
  const r = w.addStack(); r.centerAlignContent(); r.spacing = 4;
  symbol(r, "calendar", 12, Color.white());
  text(r, e ? whenLabel(e) : "Nothing coming up", 12, { weight: "bold", color: Color.white(), scale: 0.7 });
  if (e) text(w, e.title, 14, { weight: "bold", round: true, color: Color.white(), scale: 0.7 });
  text(w, n ? n + (n === 1 ? " task today" : " tasks today") : "No tasks today", 11, { weight: "medium", color: Color.white() });
  w.url = APP;
  return w;
}
function lockInline(d, kind) {
  const w = new ListWidget();
  const e = upcoming(d.events, 1)[0];
  const parts = [];
  if (d.weather && kind !== "next") parts.push(r0(d.weather.cur.temperature_2m) + "°");
  if (e && kind !== "weather") parts.push(e.title + " " + whenLabel(e));
  text(w, parts.join(" · ") || "Ember", 12, { weight: "semibold", color: Color.white() });
  return w;
}
function lockCircle(d, kind) {
  const w = new ListWidget();
  if (kind !== "next" && d.weather) {
    const c = d.weather.cur;
    const a = w.addStack(); a.addSpacer(); symbol(a, wxSymbol(c.weather_code, !!c.is_day), 16, Color.white()); a.addSpacer();
    const b = w.addStack(); b.addSpacer(); text(b, r0(c.temperature_2m) + "°", 16, { weight: "bold", round: true, color: Color.white() }); b.addSpacer();
    w.url = APP + "weather/";
  } else {
    const n = tasksToday(d.tasks).length;
    const a = w.addStack(); a.addSpacer(); symbol(a, "checklist", 14, Color.white()); a.addSpacer();
    const b = w.addStack(); b.addSpacer(); text(b, String(n), 18, { weight: "bold", round: true, color: Color.white() }); b.addSpacer();
    w.url = APP + "todo/";
  }
  return w;
}

function build(d, family, kind) {
  if (family === "accessoryRectangular") return lockRect(d, kind);
  if (family === "accessoryInline") return lockInline(d, kind);
  if (family === "accessoryCircular") return lockCircle(d, kind);
  if (family === "small") return kind === "weather" ? smallWeather(d) : kind === "next" ? smallNext(d) : smallToday(d);
  if (family === "medium") return kind === "weather" ? mediumWeather(d) : mediumToday(d);
  return kind === "weather" ? mediumWeather(d) : largeToday(d);
}

/* ---------------- run ---------------- */
async function signIn() {
  for (;;) {
    const a = new Alert();
    a.title = "Sign in to Ember";
    a.message = "Enter the same password you use in your Ember apps. It's saved in your iPhone's Keychain.";
    a.addSecureTextField("Password", "");
    a.addAction("Sign in");
    a.addCancelAction("Cancel");
    if ((await a.presentAlert()) === -1) return null;
    const pw = a.textFieldValue(0);
    try { await api("/api/c/places", pw); Keychain.set(KEY, pw); return pw; }
    catch (e) {
      const b = new Alert();
      b.title = e.message === "auth" ? "That password isn't right" : "Couldn't reach your server";
      b.message = e.message === "auth" ? "Try again." : "Check your connection and try again.";
      b.addAction("OK"); await b.presentAlert();
    }
  }
}

async function main() {
  const kind = String((args.widgetParameter || "today")).trim().toLowerCase();
  const family = config.widgetFamily || "medium";
  let pw = Keychain.contains(KEY) ? Keychain.get(KEY) : null;

  if (config.runsInWidget) {
    if (!pw) { Script.setWidget(messageWidget("Sign in first", "Open Scriptable and tap Ember Widget once to enter your password.")); return; }
    const d = await loadAll(pw, family !== "accessoryCircular" || kind !== "next");
    if (d.authError) { Script.setWidget(messageWidget("Password changed", "Open Scriptable and run Ember Widget to sign in again.")); return; }
    Script.setWidget(build(d, family, kind));
    return;
  }

  // Running inside the Scriptable app: sign in, then show previews.
  if (!pw) { pw = await signIn(); if (!pw) return; }
  const menu = new Alert();
  menu.title = "Ember Widget";
  menu.message = "Signed in. Pick a preview, or add the widget to your Home Screen.";
  ["Today (medium)", "Today (large)", "Today (small)", "Weather (medium)", "Weather (small)", "Up next (small)", "Sign out"].forEach((x) => menu.addAction(x));
  menu.addCancelAction("Done");
  const i = await menu.presentSheet();
  if (i === -1) return;
  if (i === 6) { Keychain.remove(KEY); const b = new Alert(); b.title = "Signed out"; b.addAction("OK"); await b.presentAlert(); return; }
  const pick = [["today", "medium"], ["today", "large"], ["today", "small"], ["weather", "medium"], ["weather", "small"], ["next", "small"]][i];
  const d = await loadAll(pw, true);
  if (d.authError) { Keychain.remove(KEY); const b = new Alert(); b.title = "Your password changed"; b.message = "Run the script again to sign in."; b.addAction("OK"); await b.presentAlert(); return; }
  const w = build(d, pick[1], pick[0]);
  if (pick[1] === "small") await w.presentSmall(); else if (pick[1] === "large") await w.presentLarge(); else await w.presentMedium();
}

await main();
Script.complete();
