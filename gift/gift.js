/* =========================================================
   TP Gift Exchange - shared code for gift/index.html and gift/host.html
   Uses the Supabase keys in gift-config.js (falls back to ../config.js).
   With no keys it runs in demo mode: everything is saved in this browser
   only, so you can try the host page and the player page in two tabs.
   ========================================================= */
(function () {
  'use strict';

  var GC = window.GIFT_CFG || {};
  var CFG = (GC.SUPABASE_URL && GC.SUPABASE_ANON_KEY) ? GC : (window.WISH_CFG || {});
  var LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);
  var sb = null;
  if (LIVE) {
    try {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    } catch (e) { LIVE = false; sb = null; }
  }

  var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(k) { return String(k || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
  function fmtKey(k) { k = norm(k); return k.length === 10 ? k.slice(0, 5) + '-' + k.slice(5) : k; }
  function clean(t, max) {
    var v = String(t || '').replace(/\s+/g, ' ').trim().slice(0, max);
    return v || null;
  }
  function cleanHints(t) {
    var v = String(t || '').replace(/[ \t]+/g, ' ').trim().slice(0, 200);
    return v || null;
  }
  function randomCode(len) {
    var out = '';
    var bytes = new Uint8Array(len);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    for (var i = 0; i < len; i++) out += ALPHABET[bytes[i] % 32];
    return out;
  }
  function randomInt(max) {
    var b = new Uint32Array(1);
    window.crypto.getRandomValues(b);
    return b[0] % max;
  }
  function firstName(name) { return String(name || '').trim().split(' ')[0] || name; }
  function timeAgo(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  }

  /* ---------- what this device remembers ---------- */
  var store = {
    get: function (k, fallback) {
      try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: page still works for this visit */ }
    }
  };
  var device = {
    playerKey: function (code) { return (store.get('tpgift-player', {})[norm(code)]) || null; },
    savePlayerKey: function (code, key) {
      var all = store.get('tpgift-player', {}); all[norm(code)] = norm(key); store.set('tpgift-player', all);
    },
    forgetPlayer: function (code) {
      var all = store.get('tpgift-player', {}); delete all[norm(code)]; store.set('tpgift-player', all);
    },
    hostKey: function (code) { var h = store.get('tpgift-host', {})[norm(code)]; return h ? h.key : null; },
    saveHost: function (code, key, name) {
      var all = store.get('tpgift-host', {});
      all[norm(code)] = { key: norm(key), name: name || '', saved: new Date().toISOString() };
      store.set('tpgift-host', all);
    },
    forgetHost: function (code) {
      var all = store.get('tpgift-host', {}); delete all[norm(code)]; store.set('tpgift-host', all);
    },
    hostList: function () {
      var all = store.get('tpgift-host', {});
      return Object.keys(all).map(function (c) { return { code: c, name: all[c].name, saved: all[c].saved }; })
        .sort(function (a, b) { return String(b.saved).localeCompare(String(a.saved)); });
    }
  };

  /* ---------- friendly error messages ---------- */
  var MESSAGES = {
    name_taken: 'Someone in this exchange already used that name. Add your last initial, for example "Amr M".',
    gift_closed: 'Names have already been drawn, so joining is closed. Ask the host to undo the draw if you missed it.',
    already_drawn: 'Names have already been drawn. Undo the draw first to change the list.',
    gift_not_found: 'We couldn\'t find this exchange. Scan the QR again or ask the host for the link.',
    gift_full: 'This exchange is full (200 people).',
    bad_key: 'That code doesn\'t match this exchange. Check it and try again.',
    too_few: 'You need at least 3 people to draw names.',
    busy: 'A lot of exchanges were created in the last hour. Try again in a few minutes.',
    bad_input: 'Please fill in the name.',
    network: 'Couldn\'t reach the server. Check your connection and try again.'
  };
  function codeOf(err) {
    var m = String((err && (err.message || err.code)) || err || '');
    for (var k in MESSAGES) { if (m.indexOf(k) !== -1) return k; }
    return 'network';
  }
  function messageOf(err) { return MESSAGES[codeOf(err)]; }

  /* ---------- live backend: Supabase functions ---------- */
  function rpc(fn, args) {
    return sb.rpc(fn, args).then(function (res) {
      if (res.error) throw new Error(res.error.message || 'network');
      return res.data;
    }, function () { throw new Error('network'); });
  }
  var liveApi = {
    create: function (d) {
      return rpc('gift_create', { p_name: d.name, p_host_name: d.host_name || null, p_budget: d.budget || null, p_day: d.exchange_day || null, p_note: d.note || null });
    },
    info: function (code) { return rpc('gift_info', { p_code: code }); },
    join: function (code, name, hints) { return rpc('gift_join', { p_code: code, p_name: name, p_hints: hints || null }); },
    me: function (code, key) { return rpc('gift_me', { p_code: code, p_key: key }); },
    opened: function (code, key) { return rpc('gift_opened', { p_code: code, p_key: key }); },
    setHints: function (code, key, hints) { return rpc('gift_set_hints', { p_code: code, p_key: key, p_hints: hints || null }); },
    leave: function (code, key) { return rpc('gift_leave', { p_code: code, p_key: key }); },
    hostView: function (code, hk) { return rpc('gift_host_view', { p_code: code, p_host_key: hk }); },
    hostUpdate: function (code, hk, d) {
      return rpc('gift_host_update', { p_code: code, p_host_key: hk, p_name: d.name, p_host_name: d.host_name || null, p_budget: d.budget || null, p_day: d.exchange_day || null, p_note: d.note || null });
    },
    hostRemove: function (code, hk, id) { return rpc('gift_host_remove', { p_code: code, p_host_key: hk, p_person: id }); },
    hostDraw: function (code, hk) { return rpc('gift_host_draw', { p_code: code, p_host_key: hk }); },
    hostUndo: function (code, hk) { return rpc('gift_host_undo', { p_code: code, p_host_key: hk }); }
  };

  /* ---------- demo backend: same rules, saved in this browser ---------- */
  var DEMO_DB = 'tpgift-demo-db';
  function load() { return store.get(DEMO_DB, { groups: {}, people: [] }); }
  function save(db) { store.set(DEMO_DB, db); }
  function wait(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 220); }); }
  function fail(code) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error(code)); }, 220); }); }
  function groupJson(db, g) {
    return {
      code: g.code, name: g.name, host_name: g.host_name, budget: g.budget, exchange_day: g.exchange_day,
      note: g.note, status: g.status, drawn_at: g.drawn_at,
      count: db.people.filter(function (p) { return p.group === g.code; }).length
    };
  }
  function peopleOf(db, code) {
    return db.people.filter(function (p) { return p.group === code; })
      .sort(function (a, b) { return a.joined_at < b.joined_at ? -1 : a.joined_at > b.joined_at ? 1 : 0; });
  }
  function hostGroup(db, code, hk) {
    var g = db.groups[norm(code)];
    if (!g || g.host_key !== norm(hk)) return null;
    return g;
  }
  var demoApi = {
    create: function (d) {
      var name = clean(d.name, 60);
      if (!name) return fail('bad_input');
      var db = load();
      var code; do { code = randomCode(6); } while (db.groups[code]);
      var key = randomCode(10);
      db.groups[code] = {
        code: code, host_key: key, name: name, host_name: clean(d.host_name, 40), budget: clean(d.budget, 30),
        exchange_day: clean(d.exchange_day, 60), note: cleanHints(d.note), status: 'open', drawn_at: null,
        created_at: new Date().toISOString()
      };
      save(db);
      return wait({ code: code, host_key: key });
    },
    info: function (code) {
      var db = load(); var g = db.groups[norm(code)];
      return wait(g ? groupJson(db, g) : null);
    },
    join: function (code, name, hints) {
      var db = load(); var g = db.groups[norm(code)];
      var n = clean(name, 40);
      if (!n) return fail('bad_input');
      if (!g) return fail('gift_not_found');
      if (g.status !== 'open') return fail('gift_closed');
      var list = peopleOf(db, g.code);
      if (list.length >= 200) return fail('gift_full');
      if (list.some(function (p) { return p.name.toLowerCase() === n.toLowerCase(); })) return fail('name_taken');
      var key = randomCode(10);
      db.people.push({ id: randomCode(16), group: g.code, name: n, hints: cleanHints(hints), key: key, giving_to: null, joined_at: new Date().toISOString(), opened_at: null });
      save(db);
      return wait({ key: key, name: n });
    },
    me: function (code, key) {
      var db = load(); var g = db.groups[norm(code)];
      if (!g) return fail('gift_not_found');
      var me = db.people.filter(function (p) { return p.group === g.code && p.key === norm(key); })[0];
      if (!me) return fail('bad_key');
      var match = null;
      if (g.status === 'drawn' && me.giving_to) {
        var them = db.people.filter(function (p) { return p.id === me.giving_to; })[0];
        if (them) match = { name: them.name, hints: them.hints };
      }
      return wait({
        group: groupJson(db, g),
        me: { name: me.name, hints: me.hints, opened: !!me.opened_at },
        people: peopleOf(db, g.code).map(function (p) { return p.name; }),
        match: match
      });
    },
    opened: function (code, key) {
      var db = load(); var g = db.groups[norm(code)];
      if (g && g.status === 'drawn') {
        db.people.forEach(function (p) { if (p.group === g.code && p.key === norm(key) && !p.opened_at) p.opened_at = new Date().toISOString(); });
        save(db);
      }
      return wait(null);
    },
    setHints: function (code, key, hints) {
      var db = load(); var hit = false;
      db.people.forEach(function (p) { if (p.group === norm(code) && p.key === norm(key)) { p.hints = cleanHints(hints); hit = true; } });
      if (!hit) return fail('bad_key');
      save(db); return wait(null);
    },
    leave: function (code, key) {
      var db = load(); var g = db.groups[norm(code)];
      if (!g) return fail('gift_not_found');
      if (g.status !== 'open') return fail('already_drawn');
      var before = db.people.length;
      db.people = db.people.filter(function (p) { return !(p.group === g.code && p.key === norm(key)); });
      if (db.people.length === before) return fail('bad_key');
      save(db); return wait(null);
    },
    hostView: function (code, hk) {
      var db = load(); var g = hostGroup(db, code, hk);
      if (!g) return fail('bad_key');
      return wait({
        group: groupJson(db, g),
        people: peopleOf(db, g.code).map(function (p) { return { id: p.id, name: p.name, joined_at: p.joined_at, opened: !!p.opened_at }; })
      });
    },
    hostUpdate: function (code, hk, d) {
      var db = load(); var g = hostGroup(db, code, hk);
      if (!g) return fail('bad_key');
      var name = clean(d.name, 60);
      if (!name) return fail('bad_input');
      g.name = name; g.host_name = clean(d.host_name, 40); g.budget = clean(d.budget, 30);
      g.exchange_day = clean(d.exchange_day, 60); g.note = cleanHints(d.note);
      save(db); return wait(null);
    },
    hostRemove: function (code, hk, id) {
      var db = load(); var g = hostGroup(db, code, hk);
      if (!g) return fail('bad_key');
      if (g.status !== 'open') return fail('already_drawn');
      db.people = db.people.filter(function (p) { return !(p.group === g.code && p.id === id); });
      save(db); return wait(null);
    },
    hostDraw: function (code, hk) {
      var db = load(); var g = hostGroup(db, code, hk);
      if (!g) return fail('bad_key');
      if (g.status !== 'open') return fail('already_drawn');
      var list = peopleOf(db, g.code);
      if (list.length < 3) return fail('too_few');
      // shuffle, then one circle through everyone (same as the database)
      for (var i = list.length - 1; i > 0; i--) { var j = randomInt(i + 1); var t = list[i]; list[i] = list[j]; list[j] = t; }
      list.forEach(function (p, idx) { p.giving_to = list[(idx + 1) % list.length].id; p.opened_at = null; });
      g.status = 'drawn'; g.drawn_at = new Date().toISOString();
      save(db); return wait({ count: list.length });
    },
    hostUndo: function (code, hk) {
      var db = load(); var g = hostGroup(db, code, hk);
      if (!g) return fail('bad_key');
      db.people.forEach(function (p) { if (p.group === g.code) { p.giving_to = null; p.opened_at = null; } });
      g.status = 'open'; g.drawn_at = null;
      save(db); return wait(null);
    },
    // demo only: fill an exchange with sample names
    addSamples: function (code) {
      var names = ['Aisyah', 'Nattapong', 'Wei Ling', 'Arjun', 'Siti', 'Kittisak', 'Mei Chen', 'Hafiz'];
      var db = load(); var g = db.groups[norm(code)];
      if (!g || g.status !== 'open') return wait(0);
      var have = peopleOf(db, g.code).map(function (p) { return p.name.toLowerCase(); });
      var added = 0;
      names.forEach(function (n, i) {
        if (have.indexOf(n.toLowerCase()) !== -1 || added >= 5) return;
        db.people.push({ id: randomCode(16), group: g.code, name: n, hints: i % 2 ? 'Coffee, snacks, anything green' : null, key: randomCode(10), giving_to: null, joined_at: new Date(Date.now() + i).toISOString(), opened_at: null });
        added++;
      });
      save(db); return wait(added);
    }
  };

  /* ---------- links ---------- */
  function folderUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
  function joinUrl(code) { return folderUrl() + '?g=' + norm(code); }
  function hostUrl(code) { return folderUrl() + 'host.html?g=' + norm(code); }
  function privateUrl(code, key) { return folderUrl() + '?g=' + norm(code) + '#k=' + norm(key); }

  /* ---------- clipboard ---------- */
  function copy(text, btn) {
    function done() {
      if (!btn) return;
      var old = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', old);
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    }
    fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { window.prompt('Copy this:', text); }
      document.body.removeChild(ta);
    }
    return Promise.resolve();
  }

  /* ---------- falling snow (skipped for reduced motion) ---------- */
  function snow(count) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var box = document.createElement('div');
    box.className = 'snow'; box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < (count || 28); i++) {
      var f = document.createElement('i');
      var size = 2 + Math.random() * 4;
      f.style.left = (Math.random() * 100) + '%';
      f.style.width = f.style.height = size.toFixed(1) + 'px';
      f.style.opacity = (0.25 + Math.random() * 0.5).toFixed(2);
      f.style.animationDuration = (9 + Math.random() * 10).toFixed(1) + 's';
      f.style.animationDelay = (-Math.random() * 18).toFixed(1) + 's';
      f.style.setProperty('--drift', ((Math.random() - 0.5) * 80).toFixed(0) + 'px');
      box.appendChild(f);
    }
    document.body.appendChild(box);
  }

  window.GIFT = {
    LIVE: LIVE,
    api: LIVE ? liveApi : demoApi,
    demo: LIVE ? null : demoApi,
    device: device,
    norm: norm, fmtKey: fmtKey, esc: esc, firstName: firstName, timeAgo: timeAgo,
    $: $, $all: $all,
    codeOf: codeOf, messageOf: messageOf,
    joinUrl: joinUrl, hostUrl: hostUrl, privateUrl: privateUrl,
    copy: copy, snow: snow,
    LOGO: '../assets/tp-logo-white.png'
  };
})();
