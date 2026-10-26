(() => {
  "use strict";
  const GS = "\u001d";
  const $ = (id) => document.getElementById(id);
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isDesktop = matchMedia("(hover: hover) and (pointer: fine)").matches && !isIOS;

  function plural(n, forms) {
    const a = n % 10, b = n % 100;
    return n + " " + (a === 1 && b !== 11 ? forms[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? forms[1] : forms[2]);
  }
  const CODES = ["код", "кода", "кодов"];
  const fmtDateTime = (ts) => new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ---------- GS1 element strings ----------
  // [AI pattern, AI length, fixed value length or 0, max length for variable, numeric, label]
  const AI_TABLE = [
    [/^00/, 2, 18, 0, true, "SSCC"],
    [/^01/, 2, 14, 0, true, "GTIN"],
    [/^0[23]/, 2, 14, 0, true, "GTIN вложения"],
    [/^10/, 2, 0, 20, false, "Партия"],
    [/^11/, 2, 6, 0, true, "Дата производства"],
    [/^13/, 2, 6, 0, true, "Дата упаковки"],
    [/^15/, 2, 6, 0, true, "Лучше до"],
    [/^16/, 2, 6, 0, true, "Продать до"],
    [/^17/, 2, 6, 0, true, "Годен до"],
    [/^20/, 2, 2, 0, true, "Вариант"],
    [/^21/, 2, 0, 20, false, "Серийный номер"],
    [/^22/, 2, 0, 20, false, "Вариант продукта"],
    [/^24[01]/, 3, 0, 30, false, "Доп. идентификатор"],
    [/^30/, 2, 0, 8, true, "Количество"],
    [/^3[1-6]\d\d/, 4, 6, 0, true, "Мера"],
    [/^37/, 2, 0, 8, true, "Количество"],
    [/^39[02]\d/, 4, 0, 15, true, "Сумма"],
    [/^39[13]\d/, 4, 0, 18, true, "Сумма"],
    [/^41[0-7]/, 3, 13, 0, true, "GLN"],
    [/^7003/, 4, 10, 0, true, "Годен до (дата и время)"],
    [/^8005/, 4, 6, 0, true, "Цена"],
    [/^8008/, 4, 0, 12, true, "Время производства"],
    [/^90/, 2, 0, 30, false, "Внутренние данные"],
    [/^91/, 2, 0, 90, false, "Ключ проверки"],
    [/^9[23]/, 2, 0, 90, false, "Код проверки"],
    [/^9[4-9]/, 2, 0, 90, false, "Внутренние данные"],
  ];
  function gtinValid(g) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += +g[12 - i] * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === +g[13];
  }
  const parseCache = new Map();
  function parseGS1(raw) {
    if (parseCache.has(raw)) return parseCache.get(raw);
    const s = raw;
    const fields = [];
    let problem = "";
    let i = 0;
    while (i < s.length) {
      if (s[i] === GS) { i++; continue; }
      const rest = s.slice(i);
      const spec = AI_TABLE.find((t) => t[0].test(rest));
      if (!spec) { problem = "Не удалось разобрать фрагмент «" + rest.slice(0, 10).replace(/\u001d/g, "<GS>") + "»"; break; }
      const [, aiLen, fixed, max, numeric, label] = spec;
      const ai = s.substr(i, aiLen);
      i += aiLen;
      let value;
      if (fixed) {
        value = s.substr(i, fixed);
        i += fixed;
        if (value.length < fixed || value.includes(GS)) { problem = `Поле (${ai}) короче ${fixed} символов`; break; }
      } else {
        let j = s.indexOf(GS, i);
        if (j < 0) j = s.length;
        value = s.slice(i, j);
        i = j;
        if (value.length > max) problem = `Поле (${ai}) длиннее ${max} символов, возможно, пропущен разделитель GS`;
        else if (!value) problem = problem || `Поле (${ai}) пустое`;
      }
      if (numeric && !/^\d+$/.test(value)) problem = problem || `В поле (${ai}) должны быть только цифры`;
      fields.push({ ai, value, label });
    }
    const gtin = fields.find((f) => f.ai === "01");
    if (gtin && /^\d{14}$/.test(gtin.value) && !gtinValid(gtin.value)) problem = problem || "Неверная контрольная цифра GTIN";
    const out = { fields, problem };
    parseCache.set(raw, out);
    return out;
  }
  const looksGS1 = (raw) => /^01\d{14}/.test(raw) || /^00\d{18}/.test(raw);
  function info(c) {
    if (!c.gs1) return { fields: [], problem: "", plain: true };
    return parseGS1(c.raw);
  }
  const field = (inf, ai) => (inf.fields.find((f) => f.ai === ai) || {}).value || "";
  function ki(c) {
    const inf = info(c);
    const g = field(inf, "01"), s = field(inf, "21");
    return g && s ? "01" + g + "21" + s : "";
  }
  function format(c, mode) {
    if (mode === "tag") return c.raw.split(GS).join("<GS>");
    if (mode === "esc") return c.raw.split(GS).join("\\u001d");
    if (mode === "ki") return ki(c) || c.raw.split(GS)[0];
    return c.raw;
  }
  function yymmdd(v) { return /^\d{6}$/.test(v) ? (v.slice(4) === "00" ? "" : v.slice(4) + ".") + v.slice(2, 4) + ".20" + v.slice(0, 2) : v; }
  function normalize(text) {
    return String(text).replace(/^\]d2/, "").replace(/^[\u001dè]+/, "").replace(/[\r\n]+$/, "");
  }

  // ---------- State ----------
  const KEY = "dm-state-v2";
  function defaultName() {
    const d = new Date();
    return "Партия от " + d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  function makeBatch(name) { return { id: newId(), name, createdAt: Date.now(), codes: [] }; }
  const DEFAULT_SETTINGS = {
    gsMode: "raw", shareFormat: "xlsx", sound: true, vibrate: true, cameraId: null, zoom: null,
    orgName: "", mailTo: "", employee: "", lastBackupAt: 0,
  };
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.batches) && s.batches.length) return s;
    } catch (e) {}
    const st = { v: 2, currentId: null, batches: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
    let old = [];
    try { old = JSON.parse(localStorage.getItem("dm-codes-v1") || "[]") || []; } catch (e) {}
    try { const f = localStorage.getItem("dm-fmt"); if (["raw", "tag", "esc", "ki"].includes(f)) st.settings.gsMode = f; } catch (e) {}
    const b = makeBatch(old.length ? "Коды из прошлой версии" : defaultName());
    b.codes = old.filter((c) => c && c.raw).map((c) => ({ id: c.id || newId(), raw: normalize(c.raw), ts: c.ts || Date.now(), src: "photo", gs1: looksGS1(normalize(c.raw)) }));
    st.batches.push(b);
    st.currentId = b.id;
    return st;
  }
  let state = load();
  state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings);
  // Every code remembers who added it. Codes saved before that get the employee set at the time of the upgrade.
  state.batches.forEach((b) => b.codes.forEach((c) => { if (typeof c.emp !== "string") c.emp = state.settings.employee || ""; }));
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      $("saveError").hidden = true;
      $("scanError").hidden = true;
      return true;
    } catch (e) {
      $("saveError").hidden = false;
      $("scanError").hidden = false;
      return false;
    }
  }
  // The first version lives on the same origin and still reads dm-codes-v1, so it is copied, never removed.
  save();
  const current = () => state.batches.find((b) => b.id === state.currentId) || state.batches[0];

  // ---------- Organization ----------
  // This build is Компрессор ПК's own: the organization is fixed, only the
  // recipient address and the employee name are set on each device.
  const cleanText = (v, max) => String(v || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  function parseEmails(v) {
    return String(v || "")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]{2,}$/.test(s))
      .slice(0, 5);
  }
  state.settings.orgName = "ООО «Компрессор ПК»";

  // ---------- Activation ----------
  // The scanner works only on a phone that has a key issued for it. The app shows a
  // random device code; the administrator signs a key for that code with a private key
  // that never leaves their computer, and the app checks the signature with the public key below.
  const LICENSE = {
    app: "kpk",
    publicKey: { kty: "EC", crv: "P-256", x: "cnR-tT_sO_Y4l3hBggKmzGxJ5_zY8KspVMhxc5_jIh8", y: "MZNI0YhtHO9FFbt_3si-w2lyRHrlWxeVDWCGo7Ma-7Q" },
    // Device codes whose keys stop working once the phone gets this version, e.g. "K7F39QXA".
    // K7F39QXA, WMX7Q3KA, FMKPZJ88: test keys from development and the guide screenshots.
    revoked: ["K7F39QXA", "WMX7Q3KA", "FMKPZJ88"],
  };
  const DEVICE_KEY = "dm-device-v1", LICENSE_KEY = "dm-license-v1", SEEN_KEY = "dm-seen-v1";
  const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  // Kept apart from the batches, so a backup restored on another phone does not carry the device code.
  const DEVICE = (() => {
    const d = lsGet(DEVICE_KEY);
    if (d && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(d)) return d;
    const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => B32[x & 31]).join("");
    return lsSet(DEVICE_KEY, code) && lsGet(DEVICE_KEY) === code ? code : "";
  })();
  const deviceLabel = (d) => d.slice(0, 4) + "-" + d.slice(4);
  const fmtDate = (ts) => new Date(ts).toLocaleDateString("ru-RU");
  // Turning the phone's clock back does not stretch a key: time counts from the latest moment the app has seen.
  function clockNow() {
    const seen = +lsGet(SEEN_KEY) || 0;
    const now = Date.now();
    if (now > seen) lsSet(SEEN_KEY, String(now));
    return Math.max(now, seen);
  }
  function fromB64url(s) {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  }
  // The key is "payload.signature" somewhere inside the administrator's message.
  function findKey(text) {
    const re = /([A-Za-z0-9_-]{16,})\.([A-Za-z0-9_-]{86})(?![A-Za-z0-9_-])/;
    const t = String(text || "");
    const m = t.match(re) || t.replace(/\s+/g, "").match(re);
    return m ? m[1] + "." + m[2] : "";
  }
  async function checkKey(key) {
    if (!DEVICE) return { state: "nostorage" };
    if (!window.crypto || !crypto.subtle) return { state: "unsupported" };
    const [p, s] = key.split(".");
    let data;
    try {
      const pub = await crypto.subtle.importKey("jwk", LICENSE.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(s), new TextEncoder().encode(p));
      if (!ok) return { state: "invalid" };
      data = JSON.parse(new TextDecoder().decode(fromB64url(p)));
    } catch (e) {
      return { state: "invalid" };
    }
    if (!data || data.a !== LICENSE.app || typeof data.d !== "string" || typeof data.n !== "string" || !/^\d{4}-\d\d-\d\d$/.test(data.e)) return { state: "invalid" };
    if (data.d !== DEVICE) return { state: "other", data };
    if (LICENSE.revoked.includes(data.d)) return { state: "revoked", data };
    const [y, m, d] = data.e.split("-").map(Number);
    const until = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    if (clockNow() > until) return { state: "expired", data, until };
    return { state: "ok", data, until };
  }
  let license = { state: "checking" };
  const licensed = () => license.state === "ok";
  const employeeName = () => (licensed() ? cleanText(license.data.n, 80) : state.settings.employee);

  // GS1 codes are the same item when GTIN and serial match, with or without the crypto tail.
  function codeKey(c) { return (c.gs1 && ki(c)) || c.raw; }
  let freshId = null;
  function addCode(text, src, gs1Flag, batchId) {
    const raw = normalize(text);
    if (!raw.trim()) return { status: "empty" };
    const b = batchId ? state.batches.find((x) => x.id === batchId) : current();
    if (!b) return { status: "nobatch" };
    const item = { id: newId(), raw, ts: Date.now(), src, gs1: gs1Flag === true || looksGS1(raw), emp: employeeName() };
    const key = codeKey(item);
    const idx = b.codes.findIndex((c) => c.raw === raw || codeKey(c) === key);
    if (idx >= 0) {
      const old = b.codes[idx];
      // A fuller reading (with the crypto tail) replaces the shorter one already in the batch.
      if (raw.length > old.raw.length) {
        old.raw = raw;
        old.gs1 = old.gs1 || item.gs1;
        return { status: "dup", index: idx + 1, item: old, upgraded: true, saved: save() };
      }
      return { status: "dup", index: idx + 1, item: old };
    }
    b.codes.push(item);
    freshId = item.id;
    const saved = save();
    const other = state.batches.find((o) => o !== b && o.codes.some((c) => codeKey(c) === key));
    return { status: "added", item, saved, other: other ? other.name : "" };
  }

  // ---------- Status, toast ----------
  function setStatus(text, kind) {
    const el = $("status");
    el.textContent = text;
    el.className = "status" + (kind ? " " + kind : "");
  }
  let toastTimer = null;
  function toast(text, actionLabel, action, ms) {
    $("toastText").textContent = text;
    const btn = $("toastAction");
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel || "";
    btn.onclick = () => { $("toast").hidden = true; action && action(); };
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), ms || 5000);
  }

  // ---------- Rendering ----------
  let pageSize = 200;
  function rawNode(raw) {
    const frag = document.createDocumentFragment();
    raw.split(GS).forEach((part, i) => {
      if (i) {
        const g = document.createElement("span");
        g.className = "gs";
        g.textContent = "GS";
        g.title = "Разделитель GS (символ 29)";
        frag.appendChild(g);
      }
      frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }
  function renderBatches() {
    const sel = $("batchSelect");
    sel.textContent = "";
    state.batches.slice().sort((a, b) => b.createdAt - a.createdAt).forEach((b) => {
      const o = document.createElement("option");
      o.value = b.id;
      o.textContent = `${b.name} (${b.codes.length})`;
      sel.appendChild(o);
    });
    sel.value = current().id;
  }
  function renderStats() {
    const b = current();
    const gtins = new Set();
    let issues = 0;
    b.codes.forEach((c) => {
      const inf = info(c);
      const g = field(inf, "01");
      if (g) gtins.add(g);
      if (inf.problem) issues++;
    });
    const el = $("stats");
    el.textContent = "";
    const total = document.createElement("b");
    total.textContent = plural(b.codes.length, CODES) + " · " + gtins.size + " GTIN";
    el.appendChild(total);
    if (issues) {
      const w = document.createElement("span");
      w.className = "warn";
      w.textContent = "с замечаниями: " + issues;
      el.appendChild(w);
    }
    $("batchCreated").textContent = "Создана " + fmtDateTime(b.createdAt);
    const empty = b.codes.length === 0;
    ["shareBtn", "xlsxBtn", "csvBtn", "txtBtn", "copyBtn"].forEach((id) => ($(id).disabled = empty));
    $("scanTitle").textContent = b.name;
    $("scanCount").firstChild.textContent = plural(b.codes.length, CODES);
  }
  const SRC = { camera: "камера", photo: "фото", manual: "введён вручную" };
  const fmtFull = (ts) => new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  function mark(text, kind) {
    const m = document.createElement("span");
    m.className = "mark" + (kind ? " " + kind : "");
    m.textContent = text;
    return m;
  }
  // A code is one line: number, GTIN and serial, time. Everything else opens inside the row.
  const openRows = new Set();
  function codeRow(c, n) {
    const li = document.createElement("li");
    if (c.id === freshId) {
      li.className = "fresh";
      setTimeout(() => li.classList.remove("fresh"), 50);
    }
    const inf = info(c);
    const d = document.createElement("details");
    d.className = "code";
    const sum = document.createElement("summary");
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = n;
    const main = document.createElement("span");
    main.className = "main";
    const id = document.createElement("span");
    id.className = "id";
    const g = field(inf, "01"), s = field(inf, "21");
    id.textContent = g ? g + (s ? " · " + s : "") : c.raw.replace(/\u001d/g, " ");
    main.appendChild(id);
    if (c.src === "manual" || inf.problem) {
      const marks = document.createElement("span");
      marks.className = "marks";
      if (c.src === "manual") marks.appendChild(mark("вручную"));
      if (inf.problem) marks.appendChild(mark("замечание", "warn"));
      main.appendChild(marks);
    }
    const side = document.createElement("span");
    side.className = "side";
    side.append(new Date(c.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
    const peek = document.createElement("span");
    peek.className = "peek";
    peek.appendChild(rawNode(c.raw));
    sum.append(num, main, side, peek);
    d.appendChild(sum);
    const fill = () => { if (!d.querySelector(".code-body")) d.appendChild(codeBody(c, n, inf)); };
    if (openRows.has(c.id)) { d.open = true; fill(); }
    d.addEventListener("toggle", () => {
      if (d.open) { openRows.add(c.id); fill(); } else openRows.delete(c.id);
    });
    li.appendChild(d);
    return li;
  }
  function codeBody(c, n, inf) {
    const body = document.createElement("div");
    body.className = "code-body";
    if (inf.fields.length) {
      const dl = document.createElement("dl");
      inf.fields.forEach((f) => {
        const dt = document.createElement("dt");
        dt.textContent = `${f.label} (${f.ai})`;
        const dd = document.createElement("dd");
        dd.textContent = /^1[1-7]$/.test(f.ai) ? yymmdd(f.value) : f.value;
        dl.append(dt, dd);
      });
      body.appendChild(dl);
    } else {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "DataMatrix без структуры GS1";
      body.appendChild(p);
    }
    if (inf.problem) {
      const p = document.createElement("p");
      p.className = "hint warn";
      p.textContent = "Замечание: " + inf.problem;
      body.appendChild(p);
    }
    const raw = document.createElement("div");
    raw.className = "raw";
    raw.appendChild(rawNode(c.raw));
    const meta = document.createElement("p");
    meta.className = "hint";
    meta.textContent = [SRC[c.src] || c.src, fmtFull(c.ts), c.emp].filter(Boolean).join(" · ");
    const btns = document.createElement("div");
    btns.className = "inline-form";
    const cp = document.createElement("button");
    cp.type = "button";
    cp.className = "btn small";
    cp.textContent = "Копировать";
    cp.setAttribute("aria-label", "Копировать код " + n);
    cp.onclick = () => copyText(format(c, state.settings.gsMode), cp);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn small danger";
    del.textContent = "Удалить";
    del.setAttribute("aria-label", "Удалить код " + n);
    del.onclick = () => removeCode(c.id);
    btns.append(cp, del);
    body.append(raw, meta, btns);
    return body;
  }
  const RECENT = 3;
  function renderList() {
    const b = current();
    const list = $("list");
    list.textContent = "";
    const n = b.codes.length;
    for (let i = n - 1; i >= Math.max(0, n - RECENT); i--) list.appendChild(codeRow(b.codes[i], i + 1));
    $("empty").hidden = n > 0;
    $("allWrap").hidden = n === 0;
    $("allBtn").textContent = `Все коды партии (${n})`;
    if (!$("allView").hidden) renderAll();
  }
  // Full list: search, codes with remarks only, and raw strings shown for every row at once.
  function renderAll() {
    const b = current();
    const q = $("search").value.trim().toLowerCase().replace(/<gs>/g, "");
    const issuesOnly = $("onlyIssues").checked;
    const list = $("allList");
    list.textContent = "";
    list.classList.toggle("show-raw", $("showRaw").checked);
    const shown = [];
    for (let i = b.codes.length - 1; i >= 0; i--) {
      const c = b.codes[i];
      if (q && !c.raw.replace(/\u001d/g, "").toLowerCase().includes(q)) continue;
      if (issuesOnly && !info(c).problem) continue;
      shown.push([c, i + 1]);
    }
    shown.slice(0, pageSize).forEach(([c, n]) => list.appendChild(codeRow(c, n)));
    $("allMeta").textContent = `${b.name} · ${plural(b.codes.length, CODES)}`;
    if (!shown.length) {
      const li = document.createElement("li");
      li.className = "none";
      li.textContent = b.codes.length ? "Ничего не найдено" : "В партии пока нет кодов";
      list.appendChild(li);
    }
    $("moreWrap").hidden = shown.length <= pageSize;
  }
  let homeScroll = 0;
  function showAll(on) {
    if (on === !$("allView").hidden) return;
    if (on) homeScroll = window.scrollY;
    $("homeView").hidden = on;
    $("allView").hidden = !on;
    if (on) {
      pageSize = 200;
      renderAll();
      window.scrollTo(0, 0);
    } else window.scrollTo(0, homeScroll);
  }
  function render() {
    renderBatches();
    renderStats();
    renderList();
    renderBackupInfo();
  }

  function removeCode(id) {
    const b = current();
    const i = b.codes.findIndex((c) => c.id === id);
    if (i < 0) return;
    const [item] = b.codes.splice(i, 1);
    save();
    render();
    toast("Код удалён", "Вернуть", () => {
      if (b.codes.some((c) => codeKey(c) === codeKey(item))) return;
      b.codes.splice(Math.min(i, b.codes.length), 0, item);
      save();
      render();
    });
  }

  // ---------- Batches ----------
  $("batchSelect").onchange = (e) => {
    state.currentId = e.target.value;
    pageSize = 200;
    $("search").value = "";
    save();
    render();
  };
  function openNameForm(value) {
    $("deleteConfirm").hidden = true;
    $("nameForm").hidden = false;
    $("nameInput").value = value;
    $("nameInput").focus();
    $("nameInput").select();
  }
  $("newBatchBtn").onclick = () => {
    const b = makeBatch(defaultName());
    state.batches.push(b);
    state.currentId = b.id;
    save();
    render();
    openNameForm(b.name);
    setStatus("Создана новая партия. Можно задать ей название.", "ok");
  };
  // Rare batch actions live behind the "⋯" button so they do not compete with scanning.
  function batchMenu(open) {
    $("batchMenu").hidden = !open;
    $("batchMenuBtn").setAttribute("aria-expanded", String(open));
  }
  $("batchMenuBtn").onclick = () => batchMenu($("batchMenu").hidden);
  $("renameBtn").onclick = () => { batchMenu(false); openNameForm(current().name); };
  $("nameCancel").onclick = () => ($("nameForm").hidden = true);
  $("nameForm").onsubmit = (e) => {
    e.preventDefault();
    const v = $("nameInput").value.trim();
    if (v) { current().name = v; save(); render(); }
    $("nameForm").hidden = true;
  };
  $("deleteBatchBtn").onclick = () => {
    batchMenu(false);
    $("nameForm").hidden = true;
    const b = current();
    $("deleteText").textContent = `Удалить партию «${b.name}» (${plural(b.codes.length, CODES)})?`;
    $("deleteConfirm").hidden = false;
  };
  $("deleteNo").onclick = () => ($("deleteConfirm").hidden = true);
  $("deleteYes").onclick = () => {
    $("deleteConfirm").hidden = true;
    const b = current();
    const pos = state.batches.indexOf(b);
    state.batches.splice(pos, 1);
    if (!state.batches.length) state.batches.push(makeBatch(defaultName()));
    state.currentId = state.batches.slice().sort((x, y) => y.createdAt - x.createdAt)[0].id;
    save();
    render();
    toast(`Партия «${b.name}» удалена`, "Вернуть", () => {
      state.batches.splice(pos, 0, b);
      state.currentId = b.id;
      save();
      render();
    }, 8000);
  };
  $("search").oninput = () => { pageSize = 200; renderAll(); };
  $("onlyIssues").onchange = () => { pageSize = 200; renderAll(); };
  $("showRaw").onchange = () => renderAll();
  $("moreBtn").onclick = () => { pageSize += 200; renderAll(); };
  // The full list is a step in history, so the phone's Back button returns to the main screen.
  $("allBtn").onclick = () => { history.pushState({ view: "all" }, ""); showAll(true); };
  $("allBack").onclick = () => (history.state && history.state.view === "all" ? history.back() : showAll(false));
  window.addEventListener("popstate", () => showAll(!!(history.state && history.state.view === "all")));
  if (history.state && history.state.view === "all") history.replaceState(null, "");

  // ---------- Decoder worker ----------
  let worker = null;
  let seq = 0;
  const pending = new Map();
  function failAll(msg) { pending.forEach((p) => p.reject(new Error(msg))); pending.clear(); }
  function call(msg, transfer) {
    return new Promise((resolve, reject) => {
      if (!worker) return reject(new Error("no worker"));
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage(Object.assign({ id }, msg), transfer || []);
    });
  }
  function decode(image, mode) {
    return call({ mode, image: { buffer: image.data.buffer, width: image.width, height: image.height } }, [image.data.buffer]);
  }
  // The page fetches the decoder (through the offline cache) and hands it to a
  // blob worker, so scanning works offline even where worker requests bypass the cache.
  const decoderReady = (async () => {
    const get = async (url, kind) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(url + " " + r.status);
      return r[kind]();
    };
    const [lib, code, wasm] = await Promise.all([
      get("vendor/zxing-reader.js", "text"),
      get("worker.js", "text"),
      get("zxing_reader.wasm", "arrayBuffer"),
    ]);
    worker = new Worker(URL.createObjectURL(new Blob([lib, "\n;\n", code], { type: "text/javascript" })));
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data);
    };
    worker.onerror = () => failAll("worker");
    await call({ wasm }, [wasm]);
  })();
  decoderReady
    .then(() => { decoderOk = true; showReady(); })
    .catch(() => setStatus(navigator.onLine
      ? "Распознаватель не загрузился. Обновите страницу."
      : "Нет интернета, а файлы для работы без него ещё не загружены. Откройте приложение один раз с интернетом.", "err"));

  // ---------- Photos ----------
  async function imageDataFromFile(file, maxSide) {
    let src;
    try {
      src = await createImageBitmap(file);
    } catch (e) {
      src = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = URL.createObjectURL(file);
      });
    }
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    const k = Math.min(1, maxSide / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * k);
    cv.height = Math.round(h * k);
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    if (src.close) src.close();
    return { data: ctx.getImageData(0, 0, cv.width, cv.height), big: Math.max(w, h) > maxSide };
  }
  let queue = [];
  let queueRunning = false;
  let queueStop = false;
  function queueProgress() {
    const done = queue.filter((q) => q.done).length;
    $("queueProgress").textContent = `Обработано ${done} из ${queue.length}`;
    $("queueStop").hidden = !queueRunning;
  }
  function addToQueue(files) {
    if (!licensed()) return;
    const imgs = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp|bmp|gif)$/i.test(f.name));
    if (!imgs.length) { setStatus("Это не изображения. Выберите фото с кодами.", "err"); return; }
    $("queueCard").hidden = false;
    // Photos go to the batch that was open when they were chosen, even if another one is opened meanwhile.
    const batchId = current().id;
    imgs.forEach((file) => {
      const li = document.createElement("li");
      const img = document.createElement("img");
      const url = URL.createObjectURL(file);
      img.src = url;
      img.alt = "";
      const mid = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = file.name || "Фото";
      const res = document.createElement("div");
      res.className = "res";
      res.textContent = "В очереди";
      mid.append(name, res);
      const act = document.createElement("div");
      li.append(img, mid, act);
      $("queue").appendChild(li);
      const item = { file, url, res, act, batchId, done: false, attempt: 0 };
      queue.push(item);
    });
    queueProgress();
    runQueue();
  }
  async function processItem(item) {
    item.res.className = "res";
    item.res.textContent = "Распознаю…";
    item.act.textContent = "";
    const sizes = item.attempt === 0 ? [2400, 4000] : [1200, 5000];
    let results = [];
    try {
      await decoderReady;
      for (const size of sizes) {
        const { data, big } = await imageDataFromFile(item.file, size);
        results = (await decode(data, "photo")).results;
        if (results.length || (!big && size > 2400)) break;
      }
    } catch (e) {
      item.res.className = "res err";
      item.res.textContent = "Ошибка обработки: файл не открылся";
      retryButton(item);
      return { added: 0, dup: 0, failed: 1 };
    }
    let added = 0, dup = 0, lost = 0, unsaved = 0;
    results.forEach((r) => {
      const res = addCode(r.text, "photo", r.gs1, item.batchId);
      if (res.status === "added") { added++; if (!res.saved) unsaved++; }
      else if (res.status === "dup") dup++;
      else if (res.status === "nobatch") lost++;
    });
    if (!results.length) {
      item.res.className = "res err";
      item.res.textContent = "Коды не найдены";
      retryButton(item);
      return { added, dup, failed: 1 };
    }
    if (lost) {
      item.res.className = "res err";
      item.res.textContent = `Найдено ${results.length}, но партия удалена: коды не добавлены`;
      return { added: 0, dup: 0, failed: 1 };
    }
    const target = state.batches.find((b) => b.id === item.batchId);
    const where = target && target.id !== current().id ? ` в партию «${target.name}»` : "";
    item.res.className = unsaved ? "res err" : added ? "res ok" : "res warn";
    item.res.textContent = added
      ? `Найдено ${results.length}: новых ${added}${where}` + (dup ? `, повторов ${dup}` : "") + (unsaved ? ". Не сохранено: нет места" : "")
      : `Найдено ${results.length}, все уже в партии`;
    return { added, dup, failed: 0 };
  }
  function retryButton(item) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn small";
    b.textContent = "Ещё раз";
    b.onclick = async () => {
      item.attempt++;
      const r = await processItem(item);
      render();
      if (r.added) setStatus(`Со второй попытки: добавлено ${plural(r.added, CODES)}.`, "ok");
      else if (r.failed) setStatus("Код не найден. Сфотографируйте его ближе, ровнее и без блика.", "err");
    };
    item.act.appendChild(b);
  }
  async function runQueue() {
    if (queueRunning) return;
    queueRunning = true;
    queueStop = false;
    let added = 0, dup = 0, failed = 0;
    queueProgress();
    for (const item of queue) {
      if (item.done) continue;
      if (queueStop) break;
      const r = await processItem(item);
      item.done = true;
      added += r.added; dup += r.dup; failed += r.failed;
      queueProgress();
      render();
    }
    queueRunning = false;
    queueProgress();
    const parts = [];
    parts.push(`Добавлено ${plural(added, CODES)}`);
    if (dup) parts.push(`повторов ${dup}`);
    if (failed) parts.push(`фото без кодов: ${failed}`);
    if (queueStop) parts.push("обработка остановлена");
    setStatus(parts.join(", ") + ".", added ? "ok" : failed ? "err" : "warn");
  }
  $("queueStop").onclick = () => { queueStop = true; };
  $("queueClear").onclick = () => {
    queueStop = true;
    queue.forEach((q) => URL.revokeObjectURL(q.url));
    queue = [];
    $("queue").textContent = "";
    $("queueCard").hidden = true;
  };
  $("photoBtn").onclick = () => $("photoInput").click();
  $("photoInput").onchange = (e) => { addToQueue(e.target.files); e.target.value = ""; };
  document.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    if (!licensed()) { e.preventDefault(); return; }
    e.preventDefault();
    addToQueue(e.dataTransfer.files);
  });

  // ---------- Paste ----------
  function pastedLines() {
    return $("pasteInput").value
      .split(/\r?\n/)
      .map((l) => l.replace(/<GS>|\{GS\}|\[GS\]|\\u001d|\\x1d/gi, GS).trim())
      .filter(Boolean)
      .map(normalize);
  }
  function pastePreview() {
    const lines = pastedLines();
    const b = current();
    const have = new Map(b.codes.map((c) => [codeKey(c), c]));
    const seen = new Set();
    let fresh = 0, dupBatch = 0, dupSelf = 0, fuller = 0;
    lines.forEach((l) => {
      const k = codeKey({ raw: l, gs1: looksGS1(l) });
      if (have.has(k)) { if (l.length > have.get(k).raw.length) fuller++; else dupBatch++; }
      else if (seen.has(k)) dupSelf++;
      else { fresh++; seen.add(k); }
    });
    const el = $("pastePreview");
    el.textContent = lines.length
      ? `Строк: ${lines.length}. Новых: ${fresh}` + (fuller ? `, дополнят код в партии криптохвостом: ${fuller}` : "") +
        (dupBatch ? `, уже в партии: ${dupBatch}` : "") + (dupSelf ? `, повторяются в тексте: ${dupSelf}` : "")
      : "";
    $("pasteAdd").disabled = fresh + fuller === 0;
  }
  $("pasteBtn").onclick = () => {
    const open = $("pastePanel").hidden;
    $("pastePanel").hidden = !open;
    $("pasteBtn").setAttribute("aria-expanded", String(open));
    if (open) { $("pasteInput").focus(); pastePreview(); }
  };
  $("pasteCancel").onclick = () => { $("pastePanel").hidden = true; $("pasteBtn").setAttribute("aria-expanded", "false"); };
  $("pasteInput").oninput = pastePreview;
  $("pasteAdd").onclick = () => {
    if (!licensed()) return;
    let added = 0, dup = 0, upgraded = 0, unsaved = 0;
    pastedLines().forEach((l) => {
      const r = addCode(l, "manual");
      if (r.status === "added") { added++; if (!r.saved) unsaved++; }
      else if (r.upgraded) { upgraded++; if (!r.saved) unsaved++; }
      else if (r.status === "dup") dup++;
    });
    render();
    $("pasteInput").value = "";
    pastePreview();
    if (unsaved) { setStatus(`Добавлено ${plural(added + upgraded, CODES)}, но браузер их не сохранил: нет места. Выгрузите партию.`, "err"); return; }
    const parts = [];
    if (added) parts.push(`Добавлено ${plural(added, CODES)}`);
    if (upgraded) parts.push(`${added ? "д" : "Д"}ополнено криптохвостом: ${upgraded}`);
    if (dup) parts.push(`пропущено повторов: ${dup}`);
    setStatus(added || upgraded ? parts.join(", ") + "." : "Все эти коды уже есть в партии.", added || upgraded ? "ok" : "warn");
  };

  // ---------- Export ----------
  // Organization and employee columns appear only when they are filled in.
  // The employee is the one who added each code, not whoever exports the batch later.
  function extraColumns(b) {
    const cols = [];
    if (state.settings.orgName) cols.push(["Организация", () => state.settings.orgName, 24]);
    if (b.codes.some((c) => c.emp)) cols.push(["Сотрудник", (c) => c.emp || "", 20]);
    return cols;
  }
  function tableRows(b) {
    const mode = state.settings.gsMode;
    const extra = extraColumns(b);
    const rows = [["№", "Код маркировки", "Код идентификации", "GTIN", "Серийный номер", "Партия (10)", "Годен до (17)", "Другие поля", "Замечания", "Источник", "Дата и время"].concat(extra.map((x) => x[0]))];
    b.codes.forEach((c, i) => {
      const inf = info(c);
      const other = inf.fields.filter((f) => !["01", "21", "10", "17"].includes(f.ai)).map((f) => `(${f.ai}) ${f.value}`).join(" ");
      rows.push([
        i + 1,
        format(c, mode),
        ki(c),
        field(inf, "01"),
        field(inf, "21"),
        field(inf, "10"),
        yymmdd(field(inf, "17")),
        other,
        inf.problem || (inf.plain ? "Без структуры GS1" : ""),
        SRC[c.src] || c.src,
        fmtDateTime(c.ts),
      ].concat(extra.map((x) => x[1](c))));
    });
    return rows;
  }
  const safeName = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  function baseName(b) {
    return (safeName(b.name) || "Коды DataMatrix").slice(0, 100);
  }
  function makeFile(kind) {
    const b = current();
    const name = baseName(b);
    if (kind === "xlsx") {
      const widths = [6, 60, 34, 16, 16, 14, 13, 30, 24, 14, 18].concat(extraColumns(b).map((x) => x[2]));
      const blob = window.XLSX_MINI.build(tableRows(b), { sheetName: "Коды", widths });
      return new File([blob], name + ".xlsx", { type: blob.type });
    }
    if (kind === "csv") {
      const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
      const text = "﻿" + tableRows(b).map((r) => r.map(q).join(";")).join("\r\n") + "\r\n";
      return new File([text], name + ".csv", { type: "text/csv" });
    }
    const text = b.codes.map((c) => format(c, state.settings.gsMode)).join("\n") + "\n";
    return new File([text], name + ".txt", { type: "text/plain" });
  }
  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $("xlsxBtn").onclick = () => { download(makeFile("xlsx")); setStatus("Файл Excel сохранён.", "ok"); };
  $("saveErrorExport").onclick = $("xlsxBtn").onclick;
  $("csvBtn").onclick = () => { download(makeFile("csv")); setStatus("Файл CSV сохранён.", "ok"); };
  $("txtBtn").onclick = () => { download(makeFile("txt")); setStatus("Файл TXT сохранён.", "ok"); };

  const canShareFiles = (() => {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "t.txt", { type: "text/plain" })] })); } catch (e) { return false; }
  })();
  // The share sheet cannot fill in a recipient and mailto cannot attach a file, so the labels say what really happens.
  function renderShareLabel() {
    const to = state.settings.mailTo;
    $("shareLabel").textContent = canShareFiles ? "Поделиться файлом" : "Отправить по почте";
    $("shareHint").textContent = canShareFiles
      ? "Откроется меню «Поделиться»: выберите почту или мессенджер." + (to ? ` Адрес ${to} скопируется, вставьте его в поле «Кому».` : "")
      : `Файл сохранится на устройстве, и откроется письмо${to ? " на " + to : ""}. Приложите файл к письму вручную.`;
  }
  function mailSubject(b) {
    return "Коды DataMatrix" + (state.settings.orgName ? " — " + state.settings.orgName : "") + ": " + b.name;
  }
  function mailIntro(b) {
    const s = state.settings;
    return (s.orgName ? `Организация: ${s.orgName}\n` : "") +
      (s.employee ? `Сотрудник: ${s.employee}\n` : "") +
      `Партия «${b.name}», ${plural(b.codes.length, CODES)}.`;
  }
  function mailFallback(file) {
    const b = current();
    download(file);
    let body = mailIntro(b) + `\nФайл «${file.name}» сохранён на устройстве: приложите его к письму.`;
    const list = b.codes.map((c) => format(c, state.settings.gsMode === "raw" ? "tag" : state.settings.gsMode)).join("\n");
    if (list.length < 1500) body += "\n\nКоды" + (state.settings.gsMode === "raw" ? " (разделитель GS записан как <GS>)" : "") + ":\n" + list;
    const to = parseEmails(state.settings.mailTo).map(encodeURIComponent).join(",");
    location.href = "mailto:" + to + "?subject=" + encodeURIComponent(mailSubject(b)) + "&body=" + encodeURIComponent(body);
    setStatus("Файл сохранён, открываю почтовую программу. Приложите файл к письму.", "ok");
  }
  $("shareBtn").onclick = () => {
    const file = makeFile(state.settings.shareFormat);
    const b = current();
    const to = state.settings.mailTo;
    if (canShareFiles && navigator.canShare({ files: [file] })) {
      // The share sheet cannot fill in the recipient, so the address goes to the clipboard.
      if (to && navigator.clipboard) navigator.clipboard.writeText(to).then(
        () => toast(`Адрес ${to} скопирован: вставьте его в поле «Кому»`, null, null, 8000),
        () => {}
      );
      navigator.share({ files: [file], title: mailSubject(b), text: mailIntro(b) })
        .catch((e) => { if (e && e.name !== "AbortError") mailFallback(file); });
    } else {
      mailFallback(file);
    }
  };

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) {}
      ta.remove();
      if (!ok) { setStatus("Браузер не разрешил копирование. Выгрузите TXT.", "err"); return; }
    }
    if (btn) {
      const old = btn.textContent;
      btn.textContent = "Скопировано";
      setTimeout(() => (btn.textContent = old), 1400);
    }
  }
  $("copyBtn").onclick = () => {
    const b = current();
    copyText(b.codes.map((c) => format(c, state.settings.gsMode)).join("\n"), $("copyBtn"));
  };

  // ---------- Settings ----------
  function syncSettingsUI() {
    const s = state.settings;
    $("gsMode").value = s.gsMode;
    $("shareFormat").value = s.shareFormat;
    $("optSound").checked = s.sound;
    $("optVibrate").checked = s.vibrate;
    $("mailTo").value = s.mailTo;
  }
  syncSettingsUI();
  $("gsMode").onchange = (e) => { state.settings.gsMode = e.target.value; save(); };
  $("shareFormat").onchange = (e) => { state.settings.shareFormat = e.target.value; save(); };
  $("optSound").onchange = (e) => { state.settings.sound = e.target.checked; save(); };
  $("optVibrate").onchange = (e) => { state.settings.vibrate = e.target.checked; save(); };
  // ---------- Sending: recipient and employee ----------
  function renderOrg() {
    const name = licensed() ? employeeName() : "";
    $("orgLine").hidden = !name;
    $("orgLine").textContent = name ? "Сотрудник: " + name : "";
    $("employeeInfo").textContent = name
      ? `Сотрудник: ${name} — ФИО задано ключом активации и попадает в выгрузку.`
      : "ФИО сотрудника появится после активации.";
    renderShareLabel();
  }
  $("mailTo").onchange = (e) => {
    const raw = e.target.value.trim();
    const list = parseEmails(raw);
    const typed = raw ? raw.split(/[\s,;]+/).filter(Boolean).length : 0;
    state.settings.mailTo = list.join(", ");
    e.target.value = state.settings.mailTo || raw;
    $("mailToNote").textContent = typed && !list.length
      ? "Адрес не распознан. Проверьте, что он записан как name@example.ru."
      : typed > list.length ? "Часть адресов не распознана и не сохранена." : "";
    save();
    renderOrg();
  };

  // ---------- Activation screen ----------
  // Without a valid key scanning, photos and pasting are closed; batches, export and backup stay open,
  // so codes collected earlier can always be taken out.
  const LICENSE_TEXT = {
    none: () => "Сканер работает только на телефонах сотрудников ООО «Компрессор ПК». Отправьте код устройства администратору и вставьте ключ из его ответа.",
    invalid: () => "Сохранённый ключ не подходит. Отправьте администратору код устройства, чтобы получить новый.",
    other: (l) => `Сохранённый ключ выпущен для другого устройства (${deviceLabel(l.data.d)}). Отправьте администратору код этого устройства.`,
    expired: (l) => `Срок ключа истёк ${fmtDate(l.until)}. Отправьте администратору код устройства, чтобы получить новый.`,
    revoked: () => "Ключ этого устройства отозван. Обратитесь к администратору.",
    unsupported: () => "Браузер не может проверить ключ. Откройте сканер в Safari или Chrome последней версии.",
    nostorage: () => "Браузер не сохраняет данные (возможно, включён частный режим), поэтому активировать сканер нельзя. Откройте его в обычном режиме.",
  };
  let decoderOk = false;
  let wantKey = false;
  function showReady() {
    if (license.state === "checking") return;
    if (!licensed()) setStatus("Сканирование откроется после активации.", "warn");
    else if (decoderOk) setStatus(isDesktop ? "Готово. Загрузите фото с кодами или перетащите их в окно." : "Готово к сканированию.");
  }
  function applyLicense() {
    const ok = licensed();
    const soon = ok && license.until - clockNow() < 30 * 864e5;
    $("activation").hidden = license.state === "checking" || (ok && !soon && !wantKey);
    $("activation").classList.toggle("attention", !ok || soon);
    $("actTitle").textContent = ok ? (soon ? "Ключ скоро истечёт" : "Новый ключ") : "Активация";
    $("actText").textContent = ok
      ? soon
        ? `Ключ действует до ${fmtDate(license.until)}. Отправьте администратору код устройства, чтобы получить новый.`
        : "Вставьте новый ключ от администратора: он заменит текущий."
      : (LICENSE_TEXT[license.state] || LICENSE_TEXT.none)(license);
    $("deviceCode").textContent = DEVICE ? deviceLabel(DEVICE) : "—";
    $("deviceRow").hidden = !DEVICE;
    $("keyCancel").hidden = !ok;
    ["scanBtn", "photoBtn", "pasteBtn"].forEach((id) => ($(id).disabled = !ok));
    if (!ok) {
      $("pastePanel").hidden = true;
      $("pasteBtn").setAttribute("aria-expanded", "false");
    }
    if (ok && state.settings.employee !== employeeName()) {
      state.settings.employee = employeeName();
      save();
    }
    $("licenseInfo").textContent = ok
      ? `Ключ выдан сотруднику ${employeeName()}, действует до ${fmtDate(license.until)}. Код устройства ${deviceLabel(DEVICE)}.`
      : DEVICE ? `Сканер не активирован. Код устройства ${deviceLabel(DEVICE)}.` : "Сканер не активирован.";
    renderOrg();
    showReady();
  }
  async function loadLicense() {
    const stored = lsGet(LICENSE_KEY);
    license = stored ? await checkKey(stored) : { state: DEVICE ? "none" : "nostorage" };
    applyLicense();
  }
  async function activate() {
    const note = $("keyNote");
    const key = findKey($("keyInput").value);
    if (!key) {
      note.textContent = "Ключ не найден. Скопируйте сообщение администратора целиком и вставьте сюда.";
      return;
    }
    // Entering a key is a deliberate step: the clock guard starts again from now.
    lsSet(SEEN_KEY, String(Date.now()));
    const res = await checkKey(key);
    if (res.state !== "ok") {
      note.textContent = {
        other: res.data ? `Этот ключ выпущен для устройства ${deviceLabel(res.data.d)}, а код этого устройства ${deviceLabel(DEVICE)}. Попросите ключ для этого кода.` : "",
        expired: `Срок этого ключа истёк ${res.until ? fmtDate(res.until) : ""}. Попросите у администратора новый.`,
        revoked: "Этот ключ отозван. Обратитесь к администратору.",
        unsupported: LICENSE_TEXT.unsupported(),
        nostorage: LICENSE_TEXT.nostorage(),
      }[res.state] || "Ключ повреждён или не от этого сканера. Скопируйте сообщение администратора ещё раз целиком.";
      return;
    }
    if (!lsSet(LICENSE_KEY, key)) {
      note.textContent = LICENSE_TEXT.nostorage();
      return;
    }
    note.textContent = "";
    $("keyInput").value = "";
    wantKey = false;
    license = res;
    applyLicense();
    setStatus(`Сканер активирован: ${employeeName()}, ключ действует до ${fmtDate(license.until)}.`, "ok");
  }
  $("keyApply").onclick = activate;
  if (navigator.clipboard && navigator.clipboard.readText) {
    $("keyPaste").onclick = async () => {
      try {
        $("keyInput").value = await navigator.clipboard.readText();
      } catch (e) {
        $("keyInput").focus();
        $("keyNote").textContent = "Браузер не дал прочитать буфер. Нажмите в поле и выберите «Вставить».";
        return;
      }
      activate();
    };
  } else $("keyPaste").hidden = true;
  const deviceMessage = () => `Код устройства для сканера DataMatrix: ${deviceLabel(DEVICE)}`;
  if (navigator.share) {
    $("deviceShare").onclick = () => navigator.share({ text: deviceMessage() }).catch(() => {});
  } else $("deviceShare").hidden = true;
  $("deviceCopy").onclick = () => copyText(deviceMessage(), $("deviceCopy"));
  $("newKeyBtn").onclick = () => {
    wantKey = true;
    applyLicense();
    $("activation").scrollIntoView({ behavior: "smooth", block: "start" });
    $("keyInput").focus({ preventScroll: true });
  };
  $("keyCancel").onclick = () => {
    wantKey = false;
    $("keyNote").textContent = "";
    applyLicense();
  };

  // ---------- Backup ----------
  const BACKUP_APP = "datamatrix-scanner";
  function renderBackupInfo() {
    const s = state.settings;
    const total = state.batches.reduce((n, b) => n + b.codes.length, 0);
    const el = $("backupInfo");
    const stale = total > 0 && (!s.lastBackupAt || Date.now() - s.lastBackupAt > 7 * 864e5);
    el.textContent = (s.lastBackupAt ? "Последняя копия: " + fmtDateTime(s.lastBackupAt) + "." : "Копия ещё не сохранялась.") +
      ` Сейчас в приложении ${plural(state.batches.length, ["партия", "партии", "партий"])}, ${plural(total, CODES)}.`;
    el.className = "hint" + (stale ? " warn" : "");
  }
  function backupFile() {
    const s = state.settings;
    const data = {
      app: BACKUP_APP,
      format: 1,
      exportedAt: new Date().toISOString(),
      settings: { mailTo: s.mailTo, gsMode: s.gsMode, shareFormat: s.shareFormat, sound: s.sound, vibrate: s.vibrate },
      batches: state.batches,
    };
    const stamp = new Date().toLocaleDateString("ru-RU").replace(/\./g, "-");
    return new File([JSON.stringify(data, null, 1)], `Сканер DataMatrix, копия ${stamp}.json`, { type: "application/json" });
  }
  $("backupSave").onclick = () => {
    const file = backupFile();
    const done = (how) => {
      state.settings.lastBackupAt = Date.now();
      save();
      renderBackupInfo();
      setStatus(how, "ok");
    };
    if (canShareFiles && !isDesktop && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "Резервная копия сканера" })
        .then(() => done("Резервная копия передана. Проверьте, что файл сохранился в «Файлах» или ушёл на почту."))
        .catch((e) => { if (e && e.name !== "AbortError") { download(file); done("Резервная копия сохранена: " + file.name); } });
    } else {
      download(file);
      done("Резервная копия сохранена: " + file.name);
    }
  };

  // Everything from the file is checked and rebuilt field by field; nothing is trusted as is.
  function readBackup(obj) {
    if (!obj || obj.app !== BACKUP_APP || !Array.isArray(obj.batches)) throw new Error("not a backup");
    const batches = [];
    obj.batches.slice(0, 2000).forEach((b) => {
      if (!b || typeof b !== "object" || !Array.isArray(b.codes)) return;
      const seen = new Set();
      const codes = [];
      b.codes.forEach((c) => {
        if (!c || typeof c.raw !== "string") return;
        const raw = normalize(c.raw);
        const code = {
          id: typeof c.id === "string" ? c.id.slice(0, 40) : newId(),
          raw,
          ts: Number.isFinite(c.ts) ? c.ts : Date.now(),
          src: SRC[c.src] ? c.src : "manual",
          gs1: c.gs1 === true || looksGS1(raw),
          emp: cleanText(c.emp, 80),
        };
        if (!raw.trim() || seen.has(codeKey(code))) return;
        seen.add(codeKey(code));
        codes.push(code);
      });
      batches.push({
        id: typeof b.id === "string" && b.id ? b.id.slice(0, 40) : newId(),
        name: cleanText(b.name, 80) || "Партия из копии",
        createdAt: Number.isFinite(b.createdAt) ? b.createdAt : Date.now(),
        codes,
      });
    });
    const st = obj.settings && typeof obj.settings === "object" ? obj.settings : {};
    return { batches, settings: st, exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : "" };
  }
  let restoreData = null;
  $("backupLoad").onclick = () => $("backupInput").click();
  $("backupInput").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    $("restoreBox").hidden = true;
    restoreData = null;
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("too big");
      restoreData = readBackup(JSON.parse(await file.text()));
    } catch (err) {
      setStatus("Этот файл не похож на резервную копию сканера. Выберите файл .json, сохранённый кнопкой «Сохранить копию всех партий».", "err");
      return;
    }
    let newBatches = 0, newCodes = 0, dupCodes = 0;
    restoreData.batches.forEach((b) => {
      const ex = state.batches.find((x) => x.id === b.id);
      if (!ex) { newBatches++; newCodes += b.codes.length; return; }
      const have = new Set(ex.codes.map(codeKey));
      b.codes.forEach((c) => (have.has(codeKey(c)) ? dupCodes++ : newCodes++));
    });
    const when = restoreData.exportedAt ? " от " + fmtDateTime(Date.parse(restoreData.exportedAt)) : "";
    $("restoreText").textContent =
      `Копия${when}: ${plural(restoreData.batches.length, ["партия", "партии", "партий"])}. ` +
      `Будет добавлено новых партий: ${newBatches}, кодов: ${newCodes}` +
      (dupCodes ? `. Уже есть в приложении: ${plural(dupCodes, CODES)}, они не задвоятся.` : ".") +
      " Текущие партии не удаляются.";
    $("restoreYes").disabled = newCodes === 0 && newBatches === 0;
    $("restoreBox").hidden = false;
  };
  $("restoreNo").onclick = () => { $("restoreBox").hidden = true; restoreData = null; };
  $("restoreYes").onclick = () => {
    if (!restoreData) return;
    const restoredIds = new Set(restoreData.batches.map((b) => b.id));
    let added = 0;
    restoreData.batches.forEach((b) => {
      const ex = state.batches.find((x) => x.id === b.id);
      if (!ex) { state.batches.push(b); added += b.codes.length; return; }
      const have = new Set(ex.codes.map(codeKey));
      b.codes.forEach((c) => { if (!have.has(codeKey(c))) { ex.codes.push(c); have.add(codeKey(c)); added++; } });
      ex.codes.sort((x, y) => x.ts - y.ts);
    });
    // An untouched empty batch from a fresh install only gets in the way after a restore.
    state.batches = state.batches.filter((b) => b.codes.length || restoredIds.has(b.id) || !/^Партия от /.test(b.name));
    if (!state.batches.length) state.batches.push(makeBatch(defaultName()));
    if (!state.batches.some((b) => b.id === state.currentId) || !current().codes.length) {
      state.currentId = state.batches.slice().sort((x, y) => y.createdAt - x.createdAt)[0].id;
    }
    const s = state.settings, o = restoreData.settings;
    if (!s.mailTo && typeof o.mailTo === "string") s.mailTo = parseEmails(o.mailTo).join(", ");
    if (["raw", "tag", "esc", "ki"].includes(o.gsMode)) s.gsMode = o.gsMode;
    if (["xlsx", "csv", "txt"].includes(o.shareFormat)) s.shareFormat = o.shareFormat;
    if (typeof o.sound === "boolean") s.sound = o.sound;
    if (typeof o.vibrate === "boolean") s.vibrate = o.vibrate;
    syncSettingsUI();
    save();
    restoreData = null;
    $("restoreBox").hidden = true;
    render();
    renderOrg();
    renderBackupInfo();
    setStatus(`Восстановлено: ${plural(added, CODES)}.`, "ok");
  };

  $("vibrateHint").textContent = navigator.vibrate
    ? ""
    : isIOS
      ? "На iPhone вибрация работает не на всех моделях и версиях iOS. Главный сигнал — звук: если его не слышно, проверьте громкость и беззвучный режим."
      : "Этот браузер не поддерживает вибрацию, будет только звук.";

  // ---------- Feedback: sound, vibration ----------
  let audioCtx = null;
  function unlockAudio() {
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx && AC) audioCtx = new AC();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }
  function beep(freq, dur, delay) {
    if (!state.settings.sound || !audioCtx) return;
    const t = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function iosHaptic() {
    // Safari 18+ gives a haptic tick when a switch-style checkbox toggles.
    const label = document.createElement("label");
    label.ariaHidden = "true";
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  }
  function vibrate(pattern) {
    if (!state.settings.vibrate) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
    else if (isIOS) {
      iosHaptic();
      if (Array.isArray(pattern)) setTimeout(iosHaptic, 120);
    }
  }

  // ---------- Live camera scanning ----------
  const video = $("video");
  const finder = $("finder");
  const grab = document.createElement("canvas");
  const grabCtx = grab.getContext("2d", { willReadFrequently: true });
  let stream = null, track = null, scanning = false, paused = false, busy = false, loopTimer = null, wakeLock = null;
  let sessionAdded = 0;
  // Every open of the camera layer is a new session: a camera that starts after the layer
  // was closed sees a different number and is released at once. Codes go to the batch
  // that was open when the camera started.
  let scanSession = 0, scanBatchId = null;
  const lastSeen = new Map();
  const lastCodes = [];

  // In landscape the controls move to a side column, so the frame sits in the remaining space.
  const landscape = matchMedia("(orientation: landscape) and (max-height: 540px)");
  function sizeFinder() {
    const land = landscape.matches;
    const w = land ? window.innerWidth - Math.min(300, window.innerWidth * 0.42) : window.innerWidth;
    const side = Math.round(Math.min(w * 0.72, window.innerHeight * (land ? 0.62 : 0.45), 340));
    $("scanner").style.setProperty("--finder", side + "px");
  }
  function stopStream() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    track = null;
    video.srcObject = null;
  }
  async function startStream(deviceId) {
    stopStream();
    const my = scanSession;
    const video_ = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (deviceId) video_.deviceId = { exact: deviceId };
    else video_.facingMode = { ideal: "environment" };
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: false, video: video_ });
    } catch (e) {
      if (deviceId && my === scanSession) { state.settings.cameraId = null; save(); return startStream(null); }
      throw e;
    }
    if (my !== scanSession) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = s;
    track = stream.getVideoTracks()[0];
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (e) {}
    setupCameraControls();
  }
  async function setupCameraControls() {
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    $("torchBtn").hidden = !caps.torch;
    $("torchBtn").setAttribute("aria-pressed", "false");
    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      const z = $("zoom");
      z.min = caps.zoom.min;
      z.max = Math.min(caps.zoom.max, 8);
      z.step = caps.zoom.step || 0.1;
      const want = state.settings.zoom || (track.getSettings().zoom || caps.zoom.min);
      z.value = want;
      if (state.settings.zoom) track.applyConstraints({ advanced: [{ zoom: +want }] }).catch(() => {});
      $("zoomRow").hidden = false;
    } else $("zoomRow").hidden = true;
    try {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      const sel = $("cameraSelect");
      sel.textContent = "";
      cams.forEach((d, i) => {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || "Камера " + (i + 1);
        sel.appendChild(o);
      });
      sel.value = (track && track.getSettings().deviceId) || "";
      sel.hidden = cams.length < 2;
    } catch (e) {}
  }
  $("zoom").oninput = (e) => {
    state.settings.zoom = +e.target.value;
    if (track) track.applyConstraints({ advanced: [{ zoom: +e.target.value }] }).catch(() => {});
  };
  $("zoom").onchange = () => save();
  $("cameraSelect").onchange = async (e) => {
    state.settings.cameraId = e.target.value;
    state.settings.zoom = null;
    save();
    try { await startStream(e.target.value); } catch (err) { cameraError(err); }
  };
  $("torchBtn").onclick = () => {
    const on = $("torchBtn").getAttribute("aria-pressed") !== "true";
    track.applyConstraints({ advanced: [{ torch: on }] })
      .then(() => $("torchBtn").setAttribute("aria-pressed", String(on)))
      .catch(() => {});
  };

  function roi() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const vr = video.getBoundingClientRect();
    const fr = finder.getBoundingClientRect();
    const s = Math.max(vr.width / vw, vr.height / vh);
    const ox = (vr.width - vw * s) / 2, oy = (vr.height - vh * s) / 2;
    const cx = (fr.left + fr.width / 2 - vr.left - ox) / s;
    const cy = (fr.top + fr.height / 2 - vr.top - oy) / s;
    // Read only a little beyond the visible frame, so a neighbouring code on dense packaging is not picked up.
    const side = Math.min((fr.width / s) * 1.1, vw, vh);
    const x = Math.max(0, Math.min(vw - side, cx - side / 2));
    const y = Math.max(0, Math.min(vh - side, cy - side / 2));
    return { x, y, side };
  }
  async function grabFrame() {
    busy = true;
    try {
      const r = roi();
      const out = Math.round(Math.min(r.side, 1000));
      grab.width = out;
      grab.height = out;
      grabCtx.drawImage(video, r.x, r.y, r.side, r.side, 0, 0, out, out);
      const res = await decode(grabCtx.getImageData(0, 0, out, out), "live");
      if (scanning && !paused) res.results.forEach((x) => onLiveCode(x.text, x.gs1));
    } catch (e) {
    } finally {
      busy = false;
    }
  }
  function loop() {
    if (!scanning) return;
    if (!paused && !busy && video.readyState >= 2 && video.videoWidth) grabFrame();
    loopTimer = setTimeout(loop, 80);
  }
  let flashTimer = null;
  function flash(kind) {
    finder.classList.remove("hit", "dup");
    void finder.offsetWidth;
    finder.classList.add(kind);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => finder.classList.remove("hit", "dup"), 600);
  }
  function shortLabel(c) {
    const inf = info(c);
    const g = field(inf, "01"), s = field(inf, "21");
    return g ? `GTIN ${g} · ${s}` : c.raw.replace(/\u001d/g, " ").slice(0, 40);
  }
  function onLiveCode(text, gs1) {
    const raw = normalize(text);
    const now = Date.now();
    const prev = lastSeen.get(raw);
    lastSeen.set(raw, now);
    if (prev && now - prev < 2500) return; // same code still in view
    const r = addCode(raw, "camera", gs1, scanBatchId);
    const msg = $("scanMsg");
    msg.textContent = "";
    if (r.status === "nobatch") {
      flash("dup");
      beep(300, 0.3);
      const s = document.createElement("span");
      s.className = "dupmsg";
      s.textContent = "Партия удалена в другом окне. Закройте камеру и выберите партию.";
      msg.appendChild(s);
    } else if (r.status === "added") {
      sessionAdded++;
      // A code that is read but not saved must not look like a success.
      if (r.saved) {
        flash("hit");
        beep(1900, 0.09);
        vibrate(70);
      } else {
        flash("dup");
        beep(300, 0.3);
        vibrate([200]);
      }
      const b = document.createElement("b");
      b.textContent = r.saved ? "Добавлен" : "Прочитан, но не сохранён:";
      if (!r.saved) b.className = "err";
      msg.append(b, " " + shortLabel(r.item) + (r.other ? ` (есть и в партии «${r.other}»)` : ""));
      lastCodes.unshift(shortLabel(r.item));
      lastCodes.length = Math.min(lastCodes.length, 3);
      $("scanLast").textContent = "";
      lastCodes.forEach((l) => { const d = document.createElement("div"); d.textContent = l; $("scanLast").appendChild(d); });
      renderStats();
    } else if (r.status === "dup") {
      flash("dup");
      beep(520, 0.12);
      beep(520, 0.12, 0.17);
      vibrate([40, 80, 40]);
      const s = document.createElement("span");
      s.className = "dupmsg";
      s.textContent = `Уже в партии, № ${r.index}` + (r.upgraded ? ": дополнен криптохвостом" : "");
      msg.appendChild(s);
    }
  }
  function cameraError(e) {
    closeScanner(true);
    const name = e && e.name;
    if (name === "NotAllowedError" || name === "SecurityError")
      setStatus(isIOS
        ? "Нет доступа к камере. Разрешите её: Настройки → Приложения → Safari → Камера, или нажмите «аА» в адресной строке → Настройки веб-сайта."
        : "Нет доступа к камере. Разрешите камеру для этого сайта в настройках браузера (значок слева от адреса).", "err");
    else if (name === "NotFoundError" || name === "OverconstrainedError")
      setStatus("Камера не найдена. Используйте «Загрузить фото».", "err");
    else if (name === "NotReadableError")
      setStatus("Камера занята другим приложением. Закройте его и попробуйте снова.", "err");
    else setStatus("Не удалось включить камеру. Используйте «Загрузить фото».", "err");
  }
  async function requestWakeLock() {
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  async function openScanner() {
    if (!licensed()) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(window.isSecureContext ? "Этот браузер не даёт доступ к камере. Используйте «Загрузить фото»." : "Камера работает только при открытии по https.", "err");
      return;
    }
    unlockAudio();
    const my = ++scanSession;
    scanBatchId = current().id;
    sessionAdded = 0;
    lastCodes.length = 0;
    $("scanLast").textContent = "";
    $("scanMsg").textContent = "Наведите камеру на код DataMatrix";
    paused = false;
    $("pauseBtn").textContent = "Пауза";
    sizeFinder();
    renderStats();
    $("scanner").hidden = false;
    document.documentElement.style.overflow = "hidden";
    try {
      await startStream(state.settings.cameraId);
    } catch (e) {
      if (my === scanSession) cameraError(e);
      return;
    }
    if (my !== scanSession) return; // closed while the camera was starting
    requestWakeLock();
    scanning = true;
    loop();
  }
  function closeScanner(silent) {
    scanSession++;
    scanning = false;
    clearTimeout(loopTimer);
    stopStream();
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch (e) {}
    $("scanner").hidden = true;
    document.documentElement.style.overflow = "";
    render();
    if (!silent) {
      if (!$("saveError").hidden) setStatus(`За сеанс прочитано ${plural(sessionAdded, CODES)}, но браузер не сохранил их. Выгрузите партию.`, "err");
      else setStatus(sessionAdded ? `За сеанс добавлено ${plural(sessionAdded, CODES)}.` : "Новых кодов не добавлено.", sessionAdded ? "ok" : "");
    }
    $("scanBtn").focus();
  }
  $("scanBtn").onclick = openScanner;
  $("closeScan").onclick = () => closeScanner();
  $("doneBtn").onclick = () => closeScanner();
  $("pauseBtn").onclick = () => {
    paused = !paused;
    $("pauseBtn").textContent = paused ? "Продолжить" : "Пауза";
    $("scanMsg").textContent = paused ? "Пауза" : "Наведите камеру на код DataMatrix";
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && scanning) closeScanner(); });
  window.addEventListener("resize", () => { if (!$("scanner").hidden) sizeFinder(); });
  document.addEventListener("visibilitychange", () => {
    if (!scanning) return;
    if (document.hidden) stopStream();
    else {
      startStream(state.settings.cameraId).catch(cameraError);
      requestWakeLock();
    }
  });

  // ---------- Layout per device ----------
  if (isDesktop) {
    $("photoBtn").classList.add("primary", "big");
    $("photoBtn").style.order = "-1";
    $("scanBtn").classList.remove("primary", "big");
  }
  // Fields use 16px text, so iPhone has no reason to zoom into them. If the page still ends up
  // zoomed (after a field or a turn of the phone), a moment of maximum-scale=1 brings it back;
  // pinch zoom keeps working because the limit is removed right after.
  if (isIOS) {
    const vp = document.querySelector('meta[name="viewport"]');
    const base = vp.getAttribute("content");
    let zoomTimer = null;
    const resetZoom = () => {
      vp.setAttribute("content", base + ",maximum-scale=1");
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(() => vp.setAttribute("content", base), 500);
    };
    document.addEventListener("focusout", (e) => { if (e.target.matches && e.target.matches("input, textarea, select")) resetZoom(); });
    window.addEventListener("orientationchange", resetZoom);
    if (screen.orientation) screen.orientation.addEventListener("change", resetZoom);
  }

  // ---------- Install and offline ----------
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (!standalone && isIOS) {
    $("installText").textContent = "Установите сканер на iPhone: нажмите «Поделиться» в Safari и выберите «На экран „Домой“». Затем один раз откройте его с иконки при включённом интернете и дождитесь надписи «Готово к работе без интернета». У приложения на экране «Домой» свои данные, отдельные от Safari.";
    $("installCard").hidden = false;
  }
  let installEvent = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
    $("installText").textContent = "Сканер можно установить как приложение: значок на рабочем столе, работа без интернета.";
    $("installBtn").hidden = false;
    $("installCard").hidden = false;
  });
  $("installBtn").onclick = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null;
    $("installCard").hidden = true;
  };
  function showNet(text, kind) {
    $("netState").hidden = false;
    $("netState").dataset.kind = kind;
    $("netText").textContent = text;
  }
  // Ready only when the core files are really in the offline cache, not merely when a worker exists.
  async function checkOffline() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      showNet("Работа без интернета в этом браузере недоступна", "off");
      return;
    }
    if (!navigator.onLine) showNet("Нет интернета, проверяю сохранённые файлы…", "wait");
    else showNet("Сохраняю файлы для работы без интернета…", "wait");
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000));
      await Promise.race([navigator.serviceWorker.ready, timeout]);
      const need = ["index.html", "app.js", "xlsx.js", "worker.js", "vendor/zxing-reader.js", "zxing_reader.wasm"];
      const hits = await Promise.all(need.map((f) => caches.match(new URL(f, location.href).href, { ignoreSearch: true, ignoreVary: true })));
      if (hits.every(Boolean)) showNet(navigator.onLine ? "Готово к работе без интернета" : "Нет интернета: работаю из памяти устройства", "ok");
      else showNet("Файлы для работы без интернета ещё не сохранены. Обновите страницу с интернетом.", "off");
    } catch (e) {
      showNet("Работа без интернета недоступна: браузер не дал сохранить файлы (например, частный режим)", "off");
    }
  }
  if ("serviceWorker" in navigator && window.isSecureContext) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      checkOffline();
      if (hadController && !scanning) toast("Вышла новая версия сканера", "Обновить", () => location.reload(), 15000);
    });
  }
  checkOffline();
  window.addEventListener("online", checkOffline);
  window.addEventListener("offline", checkOffline);
  // Ask the browser not to clear the batches when the device runs low on space.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}

  // ---------- Several tabs ----------
  // Another tab or window of the app saved: take its state, so neither overwrites the other.
  window.addEventListener("storage", (e) => {
    if (e.key === LICENSE_KEY) { loadLicense(); return; }
    if (e.key !== KEY || !e.newValue) return;
    let s;
    try { s = JSON.parse(e.newValue); } catch (err) { return; }
    if (!s || !Array.isArray(s.batches) || !s.batches.length) return;
    const keep = state.currentId;
    state = s;
    state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings);
    if (state.batches.some((b) => b.id === keep)) state.currentId = keep;
    syncSettingsUI();
    render();
    renderOrg();
  });

  render();
  renderOrg();
  loadLicense();
})();
