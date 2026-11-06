/* DD หลอมทอง — ระบบหน้าร้าน เฟส 1
 * เข้าระบบพนักงาน · รับซื้อ · อ่านบัตรประชาชน · พิมพ์ใบรับซื้อ · ใช้งานออฟไลน์
 */
'use strict';
const CFG = window.DD_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL;
const APP_VERSION = '1.10.0';

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
const dueTh = (d) => { const p = String(d || '').split('-'); return p.length === 3 ? `${+p[2]}/${+p[1]}/${+p[0] + 543}` : d; };
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
  NOT_FOUND: 'ไม่พบบิล หรือบิลถูกยกเลิกไปแล้ว', REASON_REQUIRED: 'ต้องใส่เหตุผลที่ยกเลิก', STAFF_CANCEL_OFF: 'เจ้าของปิดฟังก์ชันให้พนักงานยกเลิกบิลไว้', BILL_NOT_TODAY: 'พนักงานยกเลิกได้เฉพาะบิลของวันนี้', NEED_OWNER: 'บิลนี้เกินวงเงิน ต้องให้เจ้าของอนุมัติ', REQUEST_DONE: 'คำขอนี้ถูกตัดสินไปแล้ว', ITEMS_USED: 'ของในบิลนี้ถูกนำไปหลอม/ขายแล้ว ยกเลิกบิลไม่ได้ (ยกเลิกการหลอมก่อน)', ITEMS_CHANGED: 'รายการที่เลือกมีการเปลี่ยนแปลง กรุณาโหลดใหม่', MIXED_METAL: 'หลอมรวมได้เฉพาะโลหะชนิดเดียวกัน', OUT_HEAVIER: 'น้ำหนักหลังหลอมมากกว่าก่อนหลอม — ตรวจตัวเลขอีกครั้ง', BAD_WEIGHT: 'ใส่น้ำหนักหลังหลอม', BAD_PCT: 'ใส่ % ที่วัดได้ (0-100)', MELT_LOCKED: 'ก้อนนี้ถูกขาย/ยกเลิกไปแล้ว', SELL_NOT_ALLOWED: 'ไม่มีสิทธิ์บันทึกการขาย (เจ้าของเปิดได้ที่ ตั้งค่า → ขาย)', BUYER_REQUIRED: 'ใส่ชื่อผู้ซื้อ', NO_LINES: 'เลือกของที่ขาย', LINE_AMOUNT: 'ใส่ยอดขายให้ครบทุกรายการ', STOCK_CHANGED: 'ของบางรายการถูกขายหรือเปลี่ยนสถานะไปแล้ว กรุณาโหลดใหม่', SALE_LOCKED: 'รายการขายนี้ถูกปิดไปแล้ว', DOC_TOO_BIG: 'รูปใหญ่เกินไป', DOC_LIMIT: 'แนบได้สูงสุด 10 ไฟล์', NOTE_REQUIRED: 'พิมพ์หมายเหตุ', MERGE_NEED_2: 'เลือกอย่างน้อย 2 ก้อนเพื่อรวม', LOT_LOCKED: 'ล็อตนี้ปิดไปแล้ว', SILVER_USED: 'แร่เงินที่รับคืนถูกขายไปแล้ว ยกเลิกไม่ได้', DEMO_ONLY_SUPABASE: 'ฟังก์ชันนี้ใช้ได้เมื่อเชื่อม Supabase แล้ว', NO_VIEW: 'เจ้าของไม่ได้เปิดให้พนักงานดูข้อมูลการขาย', NET: 'ไม่มีอินเทอร์เน็ต', OFFLINE_LOGIN: 'เครื่องนี้ยังไม่เคยเข้าระบบด้วยรหัสนี้ตอนออนไลน์ จึงเข้าแบบออฟไลน์ไม่ได้'
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
  { id: 'stock', label: 'สต๊อก/หลอม', icon: 'M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4' },
  { id: 'bills', label: 'สรุปวันนี้', icon: 'M4 19V9M10 19V5M16 19v-7M22 19H2' },
  { id: 'sell', label: 'ขาย', icon: 'M12 21V3M5 14l7 7 7-7' },
  { id: 'more', label: 'เพิ่มเติม', icon: 'M4 6h16M4 12h16M4 18h16' }
];
const icon = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

function shell(title, body) {
  const shop = (S.settings && S.settings.shop) || {};
  const badge = (id) => id === 'more' && isOwner() && S.pendingReq ? `<i class="badge">${S.pendingReq}</i>` : '';
  const tabs = NAV.map(n => `<button class="tab ${S.screen === n.id || (n.id === 'more' && ['more', 'settings', 'staff', 'audit', 'pin', 'requests', 'customers'].includes(S.screen)) ? 'active' : ''}" data-go="${n.id}">${icon(n.icon)}<span>${n.label}</span>${badge(n.id)}</button>`).join('');
  const reqBanner = isOwner() && S.pendingReq && S.screen !== 'requests' ? `<div class="banner warn">⚠️ มีคำขอยกเลิกบิลรออนุมัติ ${S.pendingReq} รายการ <button class="btn sm" data-go="requests">ดู / อนุมัติ</button></div>` : '';
  $('#app').innerHTML = `
  <header class="appbar">
    <div class="brand">${shop.logo ? `<img src="${shop.logo}" alt="">` : '<span class="logo">DD</span>'}<div><b>${esc(shop.name || 'DD หลอมทอง')}</b><small>${esc(shop.branch || '')}${DEMO ? ' · <em>โหมดทดลอง</em>' : ''}</small></div></div>
    <nav class="topnav">${tabs}</nav>
    <div class="who"><button id="status" class="status"></button><span class="chip">${esc(me().code)} · ${esc(me().nickname)}</span><button class="btn ghost sm" id="logoutBtn">ออก</button></div>
  </header>
  <main class="main">${reqBanner}<h1 class="screen-title">${title}</h1>${body}</main>
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
  ({ buy: renderBuy, bills: renderBills, customers: renderCustomers, more: renderMore, settings: renderSettings, staff: renderStaff, audit: renderAudit, pin: renderPin, requests: renderRequests, stock: renderStock, sell: renderSell }[screen] || renderBuy)();
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
    setTimeout(pollPending, 1500);
    return go(isOwner() && location.hash === '#requests' ? 'requests' : (isOwner() ? 'bills' : 'buy'));
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
    setTimeout(pollPending, 800);
    go(r.staff.must_change_pin ? 'pin' : (r.staff.role === 'owner' ? (location.hash === '#requests' ? 'requests' : 'bills') : 'buy'));
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

const DEST_LABEL = { lump: 'หลอมแล้ว (ก้อนย่อย)', melt: 'ยังไม่หลอม', whole: 'ขายทั้งชิ้น' };
// ---------------------------------------------------------------- BUY
function newBuy() {
  const first = (metalEntries()[0] || ['gold'])[0];
  return { id: uuid(), customer: null, items: [], cash: null, note: '', entry: { metal: first, kind: (metals()[first] || {}).kinds ? metals()[first].kinds[0] : '', pct: '', weight: '', price: '', amount: '', priceEdited: false, amountEdited: false, destination: 'lump', pre_weight: '' } };
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
      <div class="seg dest">${['lump', 'melt', 'whole'].map(d => `<button data-dest="${d}" class="${e.destination === d ? 'on' : ''}">${DEST_LABEL[d]}</button>`).join('')}</div>
      <div id="preWrap" style="${e.destination === 'lump' ? '' : 'display:none'}"><label>น้ำหนักก่อนหลอม (ก.) — ไม่บังคับ<input id="preW" inputmode="decimal" value="${esc(e.pre_weight || '')}" placeholder="ถ้าหลอมต่อหน้าลูกค้า ใส่น้ำหนักเดิมไว้ดูส่วนต่าง"></label></div>
      <button class="btn block" id="addItem">+ เพิ่มรายการ</button>
      <div class="items">${B.items.map((it, i) => `
        <div class="item"><div><b>${esc(M[it.metal] ? M[it.metal].label : it.metal)} ${esc(it.pct)}%</b> · ${esc(it.kind)}<br><span class="muted sm">${gram(it.weight)} ก. × ${money(it.price_per_g)} · ${DEST_LABEL[it.destination] || ''}${it.pre_weight ? ` (ก่อนหลอม ${gram(it.pre_weight)} ก.)` : ''}</span></div>
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
  $$('[data-dest]').forEach(b => b.onclick = () => { e.destination = b.dataset.dest; $$('[data-dest]').forEach(x => x.classList.toggle('on', x === b)); $('#preWrap').style.display = e.destination === 'lump' ? '' : 'none'; });
  $('#preW').oninput = (ev) => { e.pre_weight = ev.target.value; };
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
  S.buy.items.push({ metal: e.metal, kind: e.kind, pct: num(e.pct), weight: num(e.weight), price_per_g: num(e.price), amount: num(e.amount), destination: e.destination, pre_weight: e.destination === 'lump' && num(e.pre_weight) ? num(e.pre_weight) : null, price_edited: e.priceEdited || e.amountEdited });
  Object.assign(e, { pct: '', weight: '', price: '', amount: '', pre_weight: '', priceEdited: false, amountEdited: false });
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
    <div id="cf_drawer"></div>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">กลับไปแก้</button><button class="btn gold" id="cf_ok">บันทึกและพิมพ์</button></div>`, { sticky: true });
  showDrawerInConfirm();
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
// เงินสดในลิ้นชัก: ดึงจากเซิร์ฟเวอร์ ถ้าออฟไลน์ใช้ค่าล่าสุดที่จำไว้ แล้วหักบิลเงินสดที่ยังไม่ส่งขึ้นระบบ
async function drawerBalance() {
  const today = bkkDate();
  if (S.online && S.session.token && !DEMO) {
    try { const r = await api('drawer_now', { p_token: S.session.token }); S.drawerCache = { date: today, balance: num(r.balance), float: num(r.float), at: Date.now() }; store('dd_drawer', S.drawerCache); } catch (e) { }
  }
  let c = S.drawerCache || load('dd_drawer', null);
  const fl = num(((S.settings && S.settings.drawer) || {}).float ?? 50000);
  if (!c || c.date !== today) c = { date: today, balance: fl, float: fl, at: 0, guess: true };
  const local = (await idb.all('bills').catch(() => [])).filter(b => !b.synced && bkkDate(b.created_at) === today);
  return { ...c, balance: c.balance - local.reduce((t, b) => t + num(b.payload.pay_cash), 0) };
}
async function showDrawerInConfirm() {
  const el = $('#cf_drawer'); if (!el) return;
  const B = S.buy, total = buyTotal(), cash = B.cash == null ? total : Math.min(num(B.cash), total);
  if (!cash) { el.innerHTML = `<p class="muted sm">จ่ายโอนทั้งหมด ${money(total)} บาท — ไม่ใช้เงินในลิ้นชัก</p>`; return; }
  el.innerHTML = '<p class="muted sm">กำลังเช็กเงินสดในลิ้นชัก…</p>';
  const d = await drawerBalance(); if (!$('#cf_drawer')) return;
  const after = d.balance - cash;
  el.innerHTML = `<div class="banner ${after < 0 ? 'warn' : 'info'}" style="display:block">💵 เงินสดในลิ้นชัก ${money(d.balance)} − จ่ายบิลนี้ ${money(cash)} = <b class="${after < 0 ? 'bad' : ''}">${money(after)}</b> บาท
    ${after < 0 ? '<br><b>⚠️ เงินสดในลิ้นชักไม่พอ</b> — แบ่งจ่ายโอนบางส่วน หรือเติมเงินลิ้นชักก่อน' : ''}${d.guess ? '<br><span class="sm">(ออฟไลน์ — ประมาณจากเงินตั้งต้น)</span>' : ''}</div>`;
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
      <div class="r-row r-s"><span>${gram(it.weight)} ก. × ${money(it.price_per_g)}</span><b>${money(it.amount)}</b></div>${it.pre_weight ? `<div class="r-s">หลอมแล้ว · ก่อนหลอม ${gram(it.pre_weight)} ก.</div>` : ''}</div>`).join('')}
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
async function renderBillsLegacy() {
  shell('สรุปวันนี้', '<div class="center"><span class="spin big"></span></div>');
  const { bills, fromServer } = await loadBills(S.billsDate);
  if (S.screen !== 'bills') return;
  const ok = bills.filter(b => b.status !== 'void');
  const sum = (f) => ok.reduce((s, b) => s + num(f(b)), 0);
  const total = sum(b => b.total), cash = sum(b => b.pay_cash), tr = sum(b => b.pay_transfer);
  const byMetal = {}; ok.forEach(b => b.items.forEach(it => { const k = it.metal; byMetal[k] = byMetal[k] || { w: 0, a: 0 }; byMetal[k].w += num(it.weight); byMetal[k].a += num(it.amount); }));
  const byPct = {}; ok.forEach(b => b.items.filter(i => i.metal === 'gold').forEach(it => { byPct[it.pct] = (byPct[it.pct] || 0) + num(it.weight); }));
  const M = metals();
  $('.main').innerHTML = `${isOwner() && S.pendingReq ? `<div class="banner warn">⚠️ มีคำขอยกเลิกบิลรออนุมัติ ${S.pendingReq} รายการ <button class="btn sm" id="goReq">ดู / อนุมัติ</button></div>` : ''}<h1 class="screen-title">สรุป <input type="date" id="bdate" value="${S.billsDate}" max="${bkkDate()}"></h1>
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
      <div class="right"><b>${money(b.total)}</b><br>${b.status === 'void' ? '<span class="pill bad">ยกเลิก</span>' : b.pending_cancel ? '<span class="pill warn">รออนุมัติยกเลิก</span>' : b.synced ? '<span class="pill ok">ส่งแล้ว</span>' : b.error ? `<span class="pill bad" title="${esc(b.error)}">ส่งไม่ได้</span>` : '<span class="pill warn">รอส่ง</span>'}</div></button>`).join('') || '<p class="muted center-t">ยังไม่มีบิล</p>'}</div></div>`;
  $('#bdate').onchange = (e) => { S.billsDate = e.target.value || bkkDate(); renderBills(); };
  const gr = $('#goReq'); if (gr) gr.onclick = () => go('requests');
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
  const can = canCancel(b) && !b.pending_cancel;
  modal(`<div class="rcpt-preview">${receiptHtml(b, staff, '')}</div>
    ${b.status === 'void' ? `<p class="bad">ยกเลิกแล้ว: ${esc(b.void_reason || '')}</p>` : ''}
    ${b.pending_cancel ? `<div class="banner warn">บิลนี้มีคำขอยกเลิกรอเจ้าของอนุมัติ ${isOwner() ? '<button class="btn sm" id="toReq">ไปอนุมัติ</button>' : ''}</div>` : ''}
    ${!b.synced && b.status !== 'void' ? '<p class="muted sm">บิลยังไม่ถูกส่งขึ้นระบบ — ยกเลิกได้หลังส่งแล้ว</p>' : ''}
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ปิด</button>
    ${can ? '<button class="btn danger" id="voidBtn">ยกเลิกบิล</button>' : ''}
    <button class="btn" id="reprint">พิมพ์ซ้ำ</button></div>`, { wide: true });
  $('#reprint').onclick = () => { printReceipt(b, staff); };
  const vb = $('#voidBtn'); if (vb) vb.onclick = () => voidModal(b);
  const tr = $('#toReq'); if (tr) tr.onclick = () => { closeModal(); go('requests'); };
}
function voidModal(b, mode) {
  if (!S.online || !S.session.token) return toast('ต้องออนไลน์และเข้าระบบออนไลน์ก่อนยกเลิกบิล', 'err');
  const c = cancelCfg();
  const needOwner = !isOwner() && num(b.total) > num(c.limit);
  mode = mode || 'request';
  const owners = S.staffList.filter(s => s.role === 'owner');
  const prevReason = ($('#vr') && $('#vr').value) || '';
  modal(`<h2>ยกเลิกบิล ${esc(b.bill_no)}</h2>
    <p class="muted">ยอด ${money(b.total)} บาท · ${esc((b.customer || {}).name || '')} · ${thDateTime(b.created_at)}</p>
    <label>เหตุผลที่ยกเลิก *<input id="vr" placeholder="เช่น ใส่น้ำหนักผิด / ลูกค้าเปลี่ยนใจ" maxlength="200" value="${esc(prevReason)}"></label>
    ${needOwner ? `<div class="banner warn">บิลเกิน ${money(c.limit)} บาท ต้องให้เจ้าของอนุมัติ</div>
      <div class="seg"><button data-vm="request" class="${mode === 'request' ? 'on' : ''}">ส่งขออนุมัติ (เจ้าของไม่อยู่)</button><button data-vm="here" class="${mode === 'here' ? 'on' : ''}">เจ้าของอยู่ตรงนี้</button></div>
      ${mode === 'here' ? `<label>เจ้าของที่อนุมัติ<select id="vo">${owners.map(o => `<option value="${esc(o.code)}">${esc(o.code)}-${esc(o.nickname)}</option>`).join('')}</select></label>
        <label>PIN เจ้าของ<input id="vp" type="password" inputmode="numeric" maxlength="6" class="pin-input" autocomplete="off"></label>`
      : `<p class="muted sm">ระบบจะส่งคำขอไปให้เจ้าของ เจ้าของกดอนุมัติจากมือถือได้แม้ไม่อยู่ร้าน ระหว่างรอ บิลยังไม่ถูกยกเลิก</p>`}` : ''}
    ${!isOwner() && !needOwner ? `<p class="muted sm">บิลไม่เกิน ${money(c.limit)} บาท พนักงานยกเลิกเองได้ ระบบบันทึกชื่อคุณและเหตุผลไว้ในประวัติ</p>` : ''}
    <div class="row end"><button class="btn ghost" id="vBack">กลับ</button><button class="btn danger" id="vOk">${needOwner && mode === 'request' ? 'ส่งขออนุมัติ' : 'ยืนยันยกเลิกบิล'}</button></div>`, { sticky: true });
  setTimeout(() => { const f = $('#vp') || $('#vr'); if (f) f.focus(); }, 30);
  $$('[data-vm]').forEach(x => x.onclick = () => voidModal(b, x.dataset.vm));
  $('#vBack').onclick = () => billDetail(b);
  $('#vOk').onclick = async (ev) => {
    const reason = $('#vr').value.trim(); if (!reason) return toast(ERR.REASON_REQUIRED, 'err');
    busy(ev.target, true);
    try {
      if (needOwner && mode === 'request') {
        const r = await api('request_cancel', { p_token: S.session.token, p_id: b.id, p_reason: reason });
        toast(r.existing ? 'บิลนี้ส่งขออนุมัติไว้แล้ว รอเจ้าของ' : 'ส่งคำขอยกเลิกแล้ว รอเจ้าของอนุมัติ');
        closeModal(); renderBills(); return;
      }
      const params = { p_token: S.session.token, p_id: b.id, p_reason: reason };
      if (needOwner) { params.p_approver_code = $('#vo').value; params.p_approver_pin = $('#vp').value; if (!params.p_approver_pin) { busy(ev.target, false); return toast('ให้เจ้าของใส่ PIN', 'err'); } }
      const r = await api('void_bill', params);
      toast(`ยกเลิกบิล ${b.bill_no} แล้ว${r && r.approved_by ? ' (อนุมัติโดย ' + r.approved_by + ')' : ''}`);
      closeModal(); renderBills();
    } catch (e) {
      busy(ev.target, false);
      toast(errText(e), 'err'); const vp = $('#vp'); if (vp) vp.value = '';
    }
  };
}

// ---------------------------------------------------------------- คำขอยกเลิกบิล (เจ้าของ)
async function renderRequests() {
  if (!isOwner()) return go('buy');
  shell('คำขอยกเลิกบิล', '<div class="center"><span class="spin big"></span></div>');
  if (!S.session.token || !S.online) { $('.main').innerHTML = '<h1 class="screen-title">คำขอยกเลิกบิล</h1><div class="banner warn">ต้องออนไลน์</div>'; return; }
  let pending = [], recent = [];
  try { [pending, recent] = await Promise.all([api('list_cancel_requests', { p_token: S.session.token, p_scope: 'pending' }), api('list_cancel_requests', { p_token: S.session.token, p_scope: 'recent' })]); }
  catch (e) { toast(errText(e), 'err'); }
  if (S.screen !== 'requests') return;
  S.pendingReq = pending.length; updateTitle();
  const M = metals();
  const itemsLine = (it) => (it || []).map(i => `${esc(M[i.metal] ? M[i.metal].label : i.metal)} ${esc(i.pct)}% ${gram(i.weight)}ก.`).join(' · ');
  const st = { approved: '<span class="pill ok">อนุมัติ</span>', rejected: '<span class="pill bad">ไม่อนุมัติ</span>', withdrawn: '<span class="pill">ถอนคำขอ</span>', pending: '<span class="pill warn">รออนุมัติ</span>' };
  const canNotify = 'Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied';
  $('.main').innerHTML = `<h1 class="screen-title">คำขอยกเลิกบิล</h1>
    ${canNotify ? '<div class="banner info">ให้เครื่องนี้เด้งแจ้งเตือนเมื่อมีคำขอใหม่ (ระหว่างเปิดระบบไว้) <button class="btn sm" id="askNotify">เปิดแจ้งเตือน</button></div>' : ''}
    <div class="card"><div class="card-h"><h2>รออนุมัติ (${pending.length})</h2><button class="btn sm ghost" id="reqRefresh">รีเฟรช</button></div>
    <div class="list">${pending.map((r, i) => `<div class="req">
      <div class="req-h"><b>${esc(r.bill_no)}</b><b class="big">${money(r.total)} บาท</b></div>
      <div class="sm">${esc(r.customer_name || '')} · บิลเวลา ${thDateTime(r.bill_created_at)}</div>
      <div class="sm muted">${itemsLine(r.items)}</div>
      <div class="req-reason">ขอโดย <b>${esc(r.requested_code)}${r.requested_name ? '-' + esc(r.requested_name) : ''}</b> · ${thTime(r.created_at)}<br>เหตุผล: ${esc(r.reason)}</div>
      <div class="row end"><button class="btn ghost" data-rej="${i}">ไม่อนุมัติ</button><button class="btn danger" data-app="${i}">อนุมัติยกเลิก</button></div>
    </div>`).join('') || '<p class="muted center-t">ไม่มีคำขอรออนุมัติ</p>'}</div></div>
    <div class="card"><h2>ล่าสุด 7 วัน</h2><div class="list">${recent.filter(r => r.status !== 'pending').map(r => `<div class="list-row"><div><b>${esc(r.bill_no)}</b> <span class="muted sm">${money(r.total)} บาท · ขอโดย ${esc(r.requested_code)}</span><br><span class="sm muted">${esc(r.reason)}${r.decide_note ? ' → ' + esc(r.decide_note) : ''}</span></div><div class="right">${st[r.status] || ''}<br><span class="muted sm">${r.decided_at ? thDateTime(r.decided_at) : ''} ${esc(r.decided_code || '')}</span></div></div>`).join('') || '<p class="muted">—</p>'}</div></div>`;
  $('#reqRefresh').onclick = () => renderRequests();
  const an = $('#askNotify'); if (an) an.onclick = async () => { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } renderRequests(); };
  $$('[data-app]').forEach(x => x.onclick = () => decideModal(pending[+x.dataset.app], true));
  $$('[data-rej]').forEach(x => x.onclick = () => decideModal(pending[+x.dataset.rej], false));
}
function decideModal(r, approve) {
  modal(`<h2>${approve ? 'อนุมัติยกเลิกบิล' : 'ไม่อนุมัติ'} ${esc(r.bill_no)}</h2>
    <p class="muted">${money(r.total)} บาท · ขอโดย ${esc(r.requested_code)} · เหตุผล: ${esc(r.reason)}</p>
    ${approve ? '' : '<label>เหตุผลที่ไม่อนุมัติ (พนักงานจะเห็น)<input id="dn" maxlength="200" placeholder="ไม่บังคับ"></label>'}
    <label>PIN ของคุณ (${esc(me().code)})<input id="dp" type="password" inputmode="numeric" maxlength="6" class="pin-input" autofocus autocomplete="off"></label>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">กลับ</button><button class="btn ${approve ? 'danger' : ''}" id="dOk">${approve ? 'ยืนยันอนุมัติยกเลิก' : 'ยืนยันไม่อนุมัติ'}</button></div>`, { sticky: true });
  $('#dp').onkeydown = (e) => { if (e.key === 'Enter') $('#dOk').click(); };
  $('#dOk').onclick = async (ev) => {
    busy(ev.target, true);
    try {
      await api('decide_cancel', { p_token: S.session.token, p_req: r.id, p_approve: approve, p_pin: $('#dp').value, p_note: ($('#dn') && $('#dn').value.trim()) || null });
      toast(approve ? `ยกเลิกบิล ${r.bill_no} แล้ว` : `ไม่อนุมัติคำขอ ${r.bill_no}`); closeModal(); renderRequests();
    } catch (e) { busy(ev.target, false); toast(errText(e), 'err'); $('#dp').value = ''; }
  };
}

// ---------------------------------------------------------------- ตรวจคำขอใหม่เป็นระยะ
let lastPendingSeen = null;
function updateTitle() { document.title = (isOwner() && S.pendingReq ? `(${S.pendingReq}) ` : '') + 'DD หลอมทอง'; }
async function pollPending() {
  if (!S.session || !S.session.token || !S.online || S.screen === 'login') return;
  try {
    const r = await api('pending_counts', { p_token: S.session.token });
    if (isOwner()) {
      const n = r.cancel_requests || 0, before = S.pendingReq || 0;
      S.pendingReq = n; updateTitle();
      if (n > before && lastPendingSeen !== null) {
        toast(`มีคำขอยกเลิกบิลใหม่ (${n} รายการรออนุมัติ)`, 'warn');
        try { if ('Notification' in window && Notification.permission === 'granted') { const nt = new Notification('DD หลอมทอง: มีคำขอยกเลิกบิล', { body: `รออนุมัติ ${n} รายการ`, icon: 'dd-icon-v2-192.png', tag: 'dd-cancel' }); nt.onclick = () => { window.focus(); go('requests'); }; } } catch (e) { /* ignore */ }
      }
      lastPendingSeen = n;
      if (n !== before && ['bills', 'more'].includes(S.screen) && !$('#modal')) { const sc = window.scrollY; go(S.screen); window.scrollTo(0, sc); }
      else if (n !== before) { $$('.tab[data-go=more]').forEach(t => { const old = t.querySelector('.badge'); if (old) old.remove(); if (n) t.insertAdjacentHTML('beforeend', `<i class="badge">${n}</i>`); }); }
    } else {
      const seen = load('dd_seen_decisions', []);
      const fresh = (r.my_decided || []).filter(d => !seen.includes(d.id));
      fresh.forEach(d => toast(d.status === 'approved' ? `เจ้าของ (${d.decided_code}) อนุมัติยกเลิกบิล ${d.bill_no} แล้ว` : `เจ้าของไม่อนุมัติยกเลิกบิล ${d.bill_no}${d.decide_note ? ': ' + d.decide_note : ''}`, d.status === 'approved' ? 'ok' : 'warn'));
      if (fresh.length) { store('dd_seen_decisions', seen.concat(fresh.map(d => d.id)).slice(-50)); if (S.screen === 'bills') renderBills(); }
    }
  } catch (e) { if (e.message === 'SESSION_INVALID') sessionExpired(); }
}
setInterval(pollPending, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollPending(); });

// ---------------------------------------------------------------- เฟส 2.1: สต๊อก + หลอม
function meltCfg() { return Object.assign({ default_cost: 500, tolerance_pct: 0.5, loss_warn_pct: 2 }, (S.settings && S.settings.melt) || {}); }
const fine = (w, p) => num(w) * num(p) / 100;
let stockTab = 'melt', stockMetal = 'gold', stockSel = new Set(), stockCache = [];
async function renderStock() {
  shell('สต๊อก / หลอม', '<div class="center"><span class="spin big"></span></div>');
  if (!S.session.token || !S.online) { $('.main').innerHTML = '<h1 class="screen-title">สต๊อก / หลอม</h1><div class="banner warn">ต้องออนไลน์ (บิลที่ทำตอนออฟไลน์จะเข้าสต๊อกหลังส่งขึ้นระบบ)</div>'; return; }
  const M = metals();
  let items = [], melts = [];
  try { [items, melts] = await Promise.all([api('list_stock', { p_token: S.session.token }), api('list_melts', { p_token: S.session.token, p_scope: stockTab === 'history' ? 'all' : 'stock' })]); }
  catch (e) { toast(errText(e), 'err'); }
  if (S.screen !== 'stock') return;
  stockCache = items;
  const valid = new Set(items.map(i => i.id)); stockSel.forEach(id => { if (!valid.has(id)) stockSel.delete(id); });
  const meltItems = items.filter(i => i.destination !== 'whole'), wholeItems = items.filter(i => i.destination === 'whole');
  const sum = (arr) => ({ n: arr.length, w: arr.reduce((t, i) => t + num(i.weight), 0), f: arr.reduce((t, i) => t + fine(i.weight, i.pct), 0), c: arr.reduce((t, i) => t + num(i.amount), 0) });
  const metalTotals = metalEntries(M).map(([k, m]) => ({ k, label: m.label, s: sum(meltItems.filter(i => i.metal === k)) })).filter(x => x.s.n);
  const readyByMetal = metalEntries(M).map(([k, m]) => ({ label: m.label, n: melts.filter(x => x.metal === k && x.status === 'ready').length, w: melts.filter(x => x.metal === k && x.status === 'ready').reduce((t, x) => t + num(x.out_fine), 0) })).filter(x => x.n);
  const tabs = [['melt', `รอหลอม (${meltItems.length})`], ['ingots', `ก้อนหลอมแล้ว (${stockTab === 'history' ? '…' : melts.length})`], ['whole', `ขายทั้งชิ้น (${wholeItems.length})`], ['history', 'ประวัติหลอม']];
  let body = `<div class="seg">${tabs.map(t => `<button data-stab="${t[0]}" class="${stockTab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>`;
  if (stockTab === 'melt') {
    const list = meltItems.filter(i => i.metal === stockMetal);
    const sel = sum(list.filter(i => stockSel.has(i.id)));
    body += `<div class="kpis">${metalTotals.map(x => `<div class="kpi"><span>${esc(x.label)} รอหลอม</span><b>${gram(x.s.w)} ก.</b><small>เนื้อ ${gram(x.s.f)} ก. · ทุน ${money(x.s.c)}</small></div>`).join('') || '<div class="kpi"><span>รอหลอม</span><b>0 ก.</b><small>&nbsp;</small></div>'}</div>
      <div class="card"><div class="seg metal">${metalEntries(M).map(([k, m]) => `<button data-smetal="${k}" class="${stockMetal === k ? 'on' : ''}">${esc(m.label)}</button>`).join('')}</div>
      <div class="row"><button class="btn ghost sm" id="selAll">เลือกทั้งหมด</button><button class="btn ghost sm" id="selNone">ล้างที่เลือก</button><span class="muted sm grow" style="text-align:right">${list.length} รายการ</span></div>
      <div class="list">${list.map(i => `<label class="stock-row ${stockSel.has(i.id) ? 'on' : ''}"><input type="checkbox" data-sid="${i.id}" ${stockSel.has(i.id) ? 'checked' : ''}>
        <div class="grow"><b>${esc(i.pct)}%</b> · ${esc(i.item_kind || '')} <span class="muted sm">· ${esc(i.bill_no)} · ${thDateTime(i.created_at)}</span><br><span class="sm muted">${esc(i.customer_name || '')}</span></div>
        <div class="right"><b>${gram(i.weight)} ก.</b><br><span class="muted sm">${money(i.amount)}</span></div></label>`).join('') || '<p class="muted center-t">ไม่มีของรอหลอม</p>'}</div></div>
      <div class="melt-bar ${sel.n ? 'show' : ''}"><div><b>เลือก ${sel.n} รายการ · ${gram(sel.w)} ก.</b><br><span class="sm">% เฉลี่ย ${sel.w ? (sel.f / sel.w * 100).toFixed(2) : '-'} · เนื้อที่คาด ${gram(sel.f)} ก. · ทุน ${money(sel.c)}</span></div><button class="btn gold" id="doMelt" ${sel.n ? '' : 'disabled'}>หลอมเป็นก้อน</button></div>`;
  } else if (stockTab === 'ingots' || stockTab === 'history') {
    const list = stockTab === 'history' ? melts : melts.filter(m => m.status === 'ready');
    body += stockTab === 'ingots' ? `<div class="kpis">${readyByMetal.map(x => `<div class="kpi"><span>${esc(x.label)} ก้อนพร้อมขาย</span><b>${x.n} ก้อน</b><small>เนื้อรวม ${gram(x.w)} ก.</small></div>`).join('') || '<div class="kpi"><span>ก้อนพร้อมขาย</span><b>0</b><small>&nbsp;</small></div>'}</div>` : '';
    if (stockTab === 'ingots') { ingotCache = list; const ids = new Set(list.map(m => m.id)); ingotSel.forEach(id => { if (!ids.has(id)) ingotSel.delete(id); }); }
    body += stockTab === 'ingots' && list.length ? '<p class="muted sm">ติ๊กเลือกก้อน แล้วกด "รวมเป็นก้อนเดียว" หรือ "ส่งโรงสกัด" · ขายให้ร้านรับซื้อได้ที่หน้า ขาย</p>' : '';
    body += `<div class="card list">${list.map(m => stockTab === 'ingots' ? ingotPickRow(m) : meltRow(m)).join('') || '<p class="muted center-t">ยังไม่มีก้อน</p>'}</div>`;
    if (stockTab === 'ingots') body += ingotBarHtml();
  } else {
    body += `<div class="card"><p class="muted sm">ของที่ติดป้าย "ขายทั้งชิ้น" ตอนรับซื้อ — ขายได้ในเฟส 2.3</p><div class="list">${wholeItems.map(i => `<div class="list-row"><div><b>${esc(M[i.metal] ? M[i.metal].label : i.metal)} ${esc(i.pct)}%</b> · ${esc(i.item_kind || '')}<br><span class="muted sm">${esc(i.bill_no)} · ${thDateTime(i.created_at)}</span></div><div class="right"><b>${gram(i.weight)} ก.</b><br><span class="muted sm">ทุน ${money(i.amount)}</span></div></div>`).join('') || '<p class="muted center-t">ไม่มี</p>'}</div></div>`;
  }
  $('.main').innerHTML = `<h1 class="screen-title">สต๊อก / หลอม</h1>` + body;
  $$('[data-stab]').forEach(b => b.onclick = () => { stockTab = b.dataset.stab; renderStock(); });
  $$('[data-smetal]').forEach(b => b.onclick = () => { stockMetal = b.dataset.smetal; stockSel.clear(); renderStock(); });
  $$('[data-sid]').forEach(c => c.onchange = () => { const id = +c.dataset.sid; c.checked ? stockSel.add(id) : stockSel.delete(id); renderStockBar(); c.closest('.stock-row').classList.toggle('on', c.checked); });
  const sa = $('#selAll'); if (sa) sa.onclick = () => { meltItems.filter(i => i.metal === stockMetal).forEach(i => stockSel.add(i.id)); renderStock(); };
  const sn = $('#selNone'); if (sn) sn.onclick = () => { stockSel.clear(); renderStock(); };
  const dm = $('#doMelt'); if (dm) dm.onclick = meltModal;
  $$('[data-melt]').forEach(r => r.onclick = () => meltDetail(r.dataset.melt));
  if (stockTab === 'ingots') bindIngotPick();
}
function renderStockBar() {
  const list = stockCache.filter(i => stockSel.has(i.id));
  const w = list.reduce((t, i) => t + num(i.weight), 0), f = list.reduce((t, i) => t + fine(i.weight, i.pct), 0), c = list.reduce((t, i) => t + num(i.amount), 0);
  const bar = $('.melt-bar'); if (!bar) return;
  bar.classList.toggle('show', list.length > 0);
  bar.querySelector('div').innerHTML = `<b>เลือก ${list.length} รายการ · ${gram(w)} ก.</b><br><span class="sm">% เฉลี่ย ${w ? (f / w * 100).toFixed(2) : '-'} · เนื้อที่คาด ${gram(f)} ก. · ทุน ${money(c)}</span>`;
  $('#doMelt').disabled = !list.length;
}
function meltRow(m) {
  const M = metals();
  const st = { ready: m.within_tolerance ? '<span class="pill ok">พร้อมขาย</span>' : '<span class="pill bad">เกินเกณฑ์ ตรวจสอบ</span>', sold: '<span class="pill">ขายแล้ว</span>', refining: '<span class="pill">อยู่ที่โรงสกัด</span>', cancelled: '<span class="pill bad">ยกเลิก</span>', merged: '<span class="pill">รวมเข้าก้อนใหม่แล้ว</span>' };
  return `<button class="list-row ${m.status === 'cancelled' ? 'void' : ''}" data-melt="${m.id}"><div><b>${esc(m.lot_no)}</b> <span class="muted sm">${esc(M[m.metal] ? M[m.metal].label : m.metal)} · ${thDateTime(m.created_at)} · ${esc(m.staff_code || '')}</span><br>
    <span class="sm">${gram(m.out_weight)} ก. @ ${esc(m.measured_pct)}% = เนื้อ <b>${gram(m.out_fine)} ก.</b> · ต่างจากคาด ${num(m.fine_diff) >= 0 ? '+' : ''}${gram(m.fine_diff)} ก. (${num(m.fine_diff_pct) >= 0 ? '+' : ''}${num(m.fine_diff_pct).toFixed(2)}%)</span></div>
    <div class="right">${st[m.status] || ''}<br><span class="muted sm">ทุน ${money(num(m.items_cost) + num(m.melt_cost))}</span></div></button>`;
}
function meltCalc(list, outW, pct, cost) {
  const inW = list.reduce((t, i) => t + num(i.weight), 0), inF = list.reduce((t, i) => t + fine(i.weight, i.pct), 0), itemsCost = list.reduce((t, i) => t + num(i.amount), 0);
  const outF = fine(outW, pct), loss = inW - num(outW), diff = outF - inF, diffPct = inF ? diff / inF * 100 : 0;
  const total = itemsCost + num(cost);
  return { inW, inF, inPct: inW ? inF / inW * 100 : 0, itemsCost, outF, loss, lossPct: inW ? loss / inW * 100 : 0, diff, diffPct, total, perFine: outF ? total / outF : 0 };
}
function meltModal() {
  const list = stockCache.filter(i => stockSel.has(i.id)); if (!list.length) return;
  const cfg = meltCfg(), M = metals(), metal = list[0].metal;
  const base = meltCalc(list, 0, 0, 0);
  modal(`<h2>หลอม ${esc(M[metal] ? M[metal].label : metal)} ${list.length} รายการ</h2>
    <div class="melt-sum"><div><span>น้ำหนักก่อนหลอม</span><b>${gram(base.inW)} ก.</b></div><div><span>% เฉลี่ย</span><b>${base.inPct.toFixed(2)}%</b></div><div><span>เนื้อที่คาด</span><b>${gram(base.inF)} ก.</b></div><div><span>ทุนของ</span><b>${money(base.itemsCost)}</b></div></div>
    <div class="grid2">
      <label>น้ำหนักก้อนหลังหลอม (ก.) *<input id="mw" inputmode="decimal" autofocus placeholder="0.00"></label>
      <label>% ที่วัดได้ *<input id="mp" inputmode="decimal" placeholder="เช่น 95.20"></label>
    </div>
    <label>ค่าหลอม (บาท)<input id="mc" inputmode="decimal" value="${esc(cfg.default_cost)}"></label>
    <label>หมายเหตุ<input id="mn" placeholder="ไม่บังคับ เช่น ร้านที่ส่งหลอม"></label>
    <div id="mcalc" class="melt-calc"></div>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ยกเลิก</button><button class="btn gold" id="mOk">บันทึกการหลอม</button></div>`, { sticky: true });
  const draw = () => {
    const w = num($('#mw').value), p = num($('#mp').value), c = num($('#mc').value);
    if (!w || !p) { $('#mcalc').innerHTML = '<p class="muted sm">ใส่น้ำหนักหลังหลอมและ % ที่วัดได้ ระบบจะเทียบกับที่คาดไว้ให้</p>'; return; }
    const r = meltCalc(list, w, p, c), ok = Math.abs(r.diffPct) <= num(cfg.tolerance_pct), lossWarn = r.lossPct > num(cfg.loss_warn_pct);
    $('#mcalc').innerHTML = `
      <div class="mc-row"><span>น้ำหนักหาย</span><b class="${lossWarn ? 'bad' : ''}">${gram(r.loss)} ก. (${r.lossPct.toFixed(2)}%)${lossWarn ? ' ⚠' : ''}</b></div>
      <div class="mc-row"><span>เนื้อทองจริง</span><b>${gram(r.outF)} ก.</b></div>
      <div class="mc-row"><span>ต่างจากที่คาด</span><b class="${ok ? 'okc' : 'bad'}">${r.diff >= 0 ? '+' : ''}${gram(r.diff)} ก. (${r.diffPct >= 0 ? '+' : ''}${r.diffPct.toFixed(2)}%)</b></div>
      <div class="mc-verdict ${ok ? 'ok' : 'bad'}">${ok ? `✅ อยู่ในเกณฑ์ (±${cfg.tolerance_pct}%) — พร้อมขาย` : `⚠️ เกินเกณฑ์ ±${cfg.tolerance_pct}% — ควรวัด % ซ้ำก่อนขาย`}</div>
      <div class="mc-row"><span>ทุนรวม (ของ + ค่าหลอม)</span><b>${money(r.total)}</b></div>
      <div class="mc-row"><span>ทุนต่อกรัมเนื้อทอง</span><b>${money(r.perFine, 2)} บาท</b></div>
      ${r.loss < 0 ? '<p class="bad sm">น้ำหนักหลังหลอมมากกว่าก่อนหลอม — ตรวจตัวเลข</p>' : ''}`;
  };
  ['#mw', '#mp', '#mc'].forEach(id => { $(id).oninput = draw; }); draw();
  $('#mOk').onclick = async (ev) => {
    const w = num($('#mw').value), p = num($('#mp').value);
    if (!w) return toast(ERR.BAD_WEIGHT, 'err'); if (!p || p > 100) return toast(ERR.BAD_PCT, 'err');
    busy(ev.target, true);
    try {
      const m = await api('create_melt', { p_token: S.session.token, p_item_ids: list.map(i => i.id), p_out_weight: w, p_measured_pct: p, p_melt_cost: num($('#mc').value), p_note: $('#mn').value.trim() || null });
      toast(`บันทึกก้อน ${m.lot_no} แล้ว`); stockSel.clear(); closeModal(); stockTab = 'ingots'; renderStock();
    } catch (e) { busy(ev.target, false); toast(errText(e), 'err'); }
  };
}
async function meltDetail(id) {
  let m;
  try { m = await api('get_melt', { p_token: S.session.token, p_id: id }); } catch (e) { return toast(errText(e), 'err'); }
  if (!m) return;
  const M = metals(), total = num(m.items_cost) + num(m.melt_cost);
  modal(`<h2>ก้อน ${esc(m.lot_no)}</h2>
    <p class="muted">${esc(M[m.metal] ? M[m.metal].label : m.metal)} · หลอมเมื่อ ${thDateTime(m.created_at)} โดย ${esc(m.staff_code || '')}${m.note ? ' · ' + esc(m.note) : ''}</p>
    ${m.status === 'cancelled' ? `<div class="banner warn">ยกเลิกแล้ว: ${esc(m.cancel_reason || '')}</div>` : ''}
    <div class="melt-sum"><div><span>ก่อนหลอม</span><b>${gram(m.input_weight)} ก.</b><small>${esc(m.input_pct)}% · เนื้อ ${gram(m.input_fine)}</small></div>
      <div><span>หลังหลอม</span><b>${gram(m.out_weight)} ก.</b><small>${esc(m.measured_pct)}% · เนื้อ ${gram(m.out_fine)}</small></div>
      <div><span>ต่างจากคาด</span><b class="${m.within_tolerance ? 'okc' : 'bad'}">${num(m.fine_diff) >= 0 ? '+' : ''}${gram(m.fine_diff)} ก.</b><small>${num(m.fine_diff_pct).toFixed(2)}% · ${m.within_tolerance ? 'ในเกณฑ์' : 'เกินเกณฑ์'}</small></div>
      <div><span>ทุนรวม</span><b>${money(total)}</b><small>${money(num(m.out_fine) ? total / num(m.out_fine) : 0, 2)} บ./ก.เนื้อ</small></div></div>
    ${m.children && m.children.length ? `<h3>รวมมาจาก ${m.children.length} ก้อน</h3><div class="list">${m.children.map(c => `<div class="list-row"><div><b>${esc(c.lot_no)}</b> <span class="muted sm">${thDateTime(c.created_at)} · ${c.item_count} รายการ</span></div><div class="right"><b>${gram(c.out_weight)} ก.</b><br><span class="muted sm">${esc(c.measured_pct)}% · เนื้อ ${gram(c.out_fine)}</span></div></div>`).join('')}</div>` : ''}
    ${m.source === 'refinery_return' ? '' : `<h3>มาจาก ${m.items.length} รายการ${m.children && m.children.length ? ' (จากทุกก้อน)' : ''}</h3>`}
    <div class="list">${m.items.map(i => `<div class="list-row"><div><b>${esc(i.bill_no)}</b> <span class="muted sm">${thDateTime(i.bill_created_at)}</span><br><span class="sm">${esc(i.pct)}% · ${esc(i.item_kind || '')} · ${esc(i.customer_name || '')}</span></div><div class="right"><b>${gram(i.weight)} ก.</b><br><span class="muted sm">${money(i.amount)}</span></div></div>`).join('')}</div>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ปิด</button>${isOwner() && m.status === 'ready' ? '<button class="btn danger" id="cMelt">ยกเลิกการหลอม</button>' : ''}</div>`, { wide: true });
  const cm = $('#cMelt'); if (cm) cm.onclick = async () => {
    const reason = prompt('เหตุผลที่ยกเลิกการหลอม ' + m.lot_no + ' (ของจะกลับเข้าสต๊อกรอหลอม)'); if (!reason) return;
    try { await api('cancel_melt', { p_token: S.session.token, p_id: m.id, p_reason: reason }); toast('ยกเลิกการหลอมแล้ว ของกลับเข้าสต๊อก'); closeModal(); renderStock(); } catch (e) { toast(errText(e), 'err'); }
  };
}

// ---------------------------------------------------------------- เฟส 2.3: ขาย
function saleCfg() { return Object.assign({ staff_can_sell: false }, (S.settings && S.settings.sale) || {}); }
const canSell = () => isOwner() || saleCfg().staff_can_sell;
let sellTab = 'new', sellData = null;
function newSaleDraft() { return { buyer_type: 'shop', buyer_name: '', buyer_phone: '', sel: {}, transport_cost: '', other_cost: '', paid: false, pay_method: 'transfer', due_date: '', note: '', files: [] }; }
async function renderSell() {
  shell('ขาย', '<div class="center"><span class="spin big"></span></div>');
  if (!canSell()) { $('.main').innerHTML = '<h1 class="screen-title">ขาย</h1><div class="banner warn">เจ้าของยังไม่เปิดสิทธิ์ให้พนักงานบันทึกการขาย</div>'; return; }
  if (!S.session.token || !S.online) { $('.main').innerHTML = '<h1 class="screen-title">ขาย</h1><div class="banner warn">ต้องออนไลน์</div>'; return; }
  let pending = [];
  try {
    const calls = [api('list_sales', { p_token: S.session.token, p_scope: 'pending' })];
    if (sellTab === 'new') calls.push(api('list_sellable', { p_token: S.session.token }));
    if (sellTab === 'history') calls.push(api('list_sales', { p_token: S.session.token, p_scope: 'all' }));
    const r = await Promise.all(calls); pending = r[0];
    if (sellTab === 'new') sellData = r[1]; if (sellTab === 'history') S._salesAll = r[1];
  } catch (e) { toast(errText(e), 'err'); }
  if (S.screen !== 'sell') return;
  const overdue = pending.filter(x => x.due_date && x.due_date < bkkDate()).length;
  const tabs = [['new', 'ขายใหม่'], ['refinery', 'โรงสกัด'], ['pending', `รอรับเงิน (${pending.length})${overdue ? ' ⚠' : ''}`], ['history', 'ประวัติขาย']];
  let body = `<div class="seg">${tabs.map(t => `<button data-sell="${t[0]}" class="${sellTab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>`;
  if (sellTab === 'new') body += `<div id="sellForm">${sellFormHtml()}</div>`;
  else if (sellTab === 'refinery') body += await refineryTabHtml();
  else {
    const list = sellTab === 'pending' ? pending : (S._salesAll || []);
    const pendTotal = pending.reduce((t, x) => t + num(x.total_amount), 0);
    if (sellTab === 'pending') body += `<div class="kpis"><div class="kpi"><span>ยอดรอรับเงิน</span><b>${money(pendTotal)}</b><small>${pending.length} รายการ</small></div>${overdue ? `<div class="kpi"><span>เลยกำหนด</span><b class="bad">${overdue}</b><small>รายการ</small></div>` : ''}</div>`;
    body += `<div class="card list">${list.map(saleRow).join('') || '<p class="muted center-t">ไม่มีรายการ</p>'}</div>`;
  }
  $('.main').innerHTML = `<h1 class="screen-title">ขาย</h1>` + body;
  $$('[data-sell]').forEach(b => b.onclick = () => { sellTab = b.dataset.sell; renderSell(); });
  $$('[data-sale]').forEach(r => r.onclick = () => saleDetail(r.dataset.sale));
  if (sellTab === 'new') bindSellForm();
  if (sellTab === 'refinery') bindRefineryTab();
}
function saleRow(x) {
  const st = { pending_payment: x.due_date && x.due_date < bkkDate() ? '<span class="pill bad">เลยกำหนดรับเงิน</span>' : '<span class="pill warn">รอรับเงิน</span>', paid: '<span class="pill ok">รับเงินแล้ว</span>', cancelled: '<span class="pill bad">ยกเลิก</span>' };
  const profit = num(x.total_amount) - num(x.total_cost) - num(x.transport_cost) - num(x.other_cost);
  return `<button class="list-row ${x.status === 'cancelled' ? 'void' : ''}" data-sale="${x.id}"><div><b>${esc(x.sale_no)}</b> <span class="muted sm">${thDateTime(x.created_at)} · ${esc(x.staff_code || '')}</span><br>
    <span class="sm">${x.buyer_type === 'refinery' ? '🏭' : '🏪'} ${esc(x.buyer_name)} · ${x.line_count || ''} รายการ${x.doc_count ? ` · 📎${x.doc_count}` : ''}${x.status === 'pending_payment' && x.due_date ? ` · กำหนด ${esc(dueTh(x.due_date))}` : ''}</span></div>
    <div class="right"><b>${money(x.total_amount)}</b><br>${st[x.status] || ''}<br><span class="sm ${profit >= 0 ? 'okc' : 'bad'}">กำไร ${money(profit)}</span></div></button>`;
}
function sellFormHtml() {
  const d = S.saleDraft = S.saleDraft || newSaleDraft(), M = metals(), data = sellData || { melts: [], items: [], buyers: [] };
  const valid = new Set([...data.melts.map(m => 'melt:' + m.id), ...data.items.map(i => 'item:' + i.id)]);
  Object.keys(d.sel).forEach(k => { if (!valid.has(k)) delete d.sel[k]; });
  const row = (key, title, sub, w, pct, cost) => { const s = d.sel[key]; return `<div class="sell-item ${s ? 'on' : ''}">
      <label class="stock-row"><input type="checkbox" data-pick="${key}" ${s ? 'checked' : ''}><div class="grow"><b>${title}</b><br><span class="muted sm">${sub}</span></div><div class="right"><b>${gram(w)} ก.</b><br><span class="muted sm">${esc(pct)}% · ทุน ${money(cost)}</span></div></label>
      ${s ? `<div class="sell-in grid3"><label>% ที่ผู้ซื้อวัด<input data-bpct="${key}" inputmode="decimal" value="${esc(s.buyer_pct)}" placeholder="${esc(pct)}"></label><label>ขายได้ (บาท) *<input data-amt="${key}" inputmode="decimal" value="${esc(s.amount)}" placeholder="0"></label><div class="sell-calc" data-calc="${key}"></div></div>` : ''}</div>`; };
  return `<div class="card"><h2>ผู้ซื้อ</h2>
      <div class="seg"><button data-btype="shop" class="${d.buyer_type === 'shop' ? 'on' : ''}">🏪 ร้านรับซื้อทอง</button><button data-btype="refinery" class="${d.buyer_type === 'refinery' ? 'on' : ''}">🏭 โรงหลอม/สกัด</button></div>
      <div class="grid2"><label>ชื่อผู้ซื้อ *<input id="sbName" list="buyerList" value="${esc(d.buyer_name)}" placeholder="เช่น ร้านทองเยาวราช"></label><label>เบอร์โทร<input id="sbPhone" inputmode="tel" value="${esc(d.buyer_phone)}"></label></div>
      <datalist id="buyerList">${data.buyers.map(b => `<option value="${esc(b.name)}">`).join('')}</datalist></div>
    <div class="card"><div class="card-h"><h2>เลือกของที่ขาย</h2><span class="muted sm">${data.melts.length} ก้อน · ${data.items.length} รายการรับซื้อ</span></div>
      ${data.melts.length ? '<div class="lbl">ก้อนหลอมแล้ว</div>' : ''}
      ${data.melts.map(m => row('melt:' + m.id, `${esc(m.lot_no)} · ${esc(M[m.metal] ? M[m.metal].label : m.metal)}`, `เนื้อ ${gram(m.out_fine)} ก. · ${m.within_tolerance ? 'ในเกณฑ์' : '⚠ เกินเกณฑ์'}`, m.out_weight, m.measured_pct, num(m.items_cost) + num(m.melt_cost))).join('')}
      ${[['whole', 'ขายทั้งชิ้น'], ['lump', 'ก้อนย่อย (หลอมตอนรับซื้อ) — ยังไม่ได้รวมก้อน'], ['melt', 'รับซื้อมา ยังไม่หลอม']].map(([dst, title]) => {
        const arr = data.items.filter(i => (i.destination || 'melt') === dst); if (!arr.length) return '';
        return `<div class="lbl">${title} (${arr.length})</div>` + arr.map(i => row('item:' + i.id, `${esc(M[i.metal] ? M[i.metal].label : i.metal)} ${esc(i.pct)}% · ${esc(i.item_kind || '')}`, `${esc(i.bill_no)} · ${thDateTime(i.created_at)}${i.customer_name ? ' · ' + esc(i.customer_name) : ''}${i.pre_weight ? ` · ก่อนหลอม ${gram(i.pre_weight)} ก.` : ''}`, i.weight, i.pct, i.amount)).join('');
      }).join('')}
      ${!data.melts.length && !data.items.length ? '<p class="muted center-t">ยังไม่มีของในสต๊อก</p>' : ''}</div>
    <div class="card"><h2>ค่าใช้จ่าย & การรับเงิน</h2>
      <div class="grid2"><label>ค่าขนส่ง (บาท)<input id="sTrans" inputmode="decimal" value="${esc(d.transport_cost)}" placeholder="0"></label><label>ค่าใช้จ่ายอื่น (บาท)<input id="sOther" inputmode="decimal" value="${esc(d.other_cost)}" placeholder="0"></label></div>
      <div class="seg"><button data-paid="1" class="${d.paid ? 'on' : ''}">ได้รับเงินแล้ว</button><button data-paid="0" class="${!d.paid ? 'on' : ''}">รอรับเงิน</button></div>
      <div class="grid2"><label>ช่องทาง<select id="sMethod"><option value="transfer" ${d.pay_method === 'transfer' ? 'selected' : ''}>โอน</option><option value="cash" ${d.pay_method === 'cash' ? 'selected' : ''}>เงินสด</option><option value="cheque" ${d.pay_method === 'cheque' ? 'selected' : ''}>เช็ค</option></select></label>
        ${d.paid ? '' : `<label>กำหนดรับเงิน<input id="sDue" type="date" value="${esc(d.due_date)}" min="${bkkDate()}"></label>`}</div>
      <label>หมายเหตุ<input id="sNote" value="${esc(d.note)}" placeholder="ไม่บังคับ"></label>
      <label>แนบเอกสาร/ใบรับซื้อจากผู้ซื้อ (รูป)<input id="sFiles" type="file" accept="image/*" multiple></label>
      <div id="sFileList" class="muted sm">${d.files.length ? d.files.map(f => '📎 ' + esc(f.name)).join(' · ') : ''}</div></div>
    <div class="sell-total" id="sTotal"></div>
    <button class="btn gold block xl" id="sSave">บันทึกการขาย</button>`;
}
function sellSummary() {
  const d = S.saleDraft, data = sellData || { melts: [], items: [] };
  let amt = 0, cost = 0, n = 0;
  Object.entries(d.sel).forEach(([k, s]) => {
    const [kind, id] = k.split(':');
    const src = kind === 'melt' ? data.melts.find(m => m.id === id) : data.items.find(i => String(i.id) === id); if (!src) return;
    const w = kind === 'melt' ? num(src.out_weight) : num(src.weight), pct = kind === 'melt' ? num(src.measured_pct) : num(src.pct);
    const c = kind === 'melt' ? num(src.items_cost) + num(src.melt_cost) : num(src.amount), bp = num(s.buyer_pct) || pct, a = num(s.amount), f = w * bp / 100;
    n++; amt += a; cost += c;
    const el = $(`[data-calc="${k}"]`);
    if (el) el.innerHTML = a ? `<span>ต่อกรัมเนื้อ ${money(f ? a / f : 0, 2)}</span><b class="${a - c >= 0 ? 'okc' : 'bad'}">กำไร ${money(a - c)}</b>${bp < pct ? `<span class="bad">% ต่ำกว่าเรา ${(pct - bp).toFixed(2)}</span>` : ''}` : `<span class="muted">ทุน ${money(c)}</span>`;
  });
  const exp = num(d.transport_cost) + num(d.other_cost), profit = amt - cost - exp;
  $('#sTotal').innerHTML = `<div><span>ขาย ${n} รายการ</span><b>${money(amt)}</b></div><div><span>ทุนของ</span><b>${money(cost)}</b></div><div><span>ค่าใช้จ่าย</span><b>${money(exp)}</b></div><div><span>กำไรสุทธิ</span><b class="${profit >= 0 ? 'okc' : 'bad'}">${money(profit)}</b></div>`;
  $('#sSave').disabled = !n;
}
function bindSellForm() {
  const d = S.saleDraft;
  $$('[data-btype]').forEach(b => b.onclick = () => { d.buyer_type = b.dataset.btype; renderSellForm(); });
  $$('[data-paid]').forEach(b => b.onclick = () => { d.paid = b.dataset.paid === '1'; renderSellForm(); });
  $('#sbName').oninput = (e) => { d.buyer_name = e.target.value; const b = (sellData.buyers || []).find(x => x.name === e.target.value); if (b && b.phone && !d.buyer_phone) { d.buyer_phone = b.phone; $('#sbPhone').value = b.phone; } };
  $('#sbPhone').oninput = (e) => { d.buyer_phone = e.target.value; };
  $$('[data-pick]').forEach(c => c.onchange = () => { if (c.checked) d.sel[c.dataset.pick] = { buyer_pct: '', amount: '' }; else delete d.sel[c.dataset.pick]; renderSellForm(); });
  $$('[data-bpct]').forEach(i => i.oninput = () => { d.sel[i.dataset.bpct].buyer_pct = i.value; sellSummary(); });
  $$('[data-amt]').forEach(i => i.oninput = () => { d.sel[i.dataset.amt].amount = i.value; sellSummary(); });
  $('#sTrans').oninput = (e) => { d.transport_cost = e.target.value; sellSummary(); };
  $('#sOther').oninput = (e) => { d.other_cost = e.target.value; sellSummary(); };
  $('#sMethod').onchange = (e) => { d.pay_method = e.target.value; };
  const due = $('#sDue'); if (due) due.onchange = (e) => { d.due_date = e.target.value; };
  $('#sNote').oninput = (e) => { d.note = e.target.value; };
  $('#sFiles').onchange = async (e) => {
    for (const f of Array.from(e.target.files)) { try { d.files.push({ name: f.name.replace(/\.[^.]+$/, ''), data: await compressImage(f, 1400, 0.7) }); } catch (err) { toast('อ่านรูปไม่ได้: ' + f.name, 'err'); } }
    $('#sFileList').innerHTML = d.files.map(f => '📎 ' + esc(f.name)).join(' · ');
  };
  $('#sSave').onclick = saveSale;
  sellSummary();
}
function renderSellForm() { const sc = window.scrollY; $('#sellForm').innerHTML = sellFormHtml(); bindSellForm(); window.scrollTo(0, sc); }
async function saveSale(ev) {
  const d = S.saleDraft;
  if (!d.buyer_name.trim()) return toast('ใส่ชื่อผู้ซื้อ', 'err');
  const lines = Object.entries(d.sel).map(([k, s]) => { const [kind, ref] = k.split(':'); return { kind, ref, buyer_pct: s.buyer_pct === '' ? null : num(s.buyer_pct), amount: num(s.amount) }; });
  if (!lines.length) return toast('เลือกของที่ขาย', 'err');
  if (lines.some(l => !l.amount)) return toast('ใส่ยอดขายให้ครบทุกรายการ', 'err');
  if (!d.paid && !d.due_date && !confirm('ยังไม่ได้ใส่กำหนดรับเงิน บันทึกต่อไหม?')) return;
  const total = lines.reduce((t, l) => t + l.amount, 0);
  if (!confirm(`บันทึกการขายให้ ${d.buyer_name} ยอด ${money(total)} บาท ${d.paid ? '(ได้รับเงินแล้ว)' : '(รอรับเงิน)'}?`)) return;
  busy(ev.target, true);
  try {
    const sale = await api('create_sale', { p_token: S.session.token, p_sale: { buyer_type: d.buyer_type, buyer_name: d.buyer_name.trim(), buyer_phone: d.buyer_phone.trim(), lines, transport_cost: num(d.transport_cost), other_cost: num(d.other_cost), paid: d.paid, pay_method: d.pay_method, due_date: d.paid ? null : (d.due_date || null), note: d.note.trim() } });
    let docFail = 0;
    for (const f of d.files) { try { await api('add_sale_doc', { p_token: S.session.token, p_sale: sale.id, p_name: f.name, p_data: f.data }); } catch (e) { docFail++; } }
    toast(`บันทึกการขาย ${sale.sale_no} แล้ว${docFail ? ` (แนบเอกสารไม่สำเร็จ ${docFail} ไฟล์)` : ''}`, docFail ? 'warn' : 'ok');
    S.saleDraft = null; sellTab = d.paid ? 'history' : 'pending'; renderSell();
  } catch (e) { busy(ev.target, false); toast(errText(e), 'err'); }
}
function compressImage(file, max, q) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const r = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); let out = c.toDataURL('image/jpeg', q); if (out.length > 650000) out = c.toDataURL('image/jpeg', 0.5); URL.revokeObjectURL(img.src); res(out); }; img.onerror = rej; img.src = URL.createObjectURL(file); });
}
async function saleDetail(id) {
  let x; try { x = await api('get_sale', { p_token: S.session.token, p_id: id }); } catch (e) { return toast(errText(e), 'err'); }
  if (!x) return;
  const M = metals(), exp = num(x.transport_cost) + num(x.other_cost), profit = num(x.total_amount) - num(x.total_cost) - exp, showP = x.total_cost != null;
  modal(`<h2>${esc(x.sale_no)} ${x.buyer_type === 'refinery' ? '🏭' : '🏪'} ${esc(x.buyer_name)}</h2>
    <p class="muted">${thDateTime(x.created_at)} · บันทึกโดย ${esc(x.staff_code || '')}${x.buyer_phone ? ' · โทร ' + esc(x.buyer_phone) : ''}</p>
    ${x.status === 'cancelled' ? `<div class="banner warn">ยกเลิกแล้ว: ${esc(x.cancel_reason || '')}</div>` : x.status === 'paid' ? `<div class="banner info">รับเงินแล้ว ${x.paid_at ? thDateTime(x.paid_at) : ''} · ${esc({ transfer: 'โอน', cash: 'เงินสด', cheque: 'เช็ค' }[x.pay_method] || x.pay_method || '')}</div>` : `<div class="banner warn">รอรับเงิน${x.due_date ? ' · กำหนด ' + esc(dueTh(x.due_date)) : ''}</div>`}
    <table class="tbl sale-tbl"><thead><tr><th>รายการ</th><th>น้ำหนัก</th><th>% เรา/ผู้ซื้อ</th><th>ขายได้</th>${showP ? '<th>กำไร</th>' : ''}</tr></thead><tbody>
      ${x.lines.map(l => `<tr><td>${esc(l.label)}<br><span class="muted sm">${esc(M[l.metal] ? M[l.metal].label : l.metal)}</span></td><td>${gram(l.weight)}</td><td>${esc(l.our_pct)} / <b class="${num(l.buyer_pct) < num(l.our_pct) ? 'bad' : ''}">${esc(l.buyer_pct)}</b></td><td>${money(l.amount)}</td>${showP ? `<td class="${num(l.amount) - num(l.cost) >= 0 ? 'okc' : 'bad'}">${money(num(l.amount) - num(l.cost))}</td>` : ''}</tr>`).join('')}
    </tbody></table>
    <div class="sell-total"><div><span>ยอดขาย</span><b>${money(x.total_amount)}</b></div>${showP ? `<div><span>ทุนของ</span><b>${money(x.total_cost)}</b></div>` : ''}<div><span>ค่าใช้จ่าย</span><b>${money(exp)}</b></div>${showP ? `<div><span>กำไรสุทธิ</span><b class="${profit >= 0 ? 'okc' : 'bad'}">${money(profit)}</b></div>` : ''}</div>
    ${x.fine_our ? `<p class="muted sm">เนื้อทองตามเรา ${gram(x.fine_our)} ก. · ตามผู้ซื้อ ${gram(x.fine_buyer)} ก. (ต่าง ${gram(num(x.fine_buyer) - num(x.fine_our))} ก.)</p>` : ''}
    ${x.note ? `<p class="sm">หมายเหตุ: ${esc(x.note)}</p>` : ''}
    <h3>เอกสาร (${x.docs.length})</h3><div class="docs">${x.docs.map(dc => `<button class="btn ghost sm" data-doc="${dc.id}">📎 ${esc(dc.name || 'เอกสาร')}</button>`).join('')}
      ${x.status !== 'cancelled' ? '<label class="btn ghost sm">+ แนบเพิ่ม<input type="file" id="addDoc" accept="image/*" multiple hidden></label>' : ''}</div>
    <div class="row end wrap"><button class="btn ghost" onclick="closeModal()">ปิด</button>
      ${isOwner() && x.status !== 'cancelled' ? '<button class="btn ghost" id="cSale">ยกเลิกการขาย</button>' : ''}
      ${x.status === 'pending_payment' && canSell() ? '<button class="btn gold" id="pSale">ได้รับเงินแล้ว</button>' : ''}</div>`, { wide: true });
  $$('[data-doc]').forEach(b => b.onclick = async () => { try { const dc = await api('get_sale_doc', { p_token: S.session.token, p_doc: b.dataset.doc }); const w = window.open(); if (w) { w.document.title = dc.name || 'เอกสาร'; w.document.body.style.margin = 0; w.document.body.innerHTML = `<img src="${dc.data}" style="max-width:100%">`; } } catch (e) { toast(errText(e), 'err'); } });
  const ad = $('#addDoc'); if (ad) ad.onchange = async (e) => { for (const f of Array.from(e.target.files)) { try { await api('add_sale_doc', { p_token: S.session.token, p_sale: x.id, p_name: f.name.replace(/\.[^.]+$/, ''), p_data: await compressImage(f, 1400, 0.7) }); } catch (err) { toast(errText(err), 'err'); } } toast('แนบเอกสารแล้ว'); saleDetail(x.id); };
  const ps = $('#pSale'); if (ps) ps.onclick = async () => {
    const expAmt = num(x.total_amount) - (x.buyer_type === 'refinery' ? num(x.other_cost) : 0); const amt = prompt(`ยอดที่ได้รับจริง (บาท) — ปกติ ${expAmt}`, expAmt); if (amt === null) return;
    try { await api('mark_sale_paid', { p_token: S.session.token, p_id: x.id, p_method: x.pay_method || 'transfer', p_amount: num(amt) || null }); toast('บันทึกรับเงินแล้ว'); closeModal(); renderSell(); } catch (e) { toast(errText(e), 'err'); }
  };
  const cs = $('#cSale'); if (cs) cs.onclick = async () => {
    const reason = prompt('เหตุผลที่ยกเลิกการขาย ' + x.sale_no + ' (ของจะกลับเข้าสต๊อก)'); if (!reason) return;
    try { await api('cancel_sale', { p_token: S.session.token, p_id: x.id, p_reason: reason }); toast('ยกเลิกการขายแล้ว ของกลับเข้าสต๊อก'); closeModal(); renderSell(); } catch (e) { toast(errText(e), 'err'); }
  };
}

// ---------------------------------------------------------------- รวมก้อน / ส่งโรงสกัด
let ingotSel = new Set(), ingotCache = [];
function ingotPickRow(m) {
  return `<div class="ingot-pick ${ingotSel.has(m.id) ? 'on' : ''}"><input type="checkbox" data-ising="${m.id}" ${ingotSel.has(m.id) ? 'checked' : ''} aria-label="เลือก ${esc(m.lot_no)}">${meltRow(m)}</div>`;
}
function ingotBarHtml() {
  const list = ingotCache.filter(m => ingotSel.has(m.id));
  const w = list.reduce((t, m) => t + num(m.out_weight), 0), f = list.reduce((t, m) => t + num(m.out_fine), 0);
  const metalsSel = new Set(list.map(m => m.metal));
  return `<div class="melt-bar ${list.length ? 'show' : ''}" id="ingotBar"><div><b>เลือก ${list.length} ก้อน · ${gram(w)} ก.</b><br><span class="sm">เนื้อรวม ${gram(f)} ก.${metalsSel.size > 1 ? ' · ⚠ ต่างโลหะ' : ''}</span></div>
    <div class="row" style="margin:0"><button class="btn ghost sm" id="doMerge" ${list.length >= 2 && metalsSel.size === 1 ? '' : 'disabled'} style="background:#fff">รวมเป็นก้อนเดียว</button>${canSell() ? `<button class="btn gold sm" id="doSend" ${list.length ? '' : 'disabled'}>ส่งโรงสกัด</button>` : ''}</div></div>`;
}
function bindIngotPick() {
  $$('[data-ising]').forEach(c => c.onchange = () => { c.checked ? ingotSel.add(c.dataset.ising) : ingotSel.delete(c.dataset.ising); c.closest('.ingot-pick').classList.toggle('on', c.checked); $('#ingotBar').outerHTML = ingotBarHtml(); bindIngotBar(); });
  bindIngotBar();
}
function bindIngotBar() {
  const mg = $('#doMerge'); if (mg) mg.onclick = mergeModal;
  const sd = $('#doSend'); if (sd) sd.onclick = sendModal;
}
function mergeModal() {
  const list = ingotCache.filter(m => ingotSel.has(m.id)); const cfg = meltCfg();
  const inW = list.reduce((t, m) => t + num(m.out_weight), 0), inF = list.reduce((t, m) => t + num(m.out_fine), 0), cost = list.reduce((t, m) => t + num(m.items_cost) + num(m.melt_cost), 0);
  modal(`<h2>รวม ${list.length} ก้อนเป็นก้อนเดียว</h2>
    <p class="muted sm">${list.map(m => esc(m.lot_no)).join(', ')}</p>
    <div class="melt-sum"><div><span>น้ำหนักรวม</span><b>${gram(inW)} ก.</b></div><div><span>% เฉลี่ย</span><b>${inW ? (inF / inW * 100).toFixed(2) : '-'}%</b></div><div><span>เนื้อรวม</span><b>${gram(inF)} ก.</b></div><div><span>ทุนรวม</span><b>${money(cost)}</b></div></div>
    <div class="grid2"><label>น้ำหนักก้อนใหม่ (ก.) *<input id="gw" inputmode="decimal" autofocus></label><label>% ที่วัดได้ *<input id="gp" inputmode="decimal"></label></div>
    <label>ค่าหลอม (บาท)<input id="gc" inputmode="decimal" value="${esc(cfg.default_cost)}"></label>
    <label>หมายเหตุ<input id="gn" placeholder="ไม่บังคับ"></label>
    <div id="gcalc" class="melt-calc"></div>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ยกเลิก</button><button class="btn gold" id="gOk">บันทึกก้อนใหม่</button></div>`, { sticky: true });
  const draw = () => { const w = num($('#gw').value), p = num($('#gp').value); if (!w || !p) { $('#gcalc').innerHTML = '<p class="muted sm">ใส่น้ำหนักและ % ของก้อนใหม่</p>'; return; }
    const of = w * p / 100, diff = of - inF, dp = inF ? diff / inF * 100 : 0, ok = Math.abs(dp) <= num(cfg.tolerance_pct);
    $('#gcalc').innerHTML = `<div class="mc-row"><span>น้ำหนักหาย</span><b>${gram(inW - w)} ก. (${inW ? ((inW - w) / inW * 100).toFixed(2) : 0}%)</b></div><div class="mc-row"><span>เนื้อทองก้อนใหม่</span><b>${gram(of)} ก.</b></div><div class="mc-row"><span>ต่างจากเนื้อรวมเดิม</span><b class="${ok ? 'okc' : 'bad'}">${diff >= 0 ? '+' : ''}${gram(diff)} ก. (${dp.toFixed(2)}%)</b></div><div class="mc-verdict ${ok ? 'ok' : 'bad'}">${ok ? '✅ อยู่ในเกณฑ์' : '⚠️ เกินเกณฑ์ — ควรวัดซ้ำ'}</div>`; };
  ['#gw', '#gp'].forEach(id => { $(id).oninput = draw; }); draw();
  $('#gOk').onclick = async (ev) => { busy(ev.target, true);
    try { const m = await api('merge_melts', { p_token: S.session.token, p_melt_ids: list.map(x => x.id), p_out_weight: num($('#gw').value), p_measured_pct: num($('#gp').value), p_melt_cost: num($('#gc').value), p_note: $('#gn').value.trim() || null });
      toast(`รวมเป็นก้อน ${m.lot_no} แล้ว`); ingotSel.clear(); closeModal(); renderStock(); }
    catch (e) { busy(ev.target, false); toast(errText(e), 'err'); } };
}
async function sendModal() {
  const list = ingotCache.filter(m => ingotSel.has(m.id));
  const w = list.reduce((t, m) => t + num(m.out_weight), 0);
  let known = [];
  try { const r = await api('list_refinery', { p_token: S.session.token, p_scope: 'all' }); const seen = new Set(); known = r.filter(x => !seen.has(x.refinery_name) && seen.add(x.refinery_name)); } catch (e) { /* ignore */ }
  modal(`<h2>ส่งโรงสกัด ${list.length} ก้อน</h2>
    <p class="muted sm">${list.map(m => `${esc(m.lot_no)} (${gram(m.out_weight)} ก. @ ${esc(m.measured_pct)}%)`).join(', ')}</p>
    <div class="grid2"><label>ชื่อโรงสกัด *<input id="rfName" list="rfList" autofocus></label><label>เบอร์โทร<input id="rfPhone" inputmode="tel"></label></div>
    <datalist id="rfList">${known.map(k => `<option value="${esc(k.refinery_name)}">`).join('')}</datalist>
    <div class="grid2"><label>น้ำหนักที่ส่ง (ก.)<input id="rfW" inputmode="decimal" value="${w}"></label><label>ค่าขนส่ง (บาท)<input id="rfT" inputmode="decimal" placeholder="0"></label></div>
    <label>หมายเหตุ<input id="rfN" placeholder="ไม่บังคับ"></label>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ยกเลิก</button><button class="btn gold" id="rfOk">บันทึกการส่ง</button></div>`, { sticky: true });
  $('#rfName').oninput = (e) => { const k = known.find(x => x.refinery_name === e.target.value); if (k && k.refinery_phone && !$('#rfPhone').value) $('#rfPhone').value = k.refinery_phone; };
  $('#rfOk').onclick = async (ev) => { if (!$('#rfName').value.trim()) return toast('ใส่ชื่อโรงสกัด', 'err'); busy(ev.target, true);
    try { const r = await api('send_refinery', { p_token: S.session.token, p_melt_ids: list.map(x => x.id), p_refinery: $('#rfName').value.trim(), p_phone: $('#rfPhone').value.trim(), p_sent_weight: num($('#rfW').value), p_transport: num($('#rfT').value), p_note: $('#rfN').value.trim() || null });
      toast(`ส่งโรงสกัดแล้ว ล็อต ${r.lot_no}`); ingotSel.clear(); closeModal(); sellTab = 'refinery'; go('sell'); }
    catch (e) { busy(ev.target, false); toast(errText(e), 'err'); } };
}

// ---------------------------------------------------------------- แท็บโรงสกัด (ในหน้าขาย)
let refineryCache = [];
async function refineryTabHtml() {
  try { refineryCache = await api('list_refinery', { p_token: S.session.token, p_scope: S._refAll ? 'all' : 'open' }); } catch (e) { toast(errText(e), 'err'); refineryCache = []; }
  const st = { sent: '<span class="pill warn">รอผลวิเคราะห์</span>', reported: '<span class="pill">ได้ผลแล้ว · รอสรุปขาย</span>', settled: '<span class="pill ok">สรุปขายแล้ว</span>', cancelled: '<span class="pill bad">ยกเลิก</span>' };
  return `<div class="row"><p class="muted sm grow">ส่งก้อนไปโรงสกัดได้จากหน้า สต๊อก/หลอม → ก้อนหลอมแล้ว → ติ๊กเลือก → ส่งโรงสกัด</p><button class="btn ghost sm" id="refAll">${S._refAll ? 'ดูเฉพาะที่ยังไม่ปิด' : 'ดูทั้งหมด'}</button></div>
    <div class="card list">${refineryCache.map((r, i) => `<button class="list-row ${r.status === 'cancelled' ? 'void' : ''}" data-lot="${i}"><div><b>${esc(r.lot_no)}</b> <span class="muted sm">${thDateTime(r.created_at)} · ${esc(r.staff_code || '')}</span><br>
      <span class="sm">🏭 ${esc(r.refinery_name)} · ${(r.melts || []).map(m => esc(m.lot_no)).join(', ')} · ส่ง ${gram(r.sent_weight)} ก.${r.doc_count ? ' · 📎' + r.doc_count : ''}</span>
      ${r.report ? `<br><span class="sm">ผล: ทอง <b>${esc(r.report.gold_pct)}%</b> (${gram(r.report.gold_g)} ก.) · เงิน <b>${esc(r.report.silver_pct)}%</b> (${gram(r.report.silver_g)} ก.)${(r.report.others || []).length ? ' · ' + r.report.others.map(o => `${esc(o.name)} ${esc(o.pct)}%`).join(', ') : ''}</span>` : ''}</div>
      <div class="right">${st[r.status] || ''}<br><span class="muted sm">ทุน ${money(r.cost)}</span>${r.sale_no ? `<br><span class="muted sm">${esc(r.sale_no)}</span>` : ''}</div></button>`).join('') || '<p class="muted center-t">ไม่มีล็อตที่ส่งโรงสกัดค้างอยู่</p>'}</div>`;
}
function bindRefineryTab() {
  const ra = $('#refAll'); if (ra) ra.onclick = () => { S._refAll = !S._refAll; renderSell(); };
  $$('[data-lot]').forEach(b => b.onclick = () => lotDetail(refineryCache[+b.dataset.lot]));
}
async function lotDetail(r) {
  let docs = []; try { docs = await api('list_lot_docs', { p_token: S.session.token, p_lot: r.id }); } catch (e) { /* ignore */ }
  const rp = r.report, ourPct = num(r.our_weight) ? num(r.our_fine) / num(r.our_weight) * 100 : 0;
  modal(`<h2>ล็อต ${esc(r.lot_no)} · 🏭 ${esc(r.refinery_name)}</h2>
    <p class="muted">ส่งเมื่อ ${thDateTime(r.created_at)} โดย ${esc(r.staff_code || '')}${r.refinery_phone ? ' · โทร ' + esc(r.refinery_phone) : ''}${r.note ? ' · ' + esc(r.note) : ''}</p>
    <div class="melt-sum"><div><span>ก้อนที่ส่ง</span><b>${(r.melts || []).length} ก้อน</b><small>${(r.melts || []).map(m => esc(m.lot_no)).join(', ')}</small></div>
      <div><span>น้ำหนักส่ง</span><b>${gram(r.sent_weight)} ก.</b><small>เราวัด ${ourPct.toFixed(2)}% · เนื้อ ${gram(r.our_fine)} ก.</small></div>
      <div><span>ทุน</span><b>${money(r.cost)}</b><small>ขนส่ง ${money(r.transport_cost)}</small></div>
      <div><span>สถานะ</span><b>${{ sent: 'รอผล', reported: 'ได้ผลแล้ว', settled: 'ปิดแล้ว', cancelled: 'ยกเลิก' }[r.status]}</b><small>&nbsp;</small></div></div>
    ${rp ? `<h3>ผลวิเคราะห์จากโรงสกัด</h3><table class="tbl sale-tbl"><thead><tr><th>ธาตุ</th><th>%</th><th>น้ำหนัก (ก.)</th></tr></thead><tbody>
      <tr><td>ทอง</td><td><b>${esc(rp.gold_pct)}</b> <span class="muted sm">(เรา ${ourPct.toFixed(2)})</span></td><td>${gram(rp.gold_g)}</td></tr>
      <tr><td>เงิน</td><td>${esc(rp.silver_pct)}</td><td>${gram(rp.silver_g)}</td></tr>
      ${(rp.others || []).map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.pct)}</td><td>${gram(num(rp.weight) * num(o.pct) / 100)}</td></tr>`).join('')}
      </tbody></table><p class="muted sm">น้ำหนักที่โรงสกัดชั่ง ${gram(rp.weight)} ก.${rp.report_date ? ' · รายงานวันที่ ' + esc(dueTh(rp.report_date)) : ''}</p>` : ''}
    <h3>เอกสาร (${docs.length})</h3><div class="docs">${docs.map(d => `<button class="btn ghost sm" data-ldoc="${d.id}">📎 ${esc(d.name || 'เอกสาร')}</button>`).join('')}
      ${r.status !== 'cancelled' ? '<label class="btn ghost sm">+ แนบรูปรายงาน<input type="file" id="lotDoc" accept="image/*" multiple hidden></label>' : ''}</div>
    <div class="row end wrap"><button class="btn ghost" onclick="closeModal()">ปิด</button>
      ${isOwner() && ['sent', 'reported'].includes(r.status) ? '<button class="btn ghost" id="lCancel">ยกเลิกการส่ง</button>' : ''}
      ${['sent', 'reported'].includes(r.status) && canSell() ? `<button class="btn ${rp ? 'ghost' : 'gold'}" id="lReport">${rp ? 'แก้ผลวิเคราะห์' : 'บันทึกผลวิเคราะห์'}</button>` : ''}
      ${r.status === 'reported' && canSell() ? '<button class="btn gold" id="lSettle">สรุปขาย</button>' : ''}</div>`, { wide: true });
  $$('[data-ldoc]').forEach(b => b.onclick = async () => { try { const dc = await api('get_lot_doc', { p_token: S.session.token, p_doc: b.dataset.ldoc }); const w = window.open(); if (w) { w.document.title = dc.name || 'เอกสาร'; w.document.body.style.margin = 0; w.document.body.innerHTML = `<img src="${dc.data}" style="max-width:100%">`; } } catch (e) { toast(errText(e), 'err'); } });
  const ld = $('#lotDoc'); if (ld) ld.onchange = async (e) => { for (const f of Array.from(e.target.files)) { try { await api('add_lot_doc', { p_token: S.session.token, p_lot: r.id, p_name: f.name.replace(/\.[^.]+$/, ''), p_data: await compressImage(f, 1600, 0.75) }); } catch (err) { toast(errText(err), 'err'); } } toast('แนบเอกสารแล้ว'); lotDetail(r); };
  const lc = $('#lCancel'); if (lc) lc.onclick = async () => { const reason = prompt('เหตุผลที่ยกเลิกการส่ง ' + r.lot_no + ' (ก้อนจะกลับเข้าสต๊อก)'); if (!reason) return;
    try { await api('cancel_refinery', { p_token: S.session.token, p_lot: r.id, p_reason: reason }); toast('ยกเลิกการส่งแล้ว ก้อนกลับเข้าสต๊อก'); closeModal(); renderSell(); } catch (e) { toast(errText(e), 'err'); } };
  const lr = $('#lReport'); if (lr) lr.onclick = () => reportModal(r);
  const ls = $('#lSettle'); if (ls) ls.onclick = () => settleModal(r);
}
function reportModal(r) {
  const rp = r.report || {}; const others = (rp.others || []).slice(); if (!others.length) others.push({ name: '', pct: '' });
  const drawOthers = () => others.map((o, i) => `<div class="grid2 other-row"><label>ธาตุอื่น<input data-on="${i}" value="${esc(o.name)}" placeholder="เช่น ทองแดง"></label><label>%<input data-op="${i}" inputmode="decimal" value="${esc(o.pct)}"></label></div>`).join('');
  modal(`<h2>ผลวิเคราะห์ ล็อต ${esc(r.lot_no)}</h2>
    <label>น้ำหนักที่โรงสกัดชั่ง (ก.)<input id="rpW" inputmode="decimal" value="${esc(rp.weight || r.sent_weight)}"></label>
    <div class="grid2"><label>ทอง (%) *<input id="rpG" inputmode="decimal" value="${esc(rp.gold_pct || '')}" autofocus></label><label>เงิน (%)<input id="rpS" inputmode="decimal" value="${esc(rp.silver_pct || '')}"></label></div>
    <div id="others">${drawOthers()}</div><button class="btn ghost sm" id="addOther">+ เพิ่มธาตุอื่น</button>
    <label>วันที่ในรายงาน<input id="rpD" type="date" value="${esc(rp.report_date || bkkDate())}"></label>
    <div id="rpCalc" class="melt-calc"></div>
    <p class="muted sm">แนบรูปรายงานได้ที่หน้ารายละเอียดล็อต</p>
    <div class="row end"><button class="btn ghost" id="rpBack">กลับ</button><button class="btn gold" id="rpOk">บันทึกผล</button></div>`, { sticky: true });
  const collect = () => { $$('[data-on]').forEach(i => { others[+i.dataset.on].name = i.value; }); $$('[data-op]').forEach(i => { others[+i.dataset.op].pct = i.value; }); };
  const calc = () => { const w = num($('#rpW').value), g = num($('#rpG').value), sv = num($('#rpS').value); collect(); const ot = others.reduce((t, o) => t + num(o.pct), 0);
    const ourPct = num(r.our_weight) ? num(r.our_fine) / num(r.our_weight) * 100 : 0;
    $('#rpCalc').innerHTML = g ? `<div class="mc-row"><span>เนื้อทอง</span><b>${gram(w * g / 100)} ก.</b></div><div class="mc-row"><span>เทียบที่เราวัด (${ourPct.toFixed(2)}%)</span><b class="${g >= ourPct ? 'okc' : 'bad'}">${(g - ourPct >= 0 ? '+' : '') + (g - ourPct).toFixed(2)}% · ${gram(w * g / 100 - num(r.our_fine))} ก.</b></div><div class="mc-row"><span>เนื้อเงิน</span><b>${gram(w * sv / 100)} ก.</b></div><div class="mc-row"><span>รวม %</span><b class="${g + sv + ot > 100.001 ? 'bad' : ''}">${(g + sv + ot).toFixed(2)}%</b></div>` : ''; };
  const bindO = () => { $$('[data-on],[data-op]').forEach(i => { i.oninput = calc; }); };
  $('#addOther').onclick = () => { collect(); others.push({ name: '', pct: '' }); $('#others').innerHTML = drawOthers(); bindO(); };
  ['#rpW', '#rpG', '#rpS'].forEach(id => { $(id).oninput = calc; }); bindO(); calc();
  $('#rpBack').onclick = () => lotDetail(r);
  $('#rpOk').onclick = async (ev) => { collect(); busy(ev.target, true);
    try { await api('save_refinery_report', { p_token: S.session.token, p_lot: r.id, p_report: { weight: num($('#rpW').value), gold_pct: num($('#rpG').value), silver_pct: num($('#rpS').value), others: others.filter(o => o.name.trim() && num(o.pct)).map(o => ({ name: o.name.trim(), pct: num(o.pct) })), report_date: $('#rpD').value } });
      toast('บันทึกผลวิเคราะห์แล้ว'); closeModal(); renderSell(); }
    catch (e) { busy(ev.target, false); toast(errText(e), 'err'); } };
}
function settleModal(r) {
  const rp = r.report, goldG = num(rp.gold_g), silverG = num(rp.silver_g);
  const goldPriceDefault = (() => { const t = tiersFor('gold').find(x => x.pct === 96.5); return t ? Math.round(t.price / 0.965) : ''; })();
  modal(`<h2>สรุปขาย ล็อต ${esc(r.lot_no)}</h2>
    <p class="muted sm">🏭 ${esc(r.refinery_name)} · ทอง ${gram(goldG)} ก. (${esc(rp.gold_pct)}%) · เงิน ${gram(silverG)} ก. (${esc(rp.silver_pct)}%)</p>
    <div class="card"><h3>ทอง</h3><div class="grid2"><label>ราคาต่อกรัมเนื้อทอง (บาท)<input id="stGP" inputmode="decimal" value="${esc(goldPriceDefault)}"></label><label>ยอดขายทอง (บาท) *<input id="stGA" inputmode="decimal"></label></div></div>
    ${silverG > 0 ? `<div class="card"><h3>แร่เงิน ${gram(silverG)} ก.</h3>
      <div class="seg"><button data-sact="sell">ขายพร้อมทอง</button><button data-sact="return" class="on">รับแร่เงินคืน (เก็บไว้ขายทีหลัง)</button></div>
      <div id="sSell" style="display:none" class="grid2"><label>ราคาต่อกรัม (บาท)<input id="stSP" inputmode="decimal"></label><label>ยอดขายเงิน (บาท)<input id="stSA" inputmode="decimal"></label></div>
      <div id="sRet" class="grid2"><label>น้ำหนักแร่เงินที่รับคืน (ก.)<input id="stRG" inputmode="decimal" value="${silverG}"></label><label>ทุนที่แบ่งให้แร่เงิน (บาท)<input id="stRC" inputmode="decimal" value="0"></label></div>
      <p class="muted sm" id="sRetNote">แร่เงินที่รับคืนจะเข้าสต๊อกเป็นก้อน ${esc(r.lot_no)}-AG ขายได้ภายหลังที่หน้าขาย · ทุนที่แบ่งให้จะถูกหักออกจากทุนของทองในล็อตนี้</p></div>` : ''}
    <div class="card"><h3>ค่าใช้จ่ายที่โรงสกัดหัก</h3><div class="grid2"><label>ค่าสกัด (บาท)<input id="stFee" inputmode="decimal" placeholder="0"></label><label>ค่าใช้จ่ายอื่น (บาท)<input id="stOth" inputmode="decimal" placeholder="0"></label></div>
      <p class="muted sm" id="feeHint"></p></div>
    <div class="seg"><button data-spaid="1">ได้รับเงินแล้ว</button><button data-spaid="0" class="on">รอรับเงิน</button></div>
    <div class="grid2"><label>ช่องทาง<select id="stM"><option value="transfer">โอน</option><option value="cash">เงินสด</option><option value="cheque">เช็ค</option></select></label><label id="stDueL">กำหนดรับเงิน<input id="stDue" type="date" min="${bkkDate()}"></label></div>
    <div class="sell-total" id="stTot"></div>
    <div class="row end"><button class="btn ghost" id="stBack">กลับ</button><button class="btn gold" id="stOk">บันทึกสรุปขาย</button></div>`, { sticky: true, wide: true });
  let sact = 'return', paid = false, gaEdited = false, saEdited = false;
  const tot = () => {
    const gp = num($('#stGP').value); if (!gaEdited && gp) $('#stGA').value = Math.floor(goldG * gp);
    const sp = $('#stSP') ? num($('#stSP').value) : 0; if ($('#stSA') && !saEdited && sp) $('#stSA').value = Math.floor(silverG * sp);
    const ga = num($('#stGA').value), sa = sact === 'sell' && $('#stSA') ? num($('#stSA').value) : 0, scost = sact === 'return' && $('#stRC') ? Math.min(num($('#stRC').value), num(r.cost)) : 0;
    const fees = num($('#stFee').value) + num($('#stOth').value) + num(r.transport_cost), cost = num(r.cost) - scost, profit = ga + sa - cost - fees;
    $('#feeHint').textContent = num($('#stFee').value) ? `= ${money(num($('#stFee').value) / (num(rp.weight) || 1), 2)} บาท/กรัม (ตามน้ำหนัก ${gram(rp.weight)} ก.)` : '';
    $('#stTot').innerHTML = `<div><span>ขายทอง${sa ? '+เงิน' : ''}</span><b>${money(ga + sa)}</b></div><div><span>ทุน${scost ? ' (หักส่วนแร่เงิน)' : ''}</span><b>${money(cost)}</b></div><div><span>ค่าสกัด+ขนส่ง+อื่นๆ</span><b>${money(fees)}</b></div><div><span>กำไรสุทธิ</span><b class="${profit >= 0 ? 'okc' : 'bad'}">${money(profit)}</b></div>`;
  };
  $('#stGA').oninput = () => { gaEdited = true; tot(); };
  ['#stGP', '#stFee', '#stOth'].forEach(id => { $(id).oninput = tot; });
  ['#stSP', '#stRC', '#stRG'].forEach(id => { const el = $(id); if (el) el.oninput = tot; });
  const sa = $('#stSA'); if (sa) sa.oninput = () => { saEdited = true; tot(); };
  $$('[data-sact]').forEach(b => b.onclick = () => { sact = b.dataset.sact; $$('[data-sact]').forEach(x => x.classList.toggle('on', x === b)); $('#sSell').style.display = sact === 'sell' ? '' : 'none'; $('#sRet').style.display = sact === 'return' ? '' : 'none'; $('#sRetNote').style.display = sact === 'return' ? '' : 'none'; tot(); });
  $$('[data-spaid]').forEach(b => b.onclick = () => { paid = b.dataset.spaid === '1'; $$('[data-spaid]').forEach(x => x.classList.toggle('on', x === b)); $('#stDueL').style.display = paid ? 'none' : ''; });
  tot();
  $('#stBack').onclick = () => lotDetail(r);
  $('#stOk').onclick = async (ev) => {
    if (!num($('#stGA').value)) return toast('ใส่ยอดขายทอง', 'err');
    if (sact === 'sell' && silverG > 0 && !num($('#stSA').value) && !confirm('ยังไม่ได้ใส่ยอดขายแร่เงิน บันทึกต่อไหม?')) return;
    busy(ev.target, true);
    try {
      const res = await api('settle_refinery', { p_token: S.session.token, p_lot: r.id, p_s: { gold_price_g: num($('#stGP').value) || null, gold_amount: num($('#stGA').value), silver_action: silverG > 0 ? sact : 'none',
        silver_price_g: $('#stSP') ? num($('#stSP').value) || null : null, silver_amount: $('#stSA') ? num($('#stSA').value) : 0, silver_return_g: $('#stRG') ? num($('#stRG').value) : null, silver_cost: $('#stRC') ? num($('#stRC').value) : 0,
        refine_fee: num($('#stFee').value), other_cost: num($('#stOth').value), paid, pay_method: $('#stM').value, due_date: paid ? null : ($('#stDue').value || null) } });
      toast(`สรุปขายแล้ว ${res.sale_no}${res.returned_lot ? ' · แร่เงินเข้าสต๊อก ' + res.returned_lot : ''}`); closeModal(); sellTab = paid ? 'history' : 'pending'; renderSell();
    } catch (e) { busy(ev.target, false); toast(errText(e), 'err'); }
  };
}

// ---------------------------------------------------------------- หน้าสรุปวันนี้ (เงินเข้า/ออก/รอรับเงิน + หมายเหตุ)
let sumFilter = 'all', waitFilter = 'all', sumCache = null;
const saleExpected = (x) => num(x.total_amount) - (x.buyer_type === 'refinery' ? num(x.other_cost) : 0);
const saleReceived = (x) => x.received_amount != null ? num(x.received_amount) : saleExpected(x);
const PAY_TH = { cash: 'เงินสด', transfer: 'โอน', cheque: 'เช็ค' };
const dayDiff = (d) => Math.round((new Date(bkkDate() + 'T00:00:00') - new Date(d + 'T00:00:00')) / 864e5);
const shortTh = (d) => new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
async function renderBills() {
  if (DEMO || !S.online || !S.session.token) return renderBillsLegacy();
  if (S.sumMode === 'month') return renderMonth();
  shell('สรุปวันนี้', '<div class="center"><span class="spin big"></span></div>');
  let d, bills;
  try { [d, bills] = await Promise.all([api('day_summary', { p_token: S.session.token, p_date: S.billsDate }), api('list_bills', { p_token: S.session.token, p_from: S.billsDate, p_to: S.billsDate })]); }
  catch (e) { if (e.message === 'SESSION_INVALID') sessionExpired(); return renderBillsLegacy(); }
  if (S.screen !== 'bills') return;
  const local = (await idb.all('bills').catch(() => [])).filter(b => !b.synced && bkkDate(b.created_at) === S.billsDate);
  sumCache = { d, bills };
  const M = metals(), V = d.view || { sales: true, profit: true, pending: true };
  // ---- เงินออก
  const okBills = d.bills.filter(b => b.status !== 'void');
  const buyTotal = okBills.reduce((t, b) => t + num(b.total), 0), buyCash = okBills.reduce((t, b) => t + num(b.pay_cash), 0), buyTr = okBills.reduce((t, b) => t + num(b.pay_transfer), 0);
  const buyW = okBills.reduce((t, b) => t + (b.items || []).reduce((s, i) => s + num(i.weight), 0), 0);
  const meltCost = d.melts.filter(m => m.status !== 'cancelled').reduce((t, m) => t + num(m.melt_cost), 0), meltN = d.melts.filter(m => m.status !== 'cancelled' && num(m.melt_cost)).length;
  const transLots = d.lots.filter(r => r.status !== 'cancelled' && num(r.transport_cost));
  const transCost = transLots.reduce((t, r) => t + num(r.transport_cost), 0);
  const shopExpSales = d.sales.filter(x => x.status !== 'cancelled' && x.buyer_type !== 'refinery' && (num(x.transport_cost) + num(x.other_cost)));
  const shopExp = shopExpSales.reduce((t, x) => t + num(x.transport_cost) + num(x.other_cost), 0);
  const outTotal = buyTotal + meltCost + transCost + shopExp;
  // ---- เงินเข้า
  const inTotal = d.paid.reduce((t, x) => t + saleReceived(x), 0), inN = d.paid.length;
  const cashIn = d.paid.filter(x => x.pay_method === 'cash').reduce((t, x) => t + saleReceived(x), 0);
  // ---- รอรับเงิน
  const pend = d.pending.map(x => ({ ...x, exp: saleExpected(x) }));
  const pendShop = pend.filter(x => x.buyer_type !== 'refinery'), pendRef = pend.filter(x => x.buyer_type === 'refinery');
  const sumP = (a) => a.reduce((t, x) => t + x.exp, 0);
  const overdue = pend.filter(x => x.due_date && x.due_date < bkkDate()).length;
  const openNoAmt = d.open_lots.filter(r => !pend.some(p => p.lot_no === r.lot_no));
  // ---- เงินสดในลิ้นชัก
  const drawer = d.drawer ? num(d.drawer.balance) : num(d.drawer_float) + cashIn - buyCash - meltCost - transCost - shopExp;
  if (S.billsDate === bkkDate() && d.drawer) S.drawerCache = { date: S.billsDate, balance: num(d.drawer.balance), float: num(d.drawer.float), at: Date.now() };
  // ---- หมายเหตุ
  const notesBy = {}; d.notes.forEach(n => { (notesBy[n.ref_id] = notesBy[n.ref_id] || []).push(n); });
  // ---- รายการ (timeline)
  const ev = [];
  d.bills.forEach(b => ev.push({ kind: b.status === 'void' ? 'void' : 'buy', group: 'buy', at: b.created_at, ref: 'bill', id: b.id, title: `รับซื้อ ${b.bill_no}`, staff: b.staff_code + (b.approved_code ? ` · อนุมัติโดย ${b.approved_code}` : ''),
    sub: b.status === 'void' ? `เหตุผล: ${b.void_reason || '-'}` : `${b.customer_name || ''} · ${(b.items || []).map(i => `${M[i.metal] ? M[i.metal].label : i.metal} ${i.pct}% ${gram(i.weight)} ก.${i.destination ? ' · ' + (DEST_LABEL[i.destination] || '') : ''}`).join(', ')}`,
    amt: -num(b.total), amtSub: b.status === 'void' ? '' : (num(b.pay_cash) && num(b.pay_transfer) ? `สด ${money(b.pay_cash)} · โอน ${money(b.pay_transfer)}` : num(b.pay_cash) ? 'เงินสด' : 'โอน'), voided: b.status === 'void' }));
  d.melts.forEach(m => ev.push({ kind: 'melt', group: 'melt', at: m.created_at, ref: 'melt', id: m.id, title: `${m.source === 'merge' ? 'รวมก้อน' : 'หลอม'} ${m.lot_no}`, staff: m.staff_code,
    sub: `${m.source === 'merge' ? 'รวมหลายก้อน' : `${m.item_count} รายการ`} → ${gram(m.out_weight)} ก. @ ${m.measured_pct}% · ${m.within_tolerance ? 'ในเกณฑ์' : 'เกินเกณฑ์'}${m.status === 'cancelled' ? ' · ยกเลิกแล้ว' : ''}`,
    amt: num(m.melt_cost) ? -num(m.melt_cost) : null, amtSub: num(m.melt_cost) ? 'ค่าหลอม' : '', voided: m.status === 'cancelled' }));
  d.lots.forEach(r => ev.push({ kind: 'ref', group: 'ref', at: r.created_at, ref: 'refinery', id: r.id, title: `ส่งโรงสกัด ${r.lot_no}`, staff: r.staff_code,
    sub: `${r.refinery_name} · ${r.melts || ''} · ${gram(r.sent_weight)} ก.`, amt: num(r.transport_cost) ? -num(r.transport_cost) : null, amtSub: num(r.transport_cost) ? 'ค่าขนส่ง' : '', voided: r.status === 'cancelled' }));
  const paidIds = new Set();
  d.sales.forEach(x => {
    const paidNow = x.status === 'paid' && x.paid_at && (new Date(x.paid_at) - new Date(x.created_at)) < 180000;
    if (paidNow) paidIds.add(x.id);
    ev.push({ kind: x.status === 'cancelled' ? 'void' : 'sell', group: 'sell', at: x.created_at, ref: 'sale', id: x.id, title: `ขาย ${x.sale_no}`, staff: x.staff_code,
      sub: `${x.buyer_type === 'refinery' ? '🏭' : '🏪'} ${x.buyer_name} · ${x.lines_label || ''}${x.total_cost != null ? ` · กำไร ${money(num(x.total_amount) - num(x.total_cost) - num(x.transport_cost) - num(x.other_cost))}` : ''}`,
      amt: paidNow ? saleReceived(x) : null, amtTxt: paidNow ? null : (x.status === 'cancelled' ? money(x.total_amount) : `รอรับ ${money(saleExpected(x))}`), amtSub: paidNow ? (PAY_TH[x.pay_method] || '') : (x.due_date ? `กำหนด ${shortTh(x.due_date)}` : ''), voided: x.status === 'cancelled' });
  });
  d.paid.filter(x => !paidIds.has(x.id)).forEach(x => ev.push({ kind: 'pay', group: 'sell', at: x.paid_at, ref: 'sale', id: x.id, title: `รับเงิน ${x.sale_no}`, staff: '',
    sub: `${x.buyer_type === 'refinery' ? '🏭' : '🏪'} ${x.buyer_name} · ${PAY_TH[x.pay_method] || ''}${bkkDate(x.created_at) !== S.billsDate ? ` · ขายเมื่อ ${shortTh(bkkDate(x.created_at))}` : ''}`, amt: saleReceived(x), amtSub: '' }));
  ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const evShown = ev.filter(e => sumFilter === 'all' || e.group === sumFilter || (sumFilter === 'noted' && notesBy[e.id]));
  const ICON = { buy: ['buy', '⬆'], sell: ['sell', '⬇'], pay: ['pay', '💰'], ref: ['ref', '🏭'], melt: ['ref', '🔥'], void: ['void', '✕'] };
  const amtHtml = (e) => e.amt != null ? `<div class="amt ${e.voided ? 'muted' : e.amt < 0 ? 'out-t' : 'in-t'}" ${e.voided ? 'style="text-decoration:line-through"' : ''}>${e.amt < 0 ? '−' : '+'}${money(Math.abs(e.amt))}${e.amtSub ? `<br><span class="muted sm" style="font-weight:400">${esc(e.amtSub)}</span>` : ''}</div>`
    : `<div class="amt muted" ${e.voided ? 'style="text-decoration:line-through"' : ''}>${esc(e.amtTxt || '')}${e.amtSub ? `<br><span class="muted sm" style="font-weight:400">${esc(e.amtSub)}</span>` : ''}</div>`;
  const notesHtml = (id) => (notesBy[id] || []).map(n => `<div class="note"><b>📝 ${esc(n.staff_code)}-${esc(n.nickname || '')} · ${thTime(n.created_at)}</b> — ${esc(n.note)}</div>`).join('');
  const waitList = (waitFilter === 'shop' ? pendShop : waitFilter === 'ref' ? pendRef : pend);
  $('.main').innerHTML = `${isOwner() && S.pendingReq ? `<div class="banner warn">⚠️ มีคำขอยกเลิกบิลรออนุมัติ ${S.pendingReq} รายการ <button class="btn sm" id="goReq">ดู / อนุมัติ</button></div>` : ''}
  <h1 class="screen-title">สรุป ${modeToggle()} <input type="date" id="bdate" value="${S.billsDate}" max="${bkkDate()}"> <span class="muted sm" style="font-weight:400">อัปเดตล่าสุด ${thTime(d.server_time)}</span> <button class="btn ghost sm" id="sumRefresh">รีเฟรช</button></h1>
  ${local.length ? `<div class="banner warn">มีบิลในเครื่องนี้ยังไม่ส่งขึ้นระบบ ${local.length} บิล — ยังไม่รวมในตัวเลขด้านล่าง <button class="btn sm" id="syncBtn">ส่งเลย</button></div>` : ''}
  <div class="flow">
    ${V.sales ? `<div class="kpi in"><span>💰 เงินเข้า${S.billsDate === bkkDate() ? 'วันนี้' : ''}</span><b>+${money(inTotal)}</b><small>ขาย/รับเงิน ${inN} รายการ</small></div>` : ''}
    <div class="kpi out"><span>💸 เงินออก${S.billsDate === bkkDate() ? 'วันนี้' : ''}</span><b>−${money(outTotal)}</b><small>รับซื้อ ${okBills.length} บิล + ค่าใช้จ่าย</small></div>
    ${V.sales ? `<div class="kpi"><span>สุทธิ${S.billsDate === bkkDate() ? 'วันนี้' : ''}</span><b class="${inTotal - outTotal >= 0 ? 'okc' : 'bad'}">${inTotal - outTotal >= 0 ? '+' : '−'}${money(Math.abs(inTotal - outTotal))}</b><small>เงินเข้า − เงินออก</small></div>` : ''}
    ${V.pending ? `<div class="kpi wait"><span>⏳ รอรับเงิน</span><b>${money(sumP(pend))}</b><small>${pend.length} รายการ${overdue ? ` · เลยกำหนด ${overdue}` : ''}</small></div>` : ''}
    <div class="kpi cash"><span>💵 เงินสดในลิ้นชัก (คาด)</span><b class="${drawer < 0 ? 'bad' : ''}">${money(drawer)}</b><small>เงินตั้งต้น ${money(d.drawer ? d.drawer.float : d.drawer_float)} − จ่ายรับซื้อเงินสด ${money(d.drawer ? d.drawer.cash_buy : buyCash)}${V.sales ? ' + ขายได้เงินสด' : ''} − ค่าใช้จ่าย</small></div>
  </div>
  <div class="two">
    <div class="card"><div class="card-h"><h2>💸 เงินออก</h2><span class="muted sm">แยกช่องทาง</span></div>
      <table class="brk">
        <tr><td>รับซื้อทอง/เงิน <span class="sub">· ${okBills.length} บิล · ${gram(buyW)} ก.</span></td><td class="out-t">${money(buyTotal)}</td></tr>
        <tr><td><span class="sub">↳ จ่ายเงินสด</span></td><td><span class="sub">${money(buyCash)}</span></td></tr>
        <tr><td><span class="sub">↳ จ่ายโอน</span></td><td><span class="sub">${money(buyTr)}</span></td></tr>
        ${transCost ? `<tr><td>ค่าขนส่งไปโรงสกัด <span class="sub">· ${transLots.map(r => esc(r.lot_no)).join(', ')}</span></td><td class="out-t">${money(transCost)}</td></tr>` : ''}
        ${meltCost ? `<tr><td>ค่าหลอม <span class="sub">· ${meltN} ก้อน</span></td><td class="out-t">${money(meltCost)}</td></tr>` : ''}
        ${shopExp ? `<tr><td>ค่าใช้จ่ายการขาย <span class="sub">· ${shopExpSales.map(x => esc(x.sale_no)).join(', ')}</span></td><td class="out-t">${money(shopExp)}</td></tr>` : ''}
        <tr class="tot"><td>รวมเงินออก</td><td class="out-t">${money(outTotal)}</td></tr>
      </table></div>
    ${V.sales ? `<div class="card"><div class="card-h"><h2>💰 เงินเข้า</h2><span class="muted sm">เฉพาะที่ได้รับเงินแล้ว</span></div>
      <table class="brk">
        ${d.paid.map(x => `<tr><td>${x.buyer_type === 'refinery' ? '🏭 รับเงินจากโรงสกัด' : '🏪 ขายร้านรับซื้อ'} <span class="sub">· ${esc(x.sale_no)} ${esc(x.buyer_name)}${bkkDate(x.created_at) !== S.billsDate ? ` (ขายเมื่อ ${shortTh(bkkDate(x.created_at))})` : ''}</span></td><td class="in-t">${money(saleReceived(x))}</td></tr>
          <tr><td><span class="sub">↳ ${esc(PAY_TH[x.pay_method] || x.pay_method || '-')}</span></td><td><span class="sub">${money(saleReceived(x))}</span></td></tr>`).join('') || '<tr><td class="muted">ยังไม่มีเงินเข้า</td><td></td></tr>'}
        <tr class="tot"><td>รวมเงินเข้า</td><td class="in-t">${money(inTotal)}</td></tr>
      </table></div>` : ''}
  </div>
  ${V.pending ? `<div class="card"><div class="card-h"><h2>⏳ รอรับเงิน</h2><span class="muted sm">ทุกวัน ไม่ใช่แค่วันนี้</span></div>
    <div class="filter"><button data-wf="all" class="${waitFilter === 'all' ? 'on' : ''}">ทั้งหมด ${money(sumP(pend))}</button><button data-wf="shop" class="${waitFilter === 'shop' ? 'on' : ''}">🏪 ร้านรับซื้อ ${money(sumP(pendShop))}</button><button data-wf="ref" class="${waitFilter === 'ref' ? 'on' : ''}">🏭 โรงสกัด ${money(sumP(pendRef))}</button></div>
    ${waitList.map(x => { const od = x.due_date && x.due_date < bkkDate(); return `<div class="wait-row" data-wsale="${x.id}"><div><b>${x.buyer_type === 'refinery' ? '🏭' : '🏪'} ${esc(x.sale_no)}</b> ${esc(x.buyer_name)}${x.lot_no ? ` <span class="tag">ล็อต ${esc(x.lot_no)}</span>` : ''}<br><span class="sm muted">ขาย${bkkDate(x.created_at) === bkkDate() ? 'วันนี้' : 'เมื่อ ' + shortTh(bkkDate(x.created_at))} · ${esc(x.lines_label || '')}</span>${notesHtml(x.id)}</div>
      <div class="right"><b>${money(x.exp)}</b><br>${x.due_date ? `<span class="pill ${od ? 'bad' : 'warn'}">${od ? `เลยกำหนด ${dayDiff(x.due_date)} วัน (${shortTh(x.due_date)})` : `กำหนด ${shortTh(x.due_date)}`}</span>` : '<span class="pill">ไม่ได้ระบุวัน</span>'}</div></div>`; }).join('')}
    ${waitFilter !== 'shop' ? openNoAmt.map(r => `<div class="wait-row" style="opacity:.75"><div><b>🏭 ${esc(r.lot_no)}</b> ${esc(r.refinery_name)} <span class="tag">ยังไม่มียอด</span><br><span class="sm muted">ส่ง${bkkDate(r.created_at) === bkkDate() ? 'วันนี้' : 'เมื่อ ' + shortTh(bkkDate(r.created_at))} · ${gram(r.sent_weight)} ก. · ${r.status === 'sent' ? 'รอผลวิเคราะห์' : 'ได้ผลแล้ว รอสรุปขาย'}</span></div><div class="right"><b>—</b><br><span class="pill">${r.status === 'sent' ? 'รอผล' : 'รอสรุปขาย'}</span></div></div>`).join('') : ''}
    ${!waitList.length && !(waitFilter !== 'shop' && openNoAmt.length) ? '<p class="muted center-t">ไม่มีรายการรอรับเงิน</p>' : ''}
  </div>` : ''}
  <div class="card"><div class="card-h"><h2>รายการ${S.billsDate === bkkDate() ? 'วันนี้' : ''}</h2><span class="muted sm">${ev.length} รายการ</span></div>
    <div class="filter">${[['all', 'ทั้งหมด'], ['buy', 'รับซื้อ'], ...(V.sales ? [['sell', 'ขาย/รับเงิน']] : []), ['ref', 'โรงสกัด'], ['melt', 'หลอม'], ['noted', 'มีหมายเหตุ']].map(f => `<button data-sf="${f[0]}" class="${sumFilter === f[0] ? 'on' : ''}">${f[1]}</button>`).join('')}</div>
    ${local.map(r => `<div class="tl"><div class="ic buy">⬆</div><div class="body"><b>รับซื้อ ${esc(r.bill_no)}</b> <span class="pill warn">รอส่ง</span> <span class="muted sm">${thTime(r.created_at)} · ${esc(r.payload.staff_code || '')}</span><br><span class="sm">${esc((r.payload.customer || {}).name || '')}</span></div><div class="amt out-t">−${money(r.payload.total)}</div></div>`).join('')}
    ${evShown.map(e => `<div class="tl"><div class="ic ${ICON[e.kind][0]}">${ICON[e.kind][1]}</div><div class="body"><button class="linkish" data-open="${e.ref}:${e.id}"><b ${e.voided ? 'style="text-decoration:line-through"' : ''}>${esc(e.title)}</b></button>${e.voided ? ' <span class="pill bad">ยกเลิก</span>' : ''} <span class="muted sm">${thTime(e.at)}${e.staff ? ' · ' + esc(e.staff) : ''}</span><br><span class="sm">${esc(e.sub)}</span>
      ${notesHtml(e.id)}<button class="addnote" data-note="${e.ref}:${e.id}" data-ntitle="${esc(e.title)}">+ เพิ่มหมายเหตุ</button></div>${amtHtml(e)}</div>`).join('') || (local.length ? '' : '<p class="muted center-t">ไม่มีรายการ</p>')}
  </div>`;
  $('#bdate').onchange = (e) => { S.billsDate = e.target.value || bkkDate(); renderBills(); };
  $('#sumRefresh').onclick = () => renderBills();
  bindModeToggle();
  const gr = $('#goReq'); if (gr) gr.onclick = () => go('requests');
  const sb = $('#syncBtn'); if (sb) sb.onclick = () => { if (!S.session.token) reLoginModal(); else syncNow(); };
  $$('[data-wf]').forEach(b => b.onclick = () => { waitFilter = b.dataset.wf; renderBills(); });
  $$('[data-sf]').forEach(b => b.onclick = () => { sumFilter = b.dataset.sf; renderBills(); });
  $$('[data-wsale]').forEach(r => r.onclick = () => saleDetail(r.dataset.wsale));
  $$('[data-note]').forEach(b => b.onclick = () => { const [t, id] = b.dataset.note.split(':'); noteModal(t, id, b.dataset.ntitle); });
  $$('[data-open]').forEach(b => b.onclick = () => openRef(b.dataset.open));
}
async function openRef(key) {
  const [t, id] = key.split(':');
  if (t === 'bill') { const b = (sumCache.bills || []).find(x => x.id === id); if (b) billDetail({ ...b, synced: true }); }
  else if (t === 'sale') saleDetail(id);
  else if (t === 'melt') meltDetail(id);
  else if (t === 'refinery') { try { const all = await api('list_refinery', { p_token: S.session.token, p_scope: 'all' }); const r = all.find(x => x.id === id); if (r) lotDetail(r); } catch (e) { toast(errText(e), 'err'); } }
}
function noteModal(refType, refId, title) {
  if (!S.online || !S.session.token) return toast('ต้องออนไลน์เพื่อเพิ่มหมายเหตุ', 'err');
  const people = S.staffList.length ? S.staffList : [me()];
  modal(`<h2>เพิ่มหมายเหตุ</h2>
    <p class="muted">${esc(title)}</p>
    <label>หมายเหตุ *<textarea id="nTxt" rows="3" maxlength="500" autofocus></textarea></label>
    <label>รหัสคนเขียน *<select id="nCode">${people.map(p => `<option value="${esc(p.code)}" ${p.code === me().code ? 'selected' : ''}>${esc(p.code)}-${esc(p.nickname)}</option>`).join('')}</select></label>
    <label>PIN *<input id="nPin" type="password" inputmode="numeric" maxlength="6" class="pin-input" autocomplete="off"></label>
    <p class="muted sm">หมายเหตุจะแสดงชื่อคนเขียนและเวลา แก้ไข/ลบไม่ได้ (เพิ่มหมายเหตุใหม่ได้) และบันทึกในหน้าประวัติ</p>
    <div class="row end"><button class="btn ghost" onclick="closeModal()">ยกเลิก</button><button class="btn gold" id="nOk">บันทึกหมายเหตุ</button></div>`, { sticky: true });
  $('#nPin').onkeydown = (e) => { if (e.key === 'Enter') $('#nOk').click(); };
  $('#nOk').onclick = async (ev) => {
    const txt = $('#nTxt').value.trim(); if (!txt) return toast('พิมพ์หมายเหตุ', 'err');
    if (!$('#nPin').value) return toast('ใส่ PIN', 'err');
    busy(ev.target, true);
    try { await api('add_note', { p_token: S.session.token, p_ref_type: refType, p_ref_id: refId, p_note: txt, p_code: $('#nCode').value, p_pin: $('#nPin').value }); toast('บันทึกหมายเหตุแล้ว'); closeModal(); renderBills(); }
    catch (e) { busy(ev.target, false); toast(errText(e), 'err'); $('#nPin').value = ''; }
  };
}

// ---------------------------------------------------------------- สรุปรายเดือน
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const monLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${TH_MON[m - 1]} ${y + 543}`; };
const shiftMon = (ym, k) => { let [y, m] = ym.split('-').map(Number); m += k; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
function modeToggle() { return `<span class="mode"><button data-mode="day" class="${S.sumMode !== 'month' ? 'on' : ''}">รายวัน</button><button data-mode="month" class="${S.sumMode === 'month' ? 'on' : ''}">รายเดือน</button></span>`; }
function bindModeToggle() { $$('[data-mode]').forEach(b => b.onclick = () => { S.sumMode = b.dataset.mode; renderBills(); }); }
let monthCache = null;
async function renderMonth() {
  S.sumMonth = S.sumMonth || bkkDate().slice(0, 7);
  shell('สรุป', '<div class="center"><span class="spin big"></span></div>');
  let d;
  try { d = await api('month_summary', { p_token: S.session.token, p_month: S.sumMonth + '-01' }); }
  catch (e) { toast(errText(e), 'err'); S.sumMode = 'day'; return renderBills(); }
  if (S.screen !== 'bills') return;
  monthCache = d;
  const M = metals(), today = bkkDate(), mon = S.sumMonth, V = d.view || { sales: true, profit: true, pending: true }, all = V.sales && V.profit && V.pending;
  const days = d.days.map(x => ({ ...x, out: num(x.buy) + num(x.expense), inc: num(x.income), closed: !num(x.bills) && !num(x.income) && !num(x.expense) }));
  const totOut = days.reduce((t, x) => t + x.out, 0), totIn = days.reduce((t, x) => t + x.inc, 0), totExp = days.reduce((t, x) => t + num(x.expense), 0);
  const bills = days.reduce((t, x) => t + num(x.bills), 0), incN = d.sales.reduce((t, s) => t + num(s.n), 0);
  const profit = num(d.cur.profit), saleAmt = d.sales.reduce((t, s) => t + num(s.amount), 0);
  const pend = d.pending || {}, pendTot = num(pend.shop) + num(pend.refinery);
  // กราฟ
  const W = 1180, H = 220, pad = 34, n = days.length, bw = (W - pad * 2) / n, maxv = Math.max(1, ...days.map(x => Math.max(x.out, x.inc)));
  const grid = [1, 2, 3, 4].map(k => { const y = H - 30 - (H - 50) * k / 4; return `<line x1="${pad}" x2="${W - pad}" y1="${y}" y2="${y}" stroke="#EFEBE3"/><text x="${pad - 4}" y="${y + 3}" font-size="10" text-anchor="end" fill="#8C8578">${Math.round(maxv * k / 4 / 1000)}k</text>`; }).join('');
  const bars = days.map((x, i) => { const bx = pad + i * bw, dn = +x.date.slice(8), future = x.date > today;
    let g = `<g class="bar" data-day="${x.date}"><rect x="${bx}" y="10" width="${bw}" height="${H - 20}" fill="transparent"/>`;
    if (x.closed && !future) g += `<text x="${bx + bw / 2}" y="${H - 34}" font-size="9" text-anchor="middle" fill="#B8AE98">ปิด</text>`;
    const ho = x.out / maxv * (H - 50), hi = x.inc / maxv * (H - 50);
    if (ho) g += `<rect x="${bx + 2}" y="${H - 30 - ho}" width="${Math.max(1, bw / 2 - 3)}" height="${ho}" rx="2" fill="#E08A80"><title>${dn} ${monLabel(mon)} · เงินออก ${money(x.out)}</title></rect>`;
    if (hi) g += `<rect x="${bx + bw / 2}" y="${H - 30 - hi}" width="${Math.max(1, bw / 2 - 3)}" height="${hi}" rx="2" fill="#4FA373"><title>${dn} ${monLabel(mon)} · เงินเข้า ${money(x.inc)}</title></rect>`;
    if (dn % 5 === 1 || i === n - 1) g += `<text x="${bx + bw / 2}" y="${H - 14}" font-size="11" text-anchor="middle" fill="#6B6458">${dn}</text>`;
    return g + '</g>'; }).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="กราฟเงินเข้าเงินออกรายวัน">${grid}${bars}</svg>`;
  // แยก %
  const pctRows = d.pct.filter(p => num(p.weight)), pmax = Math.max(1, ...pctRows.map(p => num(p.weight)));
  const wByMetal = {}; pctRows.forEach(p => { wByMetal[p.metal] = (wByMetal[p.metal] || 0) + num(p.weight); });
  const shop = d.sales.find(s => s.buyer_type !== 'refinery') || {}, refi = d.sales.find(s => s.buyer_type === 'refinery') || {};
  const cmp = (cur, prev) => { cur = num(cur); prev = num(prev); if (!prev) return cur ? '<span class="muted">ใหม่</span>' : '<span class="muted">–</span>'; const p = (cur - prev) / Math.abs(prev) * 100; return `<span class="${p >= 0 ? 'okc' : 'bad'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%</span>`; };
  const prevLabel = monLabel(shiftMon(mon, -1));
  $('.main').innerHTML = `<h1 class="screen-title">สรุป ${modeToggle()}
    <span class="mon"><button class="btn ghost sm" id="mPrev" aria-label="เดือนก่อน">‹</button><b>${monLabel(mon)}</b><button class="btn ghost sm" id="mNext" aria-label="เดือนถัดไป" ${mon >= today.slice(0, 7) ? 'disabled' : ''}>›</button></span>
    ${isOwner() || all ? '<button class="btn ghost sm" id="mXls">⬇ ดาวน์โหลด Excel</button>' : ''}</h1>
  <div class="flow">
    ${V.sales ? `<div class="kpi in"><span>💰 เงินเข้าทั้งเดือน</span><b>+${money(totIn)}</b><small>ขาย/รับเงิน ${incN} รายการ</small></div>` : ''}
    <div class="kpi out"><span>💸 เงินออกทั้งเดือน</span><b>−${money(totOut)}</b><small>รับซื้อ ${bills} บิล + ค่าใช้จ่าย ${money(totExp)}</small></div>
    ${V.sales ? `<div class="kpi"><span>สุทธิ (กระแสเงินสด)</span><b class="${totIn - totOut >= 0 ? 'okc' : 'bad'}">${totIn - totOut >= 0 ? '+' : '−'}${money(Math.abs(totIn - totOut))}</b><small>${totIn - totOut < 0 ? 'ส่วนใหญ่ไปอยู่ในสต๊อก' : 'เงินเข้ามากกว่าออก'}</small></div>` : ''}
    ${V.profit ? `<div class="kpi"><span>📈 กำไรจากการขาย</span><b class="${profit >= 0 ? 'okc' : 'bad'}">${profit >= 0 ? '+' : '−'}${money(Math.abs(profit))}</b><small>ยอดขาย − ทุน − ค่าใช้จ่าย${saleAmt ? ` · ${(profit / saleAmt * 100).toFixed(1)}%` : ''}</small></div>
    <div class="kpi cash"><span>สต๊อกคงเหลือ (ราคาทุน)</span><b>${money(d.stock.cost)}</b><small>ณ ตอนนี้ · ทอง ${gram(d.stock.gold_g)} ก. · เงิน ${gram(d.stock.silver_g)} ก.</small></div>` : `<div class="kpi cash"><span>สต๊อกคงเหลือ</span><b>${gram(d.stock.gold_g)} ก.</b><small>ทอง · เงิน ${gram(d.stock.silver_g)} ก.</small></div>`}
  </div>
  <div class="card"><div class="card-h"><h2>${V.sales ? 'เงินเข้า / เงินออก' : 'เงินออก'} รายวัน</h2><div class="legend"><span><i style="background:#E08A80"></i>เงินออก</span>${V.sales ? '<span><i style="background:#4FA373"></i>เงินเข้า</span>' : ''}</div></div>
    ${svg}<p class="muted sm">กดแท่งของวันไหน เพื่อเปิดสรุปของวันนั้น</p></div>
  <div class="two">
    <div class="card"><div class="card-h"><h2>รายวัน</h2><span class="muted sm">กดแถวเพื่อดูวันนั้น</span></div>
      <div class="scroll"><table class="mtbl"><thead><tr><th>วัน</th><th>บิล</th><th>รับซื้อ</th>${V.sales ? '<th>ขาย/รับเงิน</th><th>สุทธิ</th>' : ''}<th></th></tr></thead><tbody>
      ${days.filter(x => x.date <= today).map(x => { const dn = +x.date.slice(8), net = x.inc - x.out;
        return x.closed ? `<tr class="closed" data-day="${x.date}"><td>${dn} ${TH_MON[+mon.slice(5) - 1]}</td><td colspan="${V.sales ? 4 : 2}">ไม่มีรายการ</td><td>›</td></tr>`
          : `<tr data-day="${x.date}"><td>${dn} ${TH_MON[+mon.slice(5) - 1]}</td><td>${x.bills}</td><td class="out-t">${money(x.out)}</td>${V.sales ? `<td class="in-t">${x.inc ? money(x.inc) : '–'}</td><td class="${net >= 0 ? 'in-t' : 'out-t'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</td>` : ''}<td>›</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td>รวม</td><td>${bills}</td><td class="out-t">${money(totOut)}</td>${V.sales ? `<td class="in-t">${money(totIn)}</td><td class="${totIn - totOut >= 0 ? 'in-t' : 'out-t'}">${totIn - totOut >= 0 ? '+' : '−'}${money(Math.abs(totIn - totOut))}</td>` : ''}<td></td></tr></tfoot></table></div></div>
    <div>
      <div class="card"><div class="card-h"><h2>รับซื้อแยกตาม %</h2><span class="muted sm">${Object.entries(wByMetal).map(([k, w]) => `${esc(M[k] ? M[k].label : k)} ${gram(w)} ก.`).join(' · ') || '-'}</span></div>
        <div class="pct-bars">${pctRows.map(p => `<div class="pb"><span>${esc(M[p.metal] ? M[p.metal].label : p.metal)} ${num(p.pct)}%</span><div><i style="width:${(num(p.weight) / pmax * 100).toFixed(1)}%;${p.metal === 'silver' ? 'background:#9AA5B1' : ''}"></i></div><b>${gram(p.weight)} ก.</b></div>`).join('') || '<p class="muted">ยังไม่มีการรับซื้อ</p>'}</div></div>
      ${V.sales ? `<div class="card"><div class="card-h"><h2>การขายในเดือน</h2><span class="muted sm">${incN} รายการ</span></div>
        <table class="brk">
          <tr><td>🏪 ร้านรับซื้อ <span class="sub">· ${num(shop.n)} รายการ · ${gram(shop.weight)} ก.</span></td><td class="in-t">${money(shop.amount)}</td></tr>
          ${V.profit ? `<tr><td><span class="sub">↳ กำไร</span></td><td><span class="sub ${num(shop.profit) >= 0 ? 'okc' : 'bad'}">${num(shop.profit) >= 0 ? '+' : '−'}${money(Math.abs(num(shop.profit)))}</span></td></tr>` : ''}
          <tr><td>🏭 โรงสกัด <span class="sub">· ${num(refi.n)} ล็อต · ${gram(refi.weight)} ก.</span></td><td class="in-t">${money(refi.amount)}</td></tr>
          ${V.profit ? `<tr><td><span class="sub">↳ กำไร${num(refi.fees) ? ` (หักค่าสกัด ${money(refi.fees)})` : ''}</span></td><td><span class="sub ${num(refi.profit) >= 0 ? 'okc' : 'bad'}">${num(refi.profit) >= 0 ? '+' : '−'}${money(Math.abs(num(refi.profit)))}</span></td></tr>` : ''}
          ${num(d.extra.silver_returned_g) ? `<tr><td><span class="sub">↳ แร่เงินรับคืนเข้าสต๊อก</span></td><td><span class="sub">${gram(d.extra.silver_returned_g)} ก.</span></td></tr>` : ''}
          ${V.profit ? `<tr class="tot"><td>รวมกำไรจากการขาย</td><td class="${profit >= 0 ? 'okc' : 'bad'}">${profit >= 0 ? '+' : '−'}${money(Math.abs(profit))}</td></tr>` : `<tr class="tot"><td>รวมยอดขาย</td><td class="in-t">${money(saleAmt)}</td></tr>`}
        </table></div>` : ''}
    </div>
  </div>
  <div class="three">
    ${V.pending ? `<div class="card"><div class="card-h"><h2>⏳ รอรับเงิน ณ สิ้นเดือน</h2></div>
      <table class="brk"><tr><td>🏪 ร้านรับซื้อ <span class="sub">· ${pend.shop_n} รายการ</span></td><td>${money(pend.shop)}</td></tr><tr><td>🏭 โรงสกัด <span class="sub">· ${pend.refinery_n} รายการ</span></td><td>${money(pend.refinery)}</td></tr>
      ${num(pend.overdue) ? `<tr><td><span class="sub bad">↳ เลยกำหนด</span></td><td><span class="sub bad">${money(pend.overdue)}</span></td></tr>` : ''}<tr class="tot"><td>รวม</td><td>${money(pendTot)}</td></tr></table></div>` : ''}
    <div class="card"><div class="card-h"><h2>👤 พนักงาน</h2><span class="muted sm">บิลรับซื้อ</span></div>
      <table class="brk">${d.staff.map(s => `<tr><td>${esc(s.staff_code)}-${esc(s.nickname || '')} <span class="sub">· ${s.bills} บิล · ยกเลิก ${s.voided}</span></td><td>${money(s.total)}</td></tr>`).join('') || '<tr><td class="muted">ยังไม่มีบิล</td><td></td></tr>'}
      <tr class="tot"><td>รวม ${bills} บิล</td><td>${money(d.cur.buy)}</td></tr></table></div>
    <div class="card"><div class="card-h"><h2>📊 เทียบเดือนก่อน</h2><span class="muted sm">${prevLabel}</span></div>
      <table class="brk"><tr><td>ยอดรับซื้อ</td><td>${cmp(d.cur.buy, d.prev.buy)}</td></tr><tr><td>จำนวนบิล</td><td>${cmp(d.cur.bills, d.prev.bills)}</td></tr>${V.profit ? `<tr><td>กำไรจากการขาย</td><td>${cmp(d.cur.profit, d.prev.profit)}</td></tr>` : ''}
      <tr><td>ลูกค้าใหม่</td><td>${d.extra.new_customers} คน</td></tr><tr><td>% สูญเสียตอนหลอม (เฉลี่ย)</td><td>${d.extra.melt_loss_pct != null ? num(d.extra.melt_loss_pct).toFixed(2) + '%' : '–'}</td></tr></table></div>
  </div>`;
  bindModeToggle();
  $('#mPrev').onclick = () => { S.sumMonth = shiftMon(mon, -1); renderMonth(); };
  $('#mNext').onclick = () => { S.sumMonth = shiftMon(mon, 1); renderMonth(); };
  const mx = $('#mXls'); if (mx) mx.onclick = () => exportMonth(d);
  $$('[data-day]').forEach(el => el.onclick = () => { if (el.dataset.day > today) return; S.billsDate = el.dataset.day; S.sumMode = 'day'; renderBills(); });
}
function exportMonth(d) {
  const M = metals(), mon = S.sumMonth, q = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const L = [];
  L.push([`สรุปรายเดือน ${monLabel(mon)}`, (S.settings.shop || {}).name || '', (S.settings.shop || {}).branch || ''].map(q).join(','));
  L.push(''); L.push('วันที่,จำนวนบิล,รับซื้อ (บาท),รับซื้อเงินสด,ค่าใช้จ่าย,เงินออกรวม,เงินเข้า,สุทธิ');
  let tb = 0, tbuy = 0, tc = 0, te = 0, ti = 0;
  d.days.forEach(x => { const out = num(x.buy) + num(x.expense); tb += num(x.bills); tbuy += num(x.buy); tc += num(x.buy_cash); te += num(x.expense); ti += num(x.income);
    L.push([dueTh(x.date), x.bills, num(x.buy), num(x.buy_cash), num(x.expense), out, num(x.income), num(x.income) - out].map(q).join(',')); });
  L.push(['รวม', tb, tbuy, tc, te, tbuy + te, ti, ti - tbuy - te].map(q).join(','));
  L.push(''); L.push('รับซื้อแยกตาม %'); L.push('โลหะ,%,น้ำหนัก (ก.),ยอดเงิน');
  d.pct.forEach(p => L.push([M[p.metal] ? M[p.metal].label : p.metal, num(p.pct), num(p.weight), num(p.amount)].map(q).join(',')));
  L.push(''); L.push('การขาย'); L.push('ประเภท,จำนวน,น้ำหนัก (ก.),ยอดขาย,กำไร,ค่าสกัด');
  d.sales.forEach(s => L.push([s.buyer_type === 'refinery' ? 'โรงสกัด' : 'ร้านรับซื้อ', s.n, num(s.weight), num(s.amount), num(s.profit), num(s.fees)].map(q).join(',')));
  L.push(''); L.push('พนักงาน'); L.push('รหัส,ชื่อ,บิล,ยอดรับซื้อ,ยกเลิก');
  d.staff.forEach(s => L.push([s.staff_code, s.nickname, s.bills, num(s.total), s.voided].map(q).join(',')));
  L.push(''); L.push(['รอรับเงิน ณ สิ้นเดือน', num(d.pending.shop) + num(d.pending.refinery)].map(q).join(','));
  L.push(['สต๊อกคงเหลือ (ราคาทุน ณ วันที่ดาวน์โหลด)', num(d.stock.cost)].map(q).join(','));
  const blob = new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `DD-summary-${+mon.slice(0, 4) + 543}-${mon.slice(5)}.csv`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('ดาวน์โหลดแล้ว เปิดด้วย Excel ได้เลย');
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
    ['customers', 'ลูกค้า (ค้นหา / ประวัติ)', 'ทุกคน'],
    ['pin', 'เปลี่ยน PIN / ชื่อเล่นของฉัน', 'ทุกคน'],
    ...(isOwner() ? [['requests', `คำขอยกเลิกบิล${S.pendingReq ? ' 🔴 ' + S.pendingReq : ''}`, 'เจ้าของ'], ['todayprice', 'ตั้งราคาวันนี้ / เปลี่ยนราคาระหว่างวัน', 'เจ้าของ'], ['settings', 'ตั้งค่าราคา & ร้าน', 'เจ้าของ'], ['staff', 'จัดการพนักงาน', 'เจ้าของ'], ['audit', 'ประวัติการใช้งาน (ตรวจสอบ)', 'เจ้าของ']] : [])
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
  const tabs = [['prices', 'ราคา'], ['shop', 'ข้อมูลร้าน'], ['receipt', 'ใบรับซื้อ'], ['cancel', 'ยกเลิกบิล'], ['melt', 'หลอม'], ['sale', 'ขาย · ลิ้นชัก · สิทธิ์ดู']];
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
  } else if (setTab === 'sale') {
    const sc = saleCfg(), sv = Object.assign({ sales: false, profit: false, pending: false }, (S.settings && S.settings.staff_view) || {});
    body = `<div class="card"><div class="card-h"><h2>สิทธิ์การขาย</h2></div>
      <label class="switch"><input type="checkbox" id="slStaff" ${sc.staff_can_sell ? 'checked' : ''}> <b>อนุญาตให้พนักงานบันทึกการขายและรับเงิน</b></label>
      <p class="muted sm">ปิดไว้ = บันทึกการขายได้เฉพาะเจ้าของ · ยกเลิกการขายได้เฉพาะเจ้าของเสมอ</p>
      <button class="btn gold block" id="saveSl">บันทึก</button></div>
      <div class="card"><div class="card-h"><h2>เงินสดในลิ้นชัก</h2></div>
      <label>เงินตั้งต้นในลิ้นชักทุกวัน (บาท)<input id="drFloat" inputmode="decimal" value="${esc(((S.settings && S.settings.drawer) || {}).float ?? 50000)}"></label>
      <p class="muted sm">เงินสดในลิ้นชักเริ่มวันละเท่านี้ทุกวัน แล้วลดลงทุกครั้งที่จ่ายรับซื้อเป็นเงินสด (ยืนยันด้วย PIN) และค่าหลอม/ค่าขนส่ง/ค่าใช้จ่ายการขาย · เพิ่มขึ้นเมื่อขายได้เงินสด · ตอนยืนยันบิลจะเห็นยอดเงินสดคงเหลือ และเตือนถ้าเงินในลิ้นชักไม่พอ</p>
      <button class="btn gold block" id="saveDr">บันทึก</button></div>
      <div class="card"><div class="card-h"><h2>สิ่งที่พนักงานเห็นในหน้าสรุป</h2></div>
      <label class="switch"><input type="checkbox" id="svSales" ${sv.sales ? 'checked' : ''}> <b>ยอดขาย / เงินเข้า</b></label>
      <label class="switch"><input type="checkbox" id="svProfit" ${sv.profit ? 'checked' : ''}> <b>กำไร และทุนของ</b></label>
      <label class="switch"><input type="checkbox" id="svPending" ${sv.pending ? 'checked' : ''}> <b>ยอดรอรับเงิน (ร้านรับซื้อ / โรงสกัด)</b></label>
      <p class="muted sm">ปิดไว้ = พนักงานไม่เห็นข้อมูลนั้นทั้งในสรุปรายวันและรายเดือน (ระบบไม่ส่งข้อมูลไปที่เครื่องพนักงานเลย) · พนักงานยังเห็นยอดรับซื้อ เงินออก และเงินสดในลิ้นชักเสมอ · เจ้าของเห็นทุกอย่าง</p>
      <button class="btn gold block" id="saveSv">บันทึก</button></div>`;
  } else if (setTab === 'melt') {
    const m = meltCfg();
    body = `<div class="card"><div class="card-h"><h2>ค่าตั้งต้นการหลอม</h2></div>
      <label>ค่าหลอมเริ่มต้นต่อครั้ง (บาท)<input id="mCost" inputmode="decimal" value="${esc(m.default_cost)}"></label>
      <label>เกณฑ์ที่รับได้: เนื้อทองจริงต่างจากที่คาดไม่เกิน (±%)<input id="mTol" inputmode="decimal" value="${esc(m.tolerance_pct)}"></label>
      <p class="muted sm">ตัวอย่าง 0.5 = ถ้าคาดว่าได้เนื้อทอง 100 ก. แล้ววัดได้ 99.5–100.5 ก. ถือว่าอยู่ในเกณฑ์ พร้อมขาย</p>
      <label>เตือนเมื่อน้ำหนักหายตอนหลอมเกิน (%)<input id="mLoss" inputmode="decimal" value="${esc(m.loss_warn_pct)}"></label>
      <button class="btn gold block" id="saveM">บันทึก</button></div>`;
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
  } else if (setTab === 'sale') {
    $('#saveSl').onclick = (ev) => save('sale', { staff_can_sell: $('#slStaff').checked }, ev.target);
    $('#saveDr').onclick = (ev) => save('drawer', { float: Math.max(0, num($('#drFloat').value)) }, ev.target);
    $('#saveSv').onclick = (ev) => save('staff_view', { sales: $('#svSales').checked, profit: $('#svProfit').checked, pending: $('#svPending').checked }, ev.target);
  } else if (setTab === 'melt') {
    $('#saveM').onclick = (ev) => save('melt', { default_cost: Math.max(0, num($('#mCost').value)), tolerance_pct: Math.max(0, num($('#mTol').value)), loss_warn_pct: Math.max(0, num($('#mLoss').value)) }, ev.target);
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
  const A = { login: 'เข้าระบบ', logout: 'ออกจากระบบ', pin_wrong: '⚠ ใส่ PIN ผิด', create_bill: 'ทำบิลรับซื้อ', void_bill: '⚠ ยกเลิกบิล', create_melt: 'หลอมก้อน', add_note: '📝 เพิ่มหมายเหตุ', create_sale: 'บันทึกการขาย', merge_melts: 'รวมก้อน', send_refinery: 'ส่งโรงสกัด', refinery_report: 'บันทึกผลวิเคราะห์', settle_refinery: 'สรุปขายโรงสกัด', cancel_refinery: '⚠ ยกเลิกการส่งโรงสกัด', sale_paid: 'รับเงินจากการขาย', cancel_sale: '⚠ ยกเลิกการขาย', add_sale_doc: 'แนบเอกสารขาย', cancel_melt: '⚠ ยกเลิกการหลอม', request_cancel: 'ขอยกเลิกบิล', reject_cancel: 'ไม่อนุมัติคำขอยกเลิก', withdraw_cancel: 'ถอนคำขอยกเลิก', save_setting: 'แก้การตั้งค่า', add_staff: 'เพิ่มพนักงาน', reset_pin: 'รีเซ็ต PIN', set_staff_active: 'เปิด/ปิดพนักงาน', change_pin: 'เปลี่ยน PIN', set_nickname: 'เปลี่ยนชื่อเล่น', register_device: 'ลงทะเบียนเครื่อง', setup_owner: 'ตั้งค่าร้าน' };
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
