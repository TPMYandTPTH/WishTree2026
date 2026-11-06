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

  // How staff prove they are TP before posting:
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
  // Leave blank to use wish.html in the same folder as the page.
  WISH_PAGE_URL: '',

  // Official white TP logo, e.g. 'assets/tp-logo-white.svg'. Leave blank to hide.
  LOGO_URL: '',

  // Sites people can pick. country must be 'MY' or 'TH'.
  SITES: [
    { label: 'Kuala Lumpur', country: 'MY' },
    { label: 'Penang', country: 'MY' },
    { label: 'Remote · Malaysia', country: 'MY' },
    { label: 'Bangkok', country: 'TH' },
    { label: 'Remote · Thailand', country: 'TH' }
  ],

  MAX_LENGTH: 200,
  TREE_REFRESH_SECONDS: 60,
  MAX_TAGS_ON_TREE: 40,

  // Optional GA4 measurement ID, e.g. 'G-XXXXXXXXXX'
  GA4_ID: ''
};
