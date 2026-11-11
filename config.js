/* =========================================================
   TP Wish Tree 2026 - settings
   This is the only file you need to edit.
   Leave SUPABASE_URL / SUPABASE_ANON_KEY blank to run in
   demo mode (sample wishes, no sign-in, nothing saved).
   ========================================================= */
window.WISH_CFG = {
  // Supabase: Project Settings > API
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // Employees don't sign in: they give a first name (or nickname), their BMS number and an optional phone.
  // Sign-in is only for the leaders' page and the Approvals page:
  //   'google' = "Continue with your TP Google account" (no email setup needed)
  //   'email'  = 6-digit code sent by email (needs custom SMTP in Supabase)
  AUTH_MODE: 'google',
  ALLOWED_EMAIL_DOMAINS: ['tp.com'],

  // Campaign details shown on the pages
  OPEN_DATE: '[start date]',
  CLOSE_DATE: '[end date]',
  REVEAL_DATE: '[reveal date]',
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

  // Hidden wishes inside two small gifts on the left under the tree. A gift opens when the mouse rests on it
  // (or a tap on phones). gift: 'red' (Cranberry gift, front left) or 'gold' (Brass gift, behind it).
  // Change the words freely (up to about 250 characters). Delete an entry to make that gift a normal one again.
  HIDDEN_WISHES: [
    {
      gift: 'red',
      kicker: 'YOU FOUND A HIDDEN WISH',
      message: 'I built this tree so every one of us, on site or at home, could hang a wish in the same place. My wish is simple: that we keep lifting each other up in 2027. Thank you for finding this one. Merry Christmas!',
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
    title: '5 x RM 100 gift cards',
    text: 'The 5 most-liked wishes each win a RM 100 gift card. Likes count once per BMS, until the Wish Tree closes.',
    rules: 'Leaders\' messages and the Wish Tree team can\'t win. If two wishes have the same likes, the one that got there first ranks higher.'
  },

  MAX_LENGTH: 150,          // employee wish length (keep in step with schema.sql)
  LEADER_MAX_LENGTH: 250,   // leader message length (keep in step with schema.sql)
  TREE_REFRESH_SECONDS: 60,
  MAX_TAGS_ON_TREE: 40,     // flat tree (fallback and leaders' preview)
  MAX_TAGS_3D: 60,          // 3D tree: the most it holds without tags overlapping. With more wishes, the most-liked go on the tree and every wish stays in the list below it
  TREE_STYLE: 'light',      // 3D tree look: 'tiers' (smooth layers), 'cone' (one smooth cone) or 'light' (a tree made of light)
  TOUR_SECONDS: 10,         // "Tour sites" switches site every N seconds

  // TV screens (tv/ page)
  TV_SECONDS: 12,           // how long each message stays on screen
  TV_LEADER_EVERY: 4,       // show a leader's message after every N wishes
  TV_PRIZE_EVERY: 9,        // show the prize slide (5 most-liked wishes) every N messages

  // Optional GA4 measurement ID, e.g. 'G-XXXXXXXXXX'
  GA4_ID: ''
};
