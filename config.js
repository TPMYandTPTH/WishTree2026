/* =========================================================
   TP Wish Tree 2026 - settings
   This is the only file you need to edit.
   Leave SUPABASE_URL / SUPABASE_ANON_KEY blank to run in
   demo mode (sample wishes, no sign-in, nothing saved).
   ========================================================= */
window.WISH_CFG = {
  // Supabase: Project Settings > API
  SUPABASE_URL: 'https://yemysibghglelnapsekg.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_WhJt7GcqNOfWrTAntHqWOw_ZC9TSYlC',

  // Employees don't sign in: they give a first name (or nickname) and their BMS number.
  // Nobody signs in. The leaders' page and the Approvals page each ask for a password, set in Supabase
  // (schema.sql, section 10) and checked there. No emails are collected anywhere.

  // Campaign dates as YYYY-MM-DD, shown as "1 December" in each page's language (approximate for now; change any time).
  // OPEN_DATE / CLOSE_DATE: the tree page says "Wishes open 16 November to 31 December".
  // REVEAL_DATE: after hanging a wish, people read "The tree lights up for everyone on 25 December".
  OPEN_DATE: '2026-11-16',
  CLOSE_DATE: '2026-12-31',
  REVEAL_DATE: '2026-12-25',
  SUBMISSIONS_OPEN: true,

  // Full public link to wish.html, used for the QR codes.
  // Leave blank to use wish.html next to the tree page.
  WISH_PAGE_URL: '',

  // Official TP logo (black, for the light Eggnog pages; the TP logo is only ever black or white).
  LOGO_URL: 'assets/tp-logo-black.png',

  // TP Malaysia & Thailand sites. id is stored with each wish - don't change an id once wishes exist.
  SITES: [
    { id: 'gtower', label: 'G-Tower', city: 'Kuala Lumpur', country: 'MY' },
    { id: 'kcp', label: 'Kelana Centre Point', city: 'Petaling Jaya', country: 'MY' },
    { id: 'gbs', label: 'GBS @ Mahsuri', city: 'Penang', country: 'MY' },
    { id: 'op', label: 'One Precinct', city: 'Penang', country: 'MY' },
    { id: 'lv', label: 'Livingston Tower', city: 'Penang', country: 'MY' },
    { id: 'jb', label: 'Johor Bahru', city: 'Johor', country: 'MY' },
    { id: 'singha', label: 'Singha Complex', city: 'Bangkok', country: 'TH' },
    { id: 'wfh', label: 'Work from home', city: '', country: '' }
  ],

  // Languages people can write in, and readers can pick from on the tree and the TVs.
  // code is stored with each wish (2-3 lowercase letters) - add or remove lines freely.
  LANGUAGES: [
    { code: 'en', label: 'English', english: 'English' },
    { code: 'ms', label: 'Bahasa Melayu', english: 'Malay' },
    { code: 'th', label: 'ภาษาไทย', english: 'Thai' },
    { code: 'zh', label: '中文', english: 'Chinese' },
    { code: 'ja', label: '日本語', english: 'Japanese' },
    { code: 'ko', label: '한국어', english: 'Korean' },
    { code: 'vi', label: 'Tiếng Việt', english: 'Vietnamese' },
    { code: 'id', label: 'Bahasa Indonesia', english: 'Indonesian' },
    { code: 'ta', label: 'தமிழ்', english: 'Tamil' }
  ],

  // The leaders, in the order they show in the list under the tree and on the TVs.
  // Leaders type their name on the leaders' page with these as suggestions; the name can't change after the first send.
  // spot:  'ceo' = the big ornament under the star, 'crown' = around the top of the tree, 'list' = the list only.
  // level: 'exec' = C-level and VP: ornament-shaped cards, 5 per row, always shown in the list under the tree.
  //        'director' = Directors: medium cards, 5 per row, behind "Show more", once they post.
  //        'manager' = Managers and below: small cards, 6 per row, behind "Show more", once they post.
  // Photo: assets/leaders/<name in lower case with dashes>.jpg, e.g. alex-ma.jpg (initials show until it's there).
  // Add photo: 'assets/leaders/other-file.jpg' to a line to use a different file.
  // draft: a suggested message, filled in on the leaders' page when that leader picks their name.
  // Nothing is sent until they press Send; they can change every word first.
  LEADERS: [
    // C-level and VP
    { name: 'Andy',                     title: 'Chief Executive Officer',      spot: 'ceo',   level: 'exec',
      draft: 'To every one of you across Malaysia, Thailand, Vietnam and beyond: THANK YOU. Every customer, client, or colleague you helped made a difference and each of those are appreciated. Enjoy the holidays with the people you love and let\'s make 2027 our best year yet. Merry Christmas & Happy New Year!' },
    { name: 'Divya Dutta',              title: 'Chief Operating Officer',      spot: 'crown', level: 'exec',
      draft: 'Thank you for the care and energy you bring to our customers and to each other every day. I\'m proud of what we achieved together this year. Wishing you and your families a joyful Christmas and a bright New Year!' },
    { name: 'Himanshu',                 title: 'Chief Operating Officer',      spot: 'crown', level: 'exec',
      draft: 'To our teams on every site and at home: thank you for showing up for our customers, day and night. Rest well, celebrate the wins, and come back ready for an amazing 2027. Happy holidays!' },
    { name: 'Alex Ma',                  title: 'Chief Financial Officer',      spot: 'crown', level: 'exec',
      draft: 'Behind every result this year is a team that cared about getting it right. Thank you for your hard work and commitment. Wishing you a peaceful Christmas and a healthy, happy New Year with your loved ones.' },
    { name: 'Sarah',                    title: 'Chief of Staff',               spot: 'crown', level: 'exec',
      draft: 'What a year! Thank you for your kindness, your teamwork and the extra mile you go for each other. May this season bring you rest, laughter and time with the people who matter most. Merry Christmas and Happy New Year!' },
    { name: 'Michael Costevec',         title: 'VP of Transformations',        spot: 'list',  level: 'exec',
      draft: 'This year we changed a lot, and you made every change work. Thank you for your ideas, your patience and your energy. Wishing you a restful holiday season and an exciting, happy 2027!' },
    { name: 'Vivienne',                 title: 'Vice President',               spot: 'list',  level: 'exec',
      draft: 'Thank you for the warmth and dedication you bring to every customer and every colleague. You make TP a great place to be. I hope this season brings you joy, rest and time with family. Merry Christmas and Happy New Year!' },
    { name: 'Chavis',                   title: 'Vice President',               spot: 'list',  level: 'exec',
      draft: 'Every day you show what great teamwork looks like. Thank you for your effort, your smiles and your support for one another. Have a wonderful Christmas, and here\'s to an even better year together in 2027!' },
    { name: 'Sudhar',                   title: 'Vice President',               spot: 'list',  level: 'exec',
      draft: 'A big thank you to every team, on site and at home, for a year of hard work and great moments. Take time to recharge and celebrate with your loved ones. Happy holidays and all the best for 2027!' },
    { name: 'Rachel',                   title: 'Director of Human Resources',  spot: 'crown', level: 'exec',
      draft: 'Our people are what make TP special, and that means you. Thank you for everything you gave this year. Take care of yourselves this season, enjoy every moment with your loved ones, and happy holidays from all of us in HR!' },
    { name: 'Alen Celebic',             title: 'VP of Business Development',   spot: 'list',  level: 'exec',
      draft: 'Every new partnership we build starts with the great work you do every day. Thank you for making TP a team our clients trust. Wishing you and your families a merry Christmas and a successful New Year!' },
    // Directors
    { name: 'Noppawan Krynetr',         title: 'VP of Business Development',   spot: 'list',  level: 'director' },
    { name: 'Pranav Pillai',            title: 'Director of Operations',       spot: 'list',  level: 'director' },
    { name: 'Jamunah Maniram',          title: 'Director of Operations',       spot: 'list',  level: 'director' },
    { name: 'Ken Yong',                 title: 'Director of Operations',       spot: 'list',  level: 'director' },
    { name: 'Irshad Gori',              title: 'Director of Operations',       spot: 'list',  level: 'director' },
    { name: 'Syed Suleiman',            title: 'Director of Operations',       spot: 'list',  level: 'director' },
    { name: 'Aloke Dutta',              title: 'Director of Quality',          spot: 'list',  level: 'director' },
    { name: 'Eric Ooi',                 title: 'Director of Finance',          spot: 'list',  level: 'director' },
    { name: 'Prabitha Preymachandran',  title: 'Director of Operations',       spot: 'list',  level: 'director' },
    { name: 'Chun Wei Chin',            title: 'Director of Operations',       spot: 'list',  level: 'director' },
    { name: 'Michael Sanchez',          title: 'Director of Operations',       spot: 'list',  level: 'director' },
    { name: 'Hanisha Reza',             title: 'Director of Operations',       spot: 'list',  level: 'director' },
    { name: 'Amit Mittal',              title: 'Director of WFM',              spot: 'list',  level: 'director' },
    { name: 'Sol Catherine Marticio',   title: 'Executive Asst. to the CEO, MY & TH', spot: 'list', level: 'director' },
    // Managers and below
    { name: 'Partiban Periannan',       title: 'Manager of Transformations',   spot: 'list',  level: 'manager' },
    { name: 'Parvathy Ramar',           title: 'Sr. Manager of GTM',           spot: 'list',  level: 'manager' },
    { name: 'Choon Haw',                title: 'Sr. Manager of IT',            spot: 'list',  level: 'manager' },
    { name: 'Chris Tsu',                title: 'Sr. Manager of Operations',    spot: 'list',  level: 'manager' },
    { name: 'Aquil Sugui',              title: 'Sr. Manager of L&D',           spot: 'list',  level: 'manager' },
    { name: 'Liew Kin Wai',             title: 'Compliance Manager',           spot: 'list',  level: 'manager' },
    { name: 'Zhiyuan Kerk',             title: 'L&D Officer',                  spot: 'list',  level: 'manager' }
  ],

  // Hidden wishes inside two small gifts on the left under the tree. A gift opens when the mouse rests on it
  // (or a tap on phones). gift: 'red' (Cranberry gift, front left) or 'gold' (Brass gift, behind it).
  // Change the words freely (up to about 250 characters). Delete an entry to make that gift a normal one again.
  HIDDEN_WISHES: [
    {
      gift: 'red',
      kicker: 'YOU FOUND A HIDDEN WISH',
      message: 'I built this tree so all of us, on site or at home, could hang our wishes in one place. My wish for 2027: that we keep lifting each other up. Happy New Year!',
      name: 'Amr Mihany',
      title: 'Digital Services & Transformation',
      lang: 'en'
    },
    {
      gift: 'gold',
      kicker: 'WHERE THIS TREE BEGAN',
      message: 'The Wish Tree started with Maszy\'s idea and the email he sent to get it going. Thank you, Maszy, for giving all of us one place to share our Christmas wishes.',
      name: 'Maszy Ulip',
      title: 'The idea behind the Wish Tree',
      lang: 'en'
    }
  ],

  // The prize: the big gift on the right of the tree. The most-liked wishes win; leaders' messages and the
  // BMS numbers in the prize_excluded table (Amr, Maszy, the Wish Tree team) don't count. Set enabled: false to hide it.
  PRIZE: {
    enabled: true,
    winners: 5,
    amount: 'RM 100',
    reward: 'Grab voucher',
    title: '5 x RM 100 Grab vouchers',
    text: 'The 5 most-liked wishes each win a RM 100 Grab voucher. Each person can like a wish once.',
    deadline: 'Likes count until 11:59 pm on 18 December 2026 (Malaysia time). Winners are announced on 22 December.',
    rules: 'Leaders and organizers can\'t win. The Wish Tree team checks every like before the winners are announced. If two wishes have the same likes, the one that got there first ranks higher.'
    // The database stops counting likes at app_settings.likes_close_at (18 Dec 2026, 23:59 Malaysia time).
    // Wishes can still be hung until CLOSE_DATE (31 Dec); they just can't collect likes for the prize after the 18th.
  },

  // Christmas music: an MP3 in assets/music/ (royalty-free, or one TP may play in its offices).
  // Leave src empty for no music. The tree and wish pages get a music button (off until someone taps it);
  // the TVs play it in a loop after one tap on the screen. Add ?music=off to a TV link to keep that TV quiet.
  // christmas.mp3: our own instrumental of two public-domain carols, made by assets/music/make_music.py
  MUSIC: { src: 'assets/music/christmas.mp3' },

  MAX_LENGTH: 150,          // employee wish length (keep in step with schema.sql)
  LEADER_MAX_LENGTH: 300,   // leader message length (keep in step with schema.sql)
  TREE_REFRESH_SECONDS: 60,
  MAX_TAGS_ON_TREE: 40,     // flat tree (fallback and leaders' preview)
  MAX_TAGS_3D: 60,          // 3D tree: the most it holds without tags overlapping. With more wishes, the most-liked go on the tree and every wish stays in the list below it
  TREE_STYLE: 'light',      // 3D tree look: 'tiers' (smooth layers), 'cone' (one smooth cone) or 'light' (a tree made of light)
  TOUR_SECONDS: 10,         // "Tour sites" switches site every N seconds

  // TV screens (tv/ page)
  TV_SECONDS: 12,           // how long each message stays on screen
  TV_LEADER_EVERY: 4,       // show a leader's message after every N wishes
  TV_PRIZE_EVERY: 9,        // show the prize slide (prize, deadline and rules) every N messages

  // Google Tag Manager container (set up GA4 and other tags inside GTM). Page events go to the dataLayer as
  // custom events: wish_open, leader_open, prize_open, secret_wish_found, wish_like, wish_unlike, wish_submit, ...
  GTM_ID: 'GTM-P4TRBDVQ',
  // Send those events to GA4 (G-G5Q9FDEKEZ) through the GA4 tag already in the Tag Manager container. Set false only if
  // you add a GA4 Event tag for these events inside Tag Manager, or they'd be counted twice.
  GA4_EVENTS_VIA_GTM: true,
  // Optional GA4 measurement ID if you ever want GA4 without GTM, e.g. 'G-XXXXXXXXXX' (leave blank when using GTM)
  GA4_ID: ''
};
