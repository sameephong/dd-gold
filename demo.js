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
    cancel: { enabled: false, limit: 20000, today_only: true },
    melt: { default_cost: 500, tolerance_pct: 0.5, loss_warn_pct: 2 },
    sale: { staff_can_sell: false },
    receipt: { copies: 1, consent: 'ข้าพเจ้าขอยืนยันว่าทรัพย์สินข้างต้นเป็นของข้าพเจ้าโดยชอบด้วยกฎหมาย ไม่ได้มาจากการกระทำผิด และยินยอมขายให้ร้านในราคาข้างต้น ยินยอมให้ร้านนำไปหลอม/ฝนเปิดผิว/วัดเปอร์เซ็นต์ และยินยอมให้ร้านเก็บสำเนาข้อมูลบัตรประชาชนตามที่กฎหมายกำหนด' }
  };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  let db = load() || { staff: [], devices: [], sessions: [], settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), customers: {}, bills: [], audit: [] };
  db.cancel_requests = db.cancel_requests || []; db.melts = db.melts || []; db.sales = db.sales || []; db.sale_docs = db.sale_docs || []; db.item_seq = db.item_seq || 0;
  const ensureItemIds = () => db.bills.forEach(b => (b.items || []).forEach(i => { if (!i.item_id) { i.item_id = ++db.item_seq; i.stock_status = b.status === 'void' ? 'void' : 'in_stock'; } }));
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
    save_setting: ({ p_token, p_key, p_value }) => { const a = owner(p_token); if (!['shop', 'prices', 'receipt', 'cancel', 'melt', 'sale'].includes(p_key)) err('BAD_KEY'); db.settings[p_key] = p_value; log(a.s, a.dev, 'save_setting', { key: p_key }); return null; },
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
      const items = (p_bill.items || []).map(i => ({ ...i, item_id: ++db.item_seq, stock_status: 'in_stock' }));
      db.bills.push({ ...p_bill, items, customer: cust, bill_no: no, staff_code: s.code, customer_id: c.id_card, status: 'ok', synced_at: new Date().toISOString(), branch_id: 'BKP' });
      log(s, a.dev, 'create_bill', { bill_no: no, total: p_bill.total, customer: c.id_card });
      return { id: p_bill.id, bill_no: no };
    },
    list_bills: ({ p_token, p_from, p_to }) => { auth(p_token); return db.bills.filter(b => { const d = bkkDate(b.created_at); return d >= p_from && d <= p_to; }).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(b => ({ ...b, pending_cancel: db.cancel_requests.some(r => r.bill_id === b.id && r.status === 'pending') })); },
    find_customers: ({ p_token, p_q }) => {
      auth(p_token); const q = (p_q || '').trim().toLowerCase(); if (q.length < 2) return [];
      const byBill = new Set(db.bills.filter(b => b.bill_no.toLowerCase().includes(q)).map(b => b.customer_id));
      return Object.values(db.customers).filter(c => byBill.has(c.id_card) || [c.id_card, c.phone, c.name, c.name_en].some(v => v && String(v).toLowerCase().includes(q)))
        .map(c => { const x = { ...c }; delete x.photo; return x; }).slice(0, 20);
    },
    get_customer: ({ p_token, p_id }) => { auth(p_token); const c = db.customers[p_id]; if (!c) return null; return { customer: c, bills: db.bills.filter(b => b.customer_id === p_id).map(b => ({ bill_no: b.bill_no, total: b.total, created_at: b.created_at, status: b.status })).reverse() }; },
    void_bill: ({ p_token, p_id, p_reason, p_approver_code, p_approver_pin }) => {
      const a = auth(p_token);
      if (!(p_reason || '').trim()) return { error: 'REASON_REQUIRED' };
      const b = db.bills.find(x => x.id === p_id && x.status === 'ok'); if (!b) return { error: 'NOT_FOUND' };
      ensureItemIds(); if (b.items.some(i => i.stock_status !== 'in_stock')) return { error: 'ITEMS_USED' };
      let appr = null;
      if (a.s.role !== 'owner') {
        const c = db.settings.cancel || {};
        if (!c.enabled) return { error: 'STAFF_CANCEL_OFF' };
        if (c.today_only !== false && bkkDate(b.created_at) !== bkkDate(new Date().toISOString())) return { error: 'BILL_NOT_TODAY' };
        if (Number(b.total) > Number(c.limit || 0)) {
          if (!p_approver_code) return { error: 'NEED_OWNER', limit: c.limit };
          const r = pinCheck(p_approver_code, p_approver_pin); if (r !== 'OK') return { error: r };
          appr = db.staff.find(x => x.code === p_approver_code.toUpperCase()); if (appr.role !== 'owner') return { error: 'OWNER_ONLY' };
        }
      }
      b.status = 'void'; b.void_reason = p_reason; b.voided_at = new Date().toISOString(); b.voided_by_code = a.s.code; b.approved_by_code = appr && appr.code;
      b.items.forEach(i => { if (i.stock_status === 'in_stock') i.stock_status = 'void'; });
      db.cancel_requests.filter(r => r.bill_id === p_id && r.status === 'pending').forEach(r => { r.status = 'approved'; r.decided_code = (appr || a.s).code; r.decided_at = new Date().toISOString(); r.decide_note = 'ยกเลิกที่หน้าร้าน'; });
      log(a.s, a.dev, 'void_bill', { bill_no: b.bill_no, total: b.total, reason: p_reason, approved_by: appr && appr.code });
      return { ok: true, bill_no: b.bill_no, approved_by: appr && appr.code };
    },
    request_cancel: ({ p_token, p_id, p_reason }) => {
      const a = auth(p_token);
      if (!(p_reason || '').trim()) return { error: 'REASON_REQUIRED' };
      const b = db.bills.find(x => x.id === p_id && x.status === 'ok'); if (!b) return { error: 'NOT_FOUND' };
      if (a.s.role !== 'owner') {
        const c = db.settings.cancel || {};
        if (!c.enabled) return { error: 'STAFF_CANCEL_OFF' };
        if (c.today_only !== false && bkkDate(b.created_at) !== bkkDate(new Date().toISOString())) return { error: 'BILL_NOT_TODAY' };
      }
      const ex = db.cancel_requests.find(r => r.bill_id === p_id && r.status === 'pending'); if (ex) return { id: ex.id, existing: true };
      const r = { id: uid(), bill_id: p_id, requested_code: a.s.code, requested_name: a.s.nickname, reason: p_reason.trim(), status: 'pending', created_at: new Date().toISOString() };
      db.cancel_requests.push(r); log(a.s, a.dev, 'request_cancel', { bill_no: b.bill_no, total: b.total, reason: p_reason }); return { id: r.id };
    },
    list_cancel_requests: ({ p_token, p_scope }) => {
      const a = auth(p_token); const week = Date.now() - 7 * 864e5;
      return db.cancel_requests.filter(r => (p_scope === 'pending' || !p_scope ? r.status === 'pending' : new Date(r.created_at) > week) && (a.s.role === 'owner' || r.requested_code === a.s.code))
        .map(r => { const b = db.bills.find(x => x.id === r.bill_id) || {}; return { ...r, bill_no: b.bill_no, total: b.total, bill_created_at: b.created_at, customer_name: (b.customer || {}).name, items: b.items }; })
        .sort((x, y) => y.created_at.localeCompare(x.created_at));
    },
    pending_counts: ({ p_token }) => {
      const a = auth(p_token);
      if (a.s.role === 'owner') return { cancel_requests: db.cancel_requests.filter(r => r.status === 'pending').length };
      const day = Date.now() - 864e5;
      return { my_pending: db.cancel_requests.filter(r => r.requested_code === a.s.code && r.status === 'pending').length,
        my_decided: db.cancel_requests.filter(r => r.requested_code === a.s.code && ['approved', 'rejected'].includes(r.status) && new Date(r.decided_at) > day)
          .map(r => ({ id: r.id, status: r.status, bill_no: (db.bills.find(b => b.id === r.bill_id) || {}).bill_no, decided_code: r.decided_code, decide_note: r.decide_note })) };
    },
    decide_cancel: ({ p_token, p_req, p_approve, p_pin, p_note }) => {
      const a = auth(p_token); if (a.s.role !== 'owner') return { error: 'OWNER_ONLY' };
      const pr = pinCheck(a.s.code, p_pin); if (pr !== 'OK') return { error: pr };
      const r = db.cancel_requests.find(x => x.id === p_req); if (!r || r.status !== 'pending') return { error: 'REQUEST_DONE' };
      const b = db.bills.find(x => x.id === r.bill_id);
      ensureItemIds(); if (p_approve && b.items.some(i => !['in_stock', 'void'].includes(i.stock_status))) return { error: 'ITEMS_USED' };
      if (p_approve && b.status === 'ok') { b.items.forEach(i => { i.stock_status = 'void'; }); b.status = 'void'; b.void_reason = r.reason; b.voided_at = new Date().toISOString(); b.approved_by_code = a.s.code; }
      Object.assign(r, { status: p_approve ? 'approved' : 'rejected', decided_code: a.s.code, decided_at: new Date().toISOString(), decide_note: p_note || null });
      log(a.s, a.dev, p_approve ? 'void_bill' : 'reject_cancel', { bill_no: b.bill_no, total: b.total, reason: r.reason, requested_by: r.requested_code, approved_by: p_approve ? a.s.code : undefined, note: p_note });
      return { ok: true, bill_no: b.bill_no, approved: !!p_approve };
    },
    withdraw_cancel: ({ p_token, p_req }) => { const a = auth(p_token); const r = db.cancel_requests.find(x => x.id === p_req && x.status === 'pending' && (x.requested_code === a.s.code || a.s.role === 'owner')); if (!r) return { error: 'REQUEST_DONE' }; r.status = 'withdrawn'; r.decided_at = new Date().toISOString(); log(a.s, a.dev, 'withdraw_cancel', {}); return { ok: true }; },
    list_stock: ({ p_token }) => {
      auth(p_token); ensureItemIds();
      const out = [];
      db.bills.filter(b => b.status === 'ok' && !db.cancel_requests.some(r => r.bill_id === b.id && r.status === 'pending')).forEach(b => b.items.filter(i => i.stock_status === 'in_stock').forEach(i => out.push({ id: i.item_id, metal: i.metal, item_kind: i.kind, pct: i.pct, weight: i.weight, price_per_g: i.price_per_g, amount: i.amount, destination: i.destination, bill_no: b.bill_no, created_at: b.created_at, staff_code: b.staff_code, customer_name: (b.customer || {}).name })));
      return out.sort((x, y) => x.created_at.localeCompare(y.created_at));
    },
    create_melt: ({ p_token, p_item_ids, p_out_weight, p_measured_pct, p_melt_cost, p_note }) => {
      const a = auth(p_token); ensureItemIds();
      const w = Number(p_out_weight), pc = Number(p_measured_pct);
      if (!(w > 0)) return { error: 'BAD_WEIGHT' }; if (!(pc > 0 && pc <= 100)) return { error: 'BAD_PCT' };
      const items = []; db.bills.filter(b => b.status === 'ok').forEach(b => b.items.forEach(i => { if (p_item_ids.includes(i.item_id) && i.stock_status === 'in_stock') items.push(i); }));
      if (!items.length || items.length !== p_item_ids.length) return { error: 'ITEMS_CHANGED' };
      if (new Set(items.map(i => i.metal)).size > 1) return { error: 'MIXED_METAL' };
      const inW = items.reduce((t, i) => t + Number(i.weight), 0), inF = items.reduce((t, i) => t + i.weight * i.pct / 100, 0), cost = items.reduce((t, i) => t + Number(i.amount), 0);
      if (w > inW) return { error: 'OUT_HEAVIER' };
      const r3 = (x) => Math.round(x * 1000) / 1000, outF = r3(w * pc / 100), diff = r3(outF - inF), diffPct = inF ? r3(diff / inF * 100) : 0;
      const tol = Number((db.settings.melt || {}).tolerance_pct || 0.5);
      const d = new Date(); const ymd = String((d.getFullYear() + 543) % 100).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      const lot = 'M-' + ymd + '-' + String(db.melts.filter(m => m.lot_no.startsWith('M-' + ymd)).length + 1).padStart(2, '0');
      const m = { id: uid(), lot_no: lot, metal: items[0].metal, staff_code: a.s.code, item_count: items.length, input_weight: r3(inW), input_fine: r3(inF), input_pct: Math.round(inF / inW * 10000) / 100,
        out_weight: w, measured_pct: pc, out_fine: outF, loss_weight: r3(inW - w), fine_diff: diff, fine_diff_pct: diffPct, within_tolerance: Math.abs(diffPct) <= tol,
        items_cost: cost, melt_cost: Number(p_melt_cost || 0), status: 'ready', note: p_note || null, created_at: new Date().toISOString() };
      db.melts.push(m); items.forEach(i => { i.stock_status = 'melted'; i.melt_id = m.id; });
      log(a.s, a.dev, 'create_melt', { lot_no: lot, items: items.length, in_g: m.input_weight, out_g: w, pct: pc, diff_pct: diffPct });
      return m;
    },
    list_melts: ({ p_token, p_scope }) => { auth(p_token); return db.melts.filter(m => p_scope === 'stock' || !p_scope ? m.status === 'ready' : true).slice().reverse(); },
    get_melt: ({ p_token, p_id }) => {
      auth(p_token); const m = db.melts.find(x => x.id === p_id); if (!m) return null;
      const items = []; db.bills.forEach(b => b.items.forEach(i => { if (i.melt_id === p_id) items.push({ id: i.item_id, bill_no: b.bill_no, bill_created_at: b.created_at, customer_name: (b.customer || {}).name, item_kind: i.kind, pct: i.pct, weight: i.weight, amount: i.amount }); }));
      return { ...m, items };
    },
    cancel_melt: ({ p_token, p_id, p_reason }) => {
      const a = auth(p_token); if (a.s.role !== 'owner') return { error: 'OWNER_ONLY' };
      if (!(p_reason || '').trim()) return { error: 'REASON_REQUIRED' };
      const m = db.melts.find(x => x.id === p_id); if (!m || m.status !== 'ready') return { error: 'MELT_LOCKED' };
      m.status = 'cancelled'; m.cancel_reason = p_reason; m.cancelled_at = new Date().toISOString();
      db.bills.forEach(b => b.items.forEach(i => { if (i.melt_id === p_id) { i.stock_status = 'in_stock'; i.melt_id = null; } }));
      log(a.s, a.dev, 'cancel_melt', { lot_no: m.lot_no, reason: p_reason }); return { ok: true };
    },
    list_sellable: ({ p_token }) => {
      auth(p_token); ensureItemIds(); const items = [];
      db.bills.filter(b => b.status === 'ok' && !db.cancel_requests.some(r => r.bill_id === b.id && r.status === 'pending')).forEach(b => b.items.filter(i => i.stock_status === 'in_stock' && i.destination === 'whole').forEach(i => items.push({ id: i.item_id, metal: i.metal, item_kind: i.kind, pct: i.pct, weight: i.weight, amount: i.amount, bill_no: b.bill_no, created_at: b.created_at })));
      const seen = new Set(); const buyers = db.sales.filter(x => x.status !== 'cancelled').filter(x => !seen.has(x.buyer_name) && seen.add(x.buyer_name)).map(x => ({ name: x.buyer_name, phone: x.buyer_phone, type: x.buyer_type }));
      return { melts: db.melts.filter(m => m.status === 'ready'), items, buyers };
    },
    create_sale: ({ p_token, p_sale }) => {
      const a = auth(p_token); ensureItemIds();
      if (a.s.role !== 'owner' && !(db.settings.sale || {}).staff_can_sell) return { error: 'SELL_NOT_ALLOWED' };
      if (!(p_sale.buyer_name || '').trim()) return { error: 'BUYER_REQUIRED' };
      if (!(p_sale.lines || []).length) return { error: 'NO_LINES' };
      const lines = []; let total = 0, cost = 0, fo = 0, fb = 0;
      for (const ln of p_sale.lines) {
        const amt = Number(ln.amount || 0); if (!(amt > 0)) return { error: 'LINE_AMOUNT' };
        if (ln.kind === 'melt') { const m = db.melts.find(x => x.id === ln.ref && x.status === 'ready'); if (!m) return { error: 'STOCK_CHANGED' };
          const bp = Number(ln.buyer_pct || m.measured_pct); lines.push({ kind: 'melt', melt_id: m.id, metal: m.metal, label: m.lot_no, weight: m.out_weight, our_pct: m.measured_pct, buyer_pct: bp, amount: amt, cost: m.items_cost + m.melt_cost }); }
        else { let it = null, bill = null; db.bills.forEach(b => b.items.forEach(i => { if (i.item_id === Number(ln.ref) && i.stock_status === 'in_stock') { it = i; bill = b; } })); if (!it) return { error: 'STOCK_CHANGED' };
          const bp = Number(ln.buyer_pct || it.pct); lines.push({ kind: 'item', bill_item_id: it.item_id, metal: it.metal, label: bill.bill_no + ' ' + (it.kind || ''), weight: it.weight, our_pct: it.pct, buyer_pct: bp, amount: amt, cost: it.amount }); }
      }
      lines.forEach((l, i) => { l.line = i + 1; total += l.amount; cost += l.cost; fo += l.weight * l.our_pct / 100; fb += l.weight * l.buyer_pct / 100;
        if (l.melt_id) db.melts.find(x => x.id === l.melt_id).status = 'sold'; else db.bills.forEach(b => b.items.forEach(i => { if (i.item_id === l.bill_item_id) i.stock_status = 'sold'; })); });
      const d = new Date(); const ymd = String((d.getFullYear() + 543) % 100).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      const sale = { id: uid(), sale_no: 'S-' + ymd + '-' + String(db.sales.filter(x => x.sale_no.startsWith('S-' + ymd)).length + 1).padStart(2, '0'), buyer_type: p_sale.buyer_type || 'shop', buyer_name: p_sale.buyer_name.trim(), buyer_phone: p_sale.buyer_phone || null,
        staff_code: a.s.code, total_amount: total, total_cost: cost, transport_cost: Number(p_sale.transport_cost || 0), other_cost: Number(p_sale.other_cost || 0), fine_our: Math.round(fo * 1000) / 1000, fine_buyer: Math.round(fb * 1000) / 1000,
        status: p_sale.paid ? 'paid' : 'pending_payment', pay_method: p_sale.pay_method || null, due_date: p_sale.due_date || null, paid_at: p_sale.paid ? new Date().toISOString() : null, note: p_sale.note || null, created_at: new Date().toISOString(), lines };
      db.sales.push(sale); log(a.s, a.dev, 'create_sale', { sale_no: sale.sale_no, buyer: sale.buyer_name, lines: lines.length, amount: total, paid: !!p_sale.paid });
      const out = { ...sale }; delete out.lines; return out;
    },
    list_sales: ({ p_token, p_scope }) => { auth(p_token); return db.sales.filter(x => p_scope === 'pending' ? x.status === 'pending_payment' : true).map(x => { const o = { ...x, doc_count: db.sale_docs.filter(d => d.sale_id === x.id).length, line_count: x.lines.length }; delete o.lines; return o; }).reverse(); },
    get_sale: ({ p_token, p_id }) => { auth(p_token); const x = db.sales.find(y => y.id === p_id); if (!x) return null; return { ...x, docs: db.sale_docs.filter(d => d.sale_id === p_id).map(d => ({ id: d.id, name: d.name, created_at: d.created_at, size: d.data.length })) }; },
    add_sale_doc: ({ p_token, p_sale, p_name, p_data }) => { const a = auth(p_token); if (p_data.length > 700000) return { error: 'DOC_TOO_BIG' }; if (db.sale_docs.filter(d => d.sale_id === p_sale).length >= 10) return { error: 'DOC_LIMIT' }; const d = { id: uid(), sale_id: p_sale, name: p_name, data: p_data, created_at: new Date().toISOString() }; db.sale_docs.push(d); log(a.s, a.dev, 'add_sale_doc', { name: p_name }); return { id: d.id }; },
    get_sale_doc: ({ p_token, p_doc }) => { auth(p_token); const d = db.sale_docs.find(x => x.id === p_doc); return d ? { name: d.name, data: d.data } : null; },
    mark_sale_paid: ({ p_token, p_id, p_method, p_amount }) => { const a = auth(p_token); if (a.s.role !== 'owner' && !(db.settings.sale || {}).staff_can_sell) return { error: 'SELL_NOT_ALLOWED' }; const x = db.sales.find(y => y.id === p_id); if (!x || x.status !== 'pending_payment') return { error: 'SALE_LOCKED' }; x.status = 'paid'; x.paid_at = new Date().toISOString(); x.pay_method = p_method || x.pay_method; x.received_amount = p_amount || x.total_amount; log(a.s, a.dev, 'sale_paid', { sale_no: x.sale_no }); return { ok: true }; },
    cancel_sale: ({ p_token, p_id, p_reason }) => { const a = auth(p_token); if (a.s.role !== 'owner') return { error: 'OWNER_ONLY' }; if (!(p_reason || '').trim()) return { error: 'REASON_REQUIRED' }; const x = db.sales.find(y => y.id === p_id); if (!x || x.status === 'cancelled') return { error: 'SALE_LOCKED' };
      x.lines.forEach(l => { if (l.melt_id) db.melts.find(m => m.id === l.melt_id).status = 'ready'; else db.bills.forEach(b => b.items.forEach(i => { if (i.item_id === l.bill_item_id) i.stock_status = 'in_stock'; })); });
      x.status = 'cancelled'; x.cancel_reason = p_reason; log(a.s, a.dev, 'cancel_sale', { sale_no: x.sale_no, reason: p_reason }); return { ok: true }; },
    merge_melts: () => ({ error: 'DEMO_ONLY_SUPABASE' }), send_refinery: () => ({ error: 'DEMO_ONLY_SUPABASE' }),
    list_refinery: () => [], save_refinery_report: () => ({ error: 'DEMO_ONLY_SUPABASE' }), settle_refinery: () => ({ error: 'DEMO_ONLY_SUPABASE' }),
    cancel_refinery: () => ({ error: 'DEMO_ONLY_SUPABASE' }), add_lot_doc: () => ({ error: 'DEMO_ONLY_SUPABASE' }), list_lot_docs: () => [], get_lot_doc: () => null,
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
