// โหมดทดลอง: จำลองฐานข้อมูลไว้ในเครื่อง (ใช้เมื่อยังไม่ได้ใส่ค่า Supabase ใน config.js)
// ทำงานเหมือนฟังก์ชันใน supabase/schema.sql ทุกตัว แต่เก็บข้อมูลใน localStorage
(function () {
  const KEY = 'dd_demo_db';
  const DEFAULT_SETTINGS = {
    shop: { name: 'DD หลอมทอง', name2: 'ดีดี หลอมทอง', branch: 'สาขาบางกะปิ', address: '', phone: '', line: '', logo: null, footer: 'ขอบคุณที่ใช้บริการ' },
    prices: {
      date: null, rule: 'lower', round: 1, assoc_mode: false, assoc_buy_per_baht: 0,
      metals: {
        gold: { label: 'ทอง', tiers: [{ pct: 60, price: 1500 }, { pct: 70, price: 2000 }, { pct: 80, price: 2500 }, { pct: 90, price: 3000 }, { pct: 95, price: 4500 }, { pct: 96.5, price: 4600 }], kinds: ['ทองรูปพรรณ', 'ทองแท่ง', 'เศษทอง', 'ทองเค', 'ทองหลอม', 'อื่นๆ'] },
        silver: { label: 'เงิน', tiers: [{ pct: 60, price: 25 }, { pct: 80, price: 35 }, { pct: 92.5, price: 45 }, { pct: 99.9, price: 50 }], kinds: ['เครื่องประดับเงิน', 'เงินแท่ง', 'แร่เงิน', 'เศษเงิน', 'อื่นๆ'] },
        nak: { label: 'นาก', tiers: [], kinds: ['นากรูปพรรณ', 'เศษนาก', 'อื่นๆ'] },
        platinum: { label: 'แพลทินัม', tiers: [], kinds: ['เครื่องประดับ', 'เศษ', 'อื่นๆ'] }
      }
    },
    receipt: { copies: 1, consent: 'ข้าพเจ้าขอยืนยันว่าทรัพย์สินข้างต้นเป็นของข้าพเจ้าโดยชอบด้วยกฎหมาย ไม่ได้มาจากการกระทำผิด และยินยอมขายให้ร้านในราคาข้างต้น ยินยอมให้ร้านนำไปหลอม/ฝนเปิดผิว/วัดเปอร์เซ็นต์ และยินยอมให้ร้านเก็บสำเนาข้อมูลบัตรประชาชนตามที่กฎหมายกำหนด' }
  };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  let db = load() || { staff: [], devices: [], sessions: [], settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), customers: {}, bills: [], audit: [] };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('demo save failed', e); } };
  const err = (m) => { throw new Error(m); };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Math.random().toString(16).slice(2) + Date.now());
  const pin = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  const log = (s, dev, action, detail) => { db.audit.push({ id: db.audit.length + 1, at: new Date().toISOString(), staff_code: s && s.code, device_id: dev, action, detail: detail || null }); };
  const bkkDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  function auth(token) {
    const se = db.sessions.find(x => x.token === token && !x.revoked_at && new Date(x.expires_at) > new Date());
    if (!se) err('SESSION_INVALID');
    const s = db.staff.find(x => x.id === se.staff_id && x.active);
    if (!s) err('SESSION_INVALID');
    return { s, dev: se.device_id };
  }
  function owner(token) { const a = auth(token); if (a.s.role !== 'owner') err('OWNER_ONLY'); return a; }
  function checkDevice(id, secret) { const d = db.devices.find(x => x.id === id && x.active && x.secret === secret); if (!d) err('DEVICE_INVALID'); return d; }
  function pinCheck(code, p) {
    const s = db.staff.find(x => x.code === String(code).toUpperCase() && x.active);
    if (!s) return 'PIN_WRONG';
    if (s.locked_until && new Date(s.locked_until) > new Date()) return 'LOCKED:' + Math.ceil((new Date(s.locked_until) - new Date()) / 60000);
    if (s.pin !== p) {
      s.failed = (s.failed || 0) + 1;
      if (s.failed >= 5) { s.failed = 0; s.locked_until = new Date(Date.now() + 5 * 60000).toISOString(); save(); return 'LOCKED:5'; }
      log(s, null, 'pin_wrong'); save(); return 'PIN_WRONG';
    }
    s.failed = 0; s.locked_until = null; return 'OK';
  }
  const pub = (s) => ({ code: s.code, nickname: s.nickname, role: s.role, must_change_pin: !!s.must_change_pin });

  const F = {
    setup_status: () => ({ has_owner: db.staff.some(s => s.role === 'owner'), shop: db.settings.shop }),
    setup_owner: ({ p_nickname, p_pin }) => {
      if (db.staff.some(s => s.role === 'owner')) err('ALREADY_SETUP');
      if (!/^\d{6}$/.test(p_pin)) err('PIN_FORMAT_6');
      db.staff.push({ id: uid(), code: 'OWN01', nickname: p_nickname, role: 'owner', pin: p_pin, active: true, must_change_pin: false, created_at: new Date().toISOString() });
      log({ code: 'OWN01' }, null, 'setup_owner'); return { code: 'OWN01' };
    },
    register_device: ({ p_owner_code, p_pin, p_name }) => {
      const r = pinCheck(p_owner_code, p_pin); if (r !== 'OK') return { error: r };
      const s = db.staff.find(x => x.code === p_owner_code.toUpperCase()); if (s.role !== 'owner') return { error: 'OWNER_ONLY' };
      const id = String.fromCharCode(65 + db.devices.length), secret = uid();
      db.devices.push({ id, name: p_name, secret, active: true }); log(s, id, 'register_device', { name: p_name });
      return { device_id: id, secret, name: p_name };
    },
    staff_list: ({ p_device, p_secret }) => { checkDevice(p_device, p_secret); return db.staff.filter(s => s.active).sort((a, b) => (b.role > a.role ? 1 : b.role < a.role ? -1 : a.code.localeCompare(b.code))).map(s => ({ code: s.code, nickname: s.nickname, role: s.role })); },
    login: ({ p_device, p_secret, p_code, p_pin }) => {
      checkDevice(p_device, p_secret);
      const r = pinCheck(p_code, p_pin); if (r !== 'OK') return { error: r };
      const s = db.staff.find(x => x.code === p_code.toUpperCase());
      const token = uid(); db.sessions.push({ token, staff_id: s.id, device_id: p_device, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString() });
      log(s, p_device, 'login');
      return { token, staff: pub(s), settings: db.settings, server_time: new Date().toISOString() };
    },
    logout: ({ p_token }) => { const a = auth(p_token); db.sessions.find(x => x.token === p_token).revoked_at = new Date().toISOString(); log(a.s, a.dev, 'logout'); return null; },
    get_settings: ({ p_token }) => { auth(p_token); return { settings: db.settings, server_time: new Date().toISOString() }; },
    save_setting: ({ p_token, p_key, p_value }) => { const a = owner(p_token); if (!['shop', 'prices', 'receipt'].includes(p_key)) err('BAD_KEY'); db.settings[p_key] = p_value; log(a.s, a.dev, 'save_setting', { key: p_key }); return null; },
    create_bill: ({ p_token, p_bill }) => {
      const a = auth(p_token);
      const ex = db.bills.find(b => b.id === p_bill.id); if (ex) return { id: ex.id, bill_no: ex.bill_no, duplicate: true };
      const c = p_bill.customer || {}; if (!c.id_card) err('CUSTOMER_REQUIRED');
      const old = db.customers[c.id_card] || { bill_count: 0, first_seen: p_bill.created_at };
      const merged = { ...old };
      for (const k of ['name', 'name_en', 'birth', 'gender', 'address', 'phone', 'photo', 'card_issue', 'card_expire']) if (c[k]) merged[k] = c[k];
      merged.id_card = c.id_card; merged.bill_count = old.bill_count + 1; merged.last_seen = p_bill.created_at;
      db.customers[c.id_card] = merged;
      let no = p_bill.bill_no; if (db.bills.some(b => b.bill_no === no)) no += '-' + p_bill.id.slice(0, 4);
      const cust = { ...c }; delete cust.photo;
      const s = db.staff.find(x => x.code === p_bill.staff_code) || a.s;
      db.bills.push({ ...p_bill, customer: cust, bill_no: no, staff_code: s.code, customer_id: c.id_card, status: 'ok', synced_at: new Date().toISOString(), branch_id: 'BKP' });
      log(s, a.dev, 'create_bill', { bill_no: no, total: p_bill.total, customer: c.id_card });
      return { id: p_bill.id, bill_no: no };
    },
    list_bills: ({ p_token, p_from, p_to }) => { auth(p_token); return db.bills.filter(b => { const d = bkkDate(b.created_at); return d >= p_from && d <= p_to; }).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    find_customers: ({ p_token, p_q }) => {
      auth(p_token); const q = (p_q || '').trim().toLowerCase(); if (q.length < 2) return [];
      const byBill = new Set(db.bills.filter(b => b.bill_no.toLowerCase().includes(q)).map(b => b.customer_id));
      return Object.values(db.customers).filter(c => byBill.has(c.id_card) || [c.id_card, c.phone, c.name, c.name_en].some(v => v && String(v).toLowerCase().includes(q)))
        .map(c => { const x = { ...c }; delete x.photo; return x; }).slice(0, 20);
    },
    get_customer: ({ p_token, p_id }) => { auth(p_token); const c = db.customers[p_id]; if (!c) return null; return { customer: c, bills: db.bills.filter(b => b.customer_id === p_id).map(b => ({ bill_no: b.bill_no, total: b.total, created_at: b.created_at, status: b.status })).reverse() }; },
    void_bill: ({ p_token, p_id, p_reason }) => { const a = owner(p_token); const b = db.bills.find(x => x.id === p_id && x.status === 'ok'); if (!b) err('NOT_FOUND'); b.status = 'void'; b.void_reason = p_reason; b.voided_at = new Date().toISOString(); log(a.s, a.dev, 'void_bill', { bill_no: b.bill_no, reason: p_reason }); return null; },
    list_staff: ({ p_token }) => { owner(p_token); return db.staff.map(s => ({ ...pub(s), active: s.active, locked: s.locked_until && new Date(s.locked_until) > new Date(), last_login: (db.sessions.filter(x => x.staff_id === s.id).map(x => x.created_at).sort().pop()) || null })); },
    add_staff: ({ p_token, p_nickname, p_role }) => {
      const a = owner(p_token); const pre = p_role === 'owner' ? 'OWN' : 'DD';
      const n = Math.max(0, ...db.staff.filter(s => s.code.startsWith(pre) && /^\d+$/.test(s.code.slice(pre.length))).map(s => +s.code.slice(pre.length))) + 1;
      const code = pre + String(n).padStart(2, '0'), p = pin(p_role === 'owner' ? 6 : 4);
      db.staff.push({ id: uid(), code, nickname: p_nickname, role: p_role, pin: p, active: true, must_change_pin: true });
      log(a.s, a.dev, 'add_staff', { code, nickname: p_nickname }); return { code, temp_pin: p };
    },
    reset_pin: ({ p_token, p_code }) => { const a = owner(p_token); const s = db.staff.find(x => x.code === p_code); if (!s) err('NOT_FOUND'); s.pin = pin(s.role === 'owner' ? 6 : 4); s.must_change_pin = true; s.locked_until = null; db.sessions.filter(x => x.staff_id === s.id).forEach(x => x.revoked_at = x.revoked_at || new Date().toISOString()); log(a.s, a.dev, 'reset_pin', { code: p_code }); return { code: p_code, temp_pin: s.pin }; },
    set_staff_active: ({ p_token, p_code, p_active }) => { const a = owner(p_token); if (p_code === a.s.code) err('CANNOT_SELF'); const s = db.staff.find(x => x.code === p_code); s.active = p_active; log(a.s, a.dev, 'set_staff_active', { code: p_code, active: p_active }); return null; },
    change_pin: ({ p_token, p_old, p_new }) => {
      const a = auth(p_token); const r = pinCheck(a.s.code, p_old); if (r !== 'OK') return { error: r };
      if (!(a.s.role === 'owner' ? /^\d{6}$/ : /^\d{4}$/).test(p_new)) err('PIN_FORMAT');
      if (['0000', '1234', '1111', '000000', '123456', '111111'].includes(p_new)) err('PIN_WEAK');
      a.s.pin = p_new; a.s.must_change_pin = false; log(a.s, a.dev, 'change_pin'); return { ok: true };
    },
    set_my_nickname: ({ p_token, p_nickname }) => { const a = auth(p_token); a.s.nickname = p_nickname.trim(); log(a.s, a.dev, 'set_nickname', { nickname: p_nickname }); return null; },
    list_audit: ({ p_token, p_from, p_to }) => { owner(p_token); return db.audit.filter(l => { const d = bkkDate(l.at); return d >= p_from && d <= p_to; }).reverse(); }
  };

  window.DD_DEMO = {
    rpc: async (fn, params) => {
      await new Promise(r => setTimeout(r, 120));
      if (!F[fn]) err('UNKNOWN_FN');
      const out = F[fn](params || {});
      save();
      if (out && out.error) err(out.error);
      return JSON.parse(JSON.stringify(out === undefined ? null : out));
    },
    reset: () => { localStorage.removeItem(KEY); }
  };
})();
