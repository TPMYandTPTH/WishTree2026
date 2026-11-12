/* =========================================================
   TP Wish Tree 2026 - shared code used by every page.
   No need to edit this file. Settings live in config.js.
   ========================================================= */
(function () {
  'use strict';

  var CFG = window.WISH_CFG || {};
  var DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;

  // Folder this script lives in = the site root, so pages in sub-folders (leaders/) resolve paths correctly
  var BASE = (function () {
    try {
      var s = document.currentScript && document.currentScript.src;
      if (s) return s.slice(0, s.lastIndexOf('/') + 1);
    } catch (e) { /* ignore */ }
    return new URL('./', window.location.href).href;
  })();
  function url(path) {
    if (!path) return BASE;
    if (/^(https?:)?\/\//i.test(path) || path.charAt(0) === '/') return path;
    return BASE + String(path).replace(/^\.\//, '');
  }

  // Campaign colours: Spruce, Pine, Brass, Cranberry, Eggnog
  var COLORS = { spruce: '#343F37', pine: '#736E52', brass: '#B18854', cranberry: '#6C151E', eggnog: '#CFC3B0', paper: '#F4EEE3' };
  // Tag colours (the database keeps the names cream / red / gold: Eggnog, Cranberry and Brass on screen)
  var PALETTE = {
    cream: { bg: '#F4EEE3', fg: '#6C151E', text: '#343F37' },
    red: { bg: '#6C151E', fg: '#F4EEE3', text: '#F4EEE3' },
    gold: { bg: '#B18854', fg: '#241C14', text: '#241C14' }
  };
  /* ---------- Languages ---------- */
  var DEFAULT_LANGS = [
    { code: 'en', label: 'English', english: 'English' },
    { code: 'ms', label: 'Bahasa Melayu', english: 'Malay' },
    { code: 'th', label: 'ภาษาไทย', english: 'Thai' }
  ];
  var LANGUAGES = ((CFG.LANGUAGES && CFG.LANGUAGES.length) ? CFG.LANGUAGES : DEFAULT_LANGS).filter(function (l) {
    return l && /^[a-z]{2,3}$/.test(l.code);
  });
  var LANG_LABEL = {};
  LANGUAGES.forEach(function (l) { LANG_LABEL[l.code] = l.label; });
  function langLabel(code) { return LANG_LABEL[code] || String(code || '').toUpperCase(); }

  // Guess the language from the script it's written in (Latin-script languages can't be told apart reliably)
  function detectLang(text) {
    var s = String(text || '');
    var code = '';
    if (/[\u0E00-\u0E7F]/.test(s)) code = 'th';
    else if (/[\u3040-\u30FF]/.test(s)) code = 'ja';
    else if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(s)) code = 'ko';
    else if (/[\u3400-\u4DBF\u4E00-\u9FFF]/.test(s)) code = 'zh';
    else if (/[\u0B80-\u0BFF]/.test(s)) code = 'ta';
    else if (/[ăđơưĂĐƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/.test(s)) code = 'vi';
    return LANG_LABEL[code] ? code : '';
  }

  // Which languages this reader wants to read (null = all of them), remembered on this device
  function readLangs() {
    var v = null;
    try { v = JSON.parse(storageGet('wt-read-langs') || 'null'); } catch (e) { v = null; }
    if (!Array.isArray(v)) return null;
    v = v.filter(function (c) { return !!LANG_LABEL[c]; });
    return v.length && v.length < LANGUAGES.length ? v : null;
  }
  function saveReadLangs(list) {
    storageSet('wt-read-langs', list && list.length && list.length < LANGUAGES.length ? JSON.stringify(list) : '');
  }

  // Only https links (Supabase Storage) or images made in the browser (demo mode) are used as photos
  function safePhoto(u) {
    var v = String(u || '');
    if (/^assets\/leaders\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(v)) return url(v);
    if (/^https:\/\/[^\s"'<>()\\]+$/.test(v) && v.length < 600) return v;
    if (/^data:image\/(png|jpeg|webp|svg\+xml)[;,][^\s"<>\\]+$/.test(v) && v.length < 400000) return v;
    return '';
  }
  // An <img> for a person's photo. If the file can't be loaded, it turns into their initials.
  function photoHtml(src, initials, fallbackClass, imgClass) {
    return '<img' + (imgClass ? ' class="' + esc(imgClass) + '"' : '') + ' src="' + esc(src) + '" alt="" data-initials="' + esc(initials || '') + '"' +
      (fallbackClass ? ' data-fallback-class="' + esc(fallbackClass) + '"' : '') + '>';
  }
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-initials')) return;
    var span = document.createElement('span');
    span.className = img.getAttribute('data-fallback-class') || '';
    span.textContent = img.getAttribute('data-initials');
    if (img.parentNode && img.parentNode.classList) img.parentNode.classList.remove('has-photo', 'wt-photo');
    img.replaceWith(span);
  }, true);
  // Loads the 3D tree. On a weak connection its files can arrive slowly or not at all, so:
  // after opts.slowMs (or straight away if a download fails) the page shows the flat tree (opts.onSlow),
  // keeps trying in the background (4 tries, and again as soon as the connection comes back),
  // then swaps the 3D tree in (opts.onReady(module)). opts.onGiveUp runs if every try fails.
  function load3dTree(opts) {
    var tries = 0, finished = false, slowShown = false;
    function slow() { if (!slowShown && !finished) { slowShown = true; if (opts.onSlow) opts.onSlow(); } }
    var slowTimer = setTimeout(slow, opts.slowMs || 6000);
    function attempt() {
      var n = tries++;
      import(url('tree3d.js') + (n ? '?retry=' + n : '')).then(function (mod) {
        return (typeof mod.load === 'function' ? mod.load(n) : Promise.resolve()).then(function () { return mod; });
      }).then(function (mod) {
        finished = true;
        clearTimeout(slowTimer);
        opts.onReady(mod);
      }, function (err) {
        console.warn('Wish Tree: 3D tree download failed (try ' + tries + ')', err);
        slow();
        if (tries >= 4) {
          finished = true;
          clearTimeout(slowTimer);
          if (opts.onGiveUp) opts.onGiveUp(err);
          return;
        }
        var timer = setTimeout(again, [4000, 12000, 30000][tries - 1] || 30000);
        function again() {
          clearTimeout(timer);
          window.removeEventListener('online', again);
          attempt();
        }
        window.addEventListener('online', again);
      });
    }
    attempt();
  }
  var COUNTRY_LABEL = { MY: 'Malaysia', TH: 'Thailand' };

  // Charm icons as SVG path data (24 x 24), shared by the 2D and 3D trees
  var ICON_D = {
    snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
    tree: 'M12 3 6.5 10h3L5 16h14l-4.5-6h3zM12 16v4.5',
    gift: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1.5S10 7 12 7zm0 0c1.5-3 5-3.5 5-1.5S14 7 12 7z'
  };
  var ICON_PATHS = {};
  Object.keys(ICON_D).forEach(function (k) {
    ICON_PATHS[k] = '<path stroke-linejoin="round" d="' + ICON_D[k] + '"/>';
  });

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

  // Small seeded random generator, so each wish always gets the same spot on the tree
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
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

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    var first = parts[0].charAt(0);
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  /* ---------- Sites ---------- */
  var SITES = (CFG.SITES || []).slice();
  function siteById(id) {
    for (var i = 0; i < SITES.length; i++) if (SITES[i].id === id) return SITES[i];
    return null;
  }
  // "One Precinct, Penang"
  function siteName(id) {
    var s = siteById(id);
    if (!s) return String(id || '');
    return s.city ? s.label + ', ' + s.city : s.label;
  }

  /* ---------- Sample data for demo mode ---------- */
  var SAMPLE = [
    ['gtower', 'Thank you to the G-Tower floor for making every Monday feel lighter. Merry Christmas!', 'Daniel', 'en', 'cream', 'star'],
    ['gtower', 'Wishing every new joiner this year the same welcome I got on my first day. You belong here.', 'Priya', 'en', 'red', 'snow'],
    ['gtower', 'To the WFM team who juggle every schedule: you are the real Santa\'s helpers.', null, 'en', 'gold', 'gift'],
    ['gtower', 'Terima kasih team G-Tower atas sokongan sepanjang tahun. Semoga 2027 lebih ceria!', 'Hafiz', 'ms', 'cream', 'tree'],
    ['kcp', 'KCP family, thank you for the laughs during every peak season. See you in 2027!', 'Siti', 'en', 'red', 'star'],
    ['kcp', 'Thank you to my team lead for believing in me before I did.', 'Kumar', 'en', 'cream', 'snow'],
    ['kcp', 'Semoga semua rakan sekerja sihat dan dimurahkan rezeki.', 'Nurul', 'ms', 'gold', 'gift'],
    ['kcp', 'My wish for 2027: more team lunches and fewer system outages.', null, 'en', 'cream', 'tree'],
    ['gbs', 'To my GBS night-shift family: thank you for always having each other\'s backs.', 'Aisyah', 'en', 'cream', 'snow'],
    ['gbs', 'Thank you to IT for rescuing my headset more times than I can count.', 'Arjun', 'en', 'red', 'gift'],
    ['gbs', 'Wishing everyone at GBS a peaceful holiday with your loved ones.', 'Mei Ling', 'en', 'gold', 'star'],
    ['gbs', 'Terima kasih kerana sentiasa membantu saya belajar. Selamat Hari Krismas!', 'Faiz', 'ms', 'cream', 'tree'],
    ['op', 'To our trainers: thank you for your patience with every new batch. You make the floor better.', 'Jia Hui', 'en', 'cream', 'star'],
    ['op', 'One Precinct, thank you for the shuttle chats and the morning smiles.', null, 'en', 'red', 'snow'],
    ['op', 'Here\'s to learning a new language in 2027. Next Christmas I\'ll write this wish in Thai!', 'Kenji', 'en', 'gold', 'gift'],
    ['op', 'Grateful for a team that turns tough days into good stories. Merry Christmas!', 'Farah', 'en', 'cream', 'tree'],
    ['lv', 'Livingston Tower crew, thank you for every coffee run and every covered shift.', 'Wei Jie', 'en', 'red', 'star'],
    ['lv', 'Wishing my teammates a calm, happy and healthy 2027.', 'Anis', 'en', 'cream', 'snow'],
    ['lv', 'To everyone who helped me settle in Penang this year: thank you, truly.', 'Yuki', 'en', 'gold', 'tree'],
    ['lv', 'Selamat Hari Krismas dan Tahun Baru kepada semua di Livingston Tower!', 'Amir', 'ms', 'cream', 'gift'],
    ['jb', 'JB team, small but mighty. Thank you for an amazing year!', 'Rachel', 'en', 'cream', 'star'],
    ['jb', 'My wish: that everyone feels heard at work in 2027.', null, 'en', 'red', 'snow'],
    ['jb', 'Terima kasih atas kerjasama semua. Jumpa lagi tahun depan!', 'Zul', 'ms', 'gold', 'tree'],
    ['jb', 'Thank you to my supervisor for the patience and the jokes.', 'Priyanka', 'en', 'cream', 'gift'],
    ['singha', 'ขอบคุณทีมกรุงเทพฯ ที่ช่วยเหลือกันตลอดปีนี้ ขอให้ปี 2027 ทุกคนสุขภาพแข็งแรง', 'Nattaya', 'th', 'red', 'star'],
    ['singha', 'Thank you, Bangkok, for welcoming me when I moved here this year. Merry Christmas!', 'Lucas', 'en', 'cream', 'snow'],
    ['singha', 'ขอให้ทุกคนได้กลับบ้านไปหาครอบครัวช่วงปีใหม่นี้นะคะ', null, 'th', 'gold', 'gift'],
    ['singha', 'Wishing my teammates a peaceful holiday and a strong start to 2027.', 'Ploy', 'en', 'cream', 'tree'],
    ['wfh', 'Working from home can feel far away, but this team never made me feel alone.', null, 'en', 'cream', 'snow'],
    ['wfh', 'Thank you to everyone on the morning video calls. You made home feel like the office, in a good way.', 'Hana', 'en', 'red', 'star'],
    ['wfh', 'ขอให้ปีหน้าเป็นปีที่ดีของทุกคนในทีม TP', 'Somchai', 'th', 'gold', 'tree'],
    ['wfh', 'Grateful for flexible days and a team that always shows up. Happy holidays!', 'Ravi', 'en', 'cream', 'gift']
  ].map(function (r, i) {
    return {
      id: 'demo-' + (i + 1),
      site: r[0],
      message: r[1],
      display_name: r[2],
      lang: r[3],
      tag_color: r[4],
      charm: r[5],
      approved_at: new Date(Date.now() - (i * 97 + 300) * 60000).toISOString(),
      like_count: (hash('likes:' + i) % 38) + 1
    };
  });

  // More demo wishes in other languages, so the tree is fuller than its 60 spots
  var SAMPLE_MORE = [
    ['gtower', 'Thank you for every shift swap and every kind word this year.', 'Melissa', 'en', 'cream', 'star'],
    ['kcp', 'To my QA buddy: your feedback made me better. Merry Christmas!', 'Hakim', 'en', 'red', 'snow'],
    ['gbs', 'Wishing everyone a restful break and a fresh start in January.', null, 'en', 'gold', 'tree'],
    ['op', 'Thank you to the facilities team for keeping our floor bright and comfy.', 'Grace', 'en', 'cream', 'gift'],
    ['lv', 'To the night shift: the coffee is on me in 2027.', 'Darren', 'en', 'red', 'star'],
    ['jb', 'Grateful for teammates who turned into friends this year.', 'Amira', 'en', 'cream', 'snow'],
    ['singha', 'Thank you, HR, for answering every question with a smile.', 'Tom', 'en', 'gold', 'gift'],
    ['wfh', 'May 2027 bring us fewer escalations and more celebrations!', null, 'en', 'cream', 'tree'],
    ['gtower', 'To my trainer batch: we made it! Proud of all of you.', 'Shalini', 'en', 'red', 'star'],
    ['kcp', 'Merry Christmas to everyone who makes TP feel like home.', 'Jason', 'en', 'cream', 'gift'],
    ['gbs', 'Thank you to my manager for the trust and the second chances.', null, 'en', 'gold', 'snow'],
    ['op', 'Wishing peace, health and good food to every TP family.', 'Hui Min', 'en', 'cream', 'tree'],
    ['gtower', 'Selamat Hari Krismas kepada semua rakan di TP!', 'Syafiq', 'ms', 'red', 'tree'],
    ['lv', 'Terima kasih kerana sentiasa bersabar dengan saya tahun ini.', 'Izzati', 'ms', 'cream', 'star'],
    ['jb', 'Semoga tahun depan lebih banyak rezeki untuk kita semua.', null, 'ms', 'gold', 'gift'],
    ['kcp', 'Terima kasih team, kita memang terbaik!', 'Aiman', 'ms', 'cream', 'snow'],
    ['singha', 'สุขสันต์วันคริสต์มาสนะทุกคน ขอบคุณที่อยู่ด้วยกันมาทั้งปี', 'Kanokwan', 'th', 'cream', 'star'],
    ['singha', 'ขอให้ปีใหม่นี้มีแต่ความสุข สุขภาพแข็งแรงนะคะ', null, 'th', 'red', 'gift'],
    ['wfh', 'ขอบคุณหัวหน้าทีมที่คอยสนับสนุนเสมอครับ', 'Thanawat', 'th', 'cream', 'tree'],
    ['gtower', '祝大家圣诞快乐，新年身体健康，工作顺利！', 'Wei Ling', 'zh', 'red', 'star'],
    ['op', '感谢团队这一年的支持和陪伴。', null, 'zh', 'cream', 'snow'],
    ['lv', '愿2027年我们一起成长，一起加油！', 'Jun Hao', 'zh', 'gold', 'tree'],
    ['kcp', '谢谢每一位同事的帮助，圣诞快乐！', 'Xin Yi', 'zh', 'cream', 'gift'],
    ['op', 'チームの皆さん、一年間本当にありがとうございました。メリークリスマス！', 'Haruka', 'ja', 'cream', 'star'],
    ['gtower', '来年もよろしくお願いします。良いお年を！', 'Sota', 'ja', 'gold', 'snow'],
    ['gbs', 'いつも助けてくれる先輩たちに感謝しています。', null, 'ja', 'red', 'tree'],
    ['gtower', '올 한 해 함께해 주셔서 감사합니다. 메리 크리스마스!', 'Jiwoo', 'ko', 'cream', 'gift'],
    ['lv', '2027년에도 모두 건강하고 행복하세요.', null, 'ko', 'red', 'star'],
    ['kcp', '늘 도와주는 우리 팀 최고예요!', 'Minseo', 'ko', 'gold', 'snow'],
    ['gbs', 'Cảm ơn cả đội đã luôn hỗ trợ mình trong năm qua. Giáng sinh vui vẻ!', 'Linh', 'vi', 'cream', 'tree'],
    ['op', 'Chúc mọi người một năm mới an khang và hạnh phúc.', null, 'vi', 'gold', 'star'],
    ['jb', 'Terima kasih untuk tim yang selalu kompak. Selamat Natal dan Tahun Baru!', 'Putri', 'id', 'red', 'gift'],
    ['wfh', 'Semoga tahun 2027 membawa banyak kebahagiaan untuk kita semua.', 'Dimas', 'id', 'cream', 'snow'],
    ['kcp', 'அனைவருக்கும் இனிய கிறிஸ்துமஸ் நல்வாழ்த்துக்கள்!', 'Kavitha', 'ta', 'gold', 'star'],
    ['gtower', 'இந்த ஆண்டு முழுவதும் உதவிய என் அணிக்கு நன்றி.', null, 'ta', 'cream', 'tree'],
    ['jb', 'Thank you for making every busy Monday a little easier. Happy holidays!', 'Kelvin', 'en', 'cream', 'gift'],
    ['lv', 'To my seatmate: thanks for the snacks and the pep talks.', 'Nadia', 'en', 'gold', 'snow'],
    ['gbs', 'Wishing all the new joiners a wonderful first Christmas with TP.', 'Ramesh', 'en', 'red', 'tree'],
    ['wfh', 'Thank you to IT for every remote fix this year.', null, 'en', 'cream', 'star'],
    ['singha', 'Merry Christmas from Bangkok to every TP site!', 'Mint', 'en', 'red', 'gift']
  ].map(function (r, i) {
    return {
      id: 'demo-m-' + (i + 1),
      site: r[0],
      message: r[1],
      display_name: r[2],
      lang: r[3],
      tag_color: r[4],
      charm: r[5],
      approved_at: new Date(Date.now() - (i * 61 + 90) * 60000).toISOString(),
      like_count: hash('likes-m:' + i) % 24
    };
  });
  SAMPLE = SAMPLE.concat(SAMPLE_MORE);

  // Demo-only wishes waiting for approval (to try the approvals page)
  var SAMPLE_PENDING = [
    ['gtower', 'Merry Christmas all! If anyone wants to join our futsal team, WhatsApp me at 012-345 6789.', 'Arif', 'en', 'cream', 'gift', ['Phone number']],
    ['singha', 'ขอบคุณพี่ ๆ ทีมเทรนนิ่งที่ใจดีและอดทนกับน้องใหม่ทุกคนค่ะ', 'Ploy', 'th', 'red', 'star', []],
    ['gbs', 'Semoga 2027 membawa lebih banyak kejayaan untuk team GBS!', 'Nurul', 'ms', 'gold', 'tree', []],
    ['wfh', 'Thank you to my remote buddies for the daily morning check-ins. You kept me going this year.', null, 'en', 'cream', 'snow', []],
    ['kcp', 'Email me at siti.kcp@gmail.com if you want the cookie recipe from the party!', 'Siti', 'en', 'red', 'gift', ['Email address']],
    ['op', 'To my team: I know this year was tough. Proud of every one of you.', 'Jia Hui', 'en', 'gold', 'star', []]
  ].map(function (r, i) {
    return {
      id: 'demo-p-' + (i + 1), site: r[0], message: r[1], first_name: r[2], display_name: r[2],
      display_mode: r[2] ? 'name' : 'anon', lang: r[3], tag_color: r[4], charm: r[5], flags: r[6],
      email: (r[2] ? r[2].toLowerCase().replace(/\s+/g, '.') : 'colleague') + '@tp.com',
      status: 'pending', created_at: new Date(Date.now() - (i * 11 + 4) * 60000).toISOString()
    };
  });

  // Demo leaders: the real names, with sample text until each leader writes their own message.
  // Title, spot (on the tree or the list only), order and photo come from LEADERS in config.js.
  var SAMPLE_LEADERS = [
    ['Andy', '[Sample] Thank you for every call, every chat and every customer you helped this year. You are the reason TP Malaysia and Thailand shine. Merry Christmas and a happy 2027!'],
    ['Divya Dutta', '[Sample] This year we grew together across our sites in two countries. Rest well this holiday, and let us make 2027 our best year yet.'],
    ['Himanshu', '[Sample] To everyone working from home, on site, on nights and on weekends: we see you and we are grateful. Happy holidays to you and your families.'],
    ['Alex Ma', '[Sample] Every result this year came from the work you put in, one customer at a time. Thank you, and a joyful holiday season to you and your loved ones.'],
    ['Sarah', '[Sample] Thank you for showing up for each other all year long. May your holidays be restful and your 2027 bright.'],
    ['Rachel', '[Sample] Behind every wish on this tree is a person who makes TP a better place to work. Thank you, and happy holidays.'],
    ['Vivienne', '[Sample] My wish for 2027: that each of you feels proud of the work you do and supported by the people around you. Merry Christmas!'],
    ['Chavis', '[Sample] From Bangkok to Penang, Kuala Lumpur and Johor: thank you for a remarkable year. Wishing you joy and good health.'],
    ['Sudhar', '[Sample] Thank you for the care you bring to our customers and to each other. Enjoy the season with the people you love.']
  ];
  // Preview (sample) mode shows every card type for review. Add ?samples=launch to a preview link to see launch day:
  // Andy's message only (the tree goes out once Andy's is in; every other leader appears only after they post).
  var ALL_SAMPLES = !/[?&]samples=launch(&|$)/.test(window.location.search);
  if (!ALL_SAMPLES) SAMPLE_LEADERS = SAMPLE_LEADERS.slice(0, 1);
  // Every other leader in config.js LEADERS gets a placeholder (not words in their name), so the preview shows them all
  if (ALL_SAMPLES) leaderList().forEach(function (l) {
    var have = SAMPLE_LEADERS.some(function (r) { return r[0].toLowerCase() === l.name.toLowerCase(); });
    if (!have) SAMPLE_LEADERS.push([l.name, '[Sample] ' + l.name.split(' ')[0] + '\'s Christmas message will show here once it\'s written on the leaders\' page and approved.']);
  });
  SAMPLE_LEADERS = SAMPLE_LEADERS.map(function (r, i) {
    var c = leaderConfig(r[0]) || {};
    return {
      id: 'demo-leader-' + (i + 1),
      display_name: r[0],
      title: c.title || '',
      spot: c.spot || 'crown',
      senior: c.senior === true,
      level: c.level || 'manager',
      sort_order: c.order || i + 1,
      message: r[1],
      lang: 'en',
      photo_url: c.photo || null,
      updated_at: new Date(Date.UTC(2026, 11, 1, 6, i)).toISOString(),
      like_count: (hash('leader-likes:' + i) % 60) + 12
    };
  });

  var SAMPLE_PENDING_LEADERS = [
    { id: 'demo-leader-p1', display_name: 'New leader', title: '[Title]', message: 'Wishing every one of you rest, joy and time with the people you love. Thank you for 2026.', lang: 'en', status: 'pending', email: 'leader.e@tp.com', updated_at: new Date(Date.now() - 25 * 60000).toISOString() }
  ];

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

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  /* ---------- Demo store (only used when there are no Supabase keys) ---------- */
  function demoLoad(key, fallback) {
    try { var v = JSON.parse(storageGet(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function demoSave(key, value) { storageSet(key, JSON.stringify(value)); }

  // Everything that has gone through (or is waiting for) approval in demo mode
  function demoQueue() {
    var review = demoLoad('wt-demo-review', {});
    var applyReview = function (item, key) {
      var r = review[key];
      return r ? Object.assign({}, item, r) : Object.assign({}, item);
    };
    var sampleApproved = SAMPLE.map(function (w) {
      return applyReview(Object.assign({ status: 'approved', display_mode: w.display_name ? 'name' : 'anon', first_name: w.display_name, flags: [], email: (w.display_name || 'colleague').toLowerCase().replace(/\s+/g, '.') + '@tp.com', created_at: w.approved_at }, w), 'wish:' + w.id);
    });
    var wishes = SAMPLE_PENDING.map(function (w) { return applyReview(w, 'wish:' + w.id); }).concat(sampleApproved);
    demoLoad('wt-demo-wishes', []).forEach(function (w, i) {
      var phone = /\+?\d[\d\s\-().]{6,}\d/.exec(w.message || '');
      var flags = [];
      if (/[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(w.message || '')) flags.push('Email address');
      if (phone && phone[0].replace(/\D/g, '').length >= 9) flags.push('Phone number');
      wishes.unshift(Object.assign({ id: 'local-' + i, status: 'pending', flags: flags }, w, {
        display_name: w.first_name || null, key: undefined
      }));
    });
    var leaders = SAMPLE_PENDING_LEADERS.map(function (l) { return applyReview(l, 'leader:' + l.id); })
      .concat(SAMPLE_LEADERS.map(function (l) { return applyReview(Object.assign({ status: 'approved', email: 'leader@tp.com' }, l), 'leader:' + l.id); }));
    var mine = demoLoad('wt-demo-leader', null);
    if (mine && mine.message) leaders.unshift(Object.assign({ status: 'pending', email: 'you@tp.com' }, mine, { id: 'demo-leader-you' }));
    return { wishes: wishes, leaders: leaders };
  }

  function demoReview(kind, id, changes) {
    var stamp = { reviewed_at: new Date().toISOString() };
    if (changes.status === 'approved') stamp.approved_at = stamp.reviewed_at;
    var upd = Object.assign({}, changes, stamp);
    if (kind === 'wish' && String(id).indexOf('local-') === 0) {
      var list = demoLoad('wt-demo-wishes', []);
      var i = Number(String(id).slice(6));
      if (list[i]) { list[i] = Object.assign({}, list[i], upd); demoSave('wt-demo-wishes', list); }
      return;
    }
    if (kind === 'leader' && id === 'demo-leader-you') {
      var mine = demoLoad('wt-demo-leader', null);
      if (mine) demoSave('wt-demo-leader', Object.assign({}, mine, upd));
      return;
    }
    var review = demoLoad('wt-demo-review', {});
    review[kind + ':' + id] = Object.assign({}, review[kind + ':' + id] || {}, upd);
    demoSave('wt-demo-review', review);
  }

  /* ---------- BMS (employee number) ---------- */
  // People can type any BMS; the database decides quietly which likes count and which wishes can win.
  function cleanBms(v) { return String(v == null ? '' : v).replace(/\s+/g, '').replace(/[<>]/g, '').slice(0, 20); }
  function validBms(v) { return cleanBms(v).length > 0; }
  // A BMS that looks real: 4 to 7 digits, not one digit repeated (55555), not a straight run (1234567, 7654321).
  // The database has the same rule; this copy is only used in preview mode.
  function bmsLooksReal(v) {
    var b = cleanBms(v);
    return /^[0-9]{4,7}$/.test(b) && !/^(.)\1*$/.test(b) && '0123456789'.indexOf(b) === -1 && '9876543210'.indexOf(b) === -1;
  }
  // The BMS used to like on this device (remembered so people type it once)
  function myBms() { return cleanBms(storageGet('wt-bms')); }
  function saveMyBms(b) { storageSet('wt-bms', cleanBms(b)); }

  function deviceId() {
    var id = storageGet('wt-device');
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = window.crypto && crypto.randomUUID ? crypto.randomUUID()
        : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      storageSet('wt-device', id);
    }
    return id;
  }

  /* ---------- Likes ---------- */
  // counted: what the database counted for this device (loaded by loadMyLikes).
  // session: likes and unlikes made since this page opened. A like that didn't count (made-up BMS, own wish,
  // a second BMS on this device, after the deadline) stays on screen until the page is reloaded, then it's gone.
  var counted = {};
  var session = {};
  function lk(kind, id) { return kind + ':' + id; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function reconcileLikes() {
    Object.keys(session).forEach(function (k) { if (session[k] === !!counted[k]) delete session[k]; });
  }
  function loadMyLikes() {
    if (DEMO) {
      counted = demoLoad('wt-demo-likes', {}) || {};
      reconcileLikes();
      return Promise.resolve();
    }
    return getClient().rpc('get_device_likes', { p_device: deviceId() }).then(function (res) {
      if (res.error) throw res.error;
      var next = {};
      (res.data || []).forEach(function (r) { next[lk(r.kind, r.target_id)] = true; });
      counted = next;
      reconcileLikes();
    }).catch(function (err) { console.warn('Wish Tree: could not load your likes', err); });
  }
  function hasLiked(kind, id) {
    var k = lk(kind, id);
    return own(session, k) ? session[k] : !!counted[k];
  }
  // How much to add to the count the server sent, for likes made on this page since it opened
  function likeAdjust(kind, id) {
    var k = lk(kind, id);
    if (!own(session, k) || session[k] === !!counted[k]) return 0;
    return session[k] ? 1 : -1;
  }
  function likeCount(kind, item) { return Math.max(0, ((item && item.like_count) || 0) + likeAdjust(kind, item && item.id)); }

  // Resolves to { result: 'ok' | 'need_bms' | 'slow_down' }. 'ok' doesn't say whether the like counted.
  function setLike(kind, id, on) {
    var bms = myBms();
    if (!bms) return Promise.resolve({ result: 'need_bms' });
    var k = lk(kind, id);
    var had = own(session, k);
    var before = session[k];
    session[k] = !!on;
    var undo = function () { if (had) session[k] = before; else delete session[k]; };
    if (DEMO) {
      // preview mode follows the same rules; what counts is saved for the next reload
      var store = demoLoad('wt-demo-likes', {}) || {};
      var mine = kind === 'wish' && demoLoad('wt-demo-wishes', []).some(function (w, i) { return 'local-' + i === String(id) && w.bms === bms; });
      if (on && !store[k] && bmsLooksReal(bms) && !mine) store[k] = true;
      if (!on) delete store[k];
      demoSave('wt-demo-likes', store);
      return Promise.resolve({ result: 'ok' });
    }
    return getClient().rpc('set_like', { p_kind: kind, p_id: id, p_bms: bms, p_on: !!on, p_device: deviceId() }).then(function (res) {
      if (res.error) throw res.error;
      var row = Array.isArray(res.data) ? res.data[0] : res.data;
      var result = (row && row.result) || 'ok';
      if (result !== 'ok') undo();
      return { result: result };
    }, function (err) { undo(); throw err; });
  }
  function demoLikeBonus(kind, id) {
    return DEMO && (demoLoad('wt-demo-likes', {}) || {})[lk(kind, id)] ? 1 : 0;
  }

  /* ---------- Hanging a wish (no sign-in: name + BMS, one wish per BMS) ---------- */
  // What this browser remembers about the wish it sent: { bms, key, id }. The key is the only way to edit it.
  function myWishRef() {
    var r = demoLoad('wt-my-wish', null);
    return r && validBms(r.bms) && r.key ? r : null;
  }
  function saveMyWishRef(r) { demoSave('wt-my-wish', r); }
  // On a shared phone or laptop: forget the wish and the BMS this browser remembers
  function forgetMe() {
    try { window.localStorage.removeItem('wt-my-wish'); window.localStorage.removeItem('wt-bms'); } catch (e) { /* ignore */ }
  }

  // row: { bms, first_name, message, site, lang, tag_color, charm }
  // Resolves to { result: 'ok' | 'bms_taken' | 'slow_down', id, isNew }
  function submitWish(row) {
    var ref = myWishRef();
    var key = ref && ref.bms === row.bms ? ref.key : null;
    if (DEMO) {
      var list = demoLoad('wt-demo-wishes', []);
      var idx = -1;
      list.forEach(function (w, i) { if (w.bms === row.bms && w.status !== 'deleted') idx = i; });
      var flagsOf = function (m) {
        var f = [];
        if (/[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(m)) f.push('Email address');
        var ph = /\+?\d[\d\s\-().]{6,}\d/.exec(m);
        if (ph && ph[0].replace(/\D/g, '').length >= 9) f.push('Phone number');
        return f;
      };
      var rec = Object.assign({}, row, { display_mode: 'name', status: 'pending', flags: flagsOf(row.message), updated_at: new Date().toISOString() });
      if (idx >= 0) {
        if (!key || list[idx].key !== key) return Promise.resolve({ result: 'bms_taken' });
        list[idx] = Object.assign({}, list[idx], rec);
        demoSave('wt-demo-wishes', list);
        return Promise.resolve({ result: 'ok', id: 'local-' + idx, isNew: false });
      }
      var newKey = 'demo-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      list.push(Object.assign({ created_at: new Date().toISOString(), key: newKey }, rec));
      demoSave('wt-demo-wishes', list);
      saveMyWishRef({ bms: row.bms, key: newKey, id: 'local-' + (list.length - 1) });
      return Promise.resolve({ result: 'ok', id: 'local-' + (list.length - 1), isNew: true });
    }
    return getClient().rpc('submit_wish', {
      p_bms: row.bms, p_name: row.first_name, p_message: row.message,
      p_site: row.site, p_lang: row.lang, p_tag_color: row.tag_color, p_charm: row.charm, p_consent: true, p_edit_key: key
    }).then(function (res) {
      if (res.error) throw res.error;
      var r = Array.isArray(res.data) ? res.data[0] : res.data;
      if (!r) throw new Error('No answer from the server');
      if (r.result === 'ok' && r.edit_key) saveMyWishRef({ bms: row.bms, key: r.edit_key, id: r.wish_id });
      return { result: r.result, id: r.wish_id, isNew: !!r.is_new };
    });
  }

  // The wish this browser sent (or null)
  function getMyWish() {
    var ref = myWishRef();
    if (!ref) return Promise.resolve(null);
    if (DEMO) {
      var found = null;
      demoLoad('wt-demo-wishes', []).forEach(function (w, i) {
        if (w.bms === ref.bms && w.key === ref.key) found = Object.assign({ id: 'local-' + i, like_count: 0 }, w);
      });
      return Promise.resolve(found ? Object.assign({ bms: ref.bms }, found) : null);
    }
    return getClient().rpc('get_my_wish', { p_bms: ref.bms, p_edit_key: ref.key }).then(function (res) {
      if (res.error) throw res.error;
      var r = Array.isArray(res.data) ? res.data[0] : res.data;
      return r ? Object.assign({ bms: ref.bms }, r) : null;
    });
  }

  /* ---------- Prize: the most-liked wishes ---------- */
  var PRIZE = Object.assign({ enabled: true, winners: 5, amount: 'RM 100' }, CFG.PRIZE || {});
  // Preview mode only (the Approvals page reads the real standings from the database)
  // Preview mode only (the Approvals page uses get_prize_check when live; the public pages show no standings)
  function fetchPrizeTop(n) {
    n = n || PRIZE.winners || 5;
    if (!DEMO) return Promise.resolve([]);
    var list = demoQueue().wishes.filter(function (w) { return w.status === 'approved'; }).map(function (w) {
      return { id: w.id, display_name: w.display_name || w.first_name, bms: w.bms || '', site: w.site, message: w.message, approved_at: w.approved_at, like_count: (w.like_count || 0) + demoLikeBonus('wish', w.id) };
    }).filter(function (w) { return w.like_count > 0; });
    list.sort(function (a, b) { return (b.like_count - a.like_count) || (a.approved_at < b.approved_at ? -1 : 1); });
    return Promise.resolve(list.slice(0, n).map(function (w, i) { return Object.assign(w, { place: i + 1 }); }));
  }

  // Approved employee wishes, newest first
  function fetchApproved() {
    if (DEMO) {
      var list = demoQueue().wishes.filter(function (w) { return w.status === 'approved'; }).map(function (w) {
        return Object.assign({}, w, { like_count: (w.like_count || 0) + demoLikeBonus('wish', w.id) });
      });
      return Promise.resolve(list.sort(function (a, b) { return a.approved_at < b.approved_at ? 1 : -1; }));
    }
    return getClient().rpc('get_approved_wishes').then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }

  // Approved leaders' messages, oldest first (first leader gets the top spot)
  function fetchLeaders() {
    if (DEMO) {
      var list = demoQueue().leaders.filter(function (l) { return l.status === 'approved'; }).map(function (l) {
        return withLeaderConfig(Object.assign({}, l, { like_count: (l.like_count || 0) + demoLikeBonus('leader', l.id) }));
      });
      return Promise.resolve(list.sort(leaderOrder));
    }
    return getClient().rpc('get_leader_messages').then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(withLeaderConfig).sort(leaderOrder);
    });
  }
  // config.js LEADERS: the names a leader can pick on the leaders' page, where each one hangs, and their default photos
  function leaderSlug(name) {
    return String(name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function leaderList() {
    return (CFG.LEADERS || []).filter(function (l) { return l && l.name; }).map(function (l, i) {
      var name = String(l.name).trim();
      // level: 'exec' (C-level and VP), 'director', or 'manager' (managers and below); senior: true is the old way to say 'exec'
      var level = ['exec', 'director', 'manager'].indexOf(l.level) !== -1 ? l.level : (l.senior === true || l.spot === 'ceo' ? 'exec' : 'manager');
      return {
        name: name,
        title: String(l.title || '').trim(),
        spot: ['ceo', 'crown', 'gift', 'list'].indexOf(l.spot) !== -1 ? l.spot : 'list',
        level: level,
        senior: level === 'exec',
        order: i + 1,
        photo: String(l.photo || ('assets/leaders/' + leaderSlug(name) + '.jpg'))
      };
    });
  }
  function leaderConfig(name) {
    var n = String(name || '').trim().toLowerCase();
    return n ? leaderList().filter(function (l) { return l.name.toLowerCase() === n; })[0] || null : null;
  }
  function leaderPhoto(name) {
    var hit = leaderConfig(name);
    return hit && safePhoto(hit.photo) ? hit.photo : '';
  }
  // A leader on the config.js list hangs where the list says, in its order; no photo yet = the default photo
  function withLeaderConfig(l) {
    var c = leaderConfig(l.display_name);
    // a name that isn't on the list (typed on the leaders' page) goes in the list only, with the regular card
    if (!c) return CFG.LEADERS && CFG.LEADERS.length ? Object.assign({}, l, { spot: 'list', senior: false, level: 'manager' }) : l;
    return Object.assign({}, l, { spot: c.spot, senior: c.senior, level: c.level, sort_order: c.order, photo_url: l.photo_url || leaderPhoto(l.display_name) || null });
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
    var s = siteById(w.site);
    if (!s) return String(w.site || '');
    if (s.id === 'wfh') return 'Working from home';
    var country = COUNTRY_LABEL[s.country] || '';
    return s.label + (s.city ? ', ' + s.city : '') + (country ? ' · ' + country : '');
  }

  function wishPageUrl() {
    return CFG.WISH_PAGE_URL || url('wish.html');
  }

  function initGA() {
    window.dataLayer = window.dataLayer || [];
    // Google Tag Manager (GTM_ID in config.js): the container decides which tags run (GA4 and so on)
    if (CFG.GTM_ID && !window.__wtGtm) {
      window.__wtGtm = true;
      if (!window.gtag) {
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
      }
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var g = document.createElement('script');
      g.async = true;
      g.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(CFG.GTM_ID);
      document.head.appendChild(g);
    }
    if (!CFG.GA4_ID || window.__wtGa4) return;
    window.__wtGa4 = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CFG.GA4_ID);
    document.head.appendChild(s);
    if (!window.gtag) {
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
    }
    window.gtag('config', CFG.GA4_ID);
  }

  // Events for GTM (dataLayer events: use them as Custom Event triggers) and GA4. Never sends a BMS or a name.
  function track(name, params) {
    try {
      if (CFG.GTM_ID && window.dataLayer) window.dataLayer.push(Object.assign({ event: name }, params || {}));
      // GA4: straight from the page (GA4_ID), or through the GA4 tag that Tag Manager loads (GA4_EVENTS_VIA_GTM)
      if (window.gtag && (CFG.GA4_ID || (CFG.GTM_ID && CFG.GA4_EVENTS_VIA_GTM !== false))) window.gtag('event', name, params || {});
    } catch (e) { /* ignore */ }
  }

  function setLogo(img) {
    if (!img) return;
    if (!CFG.LOGO_URL) { img.hidden = true; return; }
    img.addEventListener('error', function () { img.hidden = true; });
    img.src = url(CFG.LOGO_URL);
    img.hidden = false;
  }

  // Newest `cap` wishes, returned oldest first so tags keep their place as new ones arrive
  function pickForTree(wishesNewestFirst, cap) {
    return wishesNewestFirst.slice(0, cap).reverse();
  }
  function newestFirst(a, b) {
    var x = String(a.approved_at || ''), y = String(b.approved_at || '');
    return x < y ? 1 : x > y ? -1 : 0;
  }
  /* ---------- Where leaders' messages hang ---------- */
  var CROWN_MAX = 8;        // the CEO's big ornament plus 7 around the top of the tree
  var LEADER_GIFTS = 2;     // gift boxes under the tree that hold a leader's message
  function leaderOrder(a, b) {
    var ca = a.spot === 'ceo' ? 0 : 1, cb = b.spot === 'ceo' ? 0 : 1;
    if (ca !== cb) return ca - cb;
    var sa = a.sort_order == null ? 100 : a.sort_order, sb = b.sort_order == null ? 100 : b.sort_order;
    if (sa !== sb) return sa - sb;
    return String(a.updated_at || '') < String(b.updated_at || '') ? -1 : 1;
  }
  // { crown: [...] (CEO first), gifts: [...], extra: [...] (only in the list) }
  function leaderPlaces(list) {
    var all = (list || []).slice().sort(leaderOrder);
    var crown = [], gifts = [], extra = [];
    var ceoTaken = false;
    all.forEach(function (L) {
      if (L.spot === 'list') { extra.push(L); return; }
      if (L.spot === 'gift') { (gifts.length < LEADER_GIFTS ? gifts : extra).push(L); return; }
      if (L.spot === 'ceo' && !ceoTaken) { ceoTaken = true; crown.unshift(L); return; }
      if (crown.length < CROWN_MAX) crown.push(L);
      else if (gifts.length < LEADER_GIFTS) gifts.push(L);   // no room at the top: into a gift
      else extra.push(L);
    });
    return { crown: crown, gifts: gifts, extra: extra, all: crown.concat(gifts, extra) };
  }

  // More wishes than spots: the most-liked go on the tree (ties go to the newest). Returns oldest first, like pickForTree.
  function rankForTree(list, cap) {
    if (list.length <= cap) return list.slice().sort(newestFirst).reverse();
    var top = list.slice().sort(function (a, b) {
      return ((b.like_count || 0) - (a.like_count || 0)) || newestFirst(a, b);
    }).slice(0, cap);
    return top.sort(newestFirst).reverse();
  }

  /* ---------- The tree ---------- */
  // Tree outline in tree units (620 x 760): [apex y, base y, half width at base]
  var TIERS = [[70, 230, 110], [150, 360, 165], [250, 500, 220], [370, 650, 280]];
  // Crown of the tree is kept for leaders' messages
  var CROWN_SIZE = 8;
  // Flat tree: the CEO right under the star, the other leaders scattered over the top in a mixed order
  // (the same every visit). Spots are [x, y, size] on the 620 x 760 tree.
  var FLAT_CROWN = [[262, 142], [358, 142], [232, 196], [310, 196], [388, 196], [268, 238], [352, 238]];
  var FLAT_CROWN_USE = { 1: [3], 2: [0, 1], 3: [0, 1, 3], 4: [0, 1, 2, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
  function crownPositions(leaders) {
    var out = new Array(leaders.length);
    var hasCeo = leaders.length && leaders[0].spot === 'ceo';
    if (hasCeo) out[0] = [310, 84, 60];
    var rest = [];
    for (var i = hasCeo ? 1 : 0; i < leaders.length; i++) rest.push(i);
    rest.sort(function (a, b) { return hash('crown:' + leaders[a].id) - hash('crown:' + leaders[b].id); });
    var use = FLAT_CROWN_USE[Math.min(rest.length, 7)] || [];
    rest.forEach(function (li, k) {
      var slot = FLAT_CROWN[use[k]];
      if (!slot) return;
      var h = hash('crown-jitter:' + leaders[li].id);
      out[li] = [slot[0] + (h % 7) - 3, slot[1] + ((h >>> 8) % 7) - 3, 44];
    });
    return out;
  }
  var TAGS_START_Y = 284;

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
    for (var y = TAGS_START_Y; y + th <= 642; y += rowStep) {
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

  // Random but repeatable spots inside the tree outline (seeded by each wish's id),
  // weighted towards the wider lower branches, never overlapping another tag
  function scatterTags(wishes, scale) {
    var tw = 40 * scale;
    var th = (54 + 14) * scale;
    var placed = [];
    for (var i = 0; i < wishes.length; i++) {
      var rnd = mulberry32(hash('tag:' + wishes[i].id));
      for (var k = 0; k < 90; k++) {
        var y = TAGS_START_Y + rnd() * (638 - th - TAGS_START_Y);
        var hw = Math.min(halfWidthAt(y + 14 * scale), halfWidthAt(y + th * 0.5), halfWidthAt(y + th)) - tw / 2 - 6;
        if (hw <= 0 || rnd() > (hw + 40) / 300) continue;
        var x = 310 + (rnd() * 2 - 1) * hw;
        var ok = true;
        for (var j = 0; j < placed.length; j++) {
          if (Math.abs(placed[j].x - x) < tw + 5 * scale && Math.abs(placed[j].y - y) < th + 3 * scale) { ok = false; break; }
        }
        if (ok) { placed.push({ w: wishes[i], x: x, y: y }); break; }
      }
    }
    return placed;
  }

  var LIGHTS = [
    [248, 196], [279, 203], [311, 204], [343, 200], [376, 189],
    [204, 309], [231, 316], [258, 320], [285, 322], [312, 323], [339, 320], [366, 316], [393, 310], [420, 301],
    [164, 451], [201, 458], [238, 463], [275, 466], [312, 465], [349, 462], [386, 455], [423, 446], [460, 435],
    [126, 602], [172, 612], [219, 618], [265, 621], [312, 621], [359, 618], [406, 612], [453, 603], [500, 590]
  ];
  var BALLS = [
    [312, 287, 11, '#8E1F2A'], [260, 361, 10, '#B18854'], [350, 359, 10, '#8E1F2A'],
    [257, 441, 10, '#8E1F2A'], [343, 441, 10, '#B18854'], [140, 463, 9, '#B18854'], [480, 471, 9, '#8E1F2A'],
    [217, 521, 10, '#B18854'], [387, 523, 10, '#8E1F2A'], [215, 604, 11, '#8E1F2A'], [415, 604, 11, '#B18854']
  ];

  var TREE_SVG = (function () {
    var p = [];
    p.push('<ellipse cx="310" cy="702" rx="250" ry="16" fill="#3B2F22" opacity="0.2"/>');
    p.push('<rect x="289" y="628" width="42" height="72" rx="6" fill="#5A3A26"/><rect x="310" y="628" width="21" height="72" fill="#4A2F1F"/>');
    p.push('<path d="M310,370 L30,650 Q170,682 310,662 Z" fill="#424F46"/><path d="M310,370 L310,662 Q450,682 590,650 Z" fill="#29322C"/>');
    p.push('<path d="M310,250 L90,500 Q200,528 310,510 Z" fill="#46534A"/><path d="M310,250 L310,510 Q420,528 530,500 Z" fill="#2B342E"/>');
    p.push('<path d="M310,150 L145,360 Q228,384 310,368 Z" fill="#4A574B"/><path d="M310,150 L310,368 Q392,384 475,360 Z" fill="#2D3730"/>');
    p.push('<path d="M310,70 L200,230 Q255,250 310,236 Z" fill="#4F5C4F"/><path d="M310,70 L310,236 Q365,250 420,230 Z" fill="#303A33"/>');
    ['M232,190 Q310,222 392,182', 'M178,300 Q310,350 448,290', 'M128,440 Q310,500 498,420', 'M80,590 Q310,660 548,575'].forEach(function (d) {
      p.push('<path d="' + d + '" fill="none" stroke="#B18854" stroke-width="1.6" opacity="0.8"/>');
    });
    LIGHTS.forEach(function (l, i) {
      // each light glows high and low at its own pace
      var dur = (1.6 + ((i * 7) % 11) * 0.22).toFixed(2) + 's';
      var del = (-((i * 0.37) % 3)).toFixed(2) + 's';
      var anim = 'animation-duration:' + dur + ';animation-delay:' + del;
      p.push('<circle class="wt-halo" style="' + anim + '" cx="' + l[0] + '" cy="' + l[1] + '" r="9" fill="#FFD98A"/>');
      p.push('<circle class="wt-light" style="' + anim + '" cx="' + l[0] + '" cy="' + l[1] + '" r="2.9" fill="#FFF4D6"/>');
    });
    BALLS.forEach(function (b) {
      p.push('<rect x="' + (b[0] - 4) + '" y="' + (b[1] - b[2] - 5) + '" width="8" height="5" rx="1" fill="#C9A36B"/>');
      p.push('<circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '" fill="' + b[3] + '"/>');
      p.push('<circle cx="' + (b[0] - 3) + '" cy="' + (b[1] - 3) + '" r="' + (b[2] * 0.28).toFixed(1) + '" fill="#fff" opacity="0.38"/>');
    });
    p.push('<circle cx="310" cy="52" r="44" fill="#B18854" opacity="0.16"/><circle cx="310" cy="52" r="30" fill="#B18854" opacity="0.24"/>');
    p.push('<polygon points="310,26 316.47,43.1 334.73,43.97 320.46,55.4 325.28,73.03 310,63 294.72,73.03 299.54,55.4 285.27,43.97 303.53,43.1" fill="#C99A55"/>');
    p.push('<polygon points="310,26 316.47,43.1 334.73,43.97 320.46,55.4 310,52" fill="#E2BF85"/>');
    return p.join('');
  })();

  var STAR_PATH = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';

  var TREE_CSS = [
    '.wt-stage{position:relative;width:100%;aspect-ratio:620/760;container-type:inline-size}',
    '.wt-art{position:absolute;top:0;left:0;width:100%;height:100%;display:block}',
    /* lights glow high and low */
    '.wt-light{animation:wt-glow 2.4s ease-in-out infinite}',
    '.wt-halo{transform-box:fill-box;transform-origin:center;animation:wt-halo 2.4s ease-in-out infinite}',
    '@keyframes wt-glow{0%,100%{opacity:1}50%{opacity:.3}}',
    '@keyframes wt-halo{0%,100%{opacity:.5;transform:scale(1.5)}50%{opacity:.05;transform:scale(.6)}}',
    /* employee tags: the button places the tag, .wt-swing makes it wiggle */
    '.wt-tag{position:absolute;padding:0;margin:0;border:0;background:transparent;cursor:pointer;width:var(--w);transform:translateX(-50%) rotate(var(--r,0deg));transform-origin:50% 0;transition:opacity .35s ease,transform .35s ease;-webkit-tap-highlight-color:transparent}',
    '.wt-swing{display:flex;flex-direction:column;align-items:center;transform-origin:50% 0;animation:wt-wiggle var(--wd,3s) ease-in-out var(--wdel,0s) infinite}',
    '@keyframes wt-wiggle{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}',
    '.wt-tag:hover .wt-swing{animation:wt-jiggle .7s ease-in-out}',
    '@keyframes wt-jiggle{0%{transform:rotate(0)}20%{transform:rotate(-14deg)}45%{transform:rotate(10deg)}70%{transform:rotate(-5deg)}100%{transform:rotate(0)}}',
    '.wt-string{display:block;width:1px;height:var(--str);background:#A89B78}',
    '.wt-body{position:relative;display:flex;align-items:center;justify-content:center;width:var(--w);height:var(--h);background:var(--bg);color:var(--fg);border-radius:3px 3px 5px 5px;box-shadow:0 3px 6px rgba(0,0,0,.35);transition:box-shadow .25s ease}',
    '.wt-body svg{width:var(--ic);height:var(--ic);margin-top:var(--icm)}',
    '.wt-hole{position:absolute;top:var(--holet);left:50%;width:var(--hole);height:var(--hole);transform:translateX(-50%);border-radius:50%;background:rgba(52,63,55,.5)}',
    '.wt-tag[aria-pressed="true"]{transform:translateX(-50%) rotate(0deg);z-index:2}',
    '.wt-tag[aria-pressed="true"] .wt-body{box-shadow:0 0 0 2px #F4EEE3,0 0 0 6px rgba(177,136,84,.75),0 8px 18px rgba(0,0,0,.45)}',
    '.wt-tag:focus,.wt-leader:focus{outline:none}',
    '.wt-tag:focus-visible .wt-body,.wt-leader:focus-visible .wt-lball{box-shadow:0 0 0 2px #F4EEE3,0 0 0 5px #0E6E63}',
    '.wt-tag.wt-dim{opacity:.22}',
    '.wt-tag.wt-new{animation:wt-drop .8s cubic-bezier(.2,.9,.3,1.2) both}',
    '@keyframes wt-drop{from{opacity:0;transform:translateX(-50%) translateY(-40px) rotate(var(--r,0deg))}to{opacity:1;transform:translateX(-50%) rotate(var(--r,0deg))}}',
    /* leaders' ornaments in the crown */
    '.wt-leader{position:absolute;padding:0;margin:0;border:0;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;width:var(--d);transform:translateX(-50%);transform-origin:50% 0;z-index:3;-webkit-tap-highlight-color:transparent;animation:wt-sway 5s ease-in-out infinite}',
    '@keyframes wt-sway{0%,100%{transform:translateX(-50%) rotate(-2deg)}50%{transform:translateX(-50%) rotate(2deg)}}',
    '.wt-lstring{display:block;width:1px;height:var(--lstr);background:#C99A55}',
    '.wt-lcap{display:block;width:calc(var(--d) * .26);height:calc(var(--d) * .14);margin-bottom:-1px;border-radius:2px 2px 0 0;background:#6C151E}',
    '.wt-lball{position:relative;display:flex;align-items:center;justify-content:center;width:var(--d);height:var(--d);border-radius:50%;background:#B18854;color:#241C14;font-weight:700;font-size:calc(var(--d) * .32);letter-spacing:.02em;line-height:1;box-shadow:inset 0 0 0 calc(var(--d) * .06) #D2AE78,0 0 0 calc(var(--d) * .1) rgba(201,154,85,.28),0 4px 10px rgba(0,0,0,.35);transition:box-shadow .25s ease}',
    '.wt-lball::after{content:"";position:absolute;left:18%;top:16%;width:22%;height:22%;border-radius:50%;background:rgba(255,255,255,.45)}',
    '.wt-lball.wt-photo{background-color:#B18854}',
    '.wt-limg{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover}',
    '.wt-gift{position:absolute;left:23%;top:87.5%;width:7%;aspect-ratio:1/0.9;padding:0;border:0;background:transparent;cursor:pointer;z-index:2;-webkit-tap-highlight-color:transparent;--box:#6C151E;--lid:#7D1C26;--rib:#B18854}',
    '.wt-gift-box{position:absolute;left:4%;right:4%;bottom:0;height:72%;border-radius:2px;background:linear-gradient(90deg,transparent 42%,var(--rib) 42%,var(--rib) 58%,transparent 58%),var(--box);box-shadow:0 4px 8px rgba(0,0,0,.3)}',
    '.wt-gift-lid{position:absolute;left:0;right:0;top:12%;height:20%;border-radius:2px;background:linear-gradient(90deg,transparent 42%,var(--rib) 42%,var(--rib) 58%,transparent 58%),var(--lid);transform-origin:10% 100%;transition:transform .5s cubic-bezier(.3,1.5,.5,1)}',
    '.wt-gift:hover .wt-gift-lid{transform:rotate(-8deg)}',
    '.wt-gift-gold{left:15%;top:87%;width:5.6%;aspect-ratio:1/1.05;--box:#B18854;--lid:#BE9663;--rib:#6C151E}',
    '.wt-gift-gold .wt-gift-lid{transform-origin:90% 100%}',
    '.wt-gift-gold:hover .wt-gift-lid{transform:rotate(8deg)}',
    '.wt-gift-gold[aria-pressed="true"] .wt-gift-lid{transform:rotate(38deg) translateY(-30%)}',
    '.wt-gift-green{left:52%;top:89%;width:6.5%;--box:#343F37;--lid:#3D493F;--rib:#B18854}',
    '.wt-gift-cream{left:38%;top:89.5%;width:6%;--box:#F4EEE3;--lid:#FBF7EF;--rib:#6C151E}',
    /* the prize gift: big, on the right, always moving a little */
    '.wt-gift-prize{left:72%;top:84.5%;width:14%;aspect-ratio:1/0.92;z-index:3;--box:#6C151E;--lid:#7D1C26;--rib:#C99A55;animation:wt-hop 3s ease-in-out infinite;transform-origin:50% 100%}',
    '.wt-gift-prize .wt-gift-box{height:70%;box-shadow:0 8px 14px rgba(0,0,0,.3)}',
    '.wt-gift-prize .wt-gift-lid{top:16%;height:18%}',
    '.wt-gift-bow{position:absolute;left:50%;top:2%;width:44%;height:18%;transform:translateX(-50%);pointer-events:none;transition:transform .5s cubic-bezier(.3,1.5,.5,1)}',
    '.wt-gift-bow::before,.wt-gift-bow::after{content:"";position:absolute;top:0;width:48%;height:100%;border:max(2px,.5cqw) solid var(--rib);border-radius:50% 50% 40% 40%}',
    '.wt-gift-bow::before{left:0;transform:rotate(-18deg)}',
    '.wt-gift-bow::after{right:0;transform:rotate(18deg)}',
    '.wt-gift-label{position:absolute;left:50%;bottom:20%;transform:translateX(-50%);padding:.4cqw 1.1cqw;border-radius:.6cqw;background:#F4EEE3;color:#6C151E;font-size:1.9cqw;font-weight:700;line-height:1.15;white-space:nowrap;text-align:center;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.25)}',
    '.wt-gift-prize[aria-pressed="true"]{animation:none}',
    '.wt-gift-prize[aria-pressed="true"] .wt-gift-bow{transform:translateX(-50%) translateY(-60%) rotate(-12deg)}',
    '@keyframes wt-hop{0%,58%,100%{transform:none}64%{transform:translateY(-7%) rotate(-3deg)}70%{transform:translateY(0) rotate(2.5deg)}76%{transform:translateY(-3%) rotate(-1.5deg)}82%{transform:rotate(1deg)}88%{transform:none}}',
    '.wt-leader.wt-ceo .wt-lball{box-shadow:inset 0 0 0 calc(var(--d) * .06) #D2AE78,0 0 0 3px #B18854,0 0 0 7px rgba(201,154,85,.35),0 8px 18px rgba(0,0,0,.4)}',
    '.wt-gift[aria-pressed="true"] .wt-gift-lid{transform:rotate(-38deg) translateY(-30%)}',
    '.wt-gift:focus-visible{outline:3px solid #0E6E63;outline-offset:3px;border-radius:4px}',
    '.wt-lball.wt-photo::after{display:none}',
    '.wt-lstar{position:absolute;right:-6%;bottom:-6%;width:calc(var(--d) * .4);height:calc(var(--d) * .4);border-radius:50%;background:#6C151E;color:#F4EEE3;display:flex;align-items:center;justify-content:center}',
    '.wt-lstar svg{width:62%;height:62%}',
    '.wt-leader[aria-pressed="true"]{animation:none}',
    '.wt-leader[aria-pressed="true"] .wt-lball{box-shadow:inset 0 0 0 calc(var(--d) * .06) #D2AE78,0 0 0 3px #F4EEE3,0 0 0 8px rgba(201,154,85,.55),0 8px 18px rgba(0,0,0,.4)}',
    '@media (prefers-reduced-motion:reduce){.wt-tag,.wt-body{transition:none}.wt-tag.wt-new,.wt-light,.wt-halo,.wt-leader,.wt-swing,.wt-tag:hover .wt-swing,.wt-gift-prize{animation:none}}'
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
      wishes:   employee wishes, oldest first (use pickForTree)
      leaders:  leaders' messages (the CEO plus 7 hang at the top)
      selected: { kind: 'wish' | 'leader' | 'secret' | 'prize', id }
      isDimmed: function(wish) -> true to fade a tag
      onSelect: function(kind, id, how) - how is { hover: true } when the mouse rested on it
      secrets:  hidden gift ids on the left ('red', 'gold')
      prize:    true to show the big prize gift on the right
      scale:    optional fixed tag size; otherwise picked to fit
    })
  */
  function renderTree(container, opts) {
    var o = opts || {};
    var wishes = o.wishes || [];
    var leaders = (o.leaders || []).slice(0, CROWN_SIZE);
    var sel = o.selected || {};
    ensureCss();

    if (!container._wt) {
      container.innerHTML =
        '<div class="wt-stage">' +
        '<svg class="wt-art" viewBox="0 0 620 760" aria-hidden="true">' + TREE_SVG + '</svg>' +
        '<div class="wt-crown" role="group" aria-label="Messages from our leaders"></div>' +
        '<div class="wt-tags" role="group" aria-label="Wishes on the tree"></div>' +
        (o.secrets || []).map(function (id) {
          return '<button type="button" class="wt-gift wt-gift-' + esc(id) + '" data-kind="secret" data-id="' + esc(id) + '" aria-label="A gift under the tree"><span class="wt-gift-lid"></span><span class="wt-gift-box"></span></button>';
        }).join('') +
        (o.prize ? '<button type="button" class="wt-gift wt-gift-prize" data-kind="prize" data-id="prize" aria-label="' + esc(o.prizeLabel || 'Prize for the most-liked wishes') + '">' +
          '<span class="wt-gift-bow"></span><span class="wt-gift-lid"></span><span class="wt-gift-box"></span>' +
          '<span class="wt-gift-label">' + esc(o.prizeTag || (PRIZE.winners + ' x ' + PRIZE.amount)) + '</span></button>' : '') +
        '<span class="wt-lgifts"></span>' +
        '</div>';
      container._wt = { seen: {}, first: true, onSelect: null };
      var stageEl = container.querySelector('.wt-stage');
      var pick = function (target) { return target && target.closest ? target.closest('.wt-tag,.wt-leader,.wt-gift') : null; };
      stageEl.addEventListener('click', function (e) {
        var btn = pick(e.target);
        if (!btn || typeof container._wt.onSelect !== 'function') return;
        container._wt.onSelect(btn.getAttribute('data-kind'), btn.getAttribute('data-id'));
      });
      // With a mouse, resting on a tag, an ornament or a gift opens it (a short pause, so passing over doesn't)
      var hoverTimer = 0;
      var hoverBtn = null;
      stageEl.addEventListener('pointerover', function (e) {
        if (e.pointerType !== 'mouse') return;
        var btn = pick(e.target);
        if (btn === hoverBtn) return;
        hoverBtn = btn;
        clearTimeout(hoverTimer);
        if (!btn) return;
        var kind = btn.getAttribute('data-kind'), id = btn.getAttribute('data-id');
        hoverTimer = setTimeout(function () {
          if (btn.getAttribute('aria-pressed') === 'true' || typeof container._wt.onSelect !== 'function') return;
          container._wt.onSelect(kind, id, { hover: true });
        }, 260);
      });
      stageEl.addEventListener('pointerleave', function () { clearTimeout(hoverTimer); hoverBtn = null; });
    }

    var st = container._wt;
    st.onSelect = o.onSelect || null;
    // gifts that hold a leader's message (they change as leaders' messages come in)
    var lgSig = (o.leaderGifts || []).slice(0, 2).map(function (L) { return L.id; }).join('|');
    if (st.lgSig !== lgSig) {
      st.lgSig = lgSig;
      container.querySelector('.wt-lgifts').innerHTML = (o.leaderGifts || []).slice(0, 2).map(function (L, i) {
        return '<button type="button" class="wt-gift wt-gift-' + (i ? 'cream' : 'green') + '" data-kind="leader" data-id="' + esc(L.id) + '" aria-label="A gift under the tree"><span class="wt-gift-lid"></span><span class="wt-gift-box"></span></button>';
      }).join('');
    }
    Array.prototype.forEach.call(container.querySelectorAll('.wt-gift'), function (giftBtn) {
      var gid = giftBtn.getAttribute('data-id');
      var gkind = giftBtn.getAttribute('data-kind');
      giftBtn.setAttribute('aria-pressed', sel.kind === gkind && String(sel.id) === gid ? 'true' : 'false');
    });

    // Scatter the tags at random (repeatable) spots, shrinking them if the tree gets crowded
    var scale = o.scale;
    var spots;
    var tries = scale ? [scale] : [1, 0.8, 0.68, 0.58];
    for (var t = 0; t < tries.length; t++) {
      scale = tries[t];
      spots = scatterTags(wishes, scale);
      if (spots.length >= wishes.length) break;
    }

    // Sizes in container units so everything grows and shrinks with the tree (100cqw = 620 tree units)
    var u = function (treeUnits) { return (treeUnits / 6.2).toFixed(3) + 'cqw'; };
    var sizeVars =
      '--w:' + u(40 * scale) + ';--h:' + u(54 * scale) + ';--str:' + u(14 * scale) + ';' +
      '--ic:' + u(18 * scale) + ';--icm:' + u(6 * scale) + ';--hole:' + u(6 * scale) + ';--holet:' + u(5 * scale) + ';';

    var focused = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.wt-tag,.wt-leader') : null;
    var focusedKey = focused && container.contains(focused) ? focused.getAttribute('data-kind') + ':' + focused.getAttribute('data-id') : null;

    // Leaders' crown
    var crown = '';
    var cspots = crownPositions(leaders);
    for (var li = 0; li < leaders.length; li++) {
      var L = leaders[li];
      var lid = String(L.id);
      var pos = cspots[li];
      if (!pos) continue;
      var lsel = sel.kind === 'leader' && String(sel.id) === lid;
      crown +=
        '<button type="button" class="wt-leader' + (L.spot === 'ceo' ? ' wt-ceo' : '') + '" data-kind="leader" data-id="' + esc(lid) + '"' +
        ' aria-pressed="' + (lsel ? 'true' : 'false') + '"' +
        ' aria-label="' + esc('Message from ' + (L.display_name || 'a TP leader')) + '"' +
        ' style="left:' + (pos[0] / 6.2).toFixed(2) + '%;top:' + (pos[1] / 7.6).toFixed(2) + '%;' +
        '--d:' + u(pos[2]) + ';--lstr:' + u(10) + ';animation-delay:' + (li * -0.8) + 's">' +
        '<span class="wt-lstring"></span><span class="wt-lcap"></span>' +
        (safePhoto(L.photo_url)
          ? '<span class="wt-lball wt-photo">' + photoHtml(safePhoto(L.photo_url), initials(L.display_name), '', 'wt-limg')
          : '<span class="wt-lball">' + esc(initials(L.display_name))) +
        '<span class="wt-lstar"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg></span>' +
        '</span></button>';
    }
    container.querySelector('.wt-crown').innerHTML = crown;

    // Employee tags
    var shown = spots.map(function (sp) { return sp.w; });
    var html = '';
    var newCount = 0;
    var seenNext = {};
    for (var i = 0; i < spots.length; i++) {
      var w = spots[i].w;
      var id = String(w.id);
      var s = spots[i];
      var pal = PALETTE[w.tag_color] || PALETTE.cream;
      var hv = hash(id);
      var rot = (hv % 11) - 5;
      var wiggle = '--wd:' + (2.4 + (hv % 17) / 10).toFixed(1) + 's;--wdel:-' + ((hv >>> 5) % 30 / 10).toFixed(1) + 's;';
      var isNew = !st.first && !st.seen[id];
      var dim = typeof o.isDimmed === 'function' ? !!o.isDimmed(w) : false;
      var wsel = sel.kind === 'wish' && String(sel.id) === id;
      seenNext[id] = true;
      html +=
        '<button type="button" class="wt-tag' + (isNew ? ' wt-new' : '') + (dim ? ' wt-dim' : '') + '"' +
        ' data-kind="wish" data-id="' + esc(id) + '" aria-pressed="' + (wsel ? 'true' : 'false') + '"' +
        ' aria-label="' + esc('Wish from ' + displayName(w)) + '"' +
        ' style="left:' + (s.x / 6.2).toFixed(2) + '%;top:' + (s.y / 7.6).toFixed(2) + '%;' +
        '--r:' + rot + 'deg;' + sizeVars + wiggle + '--bg:' + pal.bg + ';--fg:' + pal.fg + ';' +
        (isNew ? 'animation-delay:' + ((newCount++ % 8) * 90) + 'ms;' : '') + '">' +
        '<span class="wt-swing"><span class="wt-string"></span>' +
        '<span class="wt-body"><span class="wt-hole"></span>' + iconSvg(w.charm, Math.round(18 * scale)) + '</span>' +
        '</span></button>';
    }
    container.querySelector('.wt-tags').innerHTML = html;
    st.seen = seenNext;
    st.first = false;

    if (focusedKey) {
      var parts = focusedKey.split(':');
      var sel2 = '[data-kind="' + parts[0] + '"][data-id="' + (window.CSS && CSS.escape ? CSS.escape(parts.slice(1).join(':')) : parts.slice(1).join(':')) + '"]';
      var again = container.querySelector(sel2);
      if (again) again.focus({ preventScroll: true });
    }
    return { shown: shown, leaders: leaders, scale: scale };
  }

  // Forget which tags were already shown, so the next render doesn't animate them as "new"
  function resetTreeMemory(container) {
    if (container && container._wt) { container._wt.first = true; container._wt.seen = {}; }
  }

  window.WishCore = {
    cfg: CFG,
    demo: DEMO,
    url: url,
    PALETTE: PALETTE,
    LANG_LABEL: LANG_LABEL,
    LANGUAGES: LANGUAGES,
    langLabel: langLabel,
    detectLang: detectLang,
    readLangs: readLangs,
    saveReadLangs: saveReadLangs,
    safePhoto: safePhoto,
    rankForTree: rankForTree,
    COUNTRY_LABEL: COUNTRY_LABEL,
    SITES: SITES,
    LEADER_SLOTS: CROWN_SIZE,
    photoHtml: photoHtml,
    load3dTree: load3dTree,
    leaderPlaces: leaderPlaces,
    leaderOrder: leaderOrder,
    siteById: siteById,
    siteName: siteName,
    esc: esc,
    iconSvg: iconSvg,
    ICON_D: ICON_D,
    STAR_D: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
    hash: hash,
    random: mulberry32,
    initials: initials,
    client: getClient,
    fetchApproved: fetchApproved,
    fetchLeaders: fetchLeaders,
    hasLiked: hasLiked,
    setLike: setLike,
    loadMyLikes: loadMyLikes,
    likeCount: likeCount,
    bmsLooksReal: bmsLooksReal,
    COLORS: COLORS,
    validBms: validBms,
    cleanBms: cleanBms,
    myBms: myBms,
    saveMyBms: saveMyBms,
    myWishRef: myWishRef,
    forgetMe: forgetMe,
    submitWish: submitWish,
    getMyWish: getMyWish,
    PRIZE: PRIZE,
    fetchPrizeTop: fetchPrizeTop,
    leaderList: leaderList,
    leaderPhoto: leaderPhoto,
    demoQueue: demoQueue,
    demoReview: demoReview,
    demoLoad: demoLoad,
    demoSave: demoSave,
    allowedEmail: allowedEmail,
    displayName: displayName,
    displayWhere: displayWhere,
    wishPageUrl: wishPageUrl,
    setLogo: setLogo,
    initGA: initGA,
    track: track,
    storageGet: storageGet,
    storageSet: storageSet,
    pickForTree: pickForTree,
    treeCapacity: treeCapacity,
    renderTree: renderTree,
    resetTreeMemory: resetTreeMemory
  };
})();
