/**
 * supabase-config.js
 * ─────────────────────────────────────────────────────────
 * Single source of truth for the Supabase client.
 * Every other module imports `window.sb` from here.
 *
 * HOW TO CONFIGURE:
 *   1. Open https://supabase.com → your project → Settings → API
 *   2. Copy "Project URL"  → paste as SUPABASE_URL below
 *   3. Copy "anon / public" key → paste as SUPABASE_ANON_KEY below
 *   4. Save. Done.
 */

const SUPABASE_URL      = 'https://gssjklrdnrnxowbmregl.supabase.co'; // ← REPLACE
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzc2prbHJkbnJueG93Ym1yZWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzgwMDgsImV4cCI6MjA5MjAxNDAwOH0.eCUUTpUPEETFwUWwkRe5TpI8Lj2umbbmeXM1uF1pWdw';              // ← REPLACE

// ── Validation guard ──────────────────────────────────────
const _configured =
  !SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
  !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');

if (!_configured) {
  console.warn(
    '%c[Supabase] ⚠ Not configured — running in DEMO mode.\n' +
    'Edit supabase-config.js and replace SUPABASE_URL + SUPABASE_ANON_KEY.',
    'color: orange; font-weight: bold'
  );
}

// ── Create client ─────────────────────────────────────────
let sb = null; // "sb" = supabase client, used across all modules

try {
  if (_configured) {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession:    true,   // Remember user across page refreshes
        autoRefreshToken:  true,   // Silently refresh JWT before expiry
        detectSessionInUrl: true,  // Handle magic-link / OAuth redirects
      },
    });
    console.log('%c[Supabase] ✓ Client initialised.', 'color: green');
  }
} catch (err) {
  console.error('[Supabase] Failed to create client:', err.message);
}

// Expose globally
window.sb            = sb;
window.sbConfigured  = _configured;

// ── Helper: safe Supabase call with error normalisation ───
/**
 * Wraps a Supabase query promise and always resolves with { data, error }.
 * Prevents unhandled promise rejections.
 *
 * Usage:
 *   const { data, error } = await safeQuery(sb.from('products').select('*'));
 */
async function safeQuery(queryPromise) {
  try {
    const result = await queryPromise;
    return result; // Supabase already returns { data, error }
  } catch (err) {
    console.error('[Supabase] Unexpected query error:', err);
    return { data: null, error: { message: err.message ?? 'Unexpected error.' } };
  }
}

window.safeQuery = safeQuery;
