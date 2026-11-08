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

  var PALETTE = {
    cream: { bg: '#F6EEDC', fg: '#AB2C37', text: '#183326' },
    red: { bg: '#AB2C37', fg: '#F6EEDC', text: '#F6EEDC' },
    gold: { bg: '#E3B45A', fg: '#0E2A1F', text: '#0E2A1F' }
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
    if (/^https:\/\/[^\s"'<>()\\]+$/.test(v) && v.length < 600) return v;
    if (/^data:image\/(png|jpeg|webp|svg\+xml)[;,][^\s"<>\\]+$/.test(v) && v.length < 400000) return v;
    return '';
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

  // Placeholder "photos" for the demo leaders (a plain silhouette, not a real person)
  function placeholderPhoto(bg1, bg2) {
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0' stop-color='" + bg1 + "'/><stop offset='1' stop-color='" + bg2 + "'/></linearGradient></defs>" +
      "<rect width='200' height='200' fill='url(#g)'/><circle cx='100' cy='84' r='38' fill='#F3EEE6'/>" +
      "<path d='M28 200c4-50 34-76 72-76s68 26 72 76z' fill='#F3EEE6'/></svg>";
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  var PLACEHOLDER_BG = [['#9FB4CF', '#5F7396'], ['#C9A98B', '#8A6B52'], ['#9CC5B4', '#4E8270'], ['#C7B3D6', '#7D6596']];

  var SAMPLE_LEADERS = [
    ['Leader A', '[Title]', 'Thank you for every call, every chat and every customer you helped this year. You are the reason TP Malaysia and Thailand shine. Merry Christmas and a happy 2027!'],
    ['Leader B', '[Title]', 'This year we grew together across our sites in two countries. Rest well this holiday, and let us make 2027 our best year yet.'],
    ['Leader C', '[Title]', 'To everyone working from home, on site, on nights and on weekends: we see you and we are grateful. Happy holidays to you and your families.'],
    ['Leader D', '[Title]', 'My wish for 2027: that each of you feels proud of the work you do and supported by the people around you. Merry Christmas!']
  ].map(function (r, i) {
    return {
      id: 'demo-leader-' + (i + 1),
      display_name: r[0],
      title: r[1],
      message: r[2],
      lang: 'en',
      photo_url: placeholderPhoto(PLACEHOLDER_BG[i][0], PLACEHOLDER_BG[i][1]),
      updated_at: new Date(Date.UTC(2026, 11, 1, 6, i)).toISOString(),
      like_count: (hash('leader-likes:' + i) % 60) + 12
    };
  });

  var SAMPLE_PENDING_LEADERS = [
    { id: 'demo-leader-p1', display_name: 'Leader E', title: '[Title]', message: 'Wishing every one of you rest, joy and time with the people you love. Thank you for 2026.', lang: 'en', status: 'pending', email: 'leader.e@tp.com', updated_at: new Date(Date.now() - 25 * 60000).toISOString() }
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
      wishes.unshift(Object.assign({ id: 'local-' + i, status: 'pending', flags: flags, email: 'you@tp.com' }, w, {
        display_name: w.display_mode === 'name' ? w.first_name : null
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

  /* ---------- Likes (one per device, no sign-in needed) ---------- */
  function deviceId() {
    var id = storageGet('wt-device');
    if (!id || id.length < 16) {
      id = window.crypto && crypto.randomUUID ? crypto.randomUUID()
        : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      storageSet('wt-device', id);
    }
    return id;
  }
  function likedMap() { return demoLoad('wt-liked', {}) || {}; }
  function hasLiked(kind, id) { return !!likedMap()[kind + ':' + id]; }
  // Resolves to the new count from the server (or null in demo mode, where the page adds or removes one itself)
  function setLike(kind, id, on) {
    var all = likedMap();
    if (on) all[kind + ':' + id] = 1; else delete all[kind + ':' + id];
    demoSave('wt-liked', all);
    if (DEMO) return Promise.resolve(null);
    return getClient().rpc('set_like', { p_kind: kind, p_id: id, p_device: deviceId(), p_on: !!on }).then(function (res) {
      if (res.error) throw res.error;
      return typeof res.data === 'number' ? res.data : null;
    });
  }
  function demoLikeBonus(kind, id) { return DEMO && hasLiked(kind, id) ? 1 : 0; }

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
        return Object.assign({}, l, { like_count: (l.like_count || 0) + demoLikeBonus('leader', l.id) });
      });
      return Promise.resolve(list);
    }
    return getClient().rpc('get_leader_messages').then(function (res) {
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
  var LEADER_SLOTS = [[310, 92], [268, 148], [352, 148], [232, 210], [310, 214], [388, 210]];
  // Which slots to use for 1-6 leaders, so the crown always looks balanced
  var LEADER_LAYOUT = { 1: [0], 2: [1, 2], 3: [0, 1, 2], 4: [0, 1, 2, 4], 5: [0, 1, 2, 3, 5], 6: [0, 1, 2, 3, 4, 5] };
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
    [312, 287, 11, '#AB2C37'], [260, 361, 10, '#E3B45A'], [350, 359, 10, '#AB2C37'],
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
    p.push('<circle cx="310" cy="52" r="44" fill="#F2C766" opacity="0.10"/><circle cx="310" cy="52" r="30" fill="#F2C766" opacity="0.18"/>');
    p.push('<polygon points="310,26 316.47,43.1 334.73,43.97 320.46,55.4 325.28,73.03 310,63 294.72,73.03 299.54,55.4 285.27,43.97 303.53,43.1" fill="#F2C766"/>');
    p.push('<polygon points="310,26 316.47,43.1 334.73,43.97 320.46,55.4 310,52" fill="#FFE3A0"/>');
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
    '.wt-string{display:block;width:1px;height:var(--str);background:#D9C59A}',
    '.wt-body{position:relative;display:flex;align-items:center;justify-content:center;width:var(--w);height:var(--h);background:var(--bg);color:var(--fg);border-radius:3px 3px 5px 5px;box-shadow:0 3px 6px rgba(0,0,0,.35);transition:box-shadow .25s ease}',
    '.wt-body svg{width:var(--ic);height:var(--ic);margin-top:var(--icm)}',
    '.wt-hole{position:absolute;top:var(--holet);left:50%;width:var(--hole);height:var(--hole);transform:translateX(-50%);border-radius:50%;background:rgba(14,42,31,.5)}',
    '.wt-tag[aria-pressed="true"]{transform:translateX(-50%) rotate(0deg);z-index:2}',
    '.wt-tag[aria-pressed="true"] .wt-body{box-shadow:0 0 0 2px #F6EEDC,0 0 0 6px rgba(227,180,90,.55),0 8px 18px rgba(0,0,0,.45)}',
    '.wt-tag:focus,.wt-leader:focus{outline:none}',
    '.wt-tag:focus-visible .wt-body,.wt-leader:focus-visible .wt-lball{box-shadow:0 0 0 2px #0E2A1F,0 0 0 5px #00AF9B}',
    '.wt-tag.wt-dim{opacity:.22}',
    '.wt-tag.wt-new{animation:wt-drop .8s cubic-bezier(.2,.9,.3,1.2) both}',
    '@keyframes wt-drop{from{opacity:0;transform:translateX(-50%) translateY(-40px) rotate(var(--r,0deg))}to{opacity:1;transform:translateX(-50%) rotate(var(--r,0deg))}}',
    /* leaders' ornaments in the crown */
    '.wt-leader{position:absolute;padding:0;margin:0;border:0;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;width:var(--d);transform:translateX(-50%);transform-origin:50% 0;z-index:3;-webkit-tap-highlight-color:transparent;animation:wt-sway 5s ease-in-out infinite}',
    '@keyframes wt-sway{0%,100%{transform:translateX(-50%) rotate(-2deg)}50%{transform:translateX(-50%) rotate(2deg)}}',
    '.wt-lstring{display:block;width:1px;height:var(--lstr);background:#F2C766}',
    '.wt-lcap{display:block;width:calc(var(--d) * .26);height:calc(var(--d) * .14);margin-bottom:-1px;border-radius:2px 2px 0 0;background:#AB2C37}',
    '.wt-lball{position:relative;display:flex;align-items:center;justify-content:center;width:var(--d);height:var(--d);border-radius:50%;background:#E3B45A;color:#0E2A1F;font-weight:700;font-size:calc(var(--d) * .32);letter-spacing:.02em;line-height:1;box-shadow:inset 0 0 0 calc(var(--d) * .06) #F2C766,0 0 0 calc(var(--d) * .1) rgba(242,199,102,.22),0 4px 10px rgba(0,0,0,.4);transition:box-shadow .25s ease}',
    '.wt-lball::after{content:"";position:absolute;left:18%;top:16%;width:22%;height:22%;border-radius:50%;background:rgba(255,255,255,.45)}',
    '.wt-lball.wt-photo{background-color:#E3B45A;background-size:cover;background-position:center}',
    '.wt-gift{position:absolute;left:62%;top:86.5%;width:9%;aspect-ratio:1/0.9;padding:0;border:0;background:transparent;cursor:pointer;z-index:2;-webkit-tap-highlight-color:transparent}',
    '.wt-gift-box{position:absolute;left:4%;right:4%;bottom:0;height:72%;border-radius:2px;background:linear-gradient(90deg,transparent 42%,#E3B45A 42%,#E3B45A 58%,transparent 58%),#AB2C37;box-shadow:0 4px 8px rgba(0,0,0,.4)}',
    '.wt-gift-lid{position:absolute;left:0;right:0;top:12%;height:20%;border-radius:2px;background:linear-gradient(90deg,transparent 42%,#E3B45A 42%,#E3B45A 58%,transparent 58%),#B9333F;transform-origin:10% 100%;transition:transform .5s cubic-bezier(.3,1.5,.5,1)}',
    '.wt-gift:hover .wt-gift-lid{transform:rotate(-8deg)}',
    '.wt-gift[aria-pressed="true"] .wt-gift-lid{transform:rotate(-38deg) translateY(-30%)}',
    '.wt-gift:focus-visible{outline:3px solid #00AF9B;outline-offset:3px;border-radius:4px}',
    '.wt-lball.wt-photo::after{display:none}',
    '.wt-lstar{position:absolute;right:-6%;bottom:-6%;width:calc(var(--d) * .4);height:calc(var(--d) * .4);border-radius:50%;background:#AB2C37;color:#F6EEDC;display:flex;align-items:center;justify-content:center}',
    '.wt-lstar svg{width:62%;height:62%}',
    '.wt-leader[aria-pressed="true"]{animation:none}',
    '.wt-leader[aria-pressed="true"] .wt-lball{box-shadow:inset 0 0 0 calc(var(--d) * .06) #F2C766,0 0 0 3px #F6EEDC,0 0 0 8px rgba(242,199,102,.45),0 8px 18px rgba(0,0,0,.45)}',
    '@media (prefers-reduced-motion:reduce){.wt-tag,.wt-body{transition:none}.wt-tag.wt-new,.wt-light,.wt-halo,.wt-leader,.wt-swing,.wt-tag:hover .wt-swing{animation:none}}'
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
      leaders:  leaders' messages (first 6 hang in the crown)
      selected: { kind: 'wish' | 'leader', id }
      isDimmed: function(wish) -> true to fade a tag
      onSelect: function(kind, id)
      scale:    optional fixed tag size; otherwise picked to fit
    })
  */
  function renderTree(container, opts) {
    var o = opts || {};
    var wishes = o.wishes || [];
    var leaders = (o.leaders || []).slice(0, LEADER_SLOTS.length);
    var sel = o.selected || {};
    ensureCss();

    if (!container._wt) {
      container.innerHTML =
        '<div class="wt-stage">' +
        '<svg class="wt-art" viewBox="0 0 620 760" aria-hidden="true">' + TREE_SVG + '</svg>' +
        '<div class="wt-crown" role="group" aria-label="Messages from our leaders"></div>' +
        '<div class="wt-tags" role="group" aria-label="Wishes on the tree"></div>' +
        (o.secret ? '<button type="button" class="wt-gift" data-kind="secret" data-id="gift" aria-label="A gift under the tree"><span class="wt-gift-lid"></span><span class="wt-gift-box"></span></button>' : '') +
        '</div>';
      container._wt = { seen: {}, first: true, onSelect: null };
      container.querySelector('.wt-stage').addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.wt-tag,.wt-leader,.wt-gift') : null;
        if (!btn || typeof container._wt.onSelect !== 'function') return;
        container._wt.onSelect(btn.getAttribute('data-kind'), btn.getAttribute('data-id'));
      });
    }

    var st = container._wt;
    st.onSelect = o.onSelect || null;
    var giftBtn = container.querySelector('.wt-gift');
    if (giftBtn) {
      giftBtn.setAttribute('aria-pressed', sel.kind === 'secret' ? 'true' : 'false');
      if (!giftBtn._hover) {
        // the hidden gift opens when the mouse rests on it (a tap still opens it on phones)
        giftBtn._hover = true;
        var hoverTimer = 0;
        giftBtn.addEventListener('pointerenter', function (e) {
          if (e.pointerType !== 'mouse') return;
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(function () {
            if (giftBtn.getAttribute('aria-pressed') !== 'true' && typeof container._wt.onSelect === 'function') container._wt.onSelect('secret', 'gift');
          }, 220);
        });
        giftBtn.addEventListener('pointerleave', function () { clearTimeout(hoverTimer); });
      }
    }

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
    var layout = LEADER_LAYOUT[leaders.length] || [];
    for (var li = 0; li < leaders.length; li++) {
      var L = leaders[li];
      var lid = String(L.id);
      var pos = LEADER_SLOTS[layout[li]];
      var lsel = sel.kind === 'leader' && String(sel.id) === lid;
      crown +=
        '<button type="button" class="wt-leader" data-kind="leader" data-id="' + esc(lid) + '"' +
        ' aria-pressed="' + (lsel ? 'true' : 'false') + '"' +
        ' aria-label="' + esc('Message from ' + (L.display_name || 'a TP leader')) + '"' +
        ' style="left:' + (pos[0] / 6.2).toFixed(2) + '%;top:' + (pos[1] / 7.6).toFixed(2) + '%;' +
        '--d:' + u(50) + ';--lstr:' + u(10) + ';animation-delay:' + (li * -0.8) + 's">' +
        '<span class="wt-lstring"></span><span class="wt-lcap"></span>' +
        (safePhoto(L.photo_url)
          ? '<span class="wt-lball wt-photo" style="background-image:url(&quot;' + esc(safePhoto(L.photo_url)) + '&quot;)">'
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
    LEADER_SLOTS: LEADER_SLOTS.length,
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
