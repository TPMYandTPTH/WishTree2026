/* =========================================================
   TP Wish Tree 2026 - shared code used by every page.
   No need to edit this file. Settings live in config.js.
   ========================================================= */
(function () {
  'use strict';

  var CFG = window.WISH_CFG || {};
  var DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;

  var PALETTE = {
    cream: { bg: '#F6EEDC', fg: '#AB2C37', text: '#183326' },
    red: { bg: '#AB2C37', fg: '#F6EEDC', text: '#F6EEDC' },
    gold: { bg: '#E3B45A', fg: '#0E2A1F', text: '#0E2A1F' }
  };
  var LANG_LABEL = { en: 'English', ms: 'Bahasa Melayu', th: 'ภาษาไทย' };
  var COUNTRY_LABEL = { MY: 'Malaysia', TH: 'Thailand' };

  var ICON_PATHS = {
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
    star: '<path stroke-linejoin="round" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    tree: '<path stroke-linejoin="round" d="M12 3 6.5 10h3L5 16h14l-4.5-6h3zM12 16v4.5"/>',
    gift: '<path stroke-linejoin="round" d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1.5S10 7 12 7zm0 0c1.5-3 5-3.5 5-1.5S14 7 12 7z"/>'
  };

  function iconSvg(name, size) {
    var s = size || 18;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
      (ICON_PATHS[name] || ICON_PATHS.snow) + '</svg>';
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hash(str) {
    var h = 2166136261;
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededOrder(n, seed) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    var t = seed >>> 0;
    function rnd() {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    }
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var tmp = a[j]; a[j] = a[k]; a[k] = tmp;
    }
    return a;
  }

  /* ---------- Sample wishes for demo mode ---------- */
  var SAMPLE = [
    ['To my Penang night-shift family: thank you for always having each other\'s backs. Here\'s to a calmer, happier 2027!', 'Aisyah', 'Penang', 'MY', 'en', 'cream', 'snow'],
    ['ขอบคุณทีมกรุงเทพฯ ที่ช่วยเหลือกันตลอดปีนี้ ขอให้ปี 2027 ทุกคนสุขภาพแข็งแรงและมีความสุขมาก ๆ', 'Nattaya', 'Bangkok', 'TH', 'th', 'red', 'star'],
    ['Terima kasih team KL atas sokongan sepanjang tahun. Semoga 2027 lebih ceria untuk kita semua!', 'Hafiz', 'Kuala Lumpur', 'MY', 'ms', 'gold', 'tree'],
    ['Working from home can feel far away, but this team never made me feel alone. Thank you, and Merry Christmas!', null, 'Remote · Malaysia', 'MY', 'en', 'cream', 'gift'],
    ['Wishing every new joiner this year the same welcome I got on my first day. You belong here.', 'Priya', 'Kuala Lumpur', 'MY', 'en', 'red', 'snow'],
    ['My wish for 2027: more coffee breaks together and fewer system outages.', 'Somchai', 'Bangkok', 'TH', 'en', 'cream', 'star'],
    ['To our trainers: thank you for your patience with every new batch. You make the floor better.', 'Mei Ling', 'Penang', 'MY', 'en', 'gold', 'gift'],
    ['ขอให้ทุกคนได้กลับบ้านไปหาครอบครัวช่วงปีใหม่นี้นะคะ', null, 'Bangkok', 'TH', 'th', 'cream', 'tree'],
    ['Thank you to my team lead for believing in me before I did.', 'Daniel', 'Kuala Lumpur', 'MY', 'en', 'gold', 'snow'],
    ['Here\'s to learning a new language in 2027. Next Christmas I\'ll write this wish in Thai!', 'Kenji', 'Kuala Lumpur', 'MY', 'en', 'red', 'star'],
    ['Semoga semua rakan sekerja sihat dan dimurahkan rezeki.', 'Nurul', 'Penang', 'MY', 'ms', 'gold', 'gift'],
    ['Thank you, Bangkok, for welcoming me when I moved here this year. Merry Christmas!', 'Lucas', 'Bangkok', 'TH', 'en', 'cream', 'snow'],
    ['To the WFM team who juggle every schedule: you are the real Santa\'s helpers.', null, 'Kuala Lumpur', 'MY', 'en', 'red', 'tree'],
    ['Wishing my teammates a peaceful holiday and a strong start to 2027.', 'Ploy', 'Bangkok', 'TH', 'en', 'cream', 'star'],
    ['Thank you to IT for rescuing my headset more times than I can count.', 'Arjun', 'Penang', 'MY', 'en', 'red', 'gift'],
    ['ขอให้ปีหน้าเป็นปีที่ดีของทุกคนในทีม TP', null, 'Remote · Thailand', 'TH', 'th', 'cream', 'tree'],
    ['One TP, many languages, one big family. Grateful to be part of it.', 'Farah', 'Kuala Lumpur', 'MY', 'en', 'gold', 'snow'],
    ['My wish: that everyone feels heard at work in 2027.', 'Tanawat', 'Bangkok', 'TH', 'en', 'cream', 'star']
  ].map(function (r, i) {
    return {
      id: 'demo-' + (i + 1),
      message: r[0],
      display_name: r[1],
      site: r[2],
      country: r[3],
      lang: r[4],
      tag_color: r[5],
      charm: r[6],
      approved_at: new Date(Date.UTC(2026, 11, 1, 8, i * 7)).toISOString()
    };
  });

  /* ---------- Supabase ---------- */
  var client = null;
  function getClient() {
    if (DEMO) return null;
    if (!client) {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('The Supabase library did not load. Check your connection and try again.');
      }
      client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }

  // Approved wishes, newest first
  function fetchApproved(limit) {
    if (DEMO) {
      return Promise.resolve(SAMPLE.slice().sort(function (a, b) {
        return a.approved_at < b.approved_at ? 1 : -1;
      }));
    }
    return getClient()
      .from('approved_wishes')
      .select('id,message,display_name,site,country,lang,tag_color,charm,approved_at')
      .order('approved_at', { ascending: false })
      .limit(limit || 5000)
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      });
  }

  /* ---------- Small helpers ---------- */
  function allowedEmail(email) {
    var e = String(email || '').trim().toLowerCase();
    var at = e.lastIndexOf('@');
    if (at < 1) return false;
    var domain = e.slice(at + 1);
    return (CFG.ALLOWED_EMAIL_DOMAINS || []).some(function (d) {
      return domain === String(d).toLowerCase();
    });
  }

  function displayName(w) {
    return w.display_name && String(w.display_name).trim() ? w.display_name : 'A TP colleague';
  }

  function displayWhere(w) {
    var country = COUNTRY_LABEL[w.country] || '';
    var site = String(w.site || '');
    if (/^remote/i.test(site)) return 'Working remotely' + (country ? ' · ' + country : '');
    return site + (country && site.indexOf(country) === -1 ? ' · ' + country : '');
  }

  function wishPageUrl() {
    if (CFG.WISH_PAGE_URL) return CFG.WISH_PAGE_URL;
    try { return new URL('wish.html', window.location.href).href; } catch (e) { return 'wish.html'; }
  }

  function initGA() {
    if (!CFG.GA4_ID || window.gtag) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CFG.GA4_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', CFG.GA4_ID);
  }

  function track(name, params) {
    try { if (window.gtag && CFG.GA4_ID) window.gtag('event', name, params || {}); } catch (e) { /* ignore */ }
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  // Newest `cap` wishes, returned oldest first so tags keep their place as new ones arrive
  function pickForTree(wishesNewestFirst, cap) {
    return wishesNewestFirst.slice(0, cap).reverse();
  }

  /* ---------- The tree ---------- */
  var TIERS = [[70, 230, 110], [150, 360, 165], [250, 500, 220], [370, 650, 280]];

  function halfWidthAt(y) {
    var hw = 0;
    for (var i = 0; i < TIERS.length; i++) {
      var a = TIERS[i][0], b = TIERS[i][1], h = TIERS[i][2];
      if (y >= a && y <= b) hw = Math.max(hw, (y - a) / (b - a) * h);
    }
    return hw;
  }

  function buildSlots(scale) {
    var tw = 40 * scale;
    var th = (54 + 14) * scale;
    var rowStep = th + 8 * scale;
    var colStep = tw + 12 * scale;
    var out = [];
    for (var y = 150; y + th <= 642; y += rowStep) {
      var hw = Math.min(halfWidthAt(y + 14 * scale), halfWidthAt(y + th * 0.5), halfWidthAt(y + th));
      var usable = 2 * (hw - tw / 2 - 6);
      if (usable < 0) continue;
      var n = Math.floor(usable / colStep) + 1;
      var span = (n - 1) * colStep;
      for (var j = 0; j < n; j++) out.push({ x: 310 - span / 2 + j * colStep, y: y });
    }
    return out;
  }

  function treeCapacity(scale) { return buildSlots(scale || 0.8).length; }

  var LIGHTS = [
    [248, 196], [279, 203], [311, 204], [343, 200], [376, 189],
    [204, 309], [231, 316], [258, 320], [285, 322], [312, 323], [339, 320], [366, 316], [393, 310], [420, 301],
    [164, 451], [201, 458], [238, 463], [275, 466], [312, 465], [349, 462], [386, 455], [423, 446], [460, 435],
    [126, 602], [172, 612], [219, 618], [265, 621], [312, 621], [359, 618], [406, 612], [453, 603], [500, 590]
  ];
  var BALLS = [
    [310, 121, 9, '#E3B45A'], [312, 287, 11, '#AB2C37'], [260, 361, 10, '#E3B45A'], [350, 359, 10, '#AB2C37'],
    [257, 441, 10, '#AB2C37'], [343, 441, 10, '#E3B45A'], [140, 463, 9, '#E3B45A'], [480, 471, 9, '#AB2C37'],
    [217, 521, 10, '#E3B45A'], [387, 523, 10, '#AB2C37'], [215, 604, 11, '#AB2C37'], [415, 604, 11, '#E3B45A']
  ];

  var TREE_SVG = (function () {
    var p = [];
    p.push('<ellipse cx="310" cy="702" rx="240" ry="16" fill="#000" opacity="0.28"/>');
    p.push('<rect x="289" y="628" width="42" height="72" rx="6" fill="#5A3A26"/><rect x="310" y="628" width="21" height="72" fill="#4A2F1F"/>');
    p.push('<path d="M310,370 L30,650 Q170,682 310,662 Z" fill="#23664A"/><path d="M310,370 L310,662 Q450,682 590,650 Z" fill="#184B34"/>');
    p.push('<path d="M310,250 L90,500 Q200,528 310,510 Z" fill="#287052"/><path d="M310,250 L310,510 Q420,528 530,500 Z" fill="#1B5139"/>');
    p.push('<path d="M310,150 L145,360 Q228,384 310,368 Z" fill="#2C7858"/><path d="M310,150 L310,368 Q392,384 475,360 Z" fill="#1E573D"/>');
    p.push('<path d="M310,70 L200,230 Q255,250 310,236 Z" fill="#318060"/><path d="M310,70 L310,236 Q365,250 420,230 Z" fill="#205D41"/>');
    ['M232,190 Q310,222 392,182', 'M178,300 Q310,350 448,290', 'M128,440 Q310,500 498,420', 'M80,590 Q310,660 548,575'].forEach(function (d) {
      p.push('<path d="' + d + '" fill="none" stroke="#E3B45A" stroke-width="1.5" opacity="0.55"/>');
    });
    LIGHTS.forEach(function (l, i) {
      p.push('<circle cx="' + l[0] + '" cy="' + l[1] + '" r="7" fill="#FFD98A" opacity="0.22"/>');
      p.push('<circle class="wt-light" style="animation-delay:' + ((i * 370) % 2600) + 'ms" cx="' + l[0] + '" cy="' + l[1] + '" r="2.8" fill="#FFF1C9"/>');
    });
    BALLS.forEach(function (b) {
      p.push('<rect x="' + (b[0] - 4) + '" y="' + (b[1] - b[2] - 5) + '" width="8" height="5" rx="1" fill="#C9A36B"/>');
      p.push('<circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '" fill="' + b[3] + '"/>');
      p.push('<circle cx="' + (b[0] - 3) + '" cy="' + (b[1] - 3) + '" r="' + (b[2] * 0.28).toFixed(1) + '" fill="#fff" opacity="0.38"/>');
    });
    p.push('<circle cx="310" cy="52" r="44" fill="#F2C766" opacity="0.10"/><circle cx="310" cy="52" r="30" fill="#F2C766" opacity="0.18"/>');
    p.push('<polygon points="310,26 316.47,43.1 334.73,43.97 320.46,55.4 325.28,73.03 310,63 294.72,73.03 299.54,55.4 285.27,43.97 303.53,43.1" fill="#F2C766"/>');
    p.push('<polygon points="310,26 316.47,43.1 334.73,43.97 320.46,55.4 310,52" fill="#FFE3A0"/>');
    return p.join('');
  })();

  var TREE_CSS = [
    '.wt-stage{position:relative;width:100%;aspect-ratio:620/760;container-type:inline-size}',
    '.wt-art{position:absolute;top:0;left:0;width:100%;height:100%;display:block}',
    '.wt-light{animation:wt-twinkle 2.6s ease-in-out infinite}',
    '@keyframes wt-twinkle{0%,100%{opacity:1}50%{opacity:.45}}',
    '.wt-tag{position:absolute;padding:0;margin:0;border:0;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;width:var(--w);transform:translateX(-50%) rotate(var(--r,0deg));transform-origin:50% 0;transition:opacity .35s ease,transform .35s ease;-webkit-tap-highlight-color:transparent}',
    '.wt-tag:hover{transform:translateX(-50%) rotate(calc(var(--r,0deg) * -1))}',
    '.wt-string{display:block;width:1px;height:var(--str);background:#D9C59A}',
    '.wt-body{position:relative;display:flex;align-items:center;justify-content:center;width:var(--w);height:var(--h);background:var(--bg);color:var(--fg);border-radius:3px 3px 5px 5px;box-shadow:0 3px 6px rgba(0,0,0,.35);transition:box-shadow .25s ease}',
    '.wt-body svg{width:var(--ic);height:var(--ic);margin-top:var(--icm)}',
    '.wt-hole{position:absolute;top:var(--holet);left:50%;width:var(--hole);height:var(--hole);transform:translateX(-50%);border-radius:50%;background:rgba(14,42,31,.5)}',
    '.wt-tag[aria-pressed="true"]{transform:translateX(-50%) rotate(0deg);z-index:2}',
    '.wt-tag[aria-pressed="true"] .wt-body{box-shadow:0 0 0 2px #F6EEDC,0 0 0 6px rgba(227,180,90,.55),0 8px 18px rgba(0,0,0,.45)}',
    '.wt-tag:focus{outline:none}',
    '.wt-tag:focus-visible .wt-body{box-shadow:0 0 0 2px #0E2A1F,0 0 0 5px #00AF9B}',
    '.wt-tag.wt-dim{opacity:.22}',
    '.wt-tag.wt-new{animation:wt-drop .8s cubic-bezier(.2,.9,.3,1.2) both}',
    '@keyframes wt-drop{from{opacity:0;transform:translateX(-50%) translateY(-40px) rotate(var(--r,0deg))}to{opacity:1;transform:translateX(-50%) rotate(var(--r,0deg))}}',
    '@media (prefers-reduced-motion:reduce){.wt-tag,.wt-body{transition:none}.wt-tag.wt-new,.wt-light{animation:none}.wt-tag:hover{transform:translateX(-50%) rotate(var(--r,0deg))}}'
  ].join('\n');

  function ensureCss() {
    if (document.getElementById('wt-css')) return;
    var st = document.createElement('style');
    st.id = 'wt-css';
    st.textContent = TREE_CSS;
    document.head.appendChild(st);
  }

  /*
    renderTree(container, {
      wishes:     array of wishes, oldest first (use pickForTree)
      selectedId: id of the highlighted wish
      isDimmed:   function(wish) -> true to fade a tag
      onSelect:   function(id)
      scale:      optional fixed tag size; otherwise picked to fit
    })
  */
  function renderTree(container, opts) {
    var o = opts || {};
    var wishes = o.wishes || [];
    ensureCss();

    if (!container._wt) {
      container.innerHTML =
        '<div class="wt-stage">' +
        '<svg class="wt-art" viewBox="0 0 620 760" aria-hidden="true">' + TREE_SVG + '</svg>' +
        '<div class="wt-tags" role="group" aria-label="Wishes on the tree"></div>' +
        '</div>';
      container._wt = { seen: {}, first: true, onSelect: null };
      container.querySelector('.wt-tags').addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.wt-tag') : null;
        if (btn && typeof container._wt.onSelect === 'function') container._wt.onSelect(btn.getAttribute('data-id'));
      });
    }

    var st = container._wt;
    st.onSelect = o.onSelect || null;

    var scale = o.scale;
    var slots;
    if (scale) {
      slots = buildSlots(scale);
    } else {
      var tries = [1, 0.8, 0.68, 0.58];
      for (var t = 0; t < tries.length; t++) {
        scale = tries[t];
        slots = buildSlots(scale);
        if (wishes.length <= slots.length) break;
      }
    }

    var order = seededOrder(slots.length, 2026);
    var shown = wishes.slice(0, slots.length);
    var focused = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.wt-tag') : null;
    var focusedId = focused && container.contains(focused) ? focused.getAttribute('data-id') : null;

    // Sizes in container units so tags shrink and grow with the tree (100cqw = tree width = 620 tree units)
    var u = function (treeUnits) { return (treeUnits / 6.2).toFixed(3) + 'cqw'; };
    var sizeVars =
      '--w:' + u(40 * scale) + ';--h:' + u(54 * scale) + ';--str:' + u(14 * scale) + ';' +
      '--ic:' + u(18 * scale) + ';--icm:' + u(6 * scale) + ';--hole:' + u(6 * scale) + ';--holet:' + u(5 * scale) + ';';

    var html = '';
    var newCount = 0;
    var seenNext = {};
    for (var i = 0; i < shown.length; i++) {
      var w = shown[i];
      var id = String(w.id);
      var s = slots[order[i]];
      var pal = PALETTE[w.tag_color] || PALETTE.cream;
      var rot = (hash(id) % 11) - 5;
      var isNew = !st.first && !st.seen[id];
      var dim = typeof o.isDimmed === 'function' ? !!o.isDimmed(w) : false;
      var sel = o.selectedId != null && id === String(o.selectedId);
      seenNext[id] = true;
      html +=
        '<button type="button" class="wt-tag' + (isNew ? ' wt-new' : '') + (dim ? ' wt-dim' : '') + '"' +
        ' data-id="' + esc(id) + '" aria-pressed="' + (sel ? 'true' : 'false') + '"' +
        ' aria-label="' + esc('Wish from ' + displayName(w)) + '"' +
        ' style="left:' + (s.x / 6.2).toFixed(2) + '%;top:' + (s.y / 7.6).toFixed(2) + '%;' +
        '--r:' + rot + 'deg;' + sizeVars + '--bg:' + pal.bg + ';--fg:' + pal.fg + ';' +
        (isNew ? 'animation-delay:' + ((newCount++ % 8) * 90) + 'ms;' : '') + '">' +
        '<span class="wt-string"></span>' +
        '<span class="wt-body"><span class="wt-hole"></span>' + iconSvg(w.charm, Math.round(18 * scale)) + '</span>' +
        '</button>';
    }
    container.querySelector('.wt-tags').innerHTML = html;
    st.seen = seenNext;
    st.first = false;

    if (focusedId) {
      var again = container.querySelector('.wt-tag[data-id="' + (window.CSS && CSS.escape ? CSS.escape(focusedId) : focusedId) + '"]');
      if (again) again.focus({ preventScroll: true });
    }
    return { shown: shown, scale: scale, capacity: slots.length };
  }

  window.WishCore = {
    cfg: CFG,
    demo: DEMO,
    PALETTE: PALETTE,
    LANG_LABEL: LANG_LABEL,
    COUNTRY_LABEL: COUNTRY_LABEL,
    esc: esc,
    iconSvg: iconSvg,
    client: getClient,
    fetchApproved: fetchApproved,
    allowedEmail: allowedEmail,
    displayName: displayName,
    displayWhere: displayWhere,
    wishPageUrl: wishPageUrl,
    initGA: initGA,
    track: track,
    storageGet: storageGet,
    storageSet: storageSet,
    pickForTree: pickForTree,
    treeCapacity: treeCapacity,
    renderTree: renderTree
  };
})();
