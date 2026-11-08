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

  // How people prove they are TP before posting (employee page and leaders page):
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

  // Official TP logo (white, for the dark pages). Path is relative to the site root.
  LOGO_URL: 'assets/tp-logo-white.png',

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

  // A hidden wish inside the big red gift under the tree. People find it by tapping the gift.
  // Change the words freely (up to about 250 characters). Leave message empty to turn it off.
  SECRET_WISH: {
    message: 'I built this tree so every one of us, on site or at home, could hang a wish in the same place. My wish is simple: that we keep lifting each other up in 2027. Thank you for finding this one. Merry Christmas!',
    name: 'Amr Mihany',
    title: 'Digital Services & Transformation',
    lang: 'en'
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

  // Optional GA4 measurement ID, e.g. 'G-XXXXXXXXXX'
  GA4_ID: ''
};
