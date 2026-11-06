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

  MAX_LENGTH: 200,          // employee wish length
  LEADER_MAX_LENGTH: 400,   // leader message length
  TREE_REFRESH_SECONDS: 60,
  MAX_TAGS_ON_TREE: 40,     // flat tree (fallback and leaders' preview)
  MAX_TAGS_3D: 60,          // 3D tree
  TOUR_SECONDS: 10,         // "Tour sites" switches site every N seconds

  // Optional GA4 measurement ID, e.g. 'G-XXXXXXXXXX'
  GA4_ID: ''
};
