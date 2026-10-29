/* Avantikaar business app – front end (no build step) */
(function () {
  'use strict';

  /* ---------------- config & state ---------------- */
  const LS = {
    get: function (k, d) { try { const v = localStorage.getItem('avk_' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('avk_' + k, v); } catch (e) { } },
    del: function (k) { try { localStorage.removeItem('avk_' + k); } catch (e) { } }
  };
  const S = { settings: {}, lists: { types: [], sizes: [], channels: [] }, wholesalers: [], customers: [], stock: [], loaded: false };
  let SELL = newSell();
  let BUY = newBuy();
  const $view = document.getElementById('view');

  function newSell() {
    return { items: [], custMode: 'search', customer: null, newCust: { name: '', phone: '', address: '', city: '', state: 'Maharashtra', pin: '' },
      bill: { date: today(), order_type: 'Offline', channel: '', delivery: '', payment: 'Prepaid', courier: '', tracking: '', notes: '' } };
  }
  function newBuy() {
    return { bill: { bill_no: '', date: today(), wholesaler: '', gst: '', shipping: '', other: '', paid: '', invoice_pieces: '', notes: '' },
      lines: [{ type: '', size: '', pieces: '', rate: '', suggested_price: '', description: '' }] };
  }

  /* ---------------- helpers ---------------- */
  function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[₹,\s]/g, '')); return isNaN(n) ? 0 : n; }
  function inr(v, dec) { return '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }); }
  function fdate(d) { if (!d) return ''; const p = String(d).split('-'); if (p.length < 3) return d; const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(p[1], 10) - 1]; return p[2] + '-' + m + '-' + p[0].slice(2); }
  function fmonth(m) { const p = String(m).split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(p[1], 10) - 1] + ' ' + p[0]; }
  function normPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2); if (d.length === 11 && d[0] === '0') d = d.slice(1); return d; }
  function codeFor(type, size) { const t = S.lists.types.find(function (x) { return x.type === type; }); return (t ? t.code : 'OT') + '-' + String(size || '').toUpperCase().replace(/\s+/g, ''); }
  function stockOf(code) { code = String(code || '').trim().toUpperCase().replace(/^\*|\*$/g, ''); return S.stock.find(function (s) { return s.code === code; }); }
  function badge(status) { return status === 'OK' ? '<span class="badge green">OK</span>' : status === 'Low' ? '<span class="badge amber">Low</span>' : '<span class="badge red">' + esc(status) + '</span>'; }
  function opts(list, sel, placeholder) {
    return (placeholder !== undefined ? '<option value="">' + esc(placeholder) + '</option>' : '') +
      list.map(function (v) { const val = typeof v === 'object' ? v.value : v; const lab = typeof v === 'object' ? v.label : v; return '<option value="' + esc(val) + '"' + (String(val) === String(sel) ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('');
  }
  function gstOn(date) { const s = S.settings; if (s.gst_registered !== 'Yes') return false; if (!s.gst_date || !date) return true; return String(date) >= String(s.gst_date); }

  function words(n) {
    n = Math.round(n);
    if (n <= 0) return '';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function two(x) { return x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''); }
    const parts = [];
    const cr = Math.floor(n / 10000000); n %= 10000000;
    const lk = Math.floor(n / 100000); n %= 100000;
    const th = Math.floor(n / 1000); n %= 1000;
    const hu = Math.floor(n / 100); n %= 100;
    if (cr) parts.push(two(cr) + ' Crore');
    if (lk) parts.push(two(lk) + ' Lakh');
    if (th) parts.push(two(th) + ' Thousand');
    if (hu) parts.push(a[hu] + ' Hundred');
    if (n) parts.push(two(n));
    return parts.join(' ') + ' Rupees only';
  }

  function toast(msg, err) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, err ? 4500 : 2500);
  }
  function busy(on) { document.getElementById('loading').hidden = !on; }
  function modal(html) { document.getElementById('modalCard').innerHTML = html; document.getElementById('modal').hidden = false; }
  function closeModal() { document.getElementById('modal').hidden = true; document.getElementById('modalCard').innerHTML = ''; }
  document.getElementById('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') { stopScanner(); closeModal(); } });
  function confirmBox(msg, okText, cb) {
    modal('<h3>Please confirm</h3><p>' + esc(msg) + '</p><div class="btn-row"><button class="btn light" id="cNo">Cancel</button><button class="btn danger" id="cYes">' + esc(okText || 'Yes') + '</button></div>');
    document.getElementById('cNo').onclick = closeModal;
    document.getElementById('cYes').onclick = function () { closeModal(); cb(); };
  }
  function vibrate() { try { navigator.vibrate && navigator.vibrate(80); } catch (e) { } }

  /* ---------------- API ---------------- */
  async function api(action, data, opts2) {
    const url = LS.get('api', '');
    if (!url) throw new Error('App is not connected yet');
    if (!(opts2 && opts2.silent)) busy(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ pin: LS.get('pin', ''), user: LS.get('user', ''), action: action, data: data || {} }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Something went wrong');
      return j.data;
    } finally { if (!(opts2 && opts2.silent)) busy(false); }
  }
  async function loadBase(silent) {
    const d = await api('bootstrap', {}, { silent: silent });
    S.settings = d.settings; S.lists = d.lists; S.wholesalers = d.wholesalers; S.customers = d.customers; S.stock = d.stock; S.loaded = true;
    LS.set('cache', JSON.stringify(d));
  }

  /* ---------------- router ---------------- */
  const routes = {};
  function route(name, title, fn, tab) { routes[name] = { title: title, fn: fn, tab: tab || name }; }
  async function render() {
    stopScanner();
    const hash = location.hash.replace(/^#\//, '') || 'home';
    const parts = hash.split('/');
    const name = parts[0];
    if (!LS.get('api', '') || !LS.get('pin', '')) { show('setup', []); return; }
    if (!S.loaded) {
      const c = LS.get('cache', '');
      if (c) { try { const d = JSON.parse(c); Object.assign(S, d); S.loaded = true; } catch (e) { } }
      try { await loadBase(!!c); } catch (e) { if (!S.loaded) { $view.innerHTML = errorCard(e); return; } toast('Offline – showing last saved data', true); }
    }
    show(routes[name] ? name : 'home', parts.slice(1));
  }
  function show(name, args) {
    const r = routes[name] || routes.home;
    document.getElementById('pageTitle').textContent = r.title;
    document.querySelectorAll('#nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.tab === r.tab); });
    document.getElementById('backBtn').hidden = ['home', 'sell', 'stock', 'buy', 'more', 'setup'].indexOf(name) >= 0;
    document.getElementById('nav').style.display = name === 'setup' ? 'none' : '';
    window.scrollTo(0, 0);
    Promise.resolve(r.fn.apply(null, args)).catch(function (e) { $view.innerHTML = errorCard(e); });
  }
  function errorCard(e) {
    return '<div class="card"><h3>Could not load</h3><p class="muted">' + esc(e.message || e) + '</p><button class="btn" onclick="location.reload()">Try again</button> <a class="btn light" href="#/setup">Connection settings</a></div>';
  }
  window.addEventListener('hashchange', render);
  document.getElementById('backBtn').onclick = function () { history.length > 1 ? history.back() : (location.hash = '#/home'); };
  document.getElementById('refreshBtn').onclick = async function () { try { await loadBase(); toast('Updated'); render(); } catch (e) { toast(e.message, true); } };

  /* ================= SETUP ================= */
  route('setup', 'Connect', function () {
    $view.innerHTML = '<div class="card"><h3>Connect this phone</h3>' +
      '<p class="muted">Do this once on each phone. Use the app link and PIN from the setup guide.</p>' +
      '<label class="f">App link (Apps Script web app URL)<input id="sUrl" placeholder="https://script.google.com/macros/s/.../exec" value="' + esc(LS.get('api', '')) + '"></label>' +
      '<label class="f">PIN<input id="sPin" type="password" value="' + esc(LS.get('pin', '')) + '"></label>' +
      '<label class="f">Your name (shown as "Sold by")<input id="sUser" placeholder="e.g. Anurag" value="' + esc(LS.get('user', '')) + '"></label>' +
      '<button class="btn block big" id="sGo">Connect</button></div>';
    document.getElementById('sGo').onclick = async function () {
      const url = document.getElementById('sUrl').value.trim(), pin = document.getElementById('sPin').value.trim(), user = document.getElementById('sUser').value.trim();
      if (!/^https?:\/\//.test(url)) return toast('Paste the full app link starting with https://', true);
      if (!pin || !user) return toast('Enter PIN and your name', true);
      LS.set('api', url); LS.set('pin', pin); LS.set('user', user);
      try { await api('ping'); S.loaded = false; toast('Connected!'); location.hash = '#/home'; render(); }
      catch (e) { toast('Could not connect: ' + e.message, true); }
    };
  });

  /* ================= HOME / DASHBOARD ================= */
  route('home', 'Dashboard', async function () {
    $view.innerHTML = '<div class="empty">Loading…</div>';
    const d = await api('dashboard', {}, { silent: true });
    const k = function (v, l, warn) { return '<div class="kpi' + (warn ? ' warn' : '') + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; };
    let html = '<div class="btn-row" style="margin-bottom:12px"><a class="btn big" href="#/sell">&#9783; New Sale</a><a class="btn big light" href="#/buy">&#10010; New Purchase</a></div>';
    html += '<div class="kpis">' + k(inr(d.sales), 'Sales') + k(inr(d.profit), 'Profit (' + (d.margin * 100).toFixed(1) + '%)') +
      k(d.sold, 'Pieces sold') + k(d.in_stock, 'Pieces in stock') + k(d.orders, 'Customer orders') + k(inr(d.stock_value), 'Stock value (cost)') +
      k(inr(d.invested), 'Money invested') + k(inr(d.owed), 'To pay wholesalers', d.owed > 0) + '</div>';
    html += '<div class="card"><h3>More numbers</h3><table class="t"><tbody>' +
      '<tr><td>Pieces bought</td><td class="n">' + d.bought + '</td></tr>' +
      '<tr><td>Pieces returned</td><td class="n">' + d.returned + '</td></tr>' +
      '<tr><td>Discounts given</td><td class="n">' + inr(d.discounts) + '</td></tr>' +
      '<tr><td>Delivery charges collected</td><td class="n">' + inr(d.delivery) + '</td></tr>' +
      '<tr><td>GST payable</td><td class="n">' + inr(d.gst_payable) + '</td></tr></tbody></table></div>';
    if (d.low_list.length) {
      html += '<div class="card"><h3>Restock soon <span class="badge red">' + d.low_list.length + '</span></h3><ul class="list">' +
        d.low_list.map(function (s) { return '<li onclick="location.hash=\'#/stock\'"><span class="code">' + esc(s.code) + '</span><span class="spacer">' + esc(s.type) + ' · ' + esc(s.size) + '</span><b>' + s.in_stock + '</b>' + badge(s.status) + '</li>'; }).join('') + '</ul></div>';
    }
    html += '<div class="card"><h3>Month-wise</h3>' + (d.months.length ? '<table class="t"><thead><tr><th>Month</th><th class="n">Orders</th><th class="n">Pieces</th><th class="n">Sales</th><th class="n">Profit</th></tr></thead><tbody>' +
      d.months.map(function (m) { return '<tr><td>' + fmonth(m.month) + '</td><td class="n">' + m.orders + '</td><td class="n">' + m.pieces + '</td><td class="n">' + inr(m.sales) + '</td><td class="n">' + inr(m.profit) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty">No sales yet</div>') + '</div>';
    if (d.channels.length) html += '<div class="card"><h3>By channel</h3><table class="t"><thead><tr><th>Channel</th><th class="n">Pieces</th><th class="n">Sales</th><th class="n">Profit</th></tr></thead><tbody>' +
      d.channels.map(function (c) { return '<tr><td>' + esc(c.channel) + '</td><td class="n">' + c.pieces + '</td><td class="n">' + inr(c.sales) + '</td><td class="n">' + inr(c.profit) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    $view.innerHTML = html;
  });

  /* ================= SELL ================= */
  route('sell', 'New Sale', function () { renderSell(); });

  function renderSell() {
    const b = SELL.bill;
    let html = '<div class="card"><h3>1. Items <span class="muted">' + SELL.items.length + ' pcs</span></h3>' +
      '<div class="scanbar"><input id="codeIn" placeholder="Scan or type code e.g. SK-M" autocomplete="off" autocapitalize="characters"><button class="scan-btn" id="camBtn">&#128247; Scan</button></div>';
    if (SELL.items.length) {
      html += '<div style="margin-top:6px">' + SELL.items.map(function (it, i) {
        const st = stockOf(it.code) || {};
        return '<div class="cart-item"><div><div class="t"><span class="code">' + esc(it.code) + '</span> ' + esc(st.type || '') + ' · ' + esc(st.size || '') + '</div>' +
          '<div class="muted small">Suggested ' + inr(st.suggested_price) + ' · in stock ' + (st.in_stock !== undefined ? st.in_stock : '?') + '</div></div>' +
          '<input type="number" inputmode="decimal" class="priceIn' + (it.price === '' ? ' req-missing' : '') + '" data-i="' + i + '" value="' + esc(it.price) + '" placeholder="Price">' +
          '<button class="x-btn" data-del="' + i + '">&times;</button></div>';
      }).join('') + '</div>';
    } else html += '<div class="empty">Scan a barcode with the camera, use the USB scanner, or type the code.</div>';
    html += '</div>';

    // customer
    html += '<div class="card"><h3>2. Customer</h3><div class="seg"><button data-cm="search" class="' + (SELL.custMode === 'search' ? 'on' : '') + '">Repeat customer</button><button data-cm="new" class="' + (SELL.custMode === 'new' ? 'on' : '') + '">New customer</button></div>';
    if (SELL.custMode === 'search') {
      if (SELL.customer) {
        const c = SELL.customer;
        html += '<div class="cust-card"><div class="row"><b>' + esc(c.name) + '</b><span class="spacer"></span><button class="linkbtn" id="custChange">Change</button></div>' +
          '<div class="small">' + esc(c.phone) + '</div><div class="small muted">' + esc([c.address, c.city, c.state, c.pin].filter(Boolean).join(', ') || 'No address saved') + '</div>' +
          '<div class="small muted">' + c.orders + ' orders · ' + inr(c.spent) + ' spent</div></div>';
        if (b.order_type === 'Online' && (!c.address || !c.city || !c.pin)) html += '<p class="small" style="color:var(--red)">Address missing for an online order – choose "New customer" and type the address with the same phone to update it.</p>';
      } else {
        html += '<div class="suggest"><input id="custSearch" placeholder="Type name or phone to search" autocomplete="off"><div class="suggest-list" id="custList" hidden></div></div>' +
          '<p class="muted small">' + S.customers.length + ' customers saved</p>';
      }
    } else {
      const n = SELL.newCust;
      html += '<div class="grid2"><label class="f">Name *<input data-nc="name" value="' + esc(n.name) + '"></label><label class="f">Phone / WhatsApp *<input data-nc="phone" type="tel" inputmode="tel" value="' + esc(n.phone) + '"></label></div>' +
        '<label class="f">Address' + (b.order_type === 'Online' ? ' *' : '') + '<input data-nc="address" value="' + esc(n.address) + '"></label>' +
        '<div class="grid3"><label class="f">City' + (b.order_type === 'Online' ? ' *' : '') + '<input data-nc="city" value="' + esc(n.city) + '"></label><label class="f">State<input data-nc="state" value="' + esc(n.state) + '"></label><label class="f">PIN' + (b.order_type === 'Online' ? ' *' : '') + '<input data-nc="pin" inputmode="numeric" value="' + esc(n.pin) + '"></label></div>' +
        '<p class="muted small">If this phone number already exists, the customer\'s details are updated.</p>';
    }
    html += '</div>';

    // order details
    html += '<div class="card"><h3>3. Order details</h3><div class="seg"><button data-ot="Offline" class="' + (b.order_type === 'Offline' ? 'on' : '') + '">Offline</button><button data-ot="Online" class="' + (b.order_type === 'Online' ? 'on' : '') + '">Online (ship)</button></div>' +
      '<div class="grid2"><label class="f">Date<input type="date" data-b="date" value="' + esc(b.date) + '"></label><label class="f">Channel<select data-b="channel">' + opts(S.lists.channels, b.channel, 'Choose…') + '</select></label></div>';
    if (b.order_type === 'Online') {
      html += '<div class="grid2"><label class="f">Delivery charge (₹)<input type="number" inputmode="decimal" data-b="delivery" value="' + esc(b.delivery) + '"></label><label class="f">Payment<select data-b="payment">' + opts(['Prepaid', 'COD'], b.payment) + '</select></label></div>' +
        '<div class="grid2"><label class="f">Courier<input data-b="courier" value="' + esc(b.courier) + '"></label><label class="f">Tracking no.<input data-b="tracking" value="' + esc(b.tracking) + '"></label></div>';
    }
    html += '<label class="f">Note (optional)<input data-b="notes" value="' + esc(b.notes) + '"></label></div>';

    const sub = SELL.items.reduce(function (a, i) { return a + num(i.price); }, 0);
    const del = b.order_type === 'Online' ? num(b.delivery) : 0;
    html += '<div class="card"><div class="totalbar"><span>Total</span><span>' + inr(sub + del) + '</span></div>' +
      (del ? '<div class="muted small right">Items ' + inr(sub) + ' + delivery ' + inr(del) + '</div>' : '') +
      '<button class="btn block big" id="saveSale" style="margin-top:10px">Save sale &amp; create bill</button>' +
      (SELL.items.length ? '<button class="linkbtn" id="clearSale" style="margin-top:8px;width:100%">Clear and start again</button>' : '') + '</div>';
    $view.innerHTML = html;
    bindSell();
  }

  function addCode(raw) {
    const code = String(raw || '').trim().toUpperCase().replace(/^\*|\*$/g, '');
    if (!code) return;
    const st = stockOf(code);
    if (!st) { toast('Unknown code: ' + code, true); return false; }
    const inCart = SELL.items.filter(function (i) { return i.code === code; }).length;
    SELL.items.push({ code: code, price: st.suggested_price || '' });
    vibrate();
    if (st.in_stock - inCart <= 0) toast(code + ' added – but stock shows 0 left', true); else toast(code + ' added');
    return true;
  }

  function bindSell() {
    const codeIn = document.getElementById('codeIn');
    codeIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (addCode(codeIn.value)) { renderSell(); setTimeout(function () { const c = document.getElementById('codeIn'); c && c.focus(); }, 50); } else codeIn.select(); } });
    document.getElementById('camBtn').onclick = function () { openScanner(function (txt) { if (addCode(txt)) renderSellKeepScanner(); }); };
    document.querySelectorAll('.priceIn').forEach(function (inp) {
      inp.addEventListener('input', function () { SELL.items[+inp.dataset.i].price = inp.value; inp.classList.toggle('req-missing', inp.value === ''); updateTotal(); });
    });
    document.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { SELL.items.splice(+b.dataset.del, 1); renderSell(); }; });
    document.querySelectorAll('[data-cm]').forEach(function (b) { b.onclick = function () { SELL.custMode = b.dataset.cm; renderSell(); }; });
    document.querySelectorAll('[data-ot]').forEach(function (b) { b.onclick = function () { SELL.bill.order_type = b.dataset.ot; renderSell(); }; });
    document.querySelectorAll('[data-nc]').forEach(function (i) { i.addEventListener('input', function () { SELL.newCust[i.dataset.nc] = i.value; }); });
    document.querySelectorAll('[data-b]').forEach(function (i) { i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', function () { SELL.bill[i.dataset.b] = i.value; if (i.dataset.b === 'delivery') updateTotal(); }); });
    const cs = document.getElementById('custSearch');
    if (cs) {
      const list = document.getElementById('custList');
      cs.addEventListener('input', function () {
        const q = cs.value.trim().toLowerCase();
        if (!q) { list.hidden = true; return; }
        const qd = q.replace(/\D/g, '');
        const res = S.customers.filter(function (c) { return String(c.name).toLowerCase().indexOf(q) >= 0 || (qd && String(c.phone).indexOf(qd) >= 0); }).slice(0, 12);
        list.innerHTML = res.length ? res.map(function (c) { return '<div data-ph="' + esc(c.phone) + '"><b>' + esc(c.name) + '</b> – ' + esc(c.phone) + '<div class="muted small">' + esc(c.city || '') + '</div></div>'; }).join('')
          : '<div class="muted">No match – use "New customer"</div>';
        list.hidden = false;
        list.querySelectorAll('[data-ph]').forEach(function (d) { d.onclick = function () { SELL.customer = S.customers.find(function (c) { return String(c.phone) === d.dataset.ph; }); renderSell(); }; });
      });
    }
    const ch = document.getElementById('custChange'); if (ch) ch.onclick = function () { SELL.customer = null; renderSell(); };
    document.getElementById('saveSale').onclick = saveSale;
    const cl = document.getElementById('clearSale'); if (cl) cl.onclick = function () { confirmBox('Clear this sale?', 'Clear', function () { SELL = newSell(); renderSell(); }); };
  }
  function updateTotal() {
    const sub = SELL.items.reduce(function (a, i) { return a + num(i.price); }, 0);
    const del = SELL.bill.order_type === 'Online' ? num(SELL.bill.delivery) : 0;
    const tb = document.querySelector('.totalbar span:last-child'); if (tb) tb.textContent = inr(sub + del);
  }
  function renderSellKeepScanner() {
    const box = document.getElementById('scanCount');
    if (box) box.textContent = SELL.items.length + ' item(s) in this sale';
  }

  async function saveSale() {
    if (!SELL.items.length) return toast('Scan at least one item', true);
    if (SELL.items.some(function (i) { return i.price === '' || isNaN(Number(i.price)); })) return toast('Type the selling price for every item', true);
    let c;
    if (SELL.custMode === 'search') { if (!SELL.customer) return toast('Choose a customer or switch to "New customer"', true); c = SELL.customer; }
    else c = SELL.newCust;
    if (!c.name || !normPhone(c.phone)) return toast('Customer name and phone are required', true);
    if (normPhone(c.phone).length !== 10) return toast('Phone should be 10 digits', true);
    if (SELL.bill.order_type === 'Online' && (!c.address || !c.city || !c.pin)) return toast('Address, city and PIN are needed for online orders', true);
    if (!SELL.bill.channel) return toast('Choose the channel', true);
    try {
      const bill = Object.assign({}, SELL.bill);
      if (bill.order_type !== 'Online') { bill.delivery = 0; bill.courier = ''; bill.tracking = ''; }
      const r = await api('saveSale', { bill: bill, items: SELL.items, customer: { name: c.name, phone: c.phone, address: c.address, city: c.city, state: c.state, pin: c.pin } });
      SELL = newSell();
      toast('Saved – Bill ' + r.bill_no);
      loadBase(true).catch(function () { });
      location.hash = '#/bill/' + r.bill_no;
    } catch (e) { toast(e.message, true); }
  }

  /* ---------------- camera scanner ---------------- */
  let scanner = null;
  function openScanner(onCode) {
    modal('<h3>Scan barcode</h3><div id="reader"></div><p class="muted small center" id="scanCount">' + SELL.items.length + ' item(s) in this sale</p>' +
      '<p class="muted small center">Hold the label flat, 10–20 cm from the camera.</p><button class="btn block" id="scanDone">Done</button>');
    document.getElementById('scanDone').onclick = function () { stopScanner(); closeModal(); if (location.hash.indexOf('sell') >= 0) renderSell(); };
    if (typeof Html5Qrcode === 'undefined') { toast('Scanner library not loaded – check internet', true); return; }
    const F = Html5QrcodeSupportedFormats;
    let last = '', lastT = 0;
    scanner = new Html5Qrcode('reader', { formatsToSupport: [F.CODE_39, F.CODE_128, F.EAN_13, F.QR_CODE], experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false });
    scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: function (w, h) { return { width: Math.min(w * 0.9, 340), height: Math.min(h * 0.45, 140) }; } },
      function (txt) {
        const now = Date.now();
        if (txt === last && now - lastT < 2000) return;
        last = txt; lastT = now;
        onCode(txt);
      }, function () { }).catch(function (e) { toast('Camera not available: ' + (e && e.message ? e.message : e), true); });
  }
  function stopScanner() {
    if (scanner) { const s = scanner; scanner = null; try { s.stop().then(function () { s.clear(); }).catch(function () { }); } catch (e) { } }
  }

  /* ================= BILL VIEW ================= */
  route('bill', 'Bill', async function (no) {
    $view.innerHTML = '<div class="empty">Loading bill…</div>';
    const b = await api('getSale', { bill_no: no }, { silent: true });
    const online = b.order_type === 'Online';
    let html = '<div class="btn-row" style="margin-bottom:12px"><button class="btn" id="bPrint">&#128424; Print</button><button class="btn light" id="bPdf">Share PDF</button>' +
      '<button class="btn light" id="bWa">WhatsApp</button>' + (online ? '<a class="btn ghost" href="#/label/' + esc(b.bill_no) + '">Shipping label</a>' : '') + '</div>';
    html += '<div id="billDoc">' + billHtml(b) + '</div>';
    html += '<div class="card" style="margin-top:12px"><h3>Manage this bill</h3>';
    if (online) html += '<div class="grid2"><label class="f">Courier<input id="eCourier" value="' + esc(b.courier) + '"></label><label class="f">Tracking no.<input id="eTrack" value="' + esc(b.tracking) + '"></label></div>' +
      '<label class="f">Payment<select id="ePay">' + opts(['Prepaid', 'COD'], b.payment) + '</select></label><button class="btn light block" id="eSave">Save shipping details</button><hr>';
    html += '<p class="muted small">Returned item? Tap it to mark / unmark.</p><ul class="list">' + b.items.map(function (i, idx) {
      return '<li data-ret="' + idx + '"><span class="code">' + esc(i.code) + '</span><span class="spacer">' + esc(i.type) + ' · ' + esc(i.size) + ' · ' + inr(i.price) + '</span>' + (i.returned ? '<span class="badge red">Returned</span>' : '<span class="badge">Sold</span>') + '</li>';
    }).join('') + '</ul><hr><div class="muted small">Sold by ' + esc(b.sold_by || '-') + ' · Profit ' + inr(b.profit) + '</div>' +
      '<button class="btn danger block" id="bDel" style="margin-top:10px">Delete this bill</button></div>';
    $view.innerHTML = html;
    document.getElementById('bPrint').onclick = function () { printHtml(billHtml(b), 'bill'); };
    document.getElementById('bPdf').onclick = function () { shareBillPdf(b); };
    document.getElementById('bWa').onclick = function () { window.open(waLink(b), '_blank'); };
    if (online) document.getElementById('eSave').onclick = async function () {
      try { await api('updateSale', { bill_no: b.bill_no, fields: { courier: val('eCourier'), tracking: val('eTrack'), payment: val('ePay') } }); toast('Saved'); render(); } catch (e) { toast(e.message, true); }
    };
    document.querySelectorAll('[data-ret]').forEach(function (li) {
      li.onclick = function () {
        const i = b.items[+li.dataset.ret];
        confirmBox((i.returned ? 'Mark ' + i.code + ' as NOT returned?' : 'Mark ' + i.code + ' as returned? It goes back into stock.'), 'Yes', async function () {
          try { await api('setReturned', { bill_no: b.bill_no, index: +li.dataset.ret, returned: !i.returned }); await loadBase(true); render(); } catch (e) { toast(e.message, true); }
        });
      };
    });
    document.getElementById('bDel').onclick = function () {
      confirmBox('Delete bill ' + b.bill_no + '? Items go back into stock. This cannot be undone.', 'Delete', async function () {
        try { await api('deleteSale', { bill_no: b.bill_no }); await loadBase(true); toast('Deleted'); location.hash = '#/sales'; } catch (e) { toast(e.message, true); }
      });
    };
  });
  function val(id) { const e = document.getElementById(id); return e ? e.value : ''; }

  function billHtml(b) {
    const s = S.settings;
    const tax = b.tax_invoice;
    const rows = b.items.map(function (i, idx) {
      const disc = Math.max(0, num(i.suggested_price) - i.price);
      const mrp = Math.max(num(i.suggested_price), i.price);
      return '<tr><td>' + (idx + 1) + '</td><td class="l">' + esc(i.type) + (i.returned ? ' <span class="returned-tag">(returned)</span>' : '') + '</td><td>' + esc(i.size) + '</td><td>' + esc(i.code) + '</td><td>1</td>' +
        '<td class="n">' + Number(mrp).toLocaleString('en-IN') + '</td><td class="n">' + (disc ? Number(disc).toLocaleString('en-IN') : '') + '</td><td class="n">' + Number(i.price).toLocaleString('en-IN') + '</td></tr>';
    }).join('');
    const addr = [b.address, [b.city, b.state].filter(Boolean).join(', ') + (b.pin ? ' – ' + b.pin : '')].filter(function (x) { return x && x.trim(); });
    return '<div class="doc bill-doc">' +
      '<div class="bill-head"><img src="logo.png" alt="logo"><div class="bill-title"><h1>' + (tax ? 'TAX INVOICE' : 'BILL') + '</h1>' +
      '<div><b>Bill No:</b> ' + esc(b.bill_no) + '</div><div><b>Date:</b> ' + fdate(b.date) + '</div></div></div>' +
      '<div class="bill-sub">' + esc(s.city) + ' &nbsp;·&nbsp; WhatsApp: ' + esc(s.whatsapp) + ' &nbsp;·&nbsp; Instagram: ' + esc(s.instagram) + '</div>' +
      (tax && s.gstin ? '<div class="bill-gstin">GSTIN: ' + esc(s.gstin) + '</div>' : '') + '<hr class="bill-rule">' +
      '<div class="bill-to"><div><div class="lbl">BILL TO</div><div style="font-size:15px;font-weight:700">' + esc(b.name) + '</div><div>Phone: ' + esc(b.phone) + '</div>' +
      addr.map(function (a) { return '<div>' + esc(a) + '</div>'; }).join('') + '</div>' +
      '<div style="text-align:right"><div><b>Order:</b> ' + esc(b.order_type) + '</div><div><b>Payment:</b> ' + esc(b.payment) + '</div>' + (b.channel ? '<div><b>Channel:</b> ' + esc(b.channel) + '</div>' : '') + '</div></div>' +
      '<table class="bill-items"><thead><tr><th>#</th><th>Item</th><th>Size</th><th>Code</th><th>Qty</th><th>Price (₹)</th><th>Discount (₹)</th><th>Amount (₹)</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="bill-totals"><div><span>Subtotal</span><span>' + inr(b.subtotal) + '</span></div>' + (b.delivery ? '<div><span>Delivery charge</span><span>' + inr(b.delivery) + '</span></div>' : '') +
      '<div class="grand"><span>TOTAL</span><span>' + inr(b.total) + '</span></div>' + (b.gst > 0 ? '<div class="small" style="justify-content:flex-end">Prices include GST of ' + inr(b.gst, true) + '</div>' : '') + '</div>' +
      '<div class="bill-words">Amount in words: ' + words(b.total) + '</div>' +
      '<div class="bill-foot"><div>' + esc(s.footer) + '</div><div class="thanks">' + esc(s.thanks) + '</div><div style="color:#888;font-size:9px;margin-top:4px">This is a computer-generated bill.</div></div></div>';
  }

  function waLink(b) {
    const s = S.settings;
    const lines = ['*' + s.business_name + '* – Bill ' + b.bill_no + ' (' + fdate(b.date) + ')', ''];
    b.items.forEach(function (i, idx) { lines.push((idx + 1) + '. ' + i.type + ' (' + i.size + ') – ' + inr(i.price) + (i.returned ? ' (returned)' : '')); });
    if (b.delivery) lines.push('Delivery – ' + inr(b.delivery));
    lines.push('*Total: ' + inr(b.total) + '*' + (b.payment === 'COD' ? ' (COD)' : ''));
    if (b.courier || b.tracking) lines.push('', 'Courier: ' + (b.courier || '') + (b.tracking ? ' – Tracking: ' + b.tracking : ''));
    lines.push('', s.footer, s.thanks);
    return 'https://wa.me/91' + normPhone(b.phone) + '?text=' + encodeURIComponent(lines.join('\n'));
  }

  async function shareBillPdf(b) {
    if (typeof html2pdf === 'undefined') return toast('PDF tool not loaded – check internet', true);
    busy(true);
    try {
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff';
      holder.innerHTML = billHtml(b);
      document.body.appendChild(holder);
      const blob = await html2pdf().set({ margin: 8, filename: 'Bill-' + b.bill_no + '.pdf', image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4' } })
        .from(holder.firstChild).outputPdf('blob');
      holder.remove();
      const file = new File([blob], 'Avantikaar-Bill-' + b.bill_no + '.pdf', { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        busy(false);
        await navigator.share({ files: [file], title: 'Bill ' + b.bill_no, text: S.settings.business_name + ' bill ' + b.bill_no });
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        toast('PDF downloaded');
      }
    } catch (e) { if (e && e.name !== 'AbortError') toast('PDF failed: ' + e.message, true); }
    finally { busy(false); }
  }

  /* ---------------- printing ---------------- */
  function printHtml(html, kind) {
    const root = document.getElementById('print-root');
    root.innerHTML = html;
    let st = document.getElementById('pageStyle');
    if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
    st.textContent = kind === 'barcodes' ? '@page { size: A4 portrait; margin: 0; }' : '@page { size: A4 portrait; margin: 10mm; }';
    document.body.classList.add('printing');
    const imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    Promise.all(imgs.map(function (im) { return im.complete ? 1 : new Promise(function (r) { im.onload = im.onerror = r; }); })).then(function () {
      setTimeout(function () {
        window.print();
        setTimeout(function () { document.body.classList.remove('printing'); root.innerHTML = ''; }, 500);
      }, 100);
    });
  }

  /* ================= SHIPPING LABEL ================= */
  route('label', 'Shipping Label', async function (no) {
    const b = await api('getSale', { bill_no: no });
    if (b.order_type !== 'Online') { $view.innerHTML = '<div class="card"><h3>Offline order</h3><p>Bill ' + esc(no) + ' is an offline order – no shipping label needed.</p></div>'; return; }
    const missing = !b.address || !b.city || !b.pin;
    $view.innerHTML = (missing ? '<div class="card" style="border-color:var(--red)"><b style="color:var(--red)">Address incomplete.</b> Update the customer in More → Customers.</div>' : '') +
      '<div class="btn-row" style="margin-bottom:12px"><button class="btn" id="lPrint">&#128424; Print label</button></div>' + labelHtml(b) +
      '<p class="muted small center">Prints on the top half of an A4 sheet – use half-A4 sticker paper.</p>';
    document.getElementById('lPrint').onclick = function () { printHtml(labelHtml(b), 'label'); };
  });
  function labelHtml(b) {
    const s = S.settings;
    const count = b.items.filter(function (i) { return !i.returned; }).length;
    return '<div class="ship-label"><div class="lbl">SHIP TO:</div><div class="to-name">' + esc(b.name) + '</div><div class="to-addr">' + esc(b.address) + '</div>' +
      '<div class="to-city">' + esc([b.city, b.state].filter(Boolean).join(', ')) + (b.pin ? ' – ' + esc(b.pin) : '') + '</div><div class="to-phone">Mobile: ' + esc(b.phone) + '</div>' +
      '<div class="meta"><span>Bill No: ' + esc(b.bill_no) + ' &nbsp; Items: ' + count + '</span><span>' + (b.courier ? 'Courier: ' + esc(b.courier) : '') + (b.tracking ? ' · ' + esc(b.tracking) : '') + '</span></div>' +
      '<div class="pay">' + (b.payment === 'COD' ? 'COD – COLLECT ' + inr(b.total) : 'PREPAID') + '</div>' +
      '<div class="from"><div><div class="lbl">FROM:</div><b>' + esc(s.business_name) + '</b><div>' + esc(s.city) + '</div><div>WhatsApp: ' + esc(s.whatsapp) + '</div><div>Instagram: ' + esc(s.instagram) + '</div></div><img src="logo.png" alt=""></div></div>';
  }

  /* ================= SALES HISTORY ================= */
  route('sales', 'Sales & Bills', async function () {
    const list = await api('listSales', {}, { silent: false });
    let q = '';
    function draw() {
      const ql = q.toLowerCase();
      const rows = list.filter(function (b) { return !ql || String(b.bill_no).indexOf(ql) >= 0 || String(b.name).toLowerCase().indexOf(ql) >= 0 || String(b.phone).indexOf(ql) >= 0; });
      document.getElementById('salesList').innerHTML = rows.length ? rows.map(function (b) {
        return '<li onclick="location.hash=\'#/bill/' + esc(b.bill_no) + '\'"><div class="spacer"><div class="t">#' + esc(b.bill_no) + ' · ' + esc(b.name) + '</div><div class="muted small">' + fdate(b.date) + ' · ' + b.items.length + ' pcs · ' + esc(b.channel) + '</div></div>' +
          '<div class="right"><b>' + inr(b.total) + '</b><div>' + (b.order_type === 'Online' ? '<span class="badge">' + esc(b.payment) + '</span>' : '<span class="badge green">Offline</span>') + '</div></div></li>';
      }).join('') : '<div class="empty">No bills</div>';
    }
    $view.innerHTML = '<div class="card"><input id="sq" placeholder="Search bill no, name or phone"></div><div class="card"><ul class="list" id="salesList"></ul></div>';
    document.getElementById('sq').addEventListener('input', function (e) { q = e.target.value.trim(); draw(); });
    draw();
  });

  /* ================= STOCK ================= */
  route('stock', 'Stock', function () {
    let q = '', type = '', onlyIn = false;
    function draw() {
      const ql = q.toLowerCase();
      const rows = S.stock.filter(function (s) {
        return (!type || s.type === type) && (!onlyIn || s.in_stock > 0) && (!ql || s.code.toLowerCase().indexOf(ql) >= 0 || String(s.type).toLowerCase().indexOf(ql) >= 0);
      });
      const pcs = rows.reduce(function (a, s) { return a + Math.max(0, s.in_stock); }, 0);
      const val2 = rows.reduce(function (a, s) { return a + Math.max(0, s.stock_value); }, 0);
      document.getElementById('stockSum').textContent = rows.length + ' items · ' + pcs + ' pcs · ' + inr(val2) + ' at cost';
      document.getElementById('stockList').innerHTML = rows.length ? rows.map(function (s) {
        return '<li data-code="' + esc(s.code) + '"><div class="spacer"><div class="t"><span class="code">' + esc(s.code) + '</span> ' + esc(s.type) + ' · ' + esc(s.size) + '</div>' +
          '<div class="muted small">Cost ' + inr(s.avg_cost, true) + ' · Price ' + inr(s.suggested_price) + ' · Sold ' + s.sold + '/' + s.bought + '</div></div>' +
          '<div class="right"><b style="font-size:18px">' + s.in_stock + '</b><div>' + badge(s.status) + '</div></div></li>';
      }).join('') : '<div class="empty">' + (S.stock.length ? 'No match' : 'No stock yet – add a purchase first') + '</div>';
      document.querySelectorAll('#stockList [data-code]').forEach(function (li) { li.onclick = function () { stockDetail(li.dataset.code); }; });
    }
    const types = Array.from(new Set(S.stock.map(function (s) { return s.type; })));
    $view.innerHTML = '<div class="card"><input id="stq" placeholder="Search code or type"><div class="chips" style="margin-top:10px"><span class="chip on" data-t="">All</span>' +
      types.map(function (t) { return '<span class="chip" data-t="' + esc(t) + '">' + esc(t) + '</span>'; }).join('') + '</div>' +
      '<label class="row small"><input type="checkbox" id="onlyIn" style="width:auto"> Only items in stock</label></div>' +
      '<div class="card"><div class="muted small" id="stockSum"></div><ul class="list" id="stockList"></ul></div>';
    document.getElementById('stq').addEventListener('input', function (e) { q = e.target.value.trim(); draw(); });
    document.getElementById('onlyIn').onchange = function (e) { onlyIn = e.target.checked; draw(); };
    document.querySelectorAll('.chip').forEach(function (c) { c.onclick = function () { document.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); }); c.classList.add('on'); type = c.dataset.t; draw(); }; });
    draw();
  });
  function stockDetail(code) {
    const s = stockOf(code);
    modal('<h3><span class="code">' + esc(s.code) + '</span> ' + esc(s.type) + ' · ' + esc(s.size) + '</h3><table class="t"><tbody>' +
      '<tr><td>In stock</td><td class="n"><b>' + s.in_stock + '</b></td></tr><tr><td>Bought</td><td class="n">' + s.bought + '</td></tr><tr><td>Sold</td><td class="n">' + s.sold + '</td></tr><tr><td>Returned</td><td class="n">' + s.returned + '</td></tr>' +
      '<tr><td>Real cost / pc</td><td class="n">' + inr(s.avg_cost, true) + '</td></tr><tr><td>Suggested price</td><td class="n">' + inr(s.suggested_price) + '</td></tr><tr><td>Margin / pc</td><td class="n">' + inr(s.margin, true) + '</td></tr>' +
      '<tr><td>Stock value</td><td class="n">' + inr(s.stock_value) + '</td></tr></tbody></table>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn light" id="sdLbl">Print labels</button><button class="btn" id="sdClose">Close</button></div>');
    document.getElementById('sdClose').onclick = closeModal;
    document.getElementById('sdLbl').onclick = function () { closeModal(); location.hash = '#/barcodes/code/' + encodeURIComponent(s.code); };
  }

  /* ================= BUY (purchase entry) ================= */
  route('buy', 'New Purchase', function () { renderBuy(); });
  function renderBuy() {
    const b = BUY.bill;
    if (!S.wholesalers.length) {
      $view.innerHTML = '<div class="card"><h3>Add a wholesaler first</h3><p class="muted">You need at least one wholesaler before entering a purchase bill.</p><button class="btn block" id="addW">Add wholesaler</button></div>';
      document.getElementById('addW').onclick = function () { wholesalerForm(null, renderBuy); };
      return;
    }
    let html = '<div class="card"><h3>Invoice details</h3><div class="grid2"><label class="f">Bill / Invoice no. *<input data-bb="bill_no" value="' + esc(b.bill_no) + '"></label><label class="f">Bill date *<input type="date" data-bb="date" value="' + esc(b.date) + '"></label></div>' +
      '<label class="f">Wholesaler * <button class="linkbtn small" id="newW" style="float:right">+ New wholesaler</button><select data-bb="wholesaler">' + opts(S.wholesalers.map(function (w) { return w.name; }), b.wholesaler, 'Choose…') + '</select></label>' +
      '<div class="grid3"><label class="f">GST on bill (₹)<input type="number" inputmode="decimal" data-bb="gst" value="' + esc(b.gst) + '"></label><label class="f">Shipping (₹)<input type="number" inputmode="decimal" data-bb="shipping" value="' + esc(b.shipping) + '"></label><label class="f">Other (₹)<input type="number" inputmode="decimal" data-bb="other" value="' + esc(b.other) + '"></label></div>' +
      '<div class="grid2"><label class="f">Amount paid (₹)<input type="number" inputmode="decimal" data-bb="paid" value="' + esc(b.paid) + '"></label><label class="f">Total pieces on invoice<input type="number" inputmode="numeric" data-bb="invoice_pieces" value="' + esc(b.invoice_pieces) + '"></label></div>' +
      '<label class="f">Notes<input data-bb="notes" value="' + esc(b.notes) + '"></label></div>';
    html += '<div class="card"><h3>Items (one row per type + size)</h3>' + BUY.lines.map(function (l, i) {
      return '<div class="pline"><div class="row"><b class="small">Line ' + (i + 1) + (l.type && l.size ? ' · <span class="code">' + esc(codeFor(l.type, l.size)) + '</span>' : '') + '</b><span class="spacer"></span>' + (BUY.lines.length > 1 ? '<button class="x-btn" data-ldel="' + i + '" style="width:34px">&times;</button>' : '') + '</div>' +
        '<div class="grid2"><label class="f">Clothing type<select data-l="type" data-i="' + i + '">' + opts(S.lists.types.map(function (t) { return t.type; }), l.type, 'Choose…') + '</select></label>' +
        '<label class="f">Size<select data-l="size" data-i="' + i + '">' + opts(S.lists.sizes, l.size, 'Choose…') + '</select></label></div>' +
        '<div class="grid3"><label class="f">Pieces<input type="number" inputmode="numeric" data-l="pieces" data-i="' + i + '" value="' + esc(l.pieces) + '"></label>' +
        '<label class="f">Rate/pc (₹)<input type="number" inputmode="decimal" data-l="rate" data-i="' + i + '" value="' + esc(l.rate) + '"></label>' +
        '<label class="f">Sell price (₹)<input type="number" inputmode="decimal" data-l="suggested_price" data-i="' + i + '" value="' + esc(l.suggested_price) + '"></label></div>' +
        '<label class="f">Description (optional)<input data-l="description" data-i="' + i + '" value="' + esc(l.description) + '"></label>' +
        '<div class="muted small" id="lineInfo' + i + '"></div></div>';
    }).join('') + '<div class="btn-row"><button class="btn light" id="addLine">+ Add line</button><button class="btn light" id="dupLine">+ Same item, next size</button></div></div>';
    html += '<div class="card" id="buySummary"></div><button class="btn block big" id="saveBuy">Save purchase</button><div style="height:10px"></div>';
    $view.innerHTML = html;
    document.querySelectorAll('[data-bb]').forEach(function (i) { i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', function () { BUY.bill[i.dataset.bb] = i.value; buySummary(); }); });
    document.querySelectorAll('[data-l]').forEach(function (i) {
      i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', function () { BUY.lines[+i.dataset.i][i.dataset.l] = i.value; if (i.tagName === 'SELECT') renderBuy(); else buySummary(); });
    });
    document.querySelectorAll('[data-ldel]').forEach(function (b2) { b2.onclick = function () { BUY.lines.splice(+b2.dataset.ldel, 1); renderBuy(); }; });
    document.getElementById('addLine').onclick = function () { BUY.lines.push({ type: '', size: '', pieces: '', rate: '', suggested_price: '', description: '' }); renderBuy(); };
    document.getElementById('dupLine').onclick = function () { const l = BUY.lines[BUY.lines.length - 1]; BUY.lines.push({ type: l.type, size: '', pieces: '', rate: l.rate, suggested_price: l.suggested_price, description: l.description }); renderBuy(); };
    document.getElementById('newW').onclick = function (e) { e.preventDefault(); wholesalerForm(null, function (name) { BUY.bill.wholesaler = name; renderBuy(); }); };
    document.getElementById('saveBuy').onclick = saveBuy;
    buySummary();
  }
  function buySummary() {
    const b = BUY.bill;
    let goods = 0, pcs = 0;
    BUY.lines.forEach(function (l) { goods += num(l.pieces) * num(l.rate); pcs += num(l.pieces); });
    const claim = gstOn(b.date);
    const extra = (claim ? 0 : num(b.gst)) + num(b.shipping) + num(b.other);
    const pct = goods ? extra / goods : 0;
    BUY.lines.forEach(function (l, i) {
      const el = document.getElementById('lineInfo' + i);
      if (el) el.textContent = num(l.rate) ? 'Real cost / pc: ' + inr(num(l.rate) * (1 + pct), true) + (num(l.suggested_price) ? '  ·  margin ' + inr(num(l.suggested_price) - num(l.rate) * (1 + pct), true) : '') : '';
    });
    const total = goods + num(b.gst) + num(b.shipping) + num(b.other);
    const inv = b.invoice_pieces === '' ? null : num(b.invoice_pieces);
    document.getElementById('buySummary').innerHTML = '<h3>Summary</h3><table class="t"><tbody>' +
      '<tr><td>Pieces</td><td class="n">' + pcs + (inv === null ? '' : inv === pcs ? ' <span class="badge green">✔ matches invoice</span>' : ' <span class="badge red">✖ invoice says ' + inv + '</span>') + '</td></tr>' +
      '<tr><td>Goods value</td><td class="n">' + inr(goods) + '</td></tr><tr><td>GST + shipping + other</td><td class="n">' + inr(num(b.gst) + num(b.shipping) + num(b.other)) + '</td></tr>' +
      '<tr><td><b>Total cost</b></td><td class="n"><b>' + inr(total) + '</b></td></tr><tr><td>Balance to pay</td><td class="n">' + inr(total - num(b.paid)) + '</td></tr>' +
      '<tr><td class="muted small" colspan="2">' + (claim ? 'GST registered – GST is claimable, so it is not added to cost.' : 'Not GST registered – GST is added to the cost of each piece.') + ' Extra cost spread: ' + (pct * 100).toFixed(2) + '%</td></tr></tbody></table>';
  }
  async function saveBuy() {
    const b = BUY.bill;
    if (!b.bill_no || !b.date || !b.wholesaler) return toast('Bill no., date and wholesaler are required', true);
    const lines = BUY.lines.filter(function (l) { return l.type || l.size || l.pieces; });
    if (!lines.length) return toast('Add at least one item line', true);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.type || !l.size || !num(l.pieces) || !num(l.rate)) return toast('Line ' + (i + 1) + ': type, size, pieces and rate are required', true);
    }
    try {
      const r = await api('savePurchase', { bill: b, lines: lines });
      BUY = newBuy();
      await loadBase(true);
      modal('<h3>Purchase saved ✔</h3><p>Stock and real cost per piece are updated.</p><div class="btn-row"><button class="btn" id="goLbl">Print barcode labels</button><button class="btn light" id="goDone">Done</button></div>');
      document.getElementById('goLbl').onclick = function () { closeModal(); location.hash = '#/barcodes/bill/' + encodeURIComponent(r.bill_key); };
      document.getElementById('goDone').onclick = function () { closeModal(); location.hash = '#/purchases'; };
    } catch (e) { toast(e.message, true); }
  }

  /* ================= PURCHASE BILLS ================= */
  route('purchases', 'Purchase Bills', async function () {
    const list = await api('listPurchases');
    $view.innerHTML = '<div class="card"><ul class="list">' + (list.length ? list.map(function (b, i) {
      return '<li data-i="' + i + '"><div class="spacer"><div class="t">' + esc(b.bill_no) + ' · ' + esc(b.wholesaler) + '</div><div class="muted small">' + fdate(b.date) + ' · ' + b.pieces + ' pcs' +
        (b.pieces_ok === false ? ' · <span style="color:var(--red)">pieces don\'t match invoice</span>' : '') + '</div></div><div class="right"><b>' + inr(b.total) + '</b><div>' +
        (b.balance <= 0 ? '<span class="badge green">Paid</span>' : b.paid > 0 ? '<span class="badge amber">Due ' + inr(b.balance) + '</span>' : '<span class="badge red">Due ' + inr(b.balance) + '</span>') + '</div></div></li>';
    }).join('') : '<div class="empty">No purchase bills yet</div>') + '</ul></div>';
    document.querySelectorAll('[data-i]').forEach(function (li) { li.onclick = function () { purchaseDetail(list[+li.dataset.i]); }; });
  });
  function purchaseDetail(b) {
    modal('<h3>' + esc(b.bill_no) + ' · ' + esc(b.wholesaler) + '</h3><div class="muted small">' + fdate(b.date) + (b.created_by ? ' · entered by ' + esc(b.created_by) : '') + '</div>' +
      '<table class="t" style="margin-top:8px"><thead><tr><th>Code</th><th class="n">Pcs</th><th class="n">Rate</th><th class="n">Real cost</th></tr></thead><tbody>' +
      b.lines.map(function (l) { return '<tr><td class="code">' + esc(l.code) + '</td><td class="n">' + l.pieces + '</td><td class="n">' + inr(l.rate) + '</td><td class="n">' + inr(l.real_cost, true) + '</td></tr>'; }).join('') +
      '</tbody></table><table class="t"><tbody><tr><td>Goods</td><td class="n">' + inr(b.goods) + '</td></tr><tr><td>GST</td><td class="n">' + inr(b.gst) + '</td></tr><tr><td>Shipping</td><td class="n">' + inr(b.shipping) + '</td></tr><tr><td>Other</td><td class="n">' + inr(b.other) + '</td></tr>' +
      '<tr><td><b>Total</b></td><td class="n"><b>' + inr(b.total) + '</b></td></tr><tr><td>Balance</td><td class="n">' + inr(b.balance) + '</td></tr></tbody></table>' +
      '<label class="f" style="margin-top:10px">Amount paid (₹)<input id="pdPaid" type="number" inputmode="decimal" value="' + esc(b.paid) + '"></label>' +
      '<div class="btn-row"><button class="btn" id="pdSave">Update paid</button><button class="btn light" id="pdLbl">Print labels</button></div>' +
      '<div class="btn-row" style="margin-top:8px"><button class="btn danger" id="pdDel">Delete bill</button><button class="btn light" id="pdClose">Close</button></div>');
    document.getElementById('pdClose').onclick = closeModal;
    document.getElementById('pdSave').onclick = async function () { try { await api('updatePurchasePaid', { bill_key: b.bill_key, paid: val('pdPaid') }); closeModal(); toast('Updated'); render(); } catch (e) { toast(e.message, true); } };
    document.getElementById('pdLbl').onclick = function () { closeModal(); location.hash = '#/barcodes/bill/' + encodeURIComponent(b.bill_key); };
    document.getElementById('pdDel').onclick = function () {
      confirmBox('Delete purchase bill ' + b.bill_no + '? Its pieces are removed from stock.', 'Delete', async function () {
        try { await api('deletePurchase', { bill_key: b.bill_key }); await loadBase(true); toast('Deleted'); render(); } catch (e) { toast(e.message, true); }
      });
    };
  }

  /* ================= BARCODE LABELS ================= */
  route('barcodes', 'Barcode Labels', async function (mode, key) {
    let rows = [];
    let purchases = [];
    try { purchases = await api('listPurchases', {}, { silent: true }); } catch (e) { }
    if (mode === 'bill' && key) {
      const b = purchases.find(function (p) { return p.bill_key === decodeURIComponent(key); });
      if (b) rows = b.lines.map(function (l) { return { code: l.code, n: l.pieces }; });
    } else if (mode === 'code' && key) rows = [{ code: decodeURIComponent(key), n: 1 }];
    function draw() {
      const total = rows.reduce(function (a, r) { return a + num(r.n); }, 0);
      document.getElementById('bcRows').innerHTML = rows.map(function (r, i) {
        const st = stockOf(r.code) || {};
        return '<div class="cart-item" style="grid-template-columns:1fr 80px 34px"><div><span class="code">' + esc(r.code) + '</span> <span class="muted small">' + esc(st.type || '?') + ' · ' + esc(st.size || '') + ' · ' + inr(st.suggested_price) + '</span></div>' +
          '<input type="number" inputmode="numeric" data-bn="' + i + '" value="' + esc(r.n) + '"><button class="x-btn" data-bd="' + i + '">&times;</button></div>';
      }).join('') || '<div class="empty">Choose a purchase bill or add codes</div>';
      document.getElementById('bcTotal').textContent = total + ' labels · ' + Math.ceil(total / 24) + ' A4 sheet(s)';
      document.querySelectorAll('[data-bn]').forEach(function (i) { i.addEventListener('input', function () { rows[+i.dataset.bn].n = i.value; document.getElementById('bcTotal').textContent = rows.reduce(function (a, r) { return a + num(r.n); }, 0) + ' labels'; }); });
      document.querySelectorAll('[data-bd]').forEach(function (b) { b.onclick = function () { rows.splice(+b.dataset.bd, 1); draw(); }; });
    }
    $view.innerHTML = '<div class="card"><h3>What to print</h3><label class="f">From a purchase bill<select id="bcBill">' +
      opts(purchases.map(function (p) { return { value: p.bill_key, label: p.bill_no + ' · ' + p.wholesaler + ' (' + p.pieces + ' pcs)' }; }), mode === 'bill' ? decodeURIComponent(key || '') : '', 'Choose a bill…') + '</select></label>' +
      '<div class="row"><select id="bcCode">' + opts(S.stock.map(function (s) { return s.code; }), '', 'Add a single code…') + '</select><button class="btn light" id="bcAdd">Add</button></div></div>' +
      '<div class="card"><h3>Labels <span class="muted" id="bcTotal"></span></h3><div id="bcRows"></div></div>' +
      '<button class="btn block big" id="bcPrint">&#128424; Print labels</button><p class="muted small center">A4 sticker sheet, 24 labels (3 × 8, 70 × 37 mm). Print from the laptop at 100% / "Actual size" for exact alignment.</p>';
    document.getElementById('bcBill').onchange = function (e) { const b = purchases.find(function (p) { return p.bill_key === e.target.value; }); rows = b ? b.lines.map(function (l) { return { code: l.code, n: l.pieces }; }) : []; draw(); };
    document.getElementById('bcAdd').onclick = function () { const c = val('bcCode'); if (c) { rows.push({ code: c, n: 1 }); draw(); } };
    document.getElementById('bcPrint').onclick = function () {
      const codes = [];
      rows.forEach(function (r) { for (let i = 0; i < num(r.n); i++) codes.push(r.code); });
      if (!codes.length) return toast('Nothing to print', true);
      printHtml(barcodeSheets(codes), 'barcodes');
    };
    draw();
  });
  function barcodeSheets(codes) {
    let html = '';
    for (let p = 0; p < codes.length; p += 24) {
      html += '<div class="bc-sheet">';
      for (let i = p; i < p + 24; i++) {
        const c = codes[i];
        if (!c) { html += '<div class="bc-cell"></div>'; continue; }
        const st = stockOf(c) || {};
        let svg = '';
        try {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          JsBarcode(el, c, { format: 'CODE39', displayValue: false, margin: 0, height: 50, width: 2 });
          el.setAttribute('preserveAspectRatio', 'none');
          svg = el.outerHTML;
        } catch (e) { svg = '<div>' + esc(c) + '</div>'; }
        html += '<div class="bc-cell"><div class="n">' + esc(st.type || '') + ' | Size ' + esc(st.size || '') + '</div>' + svg + '<div class="c">' + esc(c) + ' &nbsp; ' + inr(st.suggested_price) + '</div></div>';
      }
      html += '</div>';
    }
    return html;
  }

  /* ================= CUSTOMERS ================= */
  route('customers', 'Customers', function () {
    let q = '';
    function draw() {
      const ql = q.toLowerCase(), qd = q.replace(/\D/g, '');
      const rows = S.customers.filter(function (c) { return !ql || String(c.name).toLowerCase().indexOf(ql) >= 0 || (qd && String(c.phone).indexOf(qd) >= 0); });
      document.getElementById('custRows').innerHTML = rows.length ? rows.map(function (c) {
        return '<li data-ph="' + esc(c.phone) + '"><div class="spacer"><div class="t">' + esc(c.name) + '</div><div class="muted small">' + esc(c.phone) + ' · ' + esc(c.city || 'no city') + '</div></div><div class="right"><b>' + inr(c.spent) + '</b><div class="muted small">' + c.orders + ' orders</div></div></li>';
      }).join('') : '<div class="empty">No customers yet – they are added automatically when you make a sale</div>';
      document.querySelectorAll('#custRows [data-ph]').forEach(function (li) { li.onclick = function () { customerForm(S.customers.find(function (c) { return String(c.phone) === li.dataset.ph; })); }; });
    }
    $view.innerHTML = '<div class="card"><input id="cq" placeholder="Search name or phone"></div><div class="card"><ul class="list" id="custRows"></ul></div>';
    document.getElementById('cq').addEventListener('input', function (e) { q = e.target.value.trim(); draw(); });
    draw();
  });
  function customerForm(c) {
    modal('<h3>Customer</h3><div class="grid2"><label class="f">Name<input id="cfN" value="' + esc(c.name) + '"></label><label class="f">Phone<input id="cfP" type="tel" value="' + esc(c.phone) + '"></label></div>' +
      '<label class="f">Address<input id="cfA" value="' + esc(c.address) + '"></label><div class="grid3"><label class="f">City<input id="cfC" value="' + esc(c.city) + '"></label><label class="f">State<input id="cfS" value="' + esc(c.state) + '"></label><label class="f">PIN<input id="cfPin" value="' + esc(c.pin) + '"></label></div>' +
      '<label class="f">Notes<input id="cfNo" value="' + esc(c.notes) + '"></label><p class="muted small">' + c.orders + ' orders · ' + inr(c.spent) + ' spent' + (c.last_order ? ' · last ' + fdate(c.last_order) : '') + '</p>' +
      '<div class="btn-row"><a class="btn light" href="https://wa.me/91' + normPhone(c.phone) + '" target="_blank">WhatsApp</a><button class="btn" id="cfSave">Save</button></div>');
    document.getElementById('cfSave').onclick = async function () {
      try {
        await api('saveCustomer', { original_phone: c.phone, customer: { name: val('cfN'), phone: val('cfP'), address: val('cfA'), city: val('cfC'), state: val('cfS'), pin: val('cfPin'), notes: val('cfNo') } });
        await loadBase(true); closeModal(); toast('Saved'); render();
      } catch (e) { toast(e.message, true); }
    };
  }

  /* ================= WHOLESALERS ================= */
  route('wholesalers', 'Wholesalers', async function () {
    let pb = [];
    try { pb = await api('listPurchases', {}, { silent: true }); } catch (e) { }
    $view.innerHTML = '<button class="btn block" id="wAdd" style="margin-bottom:12px">+ Add wholesaler</button><div class="card"><ul class="list">' + (S.wholesalers.length ? S.wholesalers.map(function (w, i) {
      const mine = pb.filter(function (b) { return b.wholesaler === w.name; });
      const spent = mine.reduce(function (a, b) { return a + b.total; }, 0), due = mine.reduce(function (a, b) { return a + Math.max(0, b.balance); }, 0);
      return '<li data-i="' + i + '"><div class="spacer"><div class="t">' + esc(w.name) + '</div><div class="muted small">' + esc(w.city) + ' · ' + mine.length + ' bills · ' + esc(w.phone) + '</div></div><div class="right"><b>' + inr(spent) + '</b><div>' + (due > 0 ? '<span class="badge red">Due ' + inr(due) + '</span>' : '') + '</div></div></li>';
    }).join('') : '<div class="empty">No wholesalers yet</div>') + '</ul></div>';
    document.getElementById('wAdd').onclick = function () { wholesalerForm(null, function () { render(); }); };
    document.querySelectorAll('[data-i]').forEach(function (li) { li.onclick = function () { wholesalerForm(S.wholesalers[+li.dataset.i], function () { render(); }); }; });
  });
  function wholesalerForm(w, done) {
    w = w || {};
    const f = [['name', 'Name *'], ['contact', 'Contact person'], ['phone', 'Phone / WhatsApp'], ['email', 'Email'], ['address', 'Address'], ['city', 'City'], ['gstin', 'GSTIN'], ['terms', 'Payment terms'], ['returns', 'Return policy'], ['sells', 'What they sell']];
    modal('<h3>' + (w.name ? 'Edit wholesaler' : 'New wholesaler') + '</h3>' + f.map(function (x) { return '<label class="f">' + x[1] + '<input data-w="' + x[0] + '" value="' + esc(w[x[0]]) + '"></label>'; }).join('') +
      '<div class="btn-row"><button class="btn light" id="wfC">Cancel</button><button class="btn" id="wfS">Save</button></div>');
    document.getElementById('wfC').onclick = closeModal;
    document.getElementById('wfS').onclick = async function () {
      const o = {}; document.querySelectorAll('[data-w]').forEach(function (i) { o[i.dataset.w] = i.value.trim(); });
      if (!o.name) return toast('Name is required', true);
      try { await api('saveWholesaler', { wholesaler: o, original_name: w.name }); await loadBase(true); closeModal(); toast('Saved'); done && done(o.name); } catch (e) { toast(e.message, true); }
    };
  }

  /* ================= MORE ================= */
  route('more', 'More', function () {
    const t = function (h, b, s) { return '<a href="' + h + '"><b>' + b + '</b><span>' + s + '</span></a>'; };
    $view.innerHTML = '<div class="more-grid">' + t('#/sales', 'Sales & Bills', 'Reprint bills, labels, returns') + t('#/customers', 'Customers', 'Search, orders, spend') +
      t('#/purchases', 'Purchase Bills', 'Payments due, real cost') + t('#/barcodes', 'Barcode Labels', 'Print sticker sheets') +
      t('#/wholesalers', 'Wholesalers', 'Contacts and totals') + t('#/settings', 'Settings', 'Business, GST, lists') +
      t('#/import', 'Import from Excel', 'Bring in tracker v5 data') + t('#/setup', 'Connection', 'App link, PIN, your name') + '</div>' +
      '<p class="muted small center" style="margin-top:16px">Signed in as <b>' + esc(LS.get('user', '')) + '</b></p>';
  });

  /* ================= SETTINGS ================= */
  route('settings', 'Settings', function () {
    const s = S.settings;
    const f = function (k, l, type) { return '<label class="f">' + l + '<input data-s="' + k + '" ' + (type ? 'type="' + type + '"' : '') + ' value="' + esc(s[k]) + '"></label>'; };
    $view.innerHTML = '<div class="card"><h3>Business details</h3>' + f('business_name', 'Business name') + f('tagline', 'Tagline') + f('city', 'City / State') + f('whatsapp', 'WhatsApp') + f('instagram', 'Instagram') +
      f('footer', 'Bill footer (policy)') + f('thanks', 'Thank-you line') + '</div>' +
      '<div class="card"><h3>GST</h3><label class="f">GST registered?<select data-s="gst_registered">' + opts(['No', 'Yes'], s.gst_registered) + '</select></label>' +
      f('gst_date', 'Registration date', 'date') + f('gstin', 'Your GSTIN') + '<div class="grid3">' + f('gst_limit', 'Price limit (₹)', 'number') + f('gst_low', 'Rate up to limit', 'number') + f('gst_high', 'Rate above', 'number') + '</div>' +
      '<p class="muted small">Rates as decimals: 0.05 = 5%. Bills dated on/after the registration date become "TAX INVOICE".</p></div>' +
      '<div class="card"><h3>Other</h3><div class="grid2">' + f('low_stock', 'Low-stock alert at (pcs)', 'number') + f('next_bill_no', 'Next bill number', 'number') + '</div></div>' +
      '<button class="btn block big" id="setSave">Save settings</button>' +
      '<div class="card" style="margin-top:12px"><h3>Drop-down lists</h3><label class="f">Clothing types – one per line as <b>Name, CODE</b><textarea id="lTypes" rows="8">' + esc(S.lists.types.map(function (t) { return t.type + ', ' + t.code; }).join('\n')) + '</textarea></label>' +
      '<label class="f">Sizes – separated by commas<textarea id="lSizes" rows="2">' + esc(S.lists.sizes.join(', ')) + '</textarea></label>' +
      '<label class="f">Sales channels – one per line<textarea id="lCh" rows="5">' + esc(S.lists.channels.join('\n')) + '</textarea></label>' +
      '<p class="muted small">Don\'t change the code of a type that already has stock – its barcodes would stop matching.</p><button class="btn block" id="listSave">Save lists</button></div>';
    document.getElementById('setSave').onclick = async function () {
      const o = {}; document.querySelectorAll('[data-s]').forEach(function (i) { o[i.dataset.s] = i.value; });
      try { await api('saveSettings', { settings: o }); await loadBase(true); toast('Settings saved'); } catch (e) { toast(e.message, true); }
    };
    document.getElementById('listSave').onclick = async function () {
      const types = val('lTypes').split('\n').map(function (l) { const p = l.split(','); return { type: (p[0] || '').trim(), code: (p[1] || '').trim().toUpperCase() }; }).filter(function (t) { return t.type; });
      const sizes = val('lSizes').split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean);
      const ch = val('lCh').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      try { await api('saveLists', { types: types, sizes: sizes, channels: ch }); await loadBase(true); toast('Lists saved'); } catch (e) { toast(e.message, true); }
    };
  });

  /* ================= IMPORT FROM EXCEL v5 ================= */
  route('import', 'Import from Excel', function () {
    $view.innerHTML = '<div class="card"><h3>Import tracker v5</h3><p class="muted">Choose your <b>Avantikaar_Tracker_v5.xlsx</b>. Wholesalers, purchases and sales (with customers) are brought in. Bills already in the app are skipped.</p>' +
      '<input type="file" id="xf" accept=".xlsx"><label class="row small" style="margin-top:10px"><input type="checkbox" id="skipDummy" checked style="width:auto"> Skip rows marked DUMMY</label><div id="xPrev" style="margin-top:12px"></div></div>';
    document.getElementById('xf').onchange = function (e) {
      const file = e.target.files[0]; if (!file) return;
      if (typeof XLSX === 'undefined') return toast('Excel reader not loaded – check internet', true);
      const rd = new FileReader();
      rd.onload = function () {
        try {
          const data = parseTracker(XLSX.read(rd.result, { type: 'array', cellDates: true }), document.getElementById('skipDummy').checked);
          document.getElementById('xPrev').innerHTML = '<table class="t"><tbody><tr><td>Wholesalers</td><td class="n">' + data.wholesalers.length + '</td></tr><tr><td>Purchase bills</td><td class="n">' + data.purchases.length + '</td></tr>' +
            '<tr><td>Sale bills</td><td class="n">' + data.sales.length + '</td></tr></tbody></table><button class="btn block" id="xGo" style="margin-top:10px">Import now</button>';
          document.getElementById('xGo').onclick = async function () {
            try { const r = await api('importData', data); await loadBase(true); modal('<h3>Import done ✔</h3><p>Wholesalers: ' + r.wholesalers + '<br>Purchase bills: ' + r.purchases + '<br>Sale bills: ' + r.sales + '<br>New customers: ' + r.customers + '<br>Skipped (already present): ' + r.skipped + '</p><button class="btn block" onclick="location.hash=\'#/home\';document.getElementById(\'modal\').hidden=true">OK</button>'); }
            catch (err) { toast(err.message, true); }
          };
        } catch (err) { toast('Could not read file: ' + err.message, true); }
      };
      rd.readAsArrayBuffer(file);
    };
  });
  function xdate(v) {
    if (v instanceof Date) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    return v ? String(v) : '';
  }
  function parseTracker(wb, skipDummy) {
    const rows = function (name, start) { const ws = wb.Sheets[name]; if (!ws) return []; return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).slice(start); };
    const isDummy = function (r) { return skipDummy && r.some(function (c) { return /DUMMY|SAMPLE/i.test(String(c)); }); };
    const wholesalers = rows('Wholesalers', 1).filter(function (r) { return r[0] && !isDummy(r); }).map(function (r) {
      return { name: String(r[0]).trim(), contact: r[1], phone: r[2], email: r[3], address: r[4], city: r[5], gstin: r[6], terms: r[7], returns: r[8], sells: r[9] };
    });
    const pmap = {}, porder = [];
    rows('Purchases', 1).forEach(function (r) {
      if (!r[0] || !r[3] || !r[4] || isDummy(r)) return;
      const k = String(r[0]).trim() + '|' + String(r[2]).trim();
      if (!pmap[k]) { pmap[k] = { bill: { bill_no: String(r[0]).trim(), date: xdate(r[1]), wholesaler: String(r[2]).trim(), gst: 0, shipping: 0, other: 0, paid: 0, invoice_pieces: '' }, lines: [] }; porder.push(k); }
      const p = pmap[k];
      p.bill.gst += num(r[8]); p.bill.shipping += num(r[9]); p.bill.other += num(r[10]); p.bill.paid += num(r[11]);
      if (r[12] !== '') p.bill.invoice_pieces = num(r[12]);
      p.lines.push({ type: r[3], size: r[4], pieces: num(r[5]), rate: num(r[6]), suggested_price: num(r[7]), description: r[13] });
    });
    const smap = {}, sorder = [];
    rows('Sales', 2).forEach(function (r) {
      if (!r[1] || !r[3] || isDummy(r)) return;
      const no = String(r[1]).trim();
      if (!smap[no]) { smap[no] = { bill: { bill_no: no, date: xdate(r[0]) }, customer: {}, items: [] }; sorder.push(no); }
      const s = smap[no];
      if (r[4]) s.bill.order_type = r[4];
      if (r[5]) s.bill.channel = r[5];
      if (r[6]) { const m = String(r[6]).split('–'); s.customer.phone = m[m.length - 1]; s.customer.name = s.customer.name || m.slice(0, -1).join('–').trim(); }
      if (r[7]) s.customer.name = r[7];
      if (r[8]) s.customer.phone = r[8];
      if (r[9]) s.customer.address = r[9];
      if (r[10]) s.customer.city = r[10];
      if (r[11]) s.customer.state = r[11];
      if (r[12]) s.customer.pin = r[12];
      if (r[13] !== '') s.bill.delivery = num(r[13]);
      if (r[14]) s.bill.payment = r[14];
      if (r[15]) s.bill.courier = r[15];
      if (r[16]) s.bill.tracking = r[16];
      s.items.push({ code: String(r[3]).trim().toUpperCase(), price: num(r[2]), returned: r[17] === 'Yes' ? 'Yes' : '', note: r[18] });
    });
    return { wholesalers: wholesalers, purchases: porder.map(function (k) { return pmap[k]; }), sales: sorder.map(function (k) { return smap[k]; }) };
  }

  /* ---------------- start ---------------- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { });
  render();
})();
