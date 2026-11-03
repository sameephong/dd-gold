/* DD หลอมทอง — ระบบหน้าร้าน เฟส 1
 * เข้าระบบพนักงาน · รับซื้อ · อ่านบัตรประชาชน · พิมพ์ใบรับซื้อ · ใช้งานออฟไลน์
 */
'use strict';
const CFG = window.DD_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL;
const APP_VERSION = '1.3.0';

// ---------------------------------------------------------------- utils
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
const money = (n, d = 0) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: 2 });
const gram = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const load = (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const store = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn(e); } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const deepCopy = (o) => JSON.parse(JSON.stringify(o));

let clockOffset = load('dd_clock_offset', 0);           // เวลาเซิร์ฟเวอร์ - เวลาเครื่อง
const now = () => new Date(Date.now() + clockOffset);
const bkkDate = (d = now()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const thDateTime = (d) => new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const thTime = (d) => new Date(d).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
const thDateLong = (d) => new Date(d).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const maskId = (id) => id && id.length === 13 ? `${id[0]}-${id.slice(1, 5)}-xxxxx-${id.slice(10, 12)}-${id[12]}` : (id || '');
const fmtId = (id) => id && id.length === 13 ? `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}` : (id || '');

async function sha(text) {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return 'w' + (h >>> 0).toString(16);
}

const ERR = {
  PIN_WRONG: 'PIN ไม่ถูกต้อง', DEVICE_INVALID: 'เครื่องนี้ยังไม่ได้ลงทะเบียน หรือถูกยกเลิกแล้ว', SESSION_INVALID: 'หมดเวลาเข้าระบบ กรุณาเข้าระบบใหม่',
  OWNER_ONLY: 'เฉพาะเจ้าของเท่านั้น', PIN_WEAK: 'PIN ง่ายเกินไป เลือกตัวเลขอื่น', PIN_FORMAT: 'PIN ต้องเป็นตัวเลข 4 หลัก (เจ้าของ 6 หลัก)', PIN_FORMAT_6: 'PIN เจ้าของต้องเป็นตัวเลข 6 หลัก',
  ALREADY_SETUP: 'ร้านนี้ตั้งค่าเจ้าของไปแล้ว', CUSTOMER_REQUIRED: 'ต้องมีเลขบัตรประชาชนผู้ขาย', WRONG_BRANCH: 'พนักงานไม่ได้อยู่สาขานี้', CANNOT_SELF: 'ปิดบัญชีตัวเองไม่ได้',
  NOT_FOUND: 'ไม่พบบิล หรือบิลถูกยกเลิกไปแล้ว', REASON_REQUIRED: 'ต้องใส่เหตุผลที่ยกเลิก', STAFF_CANCEL_OFF: 'เจ้าของปิดฟังก์ชันให้พนักงานยกเลิกบิลไว้', BILL_NOT_TODAY: 'พนักงานยกเลิกได้เฉพาะบิลของวันนี้', NEED_OWNER: 'บิลนี้เกินวงเงิน ต้องให้เจ้าของใส่ PIN อนุมัติ', NET: 'ไม่มีอินเทอร์เน็ต', OFFLINE_LOGIN: 'เครื่องนี้ยังไม่เคยเข้าระบบด้วยรหัสนี้ตอนออนไลน์ จึงเข้าแบบออฟไลน์ไม่ได้'
};
const errText = (e) => { const m = (e && e.message) || String(e); if (m.startsWith('LOCKED:')) return `ใส่ PIN ผิดหลายครั้ง ล็อกไว้ ${m.split(':')[1]} นาที`; return ERR[m] || m; };
const isNet = (e) => e && (e.net || e.name === 'TypeError' || e.name === 'AbortError');

// ---------------------------------------------------------------- API
async function api(fn, params = {}) {
  if (DEMO) {   // โหมดทดลองจำลองอาการเน็ตหลุดด้วย
    if (!navigator.onLine) { const e = new Error('NET'); e.net = true; setOnline(false); throw e; }
    return window.DD_DEMO.rpc(fn, params);
  }
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  const headers = { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY };
  if (String(CFG.SUPABASE_KEY).startsWith('eyJ')) headers.Authorization = 'Bearer ' + CFG.SUPABASE_KEY;
  let r;
  try {
    r = await fetch(`${CFG.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(params), signal: ctrl.signal });
  } catch (e) { e.net = true; setOnline(false); throw e; } finally { clearTimeout(t); }
  setOnline(true);
  const txt = await r.text(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* ignore */ }
  if (!r.ok) throw new Error((data && data.message) || ('HTTP_' + r.status));
  if (data && data.error) throw new Error(data.error);
  return data;
}

// ---------------------------------------------------------------- local DB (IndexedDB)
const idb = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('dd_shop', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('bills', { keyPath: 'id' }); d.createObjectStore('customers', { keyPath: 'id_card' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (st, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(st, mode); const req = fn(t.objectStore(st)); let out; if (req) req.onsuccess = () => { out = req.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }); };
  return { put: (s, v) => run(s, 'readwrite', o => o.put(v)), get: (s, k) => run(s, 'readonly', o => o.get(k)), all: (s) => run(s, 'readonly', o => o.getAll()), del: (s, k) => run(s, 'readwrite', o => o.delete(k)) };
})();

// ---------------------------------------------------------------- เปลี่ยนจากโหมดทดลองเป็นฐานข้อมูลจริง → ล้างข้อมูลทดลองในเครื่อง
(function resetIfBackendChanged() {
  const cur = DEMO ? 'demo' : CFG.SUPABASE_URL;
  let prev = null; try { prev = localStorage.getItem('dd_backend'); } catch (e) { /* ignore */ }
  if ((prev !== null && prev !== cur) || (prev === null && !DEMO)) {
    try { Object.keys(localStorage).filter(k => k.startsWith('dd_') && k !== 'dd_demo_db').forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    try { indexedDB.deleteDatabase('dd_shop'); } catch (e) { /* ignore */ }
  }
  try { localStorage.setItem('dd_backend', cur); } catch (e) { /* ignore */ }
})();

// ---------------------------------------------------------------- state
const S = {
  device: load('dd_device'),
  session: load('dd_session'),
  settings: load('dd_settings'),
  staffList: load('dd_staff_list', []),
  verifiers: load('dd_verifiers', {}),   // ใช้ตรวจ PIN ตอนออฟไลน์ / ยืนยันบิล
  online: navigator.onLine,
  pending: 0,
  screen: null,
  buy: null,
  buyStep: 1,
  billsDate: bkkDate(),
  loginTab: 'staff',
  loginCode: null,
  pinBuf: ''
};

function saveSession(s) { S.session = s; store('dd_session', s); }
function sessionValid() { return S.session && (Date.now() - S.session.login_at) < (CFG.SESSION_HOURS || 12) * 3600e3; }
const me = () => S.session && S.session.staff;
const isOwner = () => me() && me().role === 'owner';

async function setVerifier(code, pin) { S.verifiers[code] = await sha(`dd|${S.device ? S.device.secret : ''}|${code}|${pin}`); store('dd_verifiers', S.verifiers); }
async function verifyLocal(code, pin) { const v = S.verifiers[code]; return !!v && v === await sha(`dd|${S.device ? S.device.secret : ''}|${code}|${pin}`); }

// ---------------------------------------------------------------- online status & sync
function setOnline(v) { if (S.online !== v) { S.online = v; renderStatus(); if (v) setTimeout(syncNow, 300); } }
window.addEventListener('online', () => { setOnline(true); });
window.addEventListener('offline', () => setOnline(false));

let syncing = false;
async function updatePending() { let all = []; try { all = await idb.all('bills'); } catch (e) { console.warn('idb', e); } S.pending = all.filter(b => !b.synced).length; renderStatus(); }
async function syncNow() {
  if (syncing) return;
  const tok = S.session && S.session.token;
  if (!tok) { await updatePending(); return; }
  syncing = true;
  try {
    const all = (await idb.all('bills')).filter(b => !b.synced).sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const b of all) {
      try {
        const r = await api('create_bill', { p_token: tok, p_bill: b.payload });
        b.synced = true; b.error = null; b.bill_no = r.bill_no; b.payload.bill_no = r.bill_no;
        await idb.put('bills', b);
      } catch (e) {
        if (isNet(e)) break;
        if (e.message === 'SESSION_INVALID') { sessionExpired(); break; }
        b.error = errText(e); await idb.put('bills', b);
      }
    }
  } finally { syncing = false; await updatePending(); if (S.screen === 'bills') renderBills(); }
}
setInterval(() => { if (S.pending) syncNow(); }, 20000);

function sessionExpired() {
  if (S.session) S.session.token = null;
  saveSession(S.session);
  toast('หมดเวลาเข้าระบบออนไลน์ — บิลยังอยู่ในเครื่อง จะส่งเมื่อเข้าระบบใหม่', 'warn');
  renderStatus();
}

// ---------------------------------------------------------------- UI helpers
function toast(msg, kind = 'ok') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, kind === 'err' ? 5000 : 3000);
}
function modal(html, opts = {}) {
  closeModal();
  const wrap = document.createElement('div'); wrap.className = 'modal-wrap'; wrap.id = 'modal';
  wrap.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  if (!opts.sticky) wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  const f = wrap.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 30);
  return wrap;
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.t = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>'; } else if (btn.dataset.t) btn.innerHTML = btn.dataset.t; }

function renderStatus() {
  const el = $('#status'); if (!el) return;
  const on = S.online;
  el.className = 'status ' + (on ? (S.pending ? 'warn' : 'on') : 'off');
  el.innerHTML = `<span class="dot"></span>${on ? 'ออนไลน์' : 'ออฟไลน์'}${S.pending ? ` · รอส่ง ${S.pending} บิล` : ''}${S.session && !S.session.token && S.screen !== 'login' ? ' · <u>เข้าระบบออนไลน์</u>' : ''}`;
}

// ---------------------------------------------------------------- shell
const NAV = [
  { id: 'buy', label: 'รับซื้อ', icon: 'M12 3v18M5 10l7-7 7 7' },
  { id: 'bills', label: 'สรุปวันนี้', icon: 'M4 19V9M10 19V5M16 19v-7M22 19H2' },
  { id: 'customers', label: 'ลูกค้า', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { id: 'more', label: 'เพิ่มเติม', icon: 'M4 6h16M4 12h16M4 18h16' }
];
const icon = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

function shell(title, body) {
  const shop = (S.settings && S.settings.shop) || {};
  const tabs = NAV.map(n => `<button class="tab ${S.screen === n.id || (n.id === 'more' && ['more', 'settings', 'staff', 'audit', 'pin'].includes(S.screen)) ? 'active' : ''}" data-go="${n.id}">${icon(n.icon)}<span>${n.label}</span></button>`).join('');
  $('#app').innerHTML = `
  <header class="appbar">
    <div class="brand">${shop.logo ? `<img src="${shop.logo}" alt="">` : '<span class="logo">DD</span>'}<div><b>${esc(shop.name || 'DD หลอมทอง')}</b><small>${esc(shop.branch || '')}${DEMO ? ' · <em>โหมดทดลอง</em>' : ''}</small></div></div>
    <nav class="topnav">${tabs}</nav>
    <div class="who"><button id="status" class="status"></button><span class="chip">${esc(me().code)} · ${esc(me().nickname)}</span><button class="btn ghost sm" id="logoutBtn">ออก</button></div>
  </header>
  <main class="main"><h1 class="screen-title">${title}</h1>${body}</main>
  <nav class="bottomnav">${tabs}</nav>`;
  $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  $('#logoutBtn').onclick = logout;
  $('#status').onclick = () => { if (S.session && !S.session.token) reLoginModal(); else syncNow(); };
  renderStatus();
}

function go(screen) {
  if (!sessionValid()) { S.session = null; store('dd_session', null); return renderLogin(); }
  if (me().must_change_pin && screen !== 'pin') screen = 'pin';
  S.screen = screen;
  window.scrollTo(0, 0);
  ({ buy: renderBuy, bills: renderBills, customers: renderCustomers, more: renderMore, settings: renderSettings, staff: renderStaff, audit: renderAudit, pin: renderPin }[screen] || renderBuy)();
  // เจ้าของเข้าระบบวันแรกของวัน และยังไม่ได้ตั้งราคาวันนี้ → ถามว่าจะใช้ราคาแบบไหน
  if (isOwner() && S.session.token && screen !== 'pin' && S.settings && S.settings.prices && S.settings.prices.date !== bkkDate() && S.priceAsked !== bkkDate()) {
    S.priceAsked = bkkDate(); setTimeout(dailyPriceModal, 200);
  }
}

// ---------------------------------------------------------------- ราคาประจำวัน
function dailyPriceModal() {
  const P = S.settings.prices, last = P.date ? P.date.split('-').reverse().join('/') : 'ยังไม่เคยตั้ง';
  modal(`<h2>ตั้งราคารับซื้อวันนี้</h2>
    <p class="muted">${esc(thDateLong(now()))} · ราคาล่าสุดตั้งเมื่อ ${esc(last)}</p>
    <p><b>วันนี้จะใช้ราคาแบบไหน?</b></p>
    <div class="choice-list">
      <button class="choice" data-pc="assoc"><b>ใช้ราคาสมาคมค้าทองคำ</b><span>ใส่ราคารับซื้อทองรูปพรรณ 96.5% (บาทละ) แล้วระบบคำนวณราคาต่อกรัมให้</span></button>
      <button class="choice" data-pc="manual"><b>ตั้งราคาเองทุกขั้น %</b><span>ไปหน้าตั้งราคา ใส่ราคาต่อกรัมเองทีละขั้น</span></button>
      <button class="choice" data-pc="same"><b>ใช้ราคาเดิมต่อ</b><span>ราคาเหมือนครั้งล่าสุด ไม่เปลี่ยนแปลง</span></button>
    </div>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ไว้ทีหลัง</button></div>`, { sticky: true });
  $$('[data-pc]').forEach(b => b.onclick = async () => {
    const c = b.dataset.pc;
    if (c === 'manual') { closeModal(); setTab = 'prices'; go('settings'); return; }
    if (c === 'same') { await savePrices({ ...deepCopy(P), date: bkkDate() }); closeModal(); go(S.screen); return; }
    assocPriceModal();
  });
}
// ดึงราคาประกาศล่าสุดของสมาคมค้าทองคำ: ผ่านเซิร์ฟเวอร์ก่อน ถ้าไม่ได้ใช้โปรแกรมในคอมร้าน
async function fetchAssoc() {
  let err = null;
  if (!DEMO && S.session.token && S.online) {
    try { return { ...(await api('fetch_gold_assoc', { p_token: S.session.token })), via: 'เซิร์ฟเวอร์' }; } catch (e) { err = e; }
  }
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch((CFG.HELPER_URL || 'http://127.0.0.1:8765') + '/goldprice', { signal: ctrl.signal }).then(x => x.json()).finally(() => clearTimeout(t));
    if (r.ok) return { ...r.data, via: 'คอมร้าน' };
    err = new Error(r.error || 'FETCH_FAIL');
  } catch (e) { err = err || new Error('NO_HELPER'); }
  throw err;
}
function assocAsOf(d) {
  if (!d) return '';
  if (d.as_time && /^\d{4}-\d{2}-\d{2}T/.test(d.as_time)) return thDateTime(d.as_time) + (d.seq ? ` (ครั้งที่ ${d.seq})` : '');
  return d.as_of || '';
}
const ASSOC_ERR = { FETCH_FAIL: 'เชื่อมต่อเว็บสมาคมไม่ได้', PARSE_FAIL: 'อ่านราคาจากเว็บสมาคมไม่ได้ (เว็บอาจเปลี่ยนรูปแบบ)', NO_HELPER: 'ดึงราคาไม่ได้ — เปิดโปรแกรมเครื่องอ่านบัตรเวอร์ชันใหม่ในคอมก่อน' };

function assocPriceModal() {
  const P = deepCopy(S.settings.prices), gold = P.metals.gold;
  let data = null, base = (P.assoc && P.assoc.base) || 'orn_buy';
  modal(`<h2>ราคาสมาคมค้าทองคำ</h2>
    <div id="asBox"><div class="center" style="min-height:120px"><span class="spin big"></span></div><p class="muted center-t">กำลังดึงราคาล่าสุดจากเว็บสมาคม...</p></div>
    <label>ใช้ราคาไหนเป็นราคาทอง 96.5%<select id="abase"><option value="orn_buy">รับซื้อทองรูปพรรณ (แนะนำ)</option><option value="bar_buy">รับซื้อทองคำแท่ง</option></select></label>
    <label>ราคาฐาน 96.5% (บาทละ) — แก้เองได้<input id="ap" inputmode="decimal" value="${esc(P.assoc_buy_per_baht || '')}"></label>
    <p id="apg" class="big"></p>
    <label class="switch"><input type="checkbox" id="aprop"> ปรับราคาขั้น % อื่นของทองตามสัดส่วนด้วย</label>
    <div id="aprev" class="muted sm"></div>
    <div class="row end"><button class="btn ghost" id="apBack">ย้อนกลับ</button><button class="btn ghost" id="apRe">ดึงใหม่</button><button class="btn gold" id="apSave">ใช้ราคานี้</button></div>`, { sticky: true });
  $('#abase').value = base;
  const calcTiers = (p965) => (gold.tiers || []).map(t => ({ pct: t.pct, price: t.pct === 96.5 ? p965 : Math.floor(p965 * t.pct / 96.5 / 10) * 10 }));
  const draw = () => {
    const v = num($('#ap').value), p965 = Math.round(v / 15.244);
    $('#apg').innerHTML = v ? `96.5% = <b>${money(p965)}</b> บาท/กรัม` : '';
    $('#aprev').innerHTML = v && $('#aprop').checked ? 'ราคาที่จะใช้: ' + calcTiers(p965).map(t => `${t.pct}% = ${money(t.price)}`).join(' · ') : (v ? 'ขั้น % อื่นใช้ราคาเดิม: ' + (gold.tiers || []).filter(t => t.pct !== 96.5).map(t => `${t.pct}% = ${money(t.price)}`).join(' · ') : '');
  };
  const load = async () => {
    $('#asBox').innerHTML = '<div class="center" style="min-height:120px"><span class="spin big"></span></div><p class="muted center-t">กำลังดึงราคาล่าสุดจากเว็บสมาคม...</p>';
    try {
      data = await fetchAssoc();
      $('#asBox').innerHTML = `<table class="assoc"><thead><tr><th></th><th>รับซื้อ</th><th>ขายออก</th></tr></thead><tbody>
        <tr><td>ทองคำแท่ง 96.5%</td><td>${money(data.bar_buy, 2)}</td><td>${money(data.bar_sell, 2)}</td></tr>
        <tr><td>ทองรูปพรรณ 96.5%</td><td><b>${money(data.orn_buy, 2)}</b></td><td>${money(data.orn_sell, 2)}</td></tr></tbody></table>
        <p class="muted sm">ประกาศ ${esc(assocAsOf(data) || '-')} · ดึงผ่าน${esc(data.via)} · goldtraders.or.th</p>`;
      $('#ap').value = data[$('#abase').value]; draw();
    } catch (e) {
      $('#asBox').innerHTML = `<div class="banner warn">${esc(ASSOC_ERR[e.message] || errText(e))} — ใส่ราคาเองในช่องด้านล่างได้</div>`;
    }
  };
  $('#abase').onchange = () => { if (data) { $('#ap').value = data[$('#abase').value]; } draw(); };
  $('#ap').oninput = draw; $('#aprop').onchange = draw; draw(); load();
  $('#apRe').onclick = load;
  $('#apBack').onclick = dailyPriceModal;
  $('#apSave').onclick = async (ev) => {
    const v = num($('#ap').value); if (!v) return toast('ใส่ราคาสมาคม', 'err');
    const p965 = Math.round(v / 15.244);
    P.assoc_mode = true; P.assoc_buy_per_baht = v; P.date = bkkDate();
    P.assoc = data ? { bar_buy: data.bar_buy, bar_sell: data.bar_sell, orn_buy: data.orn_buy, orn_sell: data.orn_sell, as_of: assocAsOf(data), base: $('#abase').value } : { base: $('#abase').value, manual: true };
    if ($('#aprop').checked) gold.tiers = calcTiers(p965);
    if (!gold.tiers.some(t => t.pct === 96.5)) gold.tiers.push({ pct: 96.5, price: p965 });
    gold.tiers.forEach(t => { if (t.pct === 96.5) t.price = p965; });
    busy(ev.target, true);
    if (await savePrices(P)) { closeModal(); go(S.screen); } else busy(ev.target, false);
  };
}
async function savePrices(P) {
  try { await api('save_setting', { p_token: S.session.token, p_key: 'prices', p_value: P }); S.settings.prices = P; store('dd_settings', S.settings); toast('ตั้งราคาวันนี้แล้ว'); return true; }
  catch (e) { toast(errText(e), 'err'); return false; }
}

// ---------------------------------------------------------------- boot
async function boot() {
  $('#app').innerHTML = '<div class="center"><span class="spin big"></span></div>';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  await updatePending();
  if (!S.device) {
    try { const st = await api('setup_status'); return st.has_owner ? renderRegister() : renderSetup(); }
    catch (e) { return renderFatal(isNet(e) ? 'ครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อลงทะเบียนเครื่อง' : errText(e)); }
  }
  if (sessionValid()) {
    if (S.session.token) api('get_settings', { p_token: S.session.token }).then(r => { applySettings(r.settings, r.server_time); }).catch(e => { if (e.message === 'SESSION_INVALID') sessionExpired(); });
    return go(isOwner() ? 'bills' : 'buy');
  }
  renderLogin();
}
function applySettings(st, serverTime) {
  if (st) { S.settings = st; store('dd_settings', st); }
  if (serverTime) { clockOffset = new Date(serverTime).getTime() - Date.now(); store('dd_clock_offset', clockOffset); }
}
function renderFatal(msg) { $('#app').innerHTML = `<div class="center col"><div class="logo xl">DD</div><p class="muted">${esc(msg)}</p><button class="btn" onclick="location.reload()">ลองใหม่</button></div>`; }

// ---------------------------------------------------------------- first-time setup
function renderSetup() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card">
    <div class="auth-head"><span class="logo">DD</span><div><h1>ตั้งค่าร้านครั้งแรก</h1><p class="muted">สร้างบัญชีเจ้าของ OWN01</p></div></div>
    ${DEMO ? '<p class="note">โหมดทดลอง: ข้อมูลเก็บในเครื่องนี้เท่านั้น ใส่ค่า Supabase ใน config.js เมื่อพร้อมใช้จริง</p>' : ''}
    <label>ชื่อเล่นเจ้าของ<input id="nick" value="นาย" maxlength="20"></label>
    <label>ตั้ง PIN เจ้าของ (ตัวเลข 6 หลัก)<input id="p1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
    <label>ใส่ PIN อีกครั้ง<input id="p2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
    <button class="btn gold block" id="go">สร้างบัญชีเจ้าของ</button></div></div>`;
  $('#go').onclick = async (ev) => {
    const nick = $('#nick').value.trim(), p1 = $('#p1').value, p2 = $('#p2').value;
    if (!nick) return toast('ใส่ชื่อเล่น', 'err');
    if (!/^\d{6}$/.test(p1)) return toast(ERR.PIN_FORMAT_6, 'err');
    if (p1 !== p2) return toast('PIN สองช่องไม่ตรงกัน', 'err');
    busy(ev.target, true);
    try { await api('setup_owner', { p_nickname: nick, p_pin: p1 }); toast('สร้างบัญชีเจ้าของแล้ว'); renderRegister('OWN01'); }
    catch (e) { toast(errText(e), 'err'); busy(ev.target, false); }
  };
}

function renderRegister(code) {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card">
    <div class="auth-head"><span class="logo">DD</span><div><h1>ลงทะเบียนเครื่องนี้</h1><p class="muted">ทำครั้งเดียวต่อเครื่อง ต้องใช้ PIN เจ้าของ</p></div></div>
    <label>ชื่อเครื่อง<input id="dname" placeholder="เช่น คอมเคาน์เตอร์ / มือถือนาย" value="${/Mobi/.test(navigator.userAgent) ? 'มือถือ' : 'คอมเคาน์เตอร์'}"></label>
    <label>รหัสเจ้าของ<input id="ocode" value="${esc(code || 'OWN01')}" style="text-transform:uppercase"></label>
    <label>PIN เจ้าของ<input id="opin" type="password" inputmode="numeric" maxlength="6"></label>
    <button class="btn gold block" id="go">ลงทะเบียนเครื่อง</button></div></div>`;
  $('#go').onclick = async (ev) => {
    busy(ev.target, true);
    try {
      const r = await api('register_device', { p_owner_code: $('#ocode').value.trim().toUpperCase(), p_pin: $('#opin').value, p_name: $('#dname').value.trim() || 'เครื่อง' });
      S.device = { device_id: r.device_id, secret: r.secret, name: r.name }; store('dd_device', S.device);
      toast(`ลงทะเบียนแล้ว เครื่อง ${r.device_id}`); renderLogin();
    } catch (e) { toast(errText(e), 'err'); busy(ev.target, false); }
  };
}

// ---------------------------------------------------------------- login
async function renderLogin() {
  S.screen = 'login'; S.pinBuf = '';
  try { const l = await api('staff_list', { p_device: S.device.device_id, p_secret: S.device.secret }); S.staffList = l; store('dd_staff_list', l); }
  catch (e) {
    if (e.message === 'DEVICE_INVALID') { store('dd_device', null); S.device = null; return boot(); }
  }
  const shop = (S.settings && S.settings.shop) || {};
  const staff = S.staffList.filter(s => s.role === 'staff'), owners = S.staffList.filter(s => s.role === 'owner');
  const list = S.loginTab === 'owner' ? owners : staff;
  if (!list.some(s => s.code === S.loginCode)) S.loginCode = (list[0] || {}).code || null;
  const len = S.loginTab === 'owner' ? 6 : 4;
  $('#app').innerHTML = `<div class="auth"><div class="auth-card ${S.loginTab === 'owner' ? 'dark' : ''}">
    <div class="auth-head">${shop.logo ? `<img class="logo-img" src="${shop.logo}" alt="">` : '<span class="logo">DD</span>'}<div><h1>${esc(shop.name || 'DD หลอมทอง')}</h1><p class="muted">${esc(shop.name2 || '')} · ${esc(shop.branch || '')} · เครื่อง ${esc(S.device.device_id)}</p></div></div>
    <div class="seg"><button data-tab="staff" class="${S.loginTab === 'staff' ? 'on' : ''}">พนักงาน (DD)</button><button data-tab="owner" class="${S.loginTab === 'owner' ? 'on' : ''}">เจ้าของ (OWN)</button></div>
    <label>เลือกรหัส<select id="code">${list.map(s => `<option value="${esc(s.code)}" ${s.code === S.loginCode ? 'selected' : ''}>${esc(s.code)}-${esc(s.nickname)}</option>`).join('') || '<option value="">— ยังไม่มีพนักงาน —</option>'}</select></label>
    <div class="pin-dots" aria-label="PIN">${Array.from({ length: len }, (_, i) => `<span class="${i < S.pinBuf.length ? 'f' : ''}"></span>`).join('')}</div>
    <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="del" class="soft">ลบ</button><button data-k="0">0</button><button data-k="ok" class="go">เข้า</button></div>
    ${S.online ? '' : '<p class="note warn">ออฟไลน์ — เข้าได้เฉพาะรหัสที่เคยเข้าในเครื่องนี้</p>'}
    ${DEMO ? '<p class="note">โหมดทดลอง</p>' : ''}
  </div></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { S.loginTab = b.dataset.tab; S.loginCode = null; renderLogin(); });
  $('#code').onchange = (e) => { S.loginCode = e.target.value; S.pinBuf = ''; drawDots(); };
  const drawDots = () => $$('.pin-dots span').forEach((d, i) => d.classList.toggle('f', i < S.pinBuf.length));
  const press = (k) => {
    if (k === 'del') S.pinBuf = S.pinBuf.slice(0, -1);
    else if (k === 'ok') return doLogin();
    else if (S.pinBuf.length < len) S.pinBuf += k;
    drawDots(); if (S.pinBuf.length === len) doLogin();
  };
  $$('.pinpad button').forEach(b => b.onclick = () => press(b.dataset.k));
  document.onkeydown = (e) => { if (S.screen !== 'login') return; if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter') press('ok'); };
}

let loggingIn = false;
async function doLogin() {
  const code = S.loginCode, pin = S.pinBuf;
  if (!code || loggingIn) return;
  loggingIn = true;
  try {
    const r = await api('login', { p_device: S.device.device_id, p_secret: S.device.secret, p_code: code, p_pin: pin });
    applySettings(r.settings, r.server_time);
    await setVerifier(code, pin);
    saveSession({ token: r.token, staff: r.staff, login_at: Date.now() });
    toast(`สวัสดี ${r.staff.nickname}`);
    syncNow();
    go(r.staff.must_change_pin ? 'pin' : (r.staff.role === 'owner' ? 'bills' : 'buy'));
  } catch (e) {
    if (isNet(e)) {
      if (await verifyLocal(code, pin)) {
        const st = S.staffList.find(s => s.code === code) || { code, nickname: code, role: 'staff' };
        saveSession({ token: null, staff: { ...st, must_change_pin: false }, login_at: Date.now(), offline: true });
        toast('เข้าระบบแบบออฟไลน์ — บิลจะส่งขึ้นระบบเมื่อมีเน็ต', 'warn');
        go(st.role === 'owner' ? 'bills' : 'buy');
      } else { toast(S.verifiers[code] ? ERR.PIN_WRONG : ERR.OFFLINE_LOGIN, 'err'); S.pinBuf = ''; $$('.pin-dots span').forEach(d => d.classList.remove('f')); }
    } else {
      toast(errText(e), 'err'); S.pinBuf = ''; $$('.pin-dots span').forEach(d => d.classList.remove('f'));
    }
  } finally { loggingIn = false; }
}

async function logout() {
  if (S.buy && S.buy.items.length && !confirm('มีบิลที่ยังไม่บันทึก ออกจากระบบเลยไหม?')) return;
  const tok = S.session && S.session.token;
  if (tok && !S.pending) api('logout', { p_token: tok }).catch(() => { });
  saveSession(null); S.buy = null; S.loginTab = 'staff';
  renderLogin();
}

function reLoginModal() {
  const st = me();
  modal(`<h2>เข้าระบบออนไลน์</h2><p class="muted">ใส่ PIN ของ ${esc(st.code)}-${esc(st.nickname)} เพื่อส่งบิลที่ค้างขึ้นระบบ</p>
    <input id="rp" type="password" inputmode="numeric" maxlength="6" autofocus class="pin-input">
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ไว้ก่อน</button><button class="btn" id="rgo">ยืนยัน</button></div>`);
  $('#rgo').onclick = async (ev) => {
    busy(ev.target, true);
    try {
      const r = await api('login', { p_device: S.device.device_id, p_secret: S.device.secret, p_code: st.code, p_pin: $('#rp').value });
      applySettings(r.settings, r.server_time); await setVerifier(st.code, $('#rp').value);
      saveSession({ token: r.token, staff: r.staff, login_at: S.session.login_at });
      closeModal(); toast('เชื่อมต่อแล้ว กำลังส่งบิล'); syncNow();
    } catch (e) { toast(errText(e), 'err'); busy(ev.target, false); }
  };
}

// ---------------------------------------------------------------- pricing
function metals() { return (S.settings && S.settings.prices && S.settings.prices.metals) || {}; }
// ฐานข้อมูลไม่รักษาลำดับ key จึงเรียงเอง: ทอง เงิน นาก แพลทินัม แล้วตามด้วยอื่นๆ
const METAL_ORDER = ['gold', 'silver', 'nak', 'platinum'];
function metalEntries(obj) { obj = obj || metals(); return Object.entries(obj).sort((a, b) => { const ia = METAL_ORDER.indexOf(a[0]), ib = METAL_ORDER.indexOf(b[0]); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]); }); }
function tiersFor(metal) {
  const P = S.settings.prices, m = metals()[metal]; if (!m) return [];
  let t = (m.tiers || []).map(x => ({ pct: num(x.pct), price: num(x.price) })).filter(x => x.pct > 0);
  if (metal === 'gold' && P.assoc_mode && num(P.assoc_buy_per_baht) > 0) {
    const p965 = Math.round(num(P.assoc_buy_per_baht) / 15.244);
    t = t.filter(x => x.pct !== 96.5).concat([{ pct: 96.5, price: p965 }]);
  }
  return t.sort((a, b) => a.pct - b.pct);
}
function priceFor(metal, pct) {
  pct = num(pct); const t = tiersFor(metal); if (!t.length || !pct) return 0;
  const exact = t.find(x => x.pct === pct); if (exact) return exact.price;
  const lower = t.filter(x => x.pct < pct).pop(), upper = t.find(x => x.pct > pct);
  if (!lower) return 0;                     // ต่ำกว่าขั้นต่ำสุด → ให้พนักงานใส่ราคาเอง
  if (!upper) return lower.price;
  if (S.settings.prices.rule === 'avg') return Math.round(lower.price + (upper.price - lower.price) * (pct - lower.pct) / (upper.pct - lower.pct));
  return lower.price;
}
function roundAmt(v) { const r = num(S.settings.prices.round) || 1; return Math.floor(v / r) * r; }

// ---------------------------------------------------------------- BUY
function newBuy() {
  const first = (metalEntries()[0] || ['gold'])[0];
  return { id: uuid(), customer: null, items: [], cash: null, note: '', entry: { metal: first, kind: (metals()[first] || {}).kinds ? metals()[first].kinds[0] : '', pct: '', weight: '', price: '', amount: '', priceEdited: false, amountEdited: false, destination: 'melt' } };
}
const buyTotal = () => S.buy.items.reduce((s, i) => s + num(i.amount), 0);

function renderBuy() {
  if (!S.buy) S.buy = newBuy();
  const B = S.buy, c = B.customer, M = metals(), e = B.entry, total = buyTotal();
  const cash = B.cash == null ? total : Math.min(num(B.cash), total), transfer = total - cash;
  const pricesDate = S.settings.prices.date;
  const stale = pricesDate !== bkkDate();
  const tiers = tiersFor(e.metal);
  shell('รับซื้อ', `
  ${!stale && isOwner() ? `<div class="banner info"><span>ราคาวันนี้ตั้งแล้ว${assocLine()}</span> <button class="btn sm ghost" id="setTodayPrice">เปลี่ยนราคา</button></div>` : ''}
  ${stale && isOwner() ? `<div class="banner warn">ราคายังไม่ได้อัปเดตวันนี้ <button class="btn sm" id="setTodayPrice">ตั้งราคาวันนี้</button></div>` : stale ? '<div class="banner warn">ราคายังไม่ได้อัปเดตวันนี้ — แจ้งเจ้าของ</div>' : ''}
  <div class="stepper"><button data-step="1" class="${S.buyStep === 1 ? 'on' : ''} ${c ? 'done' : ''}">1 ผู้ขาย</button><button data-step="2" class="${S.buyStep === 2 ? 'on' : ''} ${B.items.length ? 'done' : ''}">2 รายการ</button><button data-step="3" class="${S.buyStep === 3 ? 'on' : ''}">3 จ่ายเงิน</button></div>
  <div class="buy-grid" data-step="${S.buyStep}">
    <section class="card" data-card="1">
      <div class="card-h"><h2>ผู้ขาย</h2><span class="muted sm">${esc(thDateLong(now()))} · <span id="clock">${thTime(now())}</span></span></div>
      ${c ? `
        <div class="seller">
          ${c.photo ? `<img src="data:image/jpeg;base64,${c.photo}" alt="รูปจากบัตร">` : '<div class="nophoto">ไม่มีรูป</div>'}
          <div class="seller-info"><b class="big">${esc(c.name)}</b>
            <span>เลขบัตร ${esc(fmtId(c.id_card))}</span>
            ${c.birth ? `<span>เกิด ${esc(c.birth)}${c.gender ? ' · ' + esc(c.gender) : ''}</span>` : ''}
            ${c.address ? `<span class="muted sm">${esc(c.address)}</span>` : ''}
            ${c.card_expire ? `<span class="${cardExpired(c.card_expire) ? 'bad' : 'muted sm'}">บัตรหมดอายุ ${esc(c.card_expire)}${cardExpired(c.card_expire) ? ' — บัตรหมดอายุแล้ว!' : ''}</span>` : ''}
            ${c.bill_count ? `<span class="pill">ลูกค้าเก่า · ขายแล้ว ${c.bill_count} ครั้ง</span>` : '<span class="pill new">ลูกค้าใหม่</span>'}
          </div>
        </div>
        <label>เบอร์โทร<input id="phone" inputmode="tel" value="${esc(c.phone || '')}" placeholder="ไม่บังคับ"></label>
        <div class="row"><button class="btn ghost" id="readCard">อ่านบัตรใหม่</button><button class="btn ghost" id="clearCust">เปลี่ยนผู้ขาย</button></div>
      ` : `
        <button class="btn gold block xl" id="readCard">${icon('M3 5h18v14H3zM7 9h4M7 13h6M15 9h2v4h-2z')} อ่านบัตรประชาชน</button>
        <p class="muted center-t sm" id="cardHint">เสียบบัตรที่เครื่องอ่าน แล้วกดปุ่ม</p>
        <div class="row"><button class="btn ghost grow" id="findCust">ค้นหาลูกค้าเก่า</button><button class="btn ghost grow" id="manualCust">กรอกเอง</button></div>
      `}
      <button class="btn block next-step" data-next="2" ${c ? '' : 'disabled'}>ถัดไป: รายการ</button>
    </section>

    <section class="card" data-card="2">
      <div class="card-h"><h2>รายการ</h2><span class="muted sm">${B.items.length} รายการ</span></div>
      <div class="seg metal">${metalEntries(M).map(([k, m]) => `<button data-metal="${k}" class="${e.metal === k ? 'on' : ''}">${esc(m.label)}</button>`).join('')}</div>
      <div class="chips">${(M[e.metal] && M[e.metal].kinds || []).map(k => `<button data-kind="${esc(k)}" class="${e.kind === k ? 'on' : ''}">${esc(k)}</button>`).join('')}</div>
      <div class="lbl">เปอร์เซ็นต์ (%)</div>
      <div class="chips pct">${tiers.map(t => `<button data-pct="${t.pct}" class="${num(e.pct) === t.pct ? 'on' : ''}">${t.pct}%<small>${money(t.price)}</small></button>`).join('')}
        <input id="pct" inputmode="decimal" placeholder="ใส่เอง" value="${esc(e.pct)}" class="pct-in"></div>
      <div class="grid3">
        <label>น้ำหนัก (กรัม)<input id="weight" inputmode="decimal" value="${esc(e.weight)}" placeholder="0.00"></label>
        <label>ราคา/กรัม<input id="price" inputmode="decimal" value="${esc(e.price)}" placeholder="0" class="${e.priceEdited ? 'edited' : ''}"></label>
        <label>เป็นเงิน<input id="amount" inputmode="decimal" value="${esc(e.amount)}" placeholder="0" class="${e.amountEdited ? 'edited' : ''}"></label>
      </div>
      <div class="seg dest"><button data-dest="melt" class="${e.destination === 'melt' ? 'on' : ''}">นำไปหลอม</button><button data-dest="whole" class="${e.destination === 'whole' ? 'on' : ''}">ขายทั้งชิ้น</button></div>
      <button class="btn block" id="addItem">+ เพิ่มรายการ</button>
      <div class="items">${B.items.map((it, i) => `
        <div class="item"><div><b>${esc(M[it.metal] ? M[it.metal].label : it.metal)} ${esc(it.pct)}%</b> · ${esc(it.kind)}<br><span class="muted sm">${gram(it.weight)} ก. × ${money(it.price_per_g)} · ${it.destination === 'melt' ? 'หลอม' : 'ขายทั้งชิ้น'}</span></div>
        <div class="right"><b>${money(it.amount)}</b><button class="x" data-del="${i}" aria-label="ลบ">✕</button></div></div>`).join('') || '<p class="muted center-t sm">ยังไม่มีรายการ</p>'}</div>
      <div class="sum"><span>รวม</span><b>${money(total)} บาท</b></div>
      <button class="btn block next-step" data-next="3" ${B.items.length ? '' : 'disabled'}>ถัดไป: จ่ายเงิน</button>
    </section>

    <section class="card" data-card="3">
      <div class="card-h"><h2>จ่ายเงิน</h2></div>
      <div class="total-box"><span>ยอดจ่ายลูกค้า</span><b>${money(total)}</b><small>บาท</small></div>
      <div class="row"><button class="btn ghost grow" data-pay="cash">เงินสดทั้งหมด</button><button class="btn ghost grow" data-pay="transfer">โอนทั้งหมด</button></div>
      <div class="grid2">
        <label>เงินสด<input id="cash" inputmode="decimal" value="${cash ? cash : ''}" placeholder="0"></label>
        <label>โอน<input id="transfer" inputmode="decimal" value="${transfer ? transfer : ''}" placeholder="0"></label>
      </div>
      <label>หมายเหตุ<input id="note" value="${esc(B.note)}" placeholder="ไม่บังคับ"></label>
      <button class="btn gold block xl" id="confirmBill" ${c && B.items.length ? '' : 'disabled'}>ยืนยันด้วย PIN และพิมพ์</button>
      ${!c ? '<p class="muted sm center-t">ยังไม่มีผู้ขาย</p>' : !B.items.length ? '<p class="muted sm center-t">ยังไม่มีรายการ</p>' : ''}
    </section>
  </div>`);
  bindBuy();
}
function assocLine() {
  const P = S.settings.prices, A = P.assoc;
  if (!P.assoc_mode) return ' · ตั้งราคาเอง';
  if (A && A.orn_buy) return ` · สมาคม${A.as_of ? ' (' + esc(A.as_of) + ')' : ''}: แท่ง รับ ${money(A.bar_buy)} / ขาย ${money(A.bar_sell)} · รูปพรรณ รับ ${money(A.orn_buy)} / ขาย ${money(A.orn_sell)}`;
  return ` · ฐาน 96.5% ${money(P.assoc_buy_per_baht)} บาท/บาททอง`;
}
function cardExpired(exp) { const m = String(exp).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return false; let y = +m[3]; if (y > 2400) y -= 543; return new Date(y, +m[2] - 1, +m[1]) < now(); }

function bindBuy() {
  const B = S.buy, e = B.entry;
  const stp = $('#setTodayPrice'); if (stp) stp.onclick = dailyPriceModal;
  $$('.stepper [data-step]').forEach(b => b.onclick = () => { S.buyStep = +b.dataset.step; renderBuy(); });
  $$('[data-next]').forEach(b => b.onclick = () => { S.buyStep = +b.dataset.next; renderBuy(); });
  const rc = $('#readCard'); if (rc) rc.onclick = readCard;
  const fc = $('#findCust'); if (fc) fc.onclick = () => customerSearchModal(c => { setCustomer(c); });
  const mc = $('#manualCust'); if (mc) mc.onclick = manualCustomerModal;
  const cc = $('#clearCust'); if (cc) cc.onclick = () => { B.customer = null; renderBuy(); };
  const ph = $('#phone'); if (ph) ph.oninput = () => { B.customer.phone = ph.value.trim(); };

  $$('[data-metal]').forEach(b => b.onclick = () => { e.metal = b.dataset.metal; e.kind = (metals()[e.metal].kinds || [''])[0]; e.pct = ''; e.priceEdited = false; e.amountEdited = false; e.price = ''; e.amount = ''; renderBuy(); });
  $$('[data-kind]').forEach(b => b.onclick = () => { e.kind = b.dataset.kind; $$('[data-kind]').forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-dest]').forEach(b => b.onclick = () => { e.destination = b.dataset.dest; $$('[data-dest]').forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-pct]').forEach(b => b.onclick = () => { e.pct = b.dataset.pct; $('#pct').value = e.pct; $$('[data-pct]').forEach(x => x.classList.toggle('on', x === b)); e.priceEdited = false; recalc(); $('#weight').focus(); });
  $('#pct').oninput = (ev) => { e.pct = ev.target.value; $$('[data-pct]').forEach(x => x.classList.toggle('on', num(x.dataset.pct) === num(e.pct))); e.priceEdited = false; recalc(); };
  $('#weight').oninput = (ev) => { e.weight = ev.target.value; recalc(); };
  $('#price').oninput = (ev) => { e.price = ev.target.value; e.priceEdited = true; ev.target.classList.add('edited'); e.amountEdited = false; recalc(); };
  $('#amount').oninput = (ev) => { e.amount = ev.target.value; e.amountEdited = true; ev.target.classList.add('edited'); };
  $('#weight').onkeydown = (ev) => { if (ev.key === 'Enter') addItem(); };
  $('#addItem').onclick = addItem;
  $$('[data-del]').forEach(b => b.onclick = () => { B.items.splice(+b.dataset.del, 1); B.cash = null; renderBuy(); });

  const total = buyTotal();
  $$('[data-pay]').forEach(b => b.onclick = () => { B.cash = b.dataset.pay === 'cash' ? total : 0; renderBuy(); });
  $('#cash').oninput = (ev) => { B.cash = Math.min(num(ev.target.value), total); $('#transfer').value = total - B.cash || ''; };
  $('#transfer').oninput = (ev) => { const t = Math.min(num(ev.target.value), total); B.cash = total - t; $('#cash').value = B.cash || ''; };
  $('#note').oninput = (ev) => { B.note = ev.target.value; };
  $('#confirmBill').onclick = confirmBill;
}
function recalc() {
  const e = S.buy.entry;
  if (!e.priceEdited) { const p = priceFor(e.metal, e.pct); e.price = p ? String(p) : ''; $('#price').value = e.price; $('#price').classList.remove('edited'); }
  if (!e.amountEdited) { const a = roundAmt(num(e.weight) * num(e.price)); e.amount = a ? String(a) : ''; $('#amount').value = e.amount; $('#amount').classList.remove('edited'); }
}
function addItem() {
  const e = S.buy.entry;
  if (!num(e.pct) || num(e.pct) > 100) return toast('ใส่เปอร์เซ็นต์ให้ถูกต้อง', 'err');
  if (!num(e.weight)) return toast('ใส่น้ำหนัก', 'err');
  if (!num(e.amount)) return toast('ยังไม่มีราคา — ใส่ราคา/กรัมเอง หรือให้เจ้าของตั้งราคา %', 'err');
  S.buy.items.push({ metal: e.metal, kind: e.kind, pct: num(e.pct), weight: num(e.weight), price_per_g: num(e.price), amount: num(e.amount), destination: e.destination, price_edited: e.priceEdited || e.amountEdited });
  Object.assign(e, { pct: '', weight: '', price: '', amount: '', priceEdited: false, amountEdited: false });
  S.buy.cash = null; renderBuy();
}

// ----- card reader
async function readCard() {
  const btn = $('#readCard'); busy(btn, true);
  const hint = $('#cardHint'); if (hint) hint.textContent = 'กำลังอ่านบัตร...';
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch((CFG.HELPER_URL || 'http://127.0.0.1:8765') + '/card', { signal: ctrl.signal }).then(x => x.json()).finally(() => clearTimeout(t));
    if (!r.ok) throw new Error(r.error || 'อ่านบัตรไม่สำเร็จ');
    const d = r.data;
    let known = null;
    try { known = await idb.get('customers', d.cid); } catch (e) { /* ignore */ }
    if (S.online && S.session.token) { try { const g = await api('get_customer', { p_token: S.session.token, p_id: d.cid }); if (g) known = { ...g.customer, ...(known || {}) , bill_count: g.customer.bill_count }; } catch (e) { /* ignore */ } }
    setCustomer({ id_card: d.cid, name: d.name_th, name_en: d.name_en, birth: d.birth, gender: d.gender, address: d.address, card_issue: d.issue, card_expire: d.expire, photo: d.photo || null, phone: known ? known.phone : '', bill_count: known ? known.bill_count : 0, source: 'card' });
    toast('อ่านบัตรสำเร็จ');
  } catch (e) {
    busy(btn, false);
    const msg = (e.name === 'TypeError' || e.name === 'AbortError') ? 'ไม่พบโปรแกรมเครื่องอ่านบัตร — เปิด "DD เครื่องอ่านบัตร" ในคอมก่อน' :
      ({ NO_READER: 'ไม่พบเครื่องอ่านบัตร เช็กสาย USB', NO_CARD: 'ยังไม่ได้เสียบบัตร', READ_FAIL: 'อ่านบัตรไม่ได้ ลองถอดเสียบใหม่' }[e.message] || e.message);
    if (hint) hint.textContent = msg; toast(msg, 'err');
  }
}
function setCustomer(c) {
  S.buy.customer = c;
  idb.put('customers', { ...c, last_seen: now().toISOString() }).catch(() => { });
  if (window.innerWidth < 900) S.buyStep = 2;
  renderBuy();
}
function manualCustomerModal() {
  modal(`<h2>กรอกข้อมูลผู้ขาย</h2>
    <label>เลขบัตรประชาชน 13 หลัก *<input id="m_id" inputmode="numeric" maxlength="13" autofocus></label>
    <label>ชื่อ-นามสกุล *<input id="m_name" placeholder="เช่น นายสมชาย ใจดี"></label>
    <label>เบอร์โทร<input id="m_phone" inputmode="tel"></label>
    <label>ที่อยู่<textarea id="m_addr" rows="2"></textarea></label>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ยกเลิก</button><button class="btn" id="m_ok">ใช้ข้อมูลนี้</button></div>`);
  $('#m_ok').onclick = () => {
    const id = $('#m_id').value.replace(/\D/g, ''), name = $('#m_name').value.trim();
    if (id.length !== 13) return toast('เลขบัตรต้องมี 13 หลัก', 'err');
    if (!validThaiId(id) && !confirm('เลขบัตรนี้ตรวจหลักสุดท้ายไม่ผ่าน ใช้ต่อไหม?')) return;
    if (!name) return toast('ใส่ชื่อ', 'err');
    const phone = $('#m_phone').value.trim(), address = $('#m_addr').value.trim();
    closeModal(); setCustomer({ id_card: id, name, phone, address, source: 'manual' });
  };
}
function validThaiId(id) { if (!/^\d{13}$/.test(id)) return false; let s = 0; for (let i = 0; i < 12; i++) s += +id[i] * (13 - i); return (11 - s % 11) % 10 === +id[12]; }

async function searchCustomers(q) {
  q = q.trim(); if (q.length < 2) return [];
  const local = (await idb.all('customers')).filter(c => [c.id_card, c.phone, c.name, c.name_en].some(v => v && String(v).toLowerCase().includes(q.toLowerCase())));
  if (S.online && S.session.token) {
    try {
      const r = await api('find_customers', { p_token: S.session.token, p_q: q });
      const map = new Map(local.map(c => [c.id_card, c])); r.forEach(c => map.set(c.id_card, { ...(map.get(c.id_card) || {}), ...c })); return Array.from(map.values());
    } catch (e) { /* fallback local */ }
  }
  return local;
}
function customerSearchModal(onPick) {
  modal(`<h2>ค้นหาลูกค้า</h2><input id="cq" placeholder="เลขบัตร / เบอร์ / ชื่อ / เลขบิล" autofocus><div id="cres" class="list"></div>`, { wide: true });
  let t; $('#cq').oninput = (ev) => { clearTimeout(t); t = setTimeout(async () => {
    const res = await searchCustomers(ev.target.value);
    $('#cres').innerHTML = res.map((c, i) => `<button class="list-row" data-i="${i}"><b>${esc(c.name)}</b><span class="muted sm">${esc(maskId(c.id_card))} · ${esc(c.phone || '-')} · ${c.bill_count || 0} บิล</span></button>`).join('') || '<p class="muted">ไม่พบ</p>';
    $$('#cres [data-i]').forEach(b => b.onclick = () => { closeModal(); onPick(res[+b.dataset.i]); });
  }, 250); };
}

// ----- confirm & save
function confirmBill() {
  const people = S.staffList.filter(s => S.verifiers[s.code]);
  if (!people.some(p => p.code === me().code)) people.unshift(me());
  modal(`<h2>ยืนยันบิล ${money(buyTotal())} บาท</h2>
    <p class="muted">ใส่ PIN ของคนที่ทำรายการนี้</p>
    <label>รหัสพนักงาน<select id="cf_code">${people.map(p => `<option value="${esc(p.code)}" ${p.code === me().code ? 'selected' : ''}>${esc(p.code)}-${esc(p.nickname)}</option>`).join('')}</select></label>
    <input id="cf_pin" type="password" inputmode="numeric" maxlength="6" class="pin-input" autofocus autocomplete="off">
    <div class="row end"><button class="btn ghost" onclick="closeModal()">กลับไปแก้</button><button class="btn gold" id="cf_ok">บันทึกและพิมพ์</button></div>`, { sticky: true });
  $('#cf_pin').onkeydown = (e) => { if (e.key === 'Enter') $('#cf_ok').click(); };
  $('#cf_ok').onclick = async (ev) => {
    const code = $('#cf_code').value, pin = $('#cf_pin').value;
    busy(ev.target, true);
    let ok = await verifyLocal(code, pin);
    if (!ok && S.online) {   // ยังไม่มีข้อมูล PIN ในเครื่อง → ตรวจกับเซิร์ฟเวอร์
      try { const r = await api('login', { p_device: S.device.device_id, p_secret: S.device.secret, p_code: code, p_pin: pin }); await setVerifier(code, pin); ok = true; if (code === me().code && !S.session.token) saveSession({ ...S.session, token: r.token }); else api('logout', { p_token: r.token }).catch(() => { }); }
      catch (e) { if (!isNet(e)) { toast(errText(e), 'err'); busy(ev.target, false); return; } }
    }
    if (!ok) { toast(ERR.PIN_WRONG, 'err'); busy(ev.target, false); $('#cf_pin').value = ''; return; }
    await saveBill(code);
  };
}
function nextBillNo() {
  const d = now(); const ymd = bkkDate(d).split('-'); const be = String(+ymd[0] + 543).slice(2);
  const key = 'dd_seq_' + ymd.join(''); const n = load(key, 0) + 1; store(key, n);
  return `${S.device.device_id}-${be}${ymd[1]}${ymd[2]}-${String(n).padStart(4, '0')}`;
}
async function saveBill(staffCode) {
  const B = S.buy, total = buyTotal(), cash = B.cash == null ? total : Math.min(num(B.cash), total);
  const created = now().toISOString();
  const payload = {
    id: B.id, bill_no: nextBillNo(), staff_code: staffCode, device_id: S.device.device_id, created_at: created,
    customer: { id_card: B.customer.id_card, name: B.customer.name, name_en: B.customer.name_en || null, birth: B.customer.birth || null, gender: B.customer.gender || null, address: B.customer.address || '', phone: B.customer.phone || '', photo: B.customer.photo || null, card_issue: B.customer.card_issue || null, card_expire: B.customer.card_expire || null, source: B.customer.source || null },
    items: B.items, total, pay_cash: cash, pay_transfer: total - cash, note: B.note || null
  };
  const rec = { id: B.id, bill_no: payload.bill_no, created_at: created, synced: false, payload };
  await idb.put('bills', rec);
  const staff = S.staffList.find(s => s.code === staffCode) || me();
  closeModal();
  printReceipt(payload, staff);
  toast(`บันทึกบิล ${payload.bill_no} แล้ว`);
  S.buy = newBuy(); S.buyStep = 1;
  await updatePending(); syncNow();
  renderBuy();
}

// ---------------------------------------------------------------- receipt (58mm)
function receiptHtml(b, staff, copyLabel) {
  const shop = S.settings.shop || {}, rc = S.settings.receipt || {}, M = metals(), c = b.customer || {};
  return `<div class="rcpt">
    ${shop.logo ? `<img src="${shop.logo}" class="r-logo" alt="">` : ''}
    <div class="r-c r-b r-xl">${esc(shop.name || '')}</div>
    ${shop.name2 ? `<div class="r-c">${esc(shop.name2)}</div>` : ''}
    <div class="r-c">${esc(shop.branch || '')}</div>
    ${shop.address ? `<div class="r-c r-s">${esc(shop.address)}</div>` : ''}
    ${shop.phone ? `<div class="r-c r-s">โทร ${esc(shop.phone)}${shop.line ? ' · LINE ' + esc(shop.line) : ''}</div>` : ''}
    <div class="r-hr"></div>
    <div class="r-c r-b r-l">ใบรับซื้อ${copyLabel ? ` <span class="r-s">(${copyLabel})</span>` : ''}</div>
    ${b.status === 'void' ? '<div class="r-c r-b r-l">*** ยกเลิกแล้ว ***</div>' : ''}
    <div class="r-row"><span>เลขที่</span><b>${esc(b.bill_no)}</b></div>
    <div class="r-row"><span>วันที่</span><span>${esc(thDateTime(b.created_at))}</span></div>
    <div class="r-row"><span>ผู้รับซื้อ</span><span>${esc(staff ? staff.code + '-' + staff.nickname : b.staff_code)}</span></div>
    <div class="r-hr"></div>
    <div class="r-b">ผู้ขาย: ${esc(c.name)}</div>
    <div class="r-s">เลขบัตร ${esc(fmtId(c.id_card))}</div>
    ${c.phone ? `<div class="r-s">โทร ${esc(c.phone)}</div>` : ''}
    ${c.address ? `<div class="r-s">${esc(c.address)}</div>` : ''}
    <div class="r-hr"></div>
    ${b.items.map((it, i) => `<div class="r-it"><div>${i + 1}. ${esc(M[it.metal] ? M[it.metal].label : it.metal)} ${esc(it.pct)}% ${esc(it.kind || '')}</div>
      <div class="r-row r-s"><span>${gram(it.weight)} ก. × ${money(it.price_per_g)}</span><b>${money(it.amount)}</b></div></div>`).join('')}
    <div class="r-hr"></div>
    <div class="r-row r-b r-l"><span>รวมเงิน</span><span>${money(b.total)} บาท</span></div>
    <div class="r-row r-s"><span>น้ำหนักรวม</span><span>${gram(b.items.reduce((s, i) => s + num(i.weight), 0))} ก.</span></div>
    ${b.pay_cash ? `<div class="r-row"><span>เงินสด</span><span>${money(b.pay_cash)}</span></div>` : ''}
    ${b.pay_transfer ? `<div class="r-row"><span>โอน</span><span>${money(b.pay_transfer)}</span></div>` : ''}
    ${b.note ? `<div class="r-s">หมายเหตุ: ${esc(b.note)}</div>` : ''}
    <div class="r-hr"></div>
    <div class="r-s r-j">${esc(rc.consent || '')}</div>
    <div class="r-sign">ลงชื่อ ........................................ ผู้ขาย</div>
    <div class="r-c r-s">(${esc(c.name)})</div>
    <div class="r-sign">ลงชื่อ ........................................ ผู้รับซื้อ</div>
    <div class="r-hr"></div>
    <div class="r-c r-s">${esc(shop.footer || '')}</div>
    <div class="r-c r-s">${esc(b.bill_no)}</div>
    <div class="r-feed"></div>
  </div>`;
}
function printReceipt(b, staff) {
  const copies = Math.max(1, Math.min(3, num((S.settings.receipt || {}).copies) || 1));
  const labels = copies === 1 ? [''] : ['ลูกค้า', 'ร้าน', 'สำเนา'].slice(0, copies);
  $('#print').innerHTML = labels.map(l => receiptHtml(b, staff, l)).join('<div class="r-break"></div>');
  setTimeout(() => window.print(), 150);
}

// ---------------------------------------------------------------- BILLS / summary
async function loadBills(date) {
  const local = (await idb.all('bills')).filter(b => bkkDate(b.created_at) === date);
  let server = [];
  let fromServer = false;
  if (S.online && S.session.token) {
    try { server = await api('list_bills', { p_token: S.session.token, p_from: date, p_to: date }); fromServer = true; } catch (e) { if (e.message === 'SESSION_INVALID') sessionExpired(); }
  }
  const map = new Map();
  server.forEach(b => map.set(b.id, { ...b, synced: true }));
  local.forEach(r => { if (!map.has(r.id)) map.set(r.id, { ...r.payload, bill_no: r.bill_no, synced: r.synced, error: r.error, status: 'ok', localOnly: true }); });
  return { bills: Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at)), fromServer };
}
async function renderBills() {
  shell('สรุปวันนี้', '<div class="center"><span class="spin big"></span></div>');
  const { bills, fromServer } = await loadBills(S.billsDate);
  if (S.screen !== 'bills') return;
  const ok = bills.filter(b => b.status !== 'void');
  const sum = (f) => ok.reduce((s, b) => s + num(f(b)), 0);
  const total = sum(b => b.total), cash = sum(b => b.pay_cash), tr = sum(b => b.pay_transfer);
  const byMetal = {}; ok.forEach(b => b.items.forEach(it => { const k = it.metal; byMetal[k] = byMetal[k] || { w: 0, a: 0 }; byMetal[k].w += num(it.weight); byMetal[k].a += num(it.amount); }));
  const byPct = {}; ok.forEach(b => b.items.filter(i => i.metal === 'gold').forEach(it => { byPct[it.pct] = (byPct[it.pct] || 0) + num(it.weight); }));
  const M = metals();
  $('.main').innerHTML = `<h1 class="screen-title">สรุป <input type="date" id="bdate" value="${S.billsDate}" max="${bkkDate()}"></h1>
    ${!fromServer && S.session.token ? '' : ''}
    ${!fromServer ? '<div class="banner warn">ออฟไลน์ — แสดงเฉพาะบิลที่ทำในเครื่องนี้</div>' : ''}
    <div class="kpis">
      <div class="kpi"><span>รับซื้อ</span><b>${money(total)}</b><small>${ok.length} บิล</small></div>
      <div class="kpi"><span>จ่ายเงินสด</span><b>${money(cash)}</b><small>ออกจากลิ้นชัก</small></div>
      <div class="kpi"><span>จ่ายโอน</span><b>${money(tr)}</b><small>&nbsp;</small></div>
      ${Object.entries(byMetal).map(([k, v]) => `<div class="kpi"><span>${esc(M[k] ? M[k].label : k)}</span><b>${gram(v.w)} ก.</b><small>${money(v.a)} บาท</small></div>`).join('')}
    </div>
    ${Object.keys(byPct).length ? `<div class="card"><h2>ทองแยกตาม %</h2><div class="pct-bars">${Object.entries(byPct).sort((a, b) => b[0] - a[0]).map(([p, w]) => { const mx = Math.max(...Object.values(byPct)); return `<div class="pb"><span>${p}%</span><div><i style="width:${(w / mx * 100).toFixed(1)}%"></i></div><b>${gram(w)} ก.</b></div>`; }).join('')}</div></div>` : ''}
    <div class="card"><div class="card-h"><h2>บิลรับซื้อ</h2>${S.pending ? `<button class="btn sm" id="syncBtn">ส่งบิลค้าง ${S.pending}</button>` : ''}</div>
    <div class="list">${bills.map(b => `<button class="list-row bill ${b.status === 'void' ? 'void' : ''}" data-id="${b.id}">
      <div><b>${esc(b.bill_no)}</b> <span class="muted sm">${thTime(b.created_at)} · ${esc(b.staff_code || '')}</span><br><span class="sm">${esc((b.customer || {}).name || '')}</span></div>
      <div class="right"><b>${money(b.total)}</b><br>${b.status === 'void' ? '<span class="pill bad">ยกเลิก</span>' : b.synced ? '<span class="pill ok">ส่งแล้ว</span>' : b.error ? `<span class="pill bad" title="${esc(b.error)}">ส่งไม่ได้</span>` : '<span class="pill warn">รอส่ง</span>'}</div></button>`).join('') || '<p class="muted center-t">ยังไม่มีบิล</p>'}</div></div>`;
  $('#bdate').onchange = (e) => { S.billsDate = e.target.value || bkkDate(); renderBills(); };
  const sb = $('#syncBtn'); if (sb) sb.onclick = () => { if (!S.session.token) reLoginModal(); else syncNow(); };
  $$('.bill').forEach(r => r.onclick = () => billDetail(bills.find(b => b.id === r.dataset.id)));
}
function cancelCfg() { return Object.assign({ enabled: false, limit: 20000, today_only: true }, (S.settings && S.settings.cancel) || {}); }
function canCancel(b) {
  if (b.status === 'void' || !b.synced) return false;
  if (isOwner()) return true;
  const c = cancelCfg();
  if (!c.enabled) return false;
  if (c.today_only && bkkDate(b.created_at) !== bkkDate()) return false;
  return true;
}
function billDetail(b) {
  const staff = S.staffList.find(s => s.code === b.staff_code);
  const can = canCancel(b);
  modal(`<div class="rcpt-preview">${receiptHtml(b, staff, '')}</div>
    ${b.status === 'void' ? `<p class="bad">ยกเลิกแล้ว: ${esc(b.void_reason || '')}</p>` : ''}
    ${!b.synced && b.status !== 'void' ? '<p class="muted sm">บิลยังไม่ถูกส่งขึ้นระบบ — ยกเลิกได้หลังส่งแล้ว</p>' : ''}
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ปิด</button>
    ${can ? '<button class="btn danger" id="voidBtn">ยกเลิกบิล</button>' : ''}
    <button class="btn" id="reprint">พิมพ์ซ้ำ</button></div>`, { wide: true });
  $('#reprint').onclick = () => { printReceipt(b, staff); };
  const vb = $('#voidBtn'); if (vb) vb.onclick = () => voidModal(b);
}
function voidModal(b) {
  if (!S.online || !S.session.token) return toast('ต้องออนไลน์และเข้าระบบออนไลน์ก่อนยกเลิกบิล', 'err');
  const c = cancelCfg();
  const needOwner = !isOwner() && num(b.total) > num(c.limit);
  const owners = S.staffList.filter(s => s.role === 'owner');
  modal(`<h2>ยกเลิกบิล ${esc(b.bill_no)}</h2>
    <p class="muted">ยอด ${money(b.total)} บาท · ${esc((b.customer || {}).name || '')} · ${thDateTime(b.created_at)}</p>
    <label>เหตุผลที่ยกเลิก *<input id="vr" placeholder="เช่น ใส่น้ำหนักผิด / ลูกค้าเปลี่ยนใจ" autofocus maxlength="200"></label>
    ${needOwner ? `<div class="banner warn">บิลเกิน ${money(c.limit)} บาท ต้องให้เจ้าของอนุมัติ</div>
      <label>เจ้าของที่อนุมัติ<select id="vo">${owners.map(o => `<option value="${esc(o.code)}">${esc(o.code)}-${esc(o.nickname)}</option>`).join('')}</select></label>
      <label>PIN เจ้าของ<input id="vp" type="password" inputmode="numeric" maxlength="6" class="pin-input" autocomplete="off"></label>` : ''}
    ${!isOwner() && !needOwner ? `<p class="muted sm">บิลไม่เกิน ${money(c.limit)} บาท พนักงานยกเลิกเองได้ ระบบบันทึกชื่อคุณและเหตุผลไว้ในประวัติ</p>` : ''}
    <div class="row end"><button class="btn ghost" id="vBack">กลับ</button><button class="btn danger" id="vOk">ยืนยันยกเลิกบิล</button></div>`, { sticky: true });
  $('#vBack').onclick = () => billDetail(b);
  $('#vOk').onclick = async (ev) => {
    const reason = $('#vr').value.trim(); if (!reason) return toast(ERR.REASON_REQUIRED, 'err');
    const params = { p_token: S.session.token, p_id: b.id, p_reason: reason };
    if (needOwner) { params.p_approver_code = $('#vo').value; params.p_approver_pin = $('#vp').value; if (!params.p_approver_pin) return toast('ให้เจ้าของใส่ PIN', 'err'); }
    busy(ev.target, true);
    try {
      const r = await api('void_bill', params);
      toast(`ยกเลิกบิล ${b.bill_no} แล้ว${r && r.approved_by ? ' (อนุมัติโดย ' + r.approved_by + ')' : ''}`);
      closeModal(); renderBills();
    } catch (e) {
      busy(ev.target, false);
      if (e.message === 'NEED_OWNER') { toast(ERR.NEED_OWNER, 'warn'); return; }
      toast(errText(e), 'err'); const vp = $('#vp'); if (vp) vp.value = '';
    }
  };
}

// ---------------------------------------------------------------- customers
function renderCustomers() {
  shell('ลูกค้า', `<div class="card"><input id="cq" placeholder="ค้นหา: เลขบัตร / เบอร์ / ชื่อ / เลขบิล" autofocus><div id="cres" class="list"></div></div>`);
  let t; $('#cq').oninput = (ev) => { clearTimeout(t); t = setTimeout(async () => {
    const res = await searchCustomers(ev.target.value);
    $('#cres').innerHTML = res.map((c, i) => `<button class="list-row" data-i="${i}"><div><b>${esc(c.name)}</b><br><span class="muted sm">${esc(maskId(c.id_card))} · ${esc(c.phone || '-')}</span></div><div class="right">${c.bill_count || 0} บิล</div></button>`).join('') || '<p class="muted">ไม่พบ</p>';
    $$('#cres [data-i]').forEach(b => b.onclick = () => customerDetail(res[+b.dataset.i]));
  }, 250); };
}
async function customerDetail(c) {
  let full = c, bills = [];
  if (S.online && S.session.token) { try { const r = await api('get_customer', { p_token: S.session.token, p_id: c.id_card }); if (r) { full = { ...c, ...r.customer }; bills = r.bills; } } catch (e) { /* ignore */ } }
  modal(`<div class="seller">${full.photo ? `<img src="data:image/jpeg;base64,${full.photo}" alt="">` : '<div class="nophoto">ไม่มีรูป</div>'}
    <div class="seller-info"><b class="big">${esc(full.name)}</b><span>${esc(isOwner() ? fmtId(full.id_card) : maskId(full.id_card))}</span><span>โทร ${esc(full.phone || '-')}</span><span class="muted sm">${esc(full.address || '')}</span></div></div>
    <h3>ประวัติขาย (${bills.length})</h3><div class="list">${bills.map(b => `<div class="list-row"><span>${esc(b.bill_no)} <span class="muted sm">${thDateTime(b.created_at)}</span></span><b class="${b.status === 'void' ? 'bad' : ''}">${money(b.total)}</b></div>`).join('') || '<p class="muted">—</p>'}</div>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ปิด</button><button class="btn" id="buyFrom">รับซื้อจากคนนี้</button></div>`, { wide: true });
  $('#buyFrom').onclick = () => { closeModal(); S.buy = newBuy(); S.screen = 'buy'; setCustomer({ ...full, source: 'search' }); };
}

// ---------------------------------------------------------------- more
function renderMore() {
  const items = [
    ['pin', 'เปลี่ยน PIN / ชื่อเล่นของฉัน', 'ทุกคน'],
    ...(isOwner() ? [['todayprice', 'ตั้งราคาวันนี้ / เปลี่ยนราคาระหว่างวัน', 'เจ้าของ'], ['settings', 'ตั้งค่าราคา & ร้าน', 'เจ้าของ'], ['staff', 'จัดการพนักงาน', 'เจ้าของ'], ['audit', 'ประวัติการใช้งาน (ตรวจสอบ)', 'เจ้าของ']] : [])
  ];
  shell('เพิ่มเติม', `<div class="card list">${items.map(i => `<button class="list-row" data-go3="${i[0]}"><b>${i[1]}</b><span class="muted sm">${i[2]} ›</span></button>`).join('')}</div>
    <div class="card"><h2>เครื่องนี้</h2><p class="muted sm">เครื่อง ${esc(S.device.device_id)} · ${esc(S.device.name)} · เวอร์ชัน ${APP_VERSION}${DEMO ? ' · โหมดทดลอง' : ''}</p>
    <div class="row"><button class="btn ghost" id="testPrint">ทดสอบพิมพ์</button><button class="btn ghost" id="testCard">ทดสอบเครื่องอ่านบัตร</button></div></div>`);
  $$('[data-go3]').forEach(b => b.onclick = () => b.dataset.go3 === 'todayprice' ? dailyPriceModal() : go(b.dataset.go3));
  $('#testPrint').onclick = () => printReceipt({ bill_no: 'TEST-0000', created_at: now().toISOString(), staff_code: me().code, customer: { name: 'ทดสอบพิมพ์', id_card: '1234567890123' }, items: [{ metal: 'gold', kind: 'ทดสอบ', pct: 96.5, weight: 1, price_per_g: 1000, amount: 1000 }], total: 1000, pay_cash: 1000, pay_transfer: 0 }, me());
  $('#testCard').onclick = async () => { try { const r = await fetch((CFG.HELPER_URL || 'http://127.0.0.1:8765') + '/status').then(x => x.json()); toast(r.reader ? 'เจอเครื่องอ่าน: ' + r.reader : 'โปรแกรมทำงาน แต่ไม่เจอเครื่องอ่านบัตร', r.reader ? 'ok' : 'warn'); } catch (e) { toast('ไม่พบโปรแกรมเครื่องอ่านบัตรในเครื่องนี้', 'err'); } };
}

// ---------------------------------------------------------------- change PIN
function renderPin() {
  const len = me().role === 'owner' ? 6 : 4;
  shell('PIN ของฉัน', `<div class="card narrow">
    ${me().must_change_pin ? '<div class="banner warn">ต้องเปลี่ยน PIN ชั่วคราวก่อนเริ่มใช้งาน — PIN ใหม่จะรู้แค่คุณคนเดียว</div>' : ''}
    <label>PIN ปัจจุบัน<input id="p0" type="password" inputmode="numeric" maxlength="${len}"></label>
    <label>PIN ใหม่ (${len} หลัก)<input id="p1" type="password" inputmode="numeric" maxlength="${len}"></label>
    <label>ใส่ PIN ใหม่อีกครั้ง<input id="p2" type="password" inputmode="numeric" maxlength="${len}"></label>
    <button class="btn block" id="pgo">เปลี่ยน PIN</button></div>
    <div class="card narrow"><label>ชื่อเล่นที่แสดงหลังรหัส<input id="nn" value="${esc(me().nickname)}" maxlength="20"></label><button class="btn ghost block" id="ngo">บันทึกชื่อเล่น</button></div>`);
  $('#pgo').onclick = async (ev) => {
    if (!S.session.token) return toast('ต้องออนไลน์เพื่อเปลี่ยน PIN', 'err');
    const p0 = $('#p0').value, p1 = $('#p1').value;
    if (p1 !== $('#p2').value) return toast('PIN ใหม่สองช่องไม่ตรงกัน', 'err');
    if (!new RegExp(`^\\d{${len}}$`).test(p1)) return toast(`PIN ต้องเป็นตัวเลข ${len} หลัก`, 'err');
    busy(ev.target, true);
    try { await api('change_pin', { p_token: S.session.token, p_old: p0, p_new: p1 }); await setVerifier(me().code, p1); S.session.staff.must_change_pin = false; saveSession(S.session); toast('เปลี่ยน PIN แล้ว'); go(isOwner() ? 'bills' : 'buy'); }
    catch (e) { toast(errText(e), 'err'); busy(ev.target, false); }
  };
  $('#ngo').onclick = async () => {
    const n = $('#nn').value.trim(); if (!n) return;
    try { await api('set_my_nickname', { p_token: S.session.token, p_nickname: n }); S.session.staff.nickname = n; saveSession(S.session); toast('บันทึกแล้ว'); renderPin(); } catch (e) { toast(errText(e), 'err'); }
  };
}

// ---------------------------------------------------------------- settings (owner)
let setTab = 'prices';
function renderSettings() {
  if (!isOwner()) return go('buy');
  const st = deepCopy(S.settings), P = st.prices, shop = st.shop, rc = st.receipt || {};
  const tabs = [['prices', 'ราคา'], ['shop', 'ข้อมูลร้าน'], ['receipt', 'ใบรับซื้อ'], ['cancel', 'ยกเลิกบิล']];
  let body = '';
  if (setTab === 'prices') {
    body = `<div class="card">
      <div class="card-h"><h2>ราคารับซื้อ (บาท/กรัม)</h2><span class="muted sm">อัปเดตล่าสุด ${P.date ? esc(P.date) : '—'}</span></div>
      <label class="switch"><input type="checkbox" id="assoc" ${P.assoc_mode ? 'checked' : ''}> ใช้ราคาสมาคมเป็นราคา 96.5%</label>
      <label>ราคาสมาคม รับซื้อทองรูปพรรณ 96.5% (บาทละ)<input id="assocP" inputmode="decimal" value="${esc(P.assoc_buy_per_baht || '')}"></label>
      <p class="muted sm" id="assocCalc"></p>
      <label>ถ้า % อยู่ระหว่างขั้น<select id="rule"><option value="lower" ${P.rule !== 'avg' ? 'selected' : ''}>ใช้ราคาขั้นที่ต่ำกว่า (ปลอดภัย)</option><option value="avg" ${P.rule === 'avg' ? 'selected' : ''}>เฉลี่ยตามสัดส่วนระหว่างขั้น</option></select></label>
      <label>ปัดเศษยอดเงินลงทีละ<select id="round">${[1, 5, 10, 50, 100].map(v => `<option ${num(P.round) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    ${metalEntries(P.metals).map(([k, m]) => `<div class="card" data-metalcard="${k}"><div class="card-h"><h2>${esc(m.label)}</h2><button class="btn sm ghost" data-addtier="${k}">+ เพิ่มขั้น %</button></div>
      <table class="tbl"><thead><tr><th>%</th><th>บาท/กรัม</th><th></th></tr></thead><tbody>
      ${(m.tiers || []).map((t, i) => `<tr><td><input data-m="${k}" data-i="${i}" data-f="pct" inputmode="decimal" value="${t.pct}"></td><td><input data-m="${k}" data-i="${i}" data-f="price" inputmode="decimal" value="${t.price}"></td><td><button class="x" data-rm="${k}:${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">ยังไม่มีราคา — ระบบให้พนักงานใส่ราคาเอง</td></tr>'}
      </tbody></table>
      <label>ประเภทสินค้า (คั่นด้วย ,)<input data-kinds="${k}" value="${esc((m.kinds || []).join(', '))}"></label></div>`).join('')}
    <button class="btn gold block xl" id="saveP">บันทึกราคาวันนี้</button>`;
  } else if (setTab === 'shop') {
    body = `<div class="card">
      <div class="logo-up">${shop.logo ? `<img src="${shop.logo}" alt="">` : '<span class="logo xl">DD</span>'}<div><label class="btn ghost sm">อัปโหลดโลโก้<input type="file" id="logo" accept="image/*" hidden></label>${shop.logo ? '<button class="btn ghost sm" id="rmLogo">ลบโลโก้</button>' : ''}<p class="muted sm">ใช้บนหน้าจอและใบรับซื้อ (ขาวดำจะชัดที่สุด)</p></div></div>
      ${[['name', 'ชื่อร้าน'], ['name2', 'ชื่อรอง'], ['branch', 'สาขา'], ['address', 'ที่อยู่'], ['phone', 'โทร'], ['line', 'LINE'], ['footer', 'ข้อความท้ายใบ']].map(([f, l]) => `<label>${l}<input data-shop="${f}" value="${esc(shop[f] || '')}"></label>`).join('')}
      <button class="btn gold block" id="saveShop">บันทึกข้อมูลร้าน</button></div>`;
  } else if (setTab === 'cancel') {
    const c = cancelCfg();
    body = `<div class="card">
      <div class="card-h"><h2>สิทธิ์ยกเลิกบิลของพนักงาน</h2></div>
      <label class="switch"><input type="checkbox" id="cEn" ${c.enabled ? 'checked' : ''}> <b>เปิดให้พนักงานยกเลิกบิลได้</b></label>
      <p class="muted sm">ปิดไว้ = ยกเลิกได้เฉพาะเจ้าของ (OWN) · เปิด/ปิดได้ทุกเมื่อ มีผลทันทีทุกเครื่อง</p>
      <div id="cOpts" style="${c.enabled ? '' : 'opacity:.45;pointer-events:none'}">
        <label>พนักงานยกเลิกเองได้ ถ้ายอดบิลไม่เกิน (บาท)<input id="cLim" inputmode="numeric" value="${esc(c.limit)}"></label>
        <p class="muted sm">บิลที่ยอดเกินกว่านี้ ต้องให้เจ้าของใส่ PIN อนุมัติที่เครื่องเดียวกัน · ใส่ 0 = ต้องให้เจ้าของอนุมัติทุกบิล</p>
        <label class="switch"><input type="checkbox" id="cToday" ${c.today_only ? 'checked' : ''}> พนักงานยกเลิกได้เฉพาะบิลของวันนี้</label>
      </div>
      <p class="muted sm">ทุกการยกเลิกต้องใส่เหตุผล บิลไม่ถูกลบ และบันทึกในหน้าประวัติว่าใครยกเลิก ใครอนุมัติ</p>
      <button class="btn gold block" id="saveC">บันทึก</button></div>`;
  } else {
    body = `<div class="card"><label>จำนวนใบที่พิมพ์ต่อบิล<select id="copies">${[1, 2, 3].map(v => `<option ${num(rc.copies) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>ข้อความยืนยันการขาย (พิมพ์ท้ายใบ ให้ลูกค้าเซ็น)<textarea id="consent" rows="6">${esc(rc.consent || '')}</textarea></label>
      <button class="btn gold block" id="saveRc">บันทึก</button></div>`;
  }
  shell('ตั้งค่า', `<div class="seg">${tabs.map(t => `<button data-st="${t[0]}" class="${setTab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>${body}`);
  $$('[data-st]').forEach(b => b.onclick = () => { setTab = b.dataset.st; renderSettings(); });
  const save = async (key, value, btn) => {
    if (!S.session.token) return toast('ต้องออนไลน์เพื่อบันทึกการตั้งค่า', 'err');
    busy(btn, true);
    try { await api('save_setting', { p_token: S.session.token, p_key: key, p_value: value }); S.settings[key] = value; store('dd_settings', S.settings); toast('บันทึกแล้ว'); renderSettings(); }
    catch (e) { toast(errText(e), 'err'); busy(btn, false); }
  };
  if (setTab === 'prices') {
    const calc = () => { const v = num($('#assocP').value); $('#assocCalc').textContent = v ? `= ${money(Math.round(v / 15.244))} บาท/กรัม สำหรับ 96.5%` : ''; };
    $('#assocP').oninput = calc; calc();
    $$('[data-addtier]').forEach(b => b.onclick = () => { collect(); P.metals[b.dataset.addtier].tiers.push({ pct: 0, price: 0 }); S._draft = st; redraw(); });
    $$('[data-rm]').forEach(b => b.onclick = () => { collect(); const [k, i] = b.dataset.rm.split(':'); P.metals[k].tiers.splice(+i, 1); S._draft = st; redraw(); });
    function collect() {
      $$('[data-m]').forEach(inp => { const t = P.metals[inp.dataset.m].tiers[+inp.dataset.i]; if (t) t[inp.dataset.f] = num(inp.value); });
      $$('[data-kinds]').forEach(inp => { P.metals[inp.dataset.kinds].kinds = inp.value.split(',').map(s => s.trim()).filter(Boolean); });
      P.assoc_mode = $('#assoc').checked; P.assoc_buy_per_baht = num($('#assocP').value); P.rule = $('#rule').value; P.round = num($('#round').value);
    }
    function redraw() { const keep = S.settings; S.settings = st; renderSettings(); S.settings = keep; }
    $('#saveP').onclick = (ev) => {
      collect();
      for (const m of Object.values(P.metals)) { m.tiers = m.tiers.filter(t => t.pct > 0 && t.pct <= 100 && t.price > 0).sort((a, b) => a.pct - b.pct); }
      P.date = bkkDate(); save('prices', P, ev.target);
    };
  } else if (setTab === 'shop') {
    $('#logo').onchange = async (ev) => { const f = ev.target.files[0]; if (!f) return; shop.logo = await resizeImage(f, 240); save('shop', shop, null); };
    const rl = $('#rmLogo'); if (rl) rl.onclick = () => { shop.logo = null; save('shop', shop, null); };
    $('#saveShop').onclick = (ev) => { $$('[data-shop]').forEach(i => { shop[i.dataset.shop] = i.value.trim(); }); save('shop', shop, ev.target); };
  } else if (setTab === 'cancel') {
    $('#cEn').onchange = (e) => { const o = $('#cOpts'); o.style.opacity = e.target.checked ? '' : '.45'; o.style.pointerEvents = e.target.checked ? '' : 'none'; };
    $('#saveC').onclick = (ev) => save('cancel', { enabled: $('#cEn').checked, limit: Math.max(0, num($('#cLim').value)), today_only: $('#cToday').checked }, ev.target);
  } else {
    $('#saveRc').onclick = (ev) => save('receipt', { ...rc, copies: num($('#copies').value), consent: $('#consent').value.trim() }, ev.target);
  }
}
function resizeImage(file, max) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const r = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/png')); URL.revokeObjectURL(img.src); }; img.onerror = rej; img.src = URL.createObjectURL(file); });
}

// ---------------------------------------------------------------- staff (owner)
async function renderStaff() {
  if (!isOwner()) return go('buy');
  shell('พนักงาน', '<div class="center"><span class="spin big"></span></div>');
  if (!S.session.token) { $('.main').innerHTML += '<div class="banner warn">ต้องออนไลน์</div>'; return; }
  let list = [];
  try { list = await api('list_staff', { p_token: S.session.token }); } catch (e) { toast(errText(e), 'err'); }
  $('.main').innerHTML = `<h1 class="screen-title">พนักงาน</h1>
    <div class="card"><div class="card-h"><h2>เพิ่มคนใหม่</h2></div><div class="row wrap"><input id="sn" placeholder="ชื่อเล่น" class="grow"><select id="sr"><option value="staff">พนักงาน (DD)</option><option value="owner">เจ้าของ/หุ้นส่วน (OWN)</option></select><button class="btn" id="sadd">เพิ่ม</button></div>
    <p class="muted sm">ระบบตั้งรหัสให้อัตโนมัติ และสุ่ม PIN ชั่วคราว — พนักงานต้องเปลี่ยน PIN เองตอนเข้าครั้งแรก เจ้าของจะไม่เห็น PIN จริง</p></div>
    <div class="card list">${list.map(s => `<div class="list-row ${s.active ? '' : 'void'}"><div><b>${esc(s.code)}-${esc(s.nickname)}</b> ${s.role === 'owner' ? '<span class="pill">เจ้าของ</span>' : ''} ${s.locked ? '<span class="pill bad">ล็อก</span>' : ''} ${s.must_change_pin ? '<span class="pill warn">รอเปลี่ยน PIN</span>' : ''}<br><span class="muted sm">เข้าล่าสุด ${s.last_login ? thDateTime(s.last_login) : '—'}</span></div>
      <div class="row">${s.code !== me().code ? `<button class="btn ghost sm" data-reset="${esc(s.code)}">รีเซ็ต PIN</button><button class="btn ghost sm" data-act="${esc(s.code)}" data-v="${!s.active}">${s.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>` : '<span class="muted sm">(คุณ)</span>'}</div></div>`).join('')}</div>`;
  const showPin = (r, title) => modal(`<h2>${title}</h2><p>รหัส <b>${esc(r.code)}</b></p><p class="big-pin">${esc(r.temp_pin)}</p><p class="muted">PIN ชั่วคราว — บอกพนักงานครั้งเดียว ระบบจะบังคับเปลี่ยนตอนเข้าครั้งแรก</p><div class="row end"><button class="btn" onclick="closeModal()">เข้าใจแล้ว</button></div>`, { sticky: true });
  $('#sadd').onclick = async (ev) => { const n = $('#sn').value.trim(); if (!n) return toast('ใส่ชื่อเล่น', 'err'); busy(ev.target, true); try { const r = await api('add_staff', { p_token: S.session.token, p_nickname: n, p_role: $('#sr').value }); await refreshStaffList(); await renderStaff(); showPin(r, 'เพิ่มแล้ว'); } catch (e) { toast(errText(e), 'err'); busy(ev.target, false); } };
  $$('[data-reset]').forEach(b => b.onclick = async () => { if (!confirm('รีเซ็ต PIN ของ ' + b.dataset.reset + '?')) return; try { const r = await api('reset_pin', { p_token: S.session.token, p_code: b.dataset.reset }); delete S.verifiers[r.code]; store('dd_verifiers', S.verifiers); showPin(r, 'รีเซ็ต PIN แล้ว'); } catch (e) { toast(errText(e), 'err'); } });
  $$('[data-act]').forEach(b => b.onclick = async () => { try { await api('set_staff_active', { p_token: S.session.token, p_code: b.dataset.act, p_active: b.dataset.v === 'true' }); if (b.dataset.v !== 'true') { delete S.verifiers[b.dataset.act]; store('dd_verifiers', S.verifiers); } await refreshStaffList(); renderStaff(); } catch (e) { toast(errText(e), 'err'); } });
}
async function refreshStaffList() { try { const l = await api('staff_list', { p_device: S.device.device_id, p_secret: S.device.secret }); S.staffList = l; store('dd_staff_list', l); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------- audit (owner)
let auditDate = null;
async function renderAudit() {
  if (!isOwner()) return go('buy');
  auditDate = auditDate || bkkDate();
  shell('ประวัติการใช้งาน', '<div class="center"><span class="spin big"></span></div>');
  let rows = [];
  try { rows = await api('list_audit', { p_token: S.session.token, p_from: auditDate, p_to: auditDate }); } catch (e) { toast(errText(e), 'err'); }
  const A = { login: 'เข้าระบบ', logout: 'ออกจากระบบ', pin_wrong: '⚠ ใส่ PIN ผิด', create_bill: 'ทำบิลรับซื้อ', void_bill: '⚠ ยกเลิกบิล', save_setting: 'แก้การตั้งค่า', add_staff: 'เพิ่มพนักงาน', reset_pin: 'รีเซ็ต PIN', set_staff_active: 'เปิด/ปิดพนักงาน', change_pin: 'เปลี่ยน PIN', set_nickname: 'เปลี่ยนชื่อเล่น', register_device: 'ลงทะเบียนเครื่อง', setup_owner: 'ตั้งค่าร้าน' };
  $('.main').innerHTML = `<h1 class="screen-title">ประวัติ <input type="date" id="adate" value="${auditDate}" max="${bkkDate()}"></h1>
    <div class="card list">${rows.map(r => `<div class="list-row ${/wrong|void/.test(r.action) ? 'warnrow' : ''}"><div><b>${esc(A[r.action] || r.action)}</b> <span class="muted sm">${esc(r.staff_code || '')} · เครื่อง ${esc(r.device_id || '-')}</span><br><span class="sm muted">${esc(r.detail ? Object.entries(r.detail).filter(([k, v]) => k !== 'value' && v != null).map(([k, v]) => `${k}: ${typeof v === 'object' ? '…' : v}`).join(' · ') : '')}</span></div><span class="muted sm">${thTime(r.at)}</span></div>`).join('') || '<p class="muted">ไม่มีรายการ</p>'}</div>`;
  $('#adate').onchange = (e) => { auditDate = e.target.value; renderAudit(); };
}

// ---------------------------------------------------------------- clock + start
setInterval(() => { const c = $('#clock'); if (c) c.textContent = thTime(now()); if (S.session && S.screen && S.screen !== 'login' && !sessionValid()) { toast('ครบเวลา กรุณาเข้าระบบใหม่', 'warn'); saveSession(null); renderLogin(); } }, 30000);
// ลบบิลเก่าที่ส่งแล้วออกจากเครื่อง (เก็บไว้ 60 วัน)
idb.all('bills').then(all => all.filter(b => b.synced && (Date.now() - new Date(b.created_at)) > 60 * 864e5).forEach(b => idb.del('bills', b.id))).catch(() => { });
window.closeModal = closeModal;
boot();
