/* Ember Vault
   How it stays private:
   - Your master password never leaves this device and is never stored.
   - It's stretched with PBKDF2-SHA256 (600,000 rounds) into a key that unlocks a random 256-bit vault key.
   - Every entry is encrypted with that vault key using AES-256-GCM before it's sent to your server,
     and each entry is bound to its own id so entries can't be swapped around.
   - The server only ever sees scrambled data. Changing your master password just re-wraps the vault key.
   - The unlocked key lives only in memory. Locking, closing the app or a timeout throws it away. */
(function () {
  "use strict";
  const E = Ember, { $, pad, LS, reduced } = E.util, I = E.ICONS, TAGS = E.TAGS;
  const te = new TextEncoder(), td = new TextDecoder();
  const ITER = 600000, KDF = "PBKDF2-SHA256", WRAP_AAD = "ember-vault-key-v1", itemAad = (id) => "ember-vault-item-v1:" + id;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const svg = (d, w, vb) => '<svg viewBox="' + (vb || "0 0 24 24") + '" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
  const IC = {
    lock: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="shackle" d="M10 15V10.5a6 6 0 0 1 12 0V15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><rect x="6" y="14" width="20" height="14" rx="4" fill="currentColor"/><circle cx="16" cy="20.2" r="2.3" fill="#f04e1e"/><rect x="15" y="21" width="2" height="3.6" rx="1" fill="#f04e1e"/></svg>',
    lockSmall: svg('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.6l6.1-.8z"/></svg>',
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8v5M12 16.5v.01"/>', 2.2),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    key: svg('<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8L20 3M16 7l3 3M14 9l2 2"/>'),
  };

  /* ---------------- crypto ---------------- */
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  async function deriveKek(pw, salt, iter) {
    const base = await crypto.subtle.importKey("raw", te.encode(pw.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function seal(key, bytes, aad) {
    const iv = rand(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(aad) }, key, bytes));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function unseal(key, blob, aad) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv), additionalData: te.encode(aad) }, key, unb64(blob.ct)));
  }
  const importVaultKey = (raw) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  async function unwrapRaw(pw, m) {
    const kek = await deriveKek(pw, unb64(m.salt), m.iter);
    return unseal(kek, m.wrapped, WRAP_AAD); // throws if the password is wrong or the data was changed
  }
  async function wrapRaw(pw, raw) {
    const salt = rand(16), kek = await deriveKek(pw, salt, ITER);
    return { kdf: KDF, iter: ITER, salt: b64(salt), wrapped: await seal(kek, raw, WRAP_AAD) };
  }
  const newId = () => "v" + Array.from(rand(8), (b) => b.toString(16).padStart(2, "0")).join("");

  /* ---------------- strength + generator ---------------- */
  const COMMON = ["password", "123456", "12345678", "123456789", "qwerty", "letmein", "iloveyou", "admin", "welcome", "monkey", "dragon", "football", "baseball", "abc123", "111111", "sunshine", "princess", "passw0rd", "password1", "qwerty123", "000000", "1234", "12345", "trustno1", "master", "hello", "freedom", "whatever", "shadow", "superman"];
  function strength(pw) {
    if (!pw) return { score: -1, label: "", bits: 0 };
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/[0-9]/.test(pw)) pool += 10;
    if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
    let bits = pw.length * Math.log2(Math.max(pool, 2));
    const low = pw.toLowerCase();
    if (COMMON.some((c) => low.replace(/[^a-z0-9]/g, "").includes(c) && c.length >= pw.length - 3)) bits = Math.min(bits, 12);
    if (/(.)\1{2,}/.test(pw)) bits *= 0.75;
    if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|wert|asdf|zxcv)/i.test(pw)) bits *= 0.75;
    if (/^[A-Za-z]+\d{0,4}[!.?]?$/.test(pw) && pw.length <= 14) bits *= 0.6;
    const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
    return { score, bits, label: ["Very weak", "Weak", "Okay", "Strong", "Very strong"][score] };
  }
  function paintMeter(barId, lblId, pw) {
    const s = strength(pw), bar = $(barId);
    bar.style.setProperty("--w", s.score < 0 ? "0%" : (s.score + 1) * 20 + "%");
    bar.style.setProperty("--c", ["var(--danger)", "var(--accent)", "var(--tag-amber)", "var(--slate)", "var(--slate)"][s.score] || "var(--faint)");
    $(lblId).textContent = s.label;
    return s;
  }
  const SETS = { lower: "abcdefghijkmnpqrstuvwxyz" + "lo", upper: "ABCDEFGHJKLMNPQRSTUVWXYZ" + "IO", digits: "23456789" + "01", symbols: "!@#$%^&*-_=+?~" };
  const LOOKALIKE = /[lIoO01]/g;
  function randInt(n) { const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1); for (;;) { crypto.getRandomValues(b); if (b[0] < lim) return b[0] % n; } }
  function generate(o) {
    const sets = [SETS.lower].concat(o.upper ? [SETS.upper] : [], o.digits ? [SETS.digits] : [], o.symbols ? [SETS.symbols] : []).map((s) => (o.plain ? s.replace(LOOKALIKE, "") : s));
    const all = sets.join("");
    for (;;) {
      let p = ""; for (let i = 0; i < o.len; i++) p += all[randInt(all.length)];
      if (sets.every((s) => [...p].some((c) => s.includes(c)))) return p;
    }
  }

  /* ---------------- state ---------------- */
  let meta = null, metaKnown = false, encItems = {}, vaultKey = null, bad = 0;
  const plain = new Map(), ctOf = new Map();
  let filter = "all", query = "", firstPaint = true, lastSig = "";
  const autoLockMin = () => LS.get("ember-vault-lock", 5);

  /* ---------------- lock screen ---------------- */
  $("lockKey").innerHTML = IC.lock;
  let mode = "";
  function setMode(m) {
    if (m === mode) return; mode = m;
    const f = $("lockFields"), msg = $("lockMsg");
    $("lockErr").hidden = true;
    if (m === "loading") { f.hidden = true; $("forgot").hidden = true; msg.textContent = "Loading your vault…"; return; }
    f.hidden = false;
    const setup = m === "setup";
    $("mp1").value = ""; $("mp2").value = ""; $("ack").checked = false;
    $("mp1").placeholder = setup ? "Create a master password" : "Master password";
    $("mp2").hidden = !setup; $("ackRow").hidden = !setup; $("mpMeter").hidden = !setup; $("forgot").hidden = setup;
    $("lockGo").textContent = setup ? "Create vault" : "Unlock";
    msg.textContent = setup ? "Pick one strong password you'll remember. It encrypts everything in here and never leaves your device." : "Enter your master password.";
    if (setup) paintMeter("mpBar", "mpLbl", "");
  }
  function refreshLock() {
    if (vaultKey) return;
    setMode(!metaKnown ? "loading" : meta ? "unlock" : "setup");
  }
  setTimeout(() => { if (mode === "loading") $("lockMsg").textContent = "Can't reach your server yet. Your vault needs to connect once to load."; }, 10000);
  $("mp1").addEventListener("input", () => { if (mode === "setup") paintMeter("mpBar", "mpLbl", $("mp1").value); });
  function lockErr(m) {
    const e = $("lockErr"); e.textContent = m; e.hidden = true; void e.offsetWidth; e.hidden = false;
    const l = $("lock"); l.classList.remove("shake"); void l.offsetWidth; l.classList.add("shake");
  }
  function busy(on, text) {
    const b = $("lockGo"); b.disabled = on;
    b.innerHTML = on ? '<span class="spinner"></span>' + text : mode === "setup" ? "Create vault" : "Unlock";
  }
  $("lockForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("mp1").value;
    if (!pw) return;
    if (mode === "setup") {
      const s = strength(pw);
      if (pw.length < 10) return lockErr("Use at least 10 characters.");
      if (s.score < 2) return lockErr("That's too easy to guess. Try a few random words with a number.");
      if (pw !== $("mp2").value) return lockErr("The two passwords don't match.");
      if (!$("ack").checked) return lockErr("Tick the box to confirm you'll remember it.");
      busy(true, "Creating…");
      try {
        const raw = rand(32);
        const m = Object.assign(await wrapRaw(pw, raw), { created: Date.now() });
        const key = await importVaultKey(raw); raw.fill(0);
        await E.save("vaultmeta", "main", m);
        vaultKey = key;
        if (Array.isArray(window.VAULT_PREVIEW_SEED)) for (const x of window.VAULT_PREVIEW_SEED) await saveEntry(newId(), x);
        unlocked(true);
      } catch (err) { vaultKey = null; busy(false); lockErr("Couldn't create your vault. Check your connection and try again."); }
      return;
    }
    busy(true, "Unlocking…");
    try {
      const raw = await unwrapRaw(pw, meta);
      vaultKey = await importVaultKey(raw); raw.fill(0);
      unlocked(false);
    } catch (err) { busy(false); lockErr("That's not it. Try again."); $("mp1").select(); }
  });

  async function unlocked(isNew) {
    $("mp1").value = ""; $("mp2").value = "";
    if (document.activeElement) document.activeElement.blur();
    await decryptAll();
    const l = $("lock");
    l.classList.add("opening");
    setTimeout(() => {
      $("app").hidden = false; $("fab").hidden = false; firstPaint = true; lastSig = ""; render();
      if (reduced()) { l.hidden = true; finish(); } else { l.classList.add("leaving"); setTimeout(() => { l.hidden = true; finish(); }, 420); }
    }, reduced() ? 0 : 380);
    function finish() { l.classList.remove("opening", "leaving"); busy(false); touch(); if (isNew) E.toast("Your vault is ready"); }
  }

  function lockNow(msg) {
    vaultKey = null; plain.clear(); ctOf.clear(); bad = 0;
    [dt, ed, vs].forEach((s) => s.isOpen && s.close());
    $("rows").textContent = ""; $("dtUser").textContent = ""; $("dtPw").textContent = ""; $("edPw").value = ""; $("genOut").textContent = "";
    $("app").hidden = true; $("fab").hidden = true;
    const l = $("lock"); l.hidden = false; l.classList.remove("opening", "leaving");
    mode = ""; refreshLock();
    if (msg) $("lockMsg").textContent = msg;
  }

  /* ---------------- data ---------------- */
  async function decryptAll() {
    if (!vaultKey) return;
    const key = vaultKey;
    let fails = 0;
    for (const id of [...plain.keys()]) if (!encItems[id]) { plain.delete(id); ctOf.delete(id); }
    for (const [id, blob] of Object.entries(encItems)) {
      if (ctOf.get(id) === blob.ct) continue;
      try { const obj = JSON.parse(td.decode(await unseal(key, blob, itemAad(id)))); if (key !== vaultKey) return; plain.set(id, obj); ctOf.set(id, blob.ct); }
      catch (e) { fails++; plain.delete(id); ctOf.delete(id); }
    }
    bad = fails;
  }
  async function saveEntry(id, item) {
    const blob = await seal(vaultKey, te.encode(JSON.stringify(item)), itemAad(id));
    const prev = plain.get(id), prevCt = ctOf.get(id);
    plain.set(id, item); ctOf.set(id, blob.ct);
    try { await E.save("vault", id, blob); }
    catch (e) { if (prev) { plain.set(id, prev); ctOf.set(id, prevCt); } else { plain.delete(id); ctOf.delete(id); } render(); throw e; }
  }

  /* ---------------- list ---------------- */
  $("newBtn").innerHTML = I.plus + "New"; $("fab").innerHTML = I.plus; $("lockBtn").innerHTML = IC.lockSmall; $("vsetBtn").innerHTML = I.gear;
  $("sIcon").outerHTML = I.search; $("qClear").innerHTML = I.close;
  const host = (u) => { try { return new URL(/^https?:\/\//i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
  const safeUrl = (u) => { if (!u) return ""; const full = /^https?:\/\//i.test(u) ? u : "https://" + u; try { const x = new URL(full); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch (e) { return ""; } };
  function analyse() {
    const uses = new Map();
    for (const [id, e] of plain) if (e.password) uses.set(e.password, (uses.get(e.password) || []).concat(id));
    const issues = new Map();
    for (const [id, e] of plain) {
      if (!e.password) continue;
      const list = [];
      if (uses.get(e.password).length > 1) list.push("Reused");
      if (strength(e.password).score <= 1) list.push("Weak");
      if (list.length) issues.set(id, list);
    }
    return { uses, issues };
  }
  [["all", "All"], ["fav", "Favourites"], ["issues", "Check"]].forEach(([k, l]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "fkey"; b.dataset.f = k; b.innerHTML = "<span></span><small></small>"; b.firstChild.textContent = l;
    b.addEventListener("click", () => { filter = k; render(true); }); $("filters").appendChild(b);
  });
  $("q").addEventListener("input", () => { query = $("q").value.trim().toLowerCase(); $("qClear").hidden = !query; render(true); });
  $("qClear").addEventListener("click", () => { $("q").value = ""; query = ""; $("qClear").hidden = true; render(true); });
  let shownCount = -1;
  function render(anim) {
    if (!vaultKey) return;
    const { issues } = analyse();
    const all = [...plain.entries()];
    const list = all.filter(([id, e]) => (filter === "all" || (filter === "fav" && e.fav) || (filter === "issues" && issues.has(id))) &&
      (!query || [e.title, e.username, e.url].join(" ").toLowerCase().includes(query)))
      .sort((a, b) => (b[1].fav - a[1].fav) || a[1].title.localeCompare(b[1].title, undefined, { sensitivity: "base" }));
    document.querySelectorAll(".fkey").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.f === filter);
      const n = b.dataset.f === "all" ? all.length : b.dataset.f === "fav" ? all.filter(([, e]) => e.fav).length : issues.size;
      b.querySelector("small").textContent = n || "";
    });
    if (all.length !== shownCount) { shownCount = all.length; E.rollTitle($("title"), "Vault", all.length ? String(all.length) : ""); }
    // issues band
    const band = $("issues");
    if (issues.size && filter !== "issues") {
      const reused = [...issues.values()].filter((x) => x.includes("Reused")).length, weak = [...issues.values()].filter((x) => x.includes("Weak")).length;
      band.hidden = false; band.innerHTML = IC.shield + "<span><b></b><small></small></span><span class=\"go\">Review</span>";
      band.querySelector("b").textContent = issues.size + (issues.size === 1 ? " password needs attention" : " passwords need attention");
      band.querySelector("small").textContent = [reused ? reused + " reused" : "", weak ? weak + " weak" : ""].filter(Boolean).join(" · ");
      band.onclick = () => { filter = "issues"; render(true); };
      band.setAttribute("role", "button"); band.tabIndex = 0;
    } else band.hidden = true;
    if (bad) { band.hidden = false; band.onclick = null; band.innerHTML = IC.shield + "<span><b>" + bad + (bad === 1 ? " entry" : " entries") + " couldn't be unlocked</b><small>They may have been changed outside your vault.</small></span>"; }
    const sig = JSON.stringify([filter, query, list.map(([id]) => id + ctOf.get(id)), [...issues.keys()]]);
    const animate = anim || firstPaint; if (sig === lastSig && !animate) return; lastSig = sig; firstPaint = false;
    const rows = $("rows"); rows.textContent = ""; rows.classList.toggle("quiet", !animate);
    list.forEach(([id, e], i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "row"; b.style.setProperty("--i", Math.min(i, 14));
      b.innerHTML = '<span class="mono-key"></span><span class="nm"><b><span></span></b><small></small></span><span></span>';
      const k = b.querySelector(".mono-key"); k.textContent = (e.title || "?").trim().charAt(0) || "?"; k.style.setProperty("--c", TAGS[e.tag] || TAGS.slate); if (e.tag === "ash") k.classList.add("ash");
      b.querySelector(".nm b span").textContent = e.title; if (e.fav) b.querySelector(".nm b").insertAdjacentHTML("beforeend", IC.star);
      b.querySelector(".nm small").textContent = e.username || host(e.url) || "No username";
      const iss = issues.get(id); if (iss) { const f = b.lastChild; f.className = "flag"; f.textContent = iss[0]; }
      b.setAttribute("aria-label", e.title + (e.username ? ", " + e.username : "") + (iss ? ", " + iss.join(" and ").toLowerCase() + " password" : ""));
      b.addEventListener("click", () => openDetail(id));
      rows.appendChild(b);
    });
    rows.parentElement.hidden = !list.length;
    const em = $("empty"); em.hidden = !!list.length;
    if (!list.length) em.innerHTML = !all.length ? "<b>Your vault is empty</b>Tap + to save your first password." : filter === "issues" && !query ? "<b>All good</b>No weak or reused passwords." : filter === "fav" && !query ? "<b>No favourites yet</b>Turn on Favourite when you edit one." : "<b>No matches</b>Try a different search.";
  }

  /* ---------------- copy ---------------- */
  let clipT = null;
  async function copy(text, what) {
    touch();
    try { await navigator.clipboard.writeText(text); }
    catch (e) { E.toast("Couldn't copy here. Tap Show, then press and hold to copy."); return; }
    if (what === "Password" && !isIOS) {
      E.toast("Password copied. Clears in 30 seconds.");
      clearTimeout(clipT); clipT = setTimeout(() => { navigator.clipboard.writeText("").catch(() => {}); }, 30000);
    } else E.toast(what + " copied");
  }

  /* ---------------- detail ---------------- */
  const dt = E.sheet($("dtScrim"), $("dtSheet"), { onClose: () => { $("dtPw").textContent = ""; } });
  let dtId = null, dtShown = false;
  $("dtShow").innerHTML = IC.eye;
  const DOTS = "••••••••••••";
  function openDetail(id) {
    const e = plain.get(id); if (!e) return; dtId = id; dtShown = false;
    const k = $("dtKey"); k.textContent = (e.title || "?").charAt(0); k.style.setProperty("--c", TAGS[e.tag] || TAGS.slate); k.classList.toggle("ash", e.tag === "ash");
    $("dtTitle").textContent = e.title;
    const u = safeUrl(e.url), a = $("dtUrl"); a.textContent = u ? host(u) : ""; if (u) a.href = u; else a.removeAttribute("href");
    const us = $("dtUser"); us.textContent = e.username || "No username"; us.classList.toggle("empty", !e.username); $("dtCopyUser").hidden = !e.username;
    paintPw(e);
    $("dtCopyPw").hidden = !e.password; $("dtShow").hidden = !e.password; $("dtMeter").hidden = !e.password;
    paintMeter("dtBar", "dtLbl", e.password);
    const { uses } = analyse(), w = $("dtWarn"), msgs = [];
    if (e.password) {
      const others = (uses.get(e.password) || []).filter((x) => x !== id).map((x) => plain.get(x).title);
      if (others.length) msgs.push("Also used for " + others.slice(0, 3).join(", ") + (others.length > 3 ? " and " + (others.length - 3) + " more" : "") + ". If one leaks, they all do.");
      if (strength(e.password).score <= 1) msgs.push("Easy to guess. Tap Edit, then Generate for a strong one.");
    }
    w.hidden = !msgs.length; w.textContent = msgs.join(" ");
    const n = $("dtNotes"); n.hidden = !e.notes; n.textContent = e.notes || "";
    const d = new Date(e.pwChanged || e.updated || e.created);
    $("dtMeta").textContent = "Password last changed " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
    const del = $("dtDel"); del.classList.remove("armed"); del.textContent = "Delete";
    dt.open();
  }
  function paintPw(e) {
    const p = $("dtPw"); p.classList.toggle("empty", !e.password);
    p.textContent = !e.password ? "No password saved" : dtShown ? e.password : DOTS;
    $("dtShow").innerHTML = dtShown ? IC.eyeOff : IC.eye; $("dtShow").setAttribute("aria-label", dtShown ? "Hide password" : "Show password");
  }
  $("dtShow").addEventListener("click", () => { dtShown = !dtShown; paintPw(plain.get(dtId)); touch(); });
  $("dtCopyUser").addEventListener("click", () => copy(plain.get(dtId).username, "Username"));
  $("dtCopyPw").addEventListener("click", () => copy(plain.get(dtId).password, "Password"));
  $("dtClose").addEventListener("click", () => dt.close());
  $("dtEdit").addEventListener("click", () => { const id = dtId; dt.close(); setTimeout(() => openEditor(id), 230); });
  $("dtDel").addEventListener("click", async () => {
    const d = $("dtDel"); if (!d.classList.contains("armed")) { d.classList.add("armed"); d.textContent = "Tap again to delete"; return; }
    const id = dtId; dt.close();
    try { await E.remove("vault", id); plain.delete(id); ctOf.delete(id); render(true); E.toast("Deleted"); } catch (e) {}
  });

  /* ---------------- editor ---------------- */
  const ed = E.sheet($("edScrim"), $("edSheet"), { focus: $("edTitle"), onClose: () => { $("edPw").value = ""; $("genOut").textContent = ""; } });
  let edId = null, edTag = "slate", edFav = false;
  $("edShow").innerHTML = IC.eye;
  Object.keys(TAGS).forEach((k) => { const b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.dataset.k = k; b.style.setProperty("--c", TAGS[k]); b.setAttribute("aria-label", k + " colour"); b.addEventListener("click", () => { edTag = k; paintSw(); }); $("edSw").appendChild(b); });
  const paintSw = () => $("edSw").querySelectorAll(".sw").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === edTag));
  function setPwVisible(v) { $("edPw").type = v ? "text" : "password"; $("edShow").innerHTML = v ? IC.eyeOff : IC.eye; $("edShow").setAttribute("aria-label", v ? "Hide password" : "Show password"); }
  $("edShow").addEventListener("click", () => setPwVisible($("edPw").type === "password"));
  $("edPw").addEventListener("input", () => paintMeter("edBar", "edLbl", $("edPw").value));
  $("edFav").addEventListener("click", () => { edFav = !edFav; $("edFav").setAttribute("aria-checked", edFav); });
  function openEditor(id) {
    const e = id ? plain.get(id) : null; edId = id || null;
    $("edH").textContent = e ? "Edit" : "New password";
    $("edTitle").value = e ? e.title : ""; $("edUrl").value = e ? e.url : ""; $("edUser").value = e ? e.username : "";
    $("edPw").value = e ? e.password : ""; $("edNotes").value = e ? e.notes : "";
    edTag = e ? e.tag || "slate" : "slate"; paintSw(); edFav = e ? !!e.fav : false; $("edFav").setAttribute("aria-checked", edFav);
    setPwVisible(false); paintMeter("edBar", "edLbl", $("edPw").value); $("edErr").hidden = true;
    $("genWrap").classList.remove("open"); $("edGenBtn").setAttribute("aria-expanded", "false");
    ed.open();
  }
  // generator
  const genOpts = Object.assign({ len: 20, upper: true, digits: true, symbols: true, plain: false }, LS.get("ember-vault-gen", {}));
  [["upper", "Uppercase"], ["digits", "Numbers"], ["symbols", "Symbols"], ["plain", "No look-alikes"]].forEach(([k, l]) => {
    const b = document.createElement("button"); b.type = "button"; b.dataset.k = k; b.textContent = l;
    b.addEventListener("click", () => { genOpts[k] = !genOpts[k]; LS.set("ember-vault-gen", genOpts); paintGen(); newGen(); }); $("genOpts").appendChild(b);
  });
  const paintGen = () => { $("genOpts").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", !!genOpts[b.dataset.k])); $("genLen").value = genOpts.len; $("genLenV").textContent = genOpts.len; };
  let genVal = "";
  function newGen() {
    genVal = generate(genOpts);
    const out = $("genOut"); out.textContent = "";
    for (const c of genVal) { const s = document.createElement("span"); if (/\d/.test(c)) s.className = "d"; else if (/[^A-Za-z]/.test(c)) s.className = "s"; s.textContent = c; out.appendChild(s); }
  }
  $("genLen").addEventListener("input", () => { genOpts.len = Number($("genLen").value); $("genLenV").textContent = genOpts.len; LS.set("ember-vault-gen", genOpts); newGen(); });
  $("edGenBtn").addEventListener("click", () => {
    const w = $("genWrap"), open = !w.classList.contains("open");
    w.classList.toggle("open", open); $("edGenBtn").setAttribute("aria-expanded", open);
    if (open) { paintGen(); newGen(); }
  });
  $("genAgain").addEventListener("click", newGen);
  $("genUse").addEventListener("click", () => { $("edPw").value = genVal; setPwVisible(true); paintMeter("edBar", "edLbl", genVal); $("genWrap").classList.remove("open"); $("edGenBtn").setAttribute("aria-expanded", "false"); });
  $("edCancel").addEventListener("click", () => ed.close());
  $("edSheet").addEventListener("submit", async (ev) => {
    ev.preventDefault(); touch();
    const url = $("edUrl").value.trim(), title = $("edTitle").value.trim() || host(url);
    if (!title) { const er = $("edErr"); er.textContent = "Give it a name or a website."; er.hidden = true; void er.offsetWidth; er.hidden = false; return; }
    const prev = edId ? plain.get(edId) : null, now = Date.now(), pw = $("edPw").value;
    const item = { title, url, username: $("edUser").value.trim(), password: pw, notes: $("edNotes").value, tag: edTag, fav: edFav,
      created: prev ? prev.created : now, updated: now, pwChanged: prev && prev.password === pw ? prev.pwChanged || prev.created : now };
    const id = edId || newId();
    const btn = $("edSave"); btn.disabled = true;
    try { await saveEntry(id, item); ed.close(); render(true); E.toast(prev ? "Saved" : "Saved to your vault"); }
    catch (e) { const er = $("edErr"); er.textContent = "Couldn't save. Check your connection and try again."; er.hidden = false; }
    finally { btn.disabled = false; }
  });

  /* ---------------- vault settings ---------------- */
  const vs = E.sheet($("vsScrim"), $("vsSheet"));
  $("vsLockIco").innerHTML = IC.clock; $("vsKeyIco").innerHTML = IC.key; $("vsGearIco").innerHTML = I.gear;
  [1, 5, 15, 60].forEach((m) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "radio"); b.dataset.m = m; b.innerHTML = (m === 60 ? "1" : m) + "<small>" + (m === 60 ? "hour" : "min") + "</small>";
    b.addEventListener("click", () => { LS.set("ember-vault-lock", m); paintLock(); paintLockIn(); }); $("vsLock").appendChild(b); });
  $("vsLock").style.gridTemplateColumns = "repeat(4,minmax(0,1fr))";
  const paintLock = () => $("vsLock").querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", Number(b.dataset.m) === autoLockMin()));
  function openVs() {
    paintLock();
    const d = new Date((meta && (meta.changed || meta.created)) || Date.now());
    $("vsChanged").textContent = "Last set " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
    $("cmWrap").classList.remove("open"); $("cmToggle").hidden = false; ["cmOld", "cmNew", "cmNew2"].forEach((x) => ($(x).value = "")); $("cmErr").hidden = true; paintMeter("cmBar", "cmLbl", "");
    vs.open();
  }
  $("vsetBtn").addEventListener("click", openVs);
  $("vsClose").addEventListener("click", () => vs.close());
  $("vsEmber").addEventListener("click", () => { vs.close(); setTimeout(E.openSettings, 230); });
  $("cmToggle").addEventListener("click", () => { $("cmWrap").classList.add("open"); $("cmToggle").hidden = true; setTimeout(() => $("cmOld").focus(), 300); });
  $("cmNew").addEventListener("input", () => paintMeter("cmBar", "cmLbl", $("cmNew").value));
  $("cmForm").addEventListener("submit", async (e) => {
    e.preventDefault(); touch();
    const err = (m) => { const x = $("cmErr"); x.textContent = m; x.hidden = true; void x.offsetWidth; x.hidden = false; };
    const old = $("cmOld").value, nw = $("cmNew").value;
    if (nw.length < 10) return err("Use at least 10 characters.");
    if (strength(nw).score < 2) return err("That's too easy to guess.");
    if (nw !== $("cmNew2").value) return err("The new passwords don't match.");
    if (nw === old) return err("That's the same as your current one.");
    const b = $("cmGo"); b.disabled = true; b.textContent = "Changing…";
    try {
      let raw;
      try { raw = await unwrapRaw(old, meta); } catch (x) { err("Your current master password isn't right."); return; }
      const m = Object.assign(await wrapRaw(nw, raw), { created: meta.created || Date.now() }); raw.fill(0);
      await E.save("vaultmeta", "main", m);
      ["cmOld", "cmNew", "cmNew2"].forEach((x) => ($(x).value = ""));
      vs.close(); E.toast("Master password changed. Use the new one everywhere.");
    } catch (x) { err("Couldn't save the change. Check your connection and try again."); }
    finally { b.disabled = false; b.textContent = "Change master password"; }
  });

  /* ---------------- forgot / erase ---------------- */
  const er = E.sheet($("erScrim"), $("erSheet"), { focus: $("erType") });
  $("forgot").addEventListener("click", () => { $("erType").value = ""; $("erGo").disabled = true; er.open(); });
  $("erType").addEventListener("input", () => { $("erGo").disabled = $("erType").value.trim() !== "ERASE"; });
  $("erCancel").addEventListener("click", () => er.close());
  $("erSheet").addEventListener("submit", async (e) => {
    e.preventDefault(); if ($("erType").value.trim() !== "ERASE") return;
    $("erGo").disabled = true; $("erGo").textContent = "Erasing…";
    try {
      for (const id of Object.keys(encItems)) await E.remove("vault", id);
      await E.remove("vaultmeta", "main");
      er.close(); E.toast("Vault erased. Create a new master password.");
    } catch (x) { E.toast("Couldn't erase everything. Check your connection and try again."); }
    finally { $("erGo").textContent = "Erase vault"; }
  });

  /* ---------------- auto-lock + privacy ---------------- */
  let lastActive = Date.now(), hiddenAt = 0;
  function touch() { lastActive = Date.now(); }
  ["pointerdown", "keydown", "input", "scroll"].forEach((t) => document.addEventListener(t, touch, { passive: true, capture: true }));
  function paintLockIn() { const m = autoLockMin(); $("lockIn").textContent = " · Locks after " + (m === 60 ? "1 hour" : m + " min"); }
  paintLockIn();
  setInterval(() => { if (vaultKey && Date.now() - lastActive > autoLockMin() * 60000) lockNow("Locked after " + (autoLockMin() === 60 ? "an hour" : autoLockMin() + " min") + " without use."); }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); $("veil").hidden = !vaultKey; }
    else { $("veil").hidden = true; if (vaultKey && hiddenAt && Date.now() - hiddenAt > 60000) lockNow("Locked while you were away."); hiddenAt = 0; }
  });
  window.addEventListener("pagehide", () => { if (vaultKey) $("veil").hidden = false; });
  window.addEventListener("pageshow", () => { $("veil").hidden = true; });
  $("lockBtn").addEventListener("click", () => lockNow("Locked."));
  $("newBtn").addEventListener("click", () => openEditor(null));
  $("fab").addEventListener("click", () => openEditor(null));
  document.addEventListener("keydown", (e) => {
    if (!vaultKey || dt.isOpen || ed.isOpen || vs.isOpen || /INPUT|TEXTAREA/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey) return;
    if (e.key === "/") { e.preventDefault(); $("q").focus(); } else if (e.key === "n") { e.preventDefault(); openEditor(null); }
  });

  /* ---------------- start ---------------- */
  E.start({
    id: "vault", name: "Vault", collections: ["vaultmeta", "vault"], push: false,
    async onData(coll, items, why) {
      if (why === "signout") { metaKnown = false; meta = null; encItems = {}; lockNow(); return; }
      if (coll === "vaultmeta") {
        const had = !!meta; meta = items.main || null;
        if (why !== "cache" || meta) metaKnown = true;
        if (had && !meta && vaultKey) lockNow("This vault was erased on another device.");
      } else {
        encItems = items;
        if (vaultKey) { await decryptAll(); render(why === "sync" && firstPaint); }
      }
      refreshLock();
    },
  });
  refreshLock();
})();
