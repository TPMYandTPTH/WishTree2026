/* =========================================================
   TP Gift Exchange - shared code for gift/index.html (phones)
   and gift/screen.html (big screen + organiser).
   Keys and event text come from gift-config.js.
   With no keys it runs in demo mode: everything is saved in this
   browser only (organiser PIN 1234), so you can try the screen and
   a phone in two tabs.
   ========================================================= */
(function () {
  'use strict';

  var GC = window.GIFT_CFG || {};
  var LIVE = !!(GC.SUPABASE_URL && GC.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);
  var sb = null;
  if (LIVE) {
    try {
      sb = window.supabase.createClient(GC.SUPABASE_URL, GC.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    } catch (e) { LIVE = false; sb = null; }
  }

  var EVENT = {
    title: GC.TITLE || 'Christmas Gift Exchange',
    team: GC.TEAM || '',
    gift: GC.GIFT || 'Unisex gift',
    budget: GC.BUDGET || ''
  };

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clean(t) { var v = String(t || '').replace(/\s+/g, ' ').trim().slice(0, 40); return v || null; }
  function firstName(name) { return String(name || '').trim().split(' ')[0] || name; }
  function randInt(max) { var b = new Uint32Array(1); window.crypto.getRandomValues(b); return b[0] % max; }
  function randToken() {
    var b = new Uint8Array(24); window.crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  var store = {
    get: function (k, fallback) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: still works for this visit */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* fine */ } }
  };
  var device = {
    token: function () { return store.get('tpgx-token', null); },
    saveToken: function (t) { store.set('tpgx-token', t); },
    forgetToken: function () { store.del('tpgx-token'); },
    pin: function () { return store.get('tpgx-pin', null); },
    savePin: function (p) { store.set('tpgx-pin', p); },
    forgetPin: function () { store.del('tpgx-pin'); }
  };

  /* ---------- friendly messages ---------- */
  function codeOf(err) {
    var m = String((err && (err.message || err.error || err.code)) || err || '');
    var keys = ['name_taken', 'closed', 'full', 'not_found', 'already_matched', 'bad_pin', 'locked', 'no_pin', 'too_few', 'bad_input'];
    for (var i = 0; i < keys.length; i++) { if (m.indexOf(keys[i]) !== -1) return keys[i]; }
    return 'network';
  }
  function takenNum(err) {
    var m = String((err && (err.message || err.error)) || err || '').match(/name_taken:(\d+)/);
    return m ? m[1] : null;
  }
  function messageOf(err) {
    var c = codeOf(err);
    switch (c) {
      case 'name_taken':
        var n = takenNum(err);
        return 'That name is already on the list' + (n ? ' as #' + n : '') + '. If that\'s not you, add your last initial, for example "Siti A".';
      case 'closed': return 'Matching is done, so the list is closed. Ask the organiser to add you.';
      case 'full': return 'The list is full.';
      case 'already_matched': return 'Everyone is already matched. Undo the matching first.';
      case 'bad_pin': return 'Wrong PIN.';
      case 'locked': return 'Too many wrong PINs. Try again in 10 minutes.';
      case 'no_pin': return 'The organiser PIN isn\'t set yet. See gift/README.md.';
      case 'too_few': return 'You need at least 2 people to match.';
      case 'not_found': return 'That person isn\'t on the list any more.';
      case 'bad_input': return 'Please type a name.';
      default: return 'Couldn\'t reach the server. Check the connection and try again.';
    }
  }

  /* ---------- live backend ---------- */
  function rpc(fn, args) {
    return sb.rpc(fn, args || {}).then(function (res) {
      if (res.error) throw new Error(res.error.message || 'network');
      if (res.data && res.data.error) throw new Error(res.data.error);
      return res.data;
    }, function () { throw new Error('network'); });
  }
  var liveApi = {
    board: function () { return rpc('gx_board'); },
    join: function (name) { return rpc('gx_join', { p_name: name }); },
    me: function (token) { return rpc('gx_me', { p_token: token }); },
    leave: function (token) { return rpc('gx_leave', { p_token: token }); },
    check: function (pin) { return rpc('gx_admin_check', { p_pin: pin }); },
    people: function (pin) { return rpc('gx_admin_people', { p_pin: pin }); },
    setTeam: function (pin, num, team) { return rpc('gx_admin_set_team', { p_pin: pin, p_num: num, p_team: team || null }); },
    rosterAdd: function (pin, name, team) { return rpc('gx_admin_roster_add', { p_pin: pin, p_name: name, p_team: team }); },
    rosterRemove: function (pin, name) { return rpc('gx_admin_roster_remove', { p_pin: pin, p_name: name }); },
    add: function (pin, name) { return rpc('gx_admin_add', { p_pin: pin, p_name: name }); },
    remove: function (pin, num) { return rpc('gx_admin_remove', { p_pin: pin, p_num: num }); },
    match: function (pin) { return rpc('gx_admin_match', { p_pin: pin }); },
    reopen: function (pin) { return rpc('gx_admin_reopen', { p_pin: pin }); },
    reset: function (pin) { return rpc('gx_admin_reset', { p_pin: pin }); }
  };

  /* ---------- demo backend (same rules, this browser only) ---------- */
  var DB_KEY = 'tpgx-demo2';
  function load() {
    var db = store.get(DB_KEY, null) || { status: 'open', round: 0, matched_at: null, people: [], roster: [] };
    if (!db.roster) db.roster = [];
    return db;
  }
  function save(db) { store.set(DB_KEY, db); }
  function ok(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 160); }); }
  function no(code) { return new Promise(function (_, j) { setTimeout(function () { j(new Error(code)); }, 160); }); }
  function pinOk(pin) { return String(pin || '').trim() === '1234'; }
  function key(t) { return (clean(t) || '').toLowerCase(); }
  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) { var j = randInt(i + 1); var x = list[i]; list[i] = list[j]; list[j] = x; }
    return list;
  }
  function teamFor(db, name) {
    var k = key(name), best = null;
    db.roster.forEach(function (r) {
      var rk = key(r.name);
      if ((k === rk || k.indexOf(rk + ' ') === 0) && (!best || rk.length > key(best.name).length)) best = r;
    });
    return best ? best.team : null;
  }
  function minClashes(n, r, s) { return Math.max(0, 2 * r - n) + Math.max(0, 2 * s - n); }
  function person(p) { return { num: p.num, name: p.name }; }
  function byId(db, id) { return db.people.filter(function (p) { return p.id === id; })[0]; }
  function boardOf(db) {
    var people = db.people.slice().sort(function (a, b) { return a.num - b.num; });
    var gives = [];
    if (db.status === 'matched') {
      gives = people.filter(function (p) { return p.gives_to; }).map(function (p) { return { from: person(p), to: person(byId(db, p.gives_to)) }; });
    }
    return { status: db.status, round: db.round, matched_at: db.matched_at, has_pin: true, people: people.map(person), gives: gives };
  }
  // Same circle as the database: the bigger tagged group spaced round the circle,
  // everyone else in the gaps, the smaller tagged group never two together.
  function makeCircle(db) {
    var R = shuffle(db.people.filter(function (p) { return p.team === 'R'; }));
    var S = shuffle(db.people.filter(function (p) { return p.team === 'S'; }));
    var O = shuffle(db.people.filter(function (p) { return !p.team; }));
    var A, B;
    if (R.length > S.length || (R.length === S.length && randInt(2) === 0)) { A = R; B = S; } else { A = S; B = R; }
    var a = A.length, n = a + B.length + O.length, m = n - a, circle = [], g, k;
    if (a === 0) {
      circle = O;
    } else if (a > m) {
      var rest = shuffle(B.concat(O));
      var pick = shuffle(A.map(function (_, i) { return i; })).slice(0, m);
      var ri = 0;
      A.forEach(function (p, i) { circle.push(p); if (pick.indexOf(i) !== -1) circle.push(rest[ri++]); });
    } else {
      var cuts = shuffle(Array.from({ length: m - 1 }, function (_, i) { return i + 1; })).slice(0, a - 1).sort(function (x, y) { return x - y; });
      var sizes = [], prev = 0;
      for (g = 0; g < a; g++) { var nx = g < a - 1 ? cuts[g] : m; sizes.push(nx - prev); prev = nx; }
      var slots = [];
      sizes.forEach(function (sz, gi) { for (var q = 0; q < Math.ceil(sz / 2); q++) slots.push(gi); });
      shuffle(slots);
      var bc = sizes.map(function () { return 0; });
      for (k = 0; k < B.length; k++) bc[slots[k]]++;
      var bi = 0, oi = 0;
      for (g = 0; g < a; g++) {
        circle.push(A[g]);
        var og = sizes[g] - bc[g];
        var chosen = shuffle(Array.from({ length: og + 1 }, function (_, i) { return i; })).slice(0, bc[g]);
        for (k = 0; k <= og; k++) {
          if (chosen.indexOf(k) !== -1) circle.push(B[bi++]);
          if (k < og) circle.push(O[oi++]);
        }
      }
    }
    circle.forEach(function (p, i) { p.grp = 1; p.pos = i + 1; p.gives_to = circle[(i + 1) % n].id; });
    return db.people.filter(function (p) { var t = byId(db, p.gives_to); return p.team && t && t.team === p.team; }).length;
  }
  function nextNum(db) { return db.people.reduce(function (m, p) { return Math.max(m, p.num); }, 0) + 1; }
  function nameTaken(db, name) {
    var hit = db.people.filter(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })[0];
    return hit ? hit.num : null;
  }
  function newPerson(db, name, token) {
    return { id: randToken(), num: nextNum(db), name: name, token: token || null, team: teamFor(db, name), grp: null, pos: null, gives_to: null };
  }
  var demoApi = {
    board: function () { return ok(boardOf(load())); },
    join: function (name) {
      var db = load(); var n = clean(name);
      if (!n) return no('bad_input');
      if (db.status !== 'open') return no('closed');
      var t = nameTaken(db, n); if (t) return no('name_taken:' + t);
      var token = randToken();
      var p = newPerson(db, n, token);
      db.people.push(p);
      save(db); return ok({ num: p.num, name: n, token: token });
    },
    me: function (token) {
      var db = load();
      var me = db.people.filter(function (p) { return p.token && p.token === token; })[0];
      if (!me) return no('not_found');
      var match = null;
      if (db.status === 'matched' && me.gives_to) {
        var get = db.people.filter(function (p) { return p.gives_to === me.id; })[0];
        match = { give: person(byId(db, me.gives_to)), get: person(get) };
      }
      return ok({ num: me.num, name: me.name, status: db.status, round: db.round, count: db.people.length, match: match });
    },
    leave: function (token) {
      var db = load();
      if (db.status !== 'open') return no('already_matched');
      db.people = db.people.filter(function (p) { return p.token !== token; });
      save(db); return ok(null);
    },
    check: function (pin) { return pinOk(pin) ? ok({ ok: true }) : no('bad_pin'); },
    people: function (pin) {
      if (!pinOk(pin)) return no('bad_pin');
      var db = load();
      var n = db.people.length;
      var r = db.people.filter(function (p) { return p.team === 'R'; }).length;
      var s = db.people.filter(function (p) { return p.team === 'S'; }).length;
      var clashes = null;
      if (db.status === 'matched') clashes = db.people.filter(function (p) { var t = byId(db, p.gives_to); return p.team && t && t.team === p.team; }).length;
      return ok({
        ok: true, status: db.status, round: db.round,
        people: db.people.slice().sort(function (a, b) { return a.num - b.num; }).map(function (p) { return { num: p.num, name: p.name, team: p.team || null }; }),
        roster: db.roster.slice().sort(function (a, b) { return a.team.localeCompare(b.team) || key(a.name).localeCompare(key(b.name)); }),
        count: n, r: r, s: s, min_clashes: minClashes(n, r, s), clashes: clashes
      });
    },
    setTeam: function (pin, num, team) {
      if (!pinOk(pin)) return no('bad_pin');
      var db = load();
      var p = db.people.filter(function (x) { return x.num === num; })[0];
      if (!p) return no('not_found');
      p.team = team || null;
      db.roster = db.roster.filter(function (r) { return key(r.name) !== key(p.name); });
      if (team) db.roster.push({ name: p.name, team: team });
      save(db); return ok({ ok: true });
    },
    rosterAdd: function (pin, name, team) {
      if (!pinOk(pin)) return no('bad_pin');
      var n = clean(name);
      if (!n || (team !== 'R' && team !== 'S')) return no('bad_input');
      var db = load();
      db.roster = db.roster.filter(function (r) { return key(r.name) !== key(n); });
      db.roster.push({ name: n, team: team });
      db.people.forEach(function (p) { var k = key(p.name), rk = key(n); if (!p.team && (k === rk || k.indexOf(rk + ' ') === 0)) p.team = team; });
      save(db); return ok({ ok: true });
    },
    rosterRemove: function (pin, name) {
      if (!pinOk(pin)) return no('bad_pin');
      var db = load();
      db.roster = db.roster.filter(function (r) { return key(r.name) !== key(name); });
      save(db); return ok({ ok: true });
    },
    add: function (pin, name) {
      if (!pinOk(pin)) return no('bad_pin');
      var db = load(); var n = clean(name);
      if (!n) return no('bad_input');
      if (db.status !== 'open') return no('already_matched');
      var t = nameTaken(db, n); if (t) return no('name_taken:' + t);
      var p = newPerson(db, n, null);
      db.people.push(p);
      save(db); return ok({ ok: true, num: p.num });
    },
    remove: function (pin, num) {
      if (!pinOk(pin)) return no('bad_pin');
      var db = load();
      if (db.status !== 'open') return no('already_matched');
      db.people = db.people.filter(function (p) { return p.num !== num; });
      save(db); return ok({ ok: true });
    },
    match: function (pin) {
      if (!pinOk(pin)) return no('bad_pin');
      var db = load();
      if (db.status !== 'open') return no('already_matched');
      var n = db.people.length;
      if (n < 2) return no('too_few');
      var c = makeCircle(db);
      db.status = 'matched'; db.round += 1; db.matched_at = new Date().toISOString();
      save(db); return ok({ ok: true, count: n, clashes: c });
    },
    reopen: function (pin) {
      if (!pinOk(pin)) return no('bad_pin');
      var db = load();
      db.people.forEach(function (p) { p.grp = null; p.pos = null; p.gives_to = null; });
      db.status = 'open'; db.matched_at = null;
      save(db); return ok({ ok: true });
    },
    reset: function (pin) {
      if (!pinOk(pin)) return no('bad_pin');
      var db = load();
      db.people = []; db.status = 'open'; db.matched_at = null; db.round += 1;
      save(db); return ok({ ok: true });
    },
    // demo only: fill the list with sample names
    samples: function (count) {
      var names = ['Aisyah', 'Nattapong', 'Wei Ling', 'Arjun', 'Siti', 'Kittisak', 'Mei Chen', 'Hafiz', 'Priya', 'Somchai', 'Farah', 'Daniel', 'Nurul', 'Ploy', 'Kumar', 'Hui Min', 'Zack', 'Anong', 'Rizal', 'Jia Yi'];
      var db = load();
      if (db.status !== 'open') return ok(0);
      var added = 0;
      names.forEach(function (nm) {
        if (added >= count || nameTaken(db, nm)) return;
        db.people.push(newPerson(db, nm, null));
        added++;
      });
      save(db); return ok(added);
    }
  };

  /* ---------- links ---------- */
  function folderUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
  function joinUrl() { return folderUrl(); }

  /* ---------- falling snow ---------- */
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

  /* ---------- confetti burst inside an element ---------- */
  function burst(host, count) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var b = document.createElement('div'); b.className = 'burst'; b.setAttribute('aria-hidden', 'true');
    var colors = ['#E3B45A', '#F2C766', '#F6EEDC', '#AB2C37', '#00AF9B'];
    var n = count || 26;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('i');
      var ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      var dist = 90 + Math.random() * 90;
      p.style.setProperty('--x', (Math.cos(ang) * dist).toFixed(0) + 'px');
      p.style.setProperty('--y', (Math.sin(ang) * dist - 30).toFixed(0) + 'px');
      p.style.setProperty('--r', (Math.random() * 540 - 270).toFixed(0) + 'deg');
      p.style.background = colors[i % colors.length];
      if (i % 3 === 0) p.style.borderRadius = '50%';
      p.style.animationDelay = (Math.random() * 0.12).toFixed(2) + 's';
      b.appendChild(p);
    }
    host.appendChild(b);
    setTimeout(function () { b.remove(); }, 1600);
  }

  /* ---------- the gift box drawing ---------- */
  var GIFT_SVG =
    '<svg viewBox="0 0 240 236" aria-hidden="true">' +
    '<defs><pattern id="gxdots" width="22" height="22" patternUnits="userSpaceOnUse">' +
    '<circle cx="5" cy="6" r="1.7" fill="#F6EEDC" opacity=".26"/><circle cx="16" cy="17" r="1.7" fill="#F6EEDC" opacity=".26"/></pattern></defs>' +
    '<ellipse class="gb-shadow" cx="120" cy="222" rx="88" ry="9" fill="#000" opacity=".28"/>' +
    '<g class="gb-body"><rect x="42" y="110" width="156" height="108" rx="6" fill="#AB2C37"/>' +
    '<rect x="42" y="110" width="156" height="108" rx="6" fill="url(#gxdots)"/>' +
    '<rect x="42" y="110" width="156" height="12" fill="#000" opacity=".16"/>' +
    '<rect x="110" y="110" width="20" height="108" fill="#E3B45A"/><rect x="124" y="110" width="6" height="108" fill="#000" opacity=".08"/></g>' +
    '<g class="gb-lid"><rect x="34" y="86" width="172" height="30" rx="6" fill="#C23B47"/>' +
    '<rect x="34" y="86" width="172" height="30" rx="6" fill="url(#gxdots)"/><rect x="110" y="86" width="20" height="30" fill="#F2C766"/>' +
    '<g class="gb-bow"><path d="M120 86 C 100 52, 64 58, 78 81 C 86 93, 108 91, 120 86 Z" fill="#E3B45A"/>' +
    '<path d="M120 86 C 140 52, 176 58, 162 81 C 154 93, 132 91, 120 86 Z" fill="#E3B45A"/>' +
    '<path d="M120 86 C 106 68, 88 66, 90 78 C 96 84, 110 86, 120 86 Z" fill="#000" opacity=".12"/>' +
    '<path d="M120 86 C 134 68, 152 66, 150 78 C 144 84, 130 86, 120 86 Z" fill="#000" opacity=".12"/>' +
    '<circle cx="120" cy="85" r="9" fill="#F2C766"/></g></g></svg>';

  var ICON = {
    gift: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7ZM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z"/></svg>',
    tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    people: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>',
    swap: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg>',
    arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    circle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>'
  };

  function chipsHTML(extra) {
    var out = [];
    if (EVENT.gift) out.push('<span class="chip">' + ICON.gift + esc(EVENT.gift) + '</span>');
    if (EVENT.budget) out.push('<span class="chip">' + ICON.tag + esc(EVENT.budget) + '</span>');
    if (extra) out.push(extra);
    return out.join('');
  }

  window.GIFT = {
    LIVE: LIVE,
    api: LIVE ? liveApi : demoApi,
    demo: LIVE ? null : demoApi,
    EVENT: EVENT, ICON: ICON, GIFT_SVG: GIFT_SVG,
    device: device,
    $: $, $all: $all, esc: esc, firstName: firstName,
    codeOf: codeOf, messageOf: messageOf,
    joinUrl: joinUrl, snow: snow, burst: burst, chipsHTML: chipsHTML
  };
})();
