/**
 * auth.js
 * ─────────────────────────────────────────────────────────
 * Handles all Supabase Auth operations:
 *   • Sign Up  (with field validation + specific error messages)
 *   • Sign In  (with field validation + specific error messages)
 *   • Sign Out
 *   • Session restoration on page load
 *   • Real-time auth state → UI sync
 *
 * Depends on: supabase-config.js (window.sb)
 */

// ══════════════════════════════════════════════════════════
//  ERROR MESSAGE TRANSLATOR
//  Maps Supabase/network error strings → human-friendly UI text
// ══════════════════════════════════════════════════════════
function translateAuthError(errorMessage) {
  if (!errorMessage) return 'Something went wrong. Please try again.';

  const msg = errorMessage.toLowerCase();

  // Signup-specific
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'An account with this email already exists. Try signing in instead.';

  if (msg.includes('password should be at least') || msg.includes('password is too short'))
    return 'Password must be at least 6 characters long.';

  if (msg.includes('unable to validate email') || msg.includes('invalid email'))
    return 'Please enter a valid email address (e.g. name@example.com).';

  if (msg.includes('signup is disabled'))
    return 'New sign-ups are currently disabled. Please contact support.';

  // Login-specific
  if (msg.includes('invalid login credentials') || msg.includes('invalid password') || msg.includes('wrong password'))
    return 'Incorrect email or password. Please check your details and try again.';

  if (msg.includes('email not confirmed'))
    return 'Please confirm your email address. Check your inbox for a verification link.';

  if (msg.includes('user not found') || msg.includes('no user found'))
    return 'No account found with this email. Please sign up first.';

  if (msg.includes('too many requests') || msg.includes('rate limit'))
    return 'Too many attempts. Please wait a few minutes and try again.';

  // Network
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch'))
    return 'Network error. Please check your internet connection and try again.';

  // Supabase not configured
  if (msg.includes('supabase') || msg.includes('not configured'))
    return 'Service unavailable. Please check the Supabase configuration.';

  // Generic fallback — show the raw message in dev, generic in prod
  return errorMessage.length < 120 ? errorMessage : 'An unexpected error occurred. Please try again.';
}

// ══════════════════════════════════════════════════════════
//  FIELD VALIDATION
// ══════════════════════════════════════════════════════════
function validateEmail(email) {
  // RFC 5322 simplified pattern
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim());
}

function validateSignupFields({ email, password, confirmPassword, fullName }) {
  if (!fullName || fullName.trim().length < 2)
    return 'Please enter your full name (at least 2 characters).';
  if (!email || !email.trim())
    return 'Email address is required.';
  if (!validateEmail(email))
    return 'Please enter a valid email address (e.g. name@example.com).';
  if (!password)
    return 'Password is required.';
  if (password.length < 6)
    return 'Password must be at least 6 characters long.';
  if (confirmPassword !== undefined && password !== confirmPassword)
    return 'Passwords do not match. Please try again.';
  return null; // ← null means valid
}

function validateLoginFields({ email, password }) {
  if (!email || !email.trim())
    return 'Email address is required.';
  if (!validateEmail(email))
    return 'Please enter a valid email address (e.g. name@example.com).';
  if (!password)
    return 'Password is required.';
  return null;
}

// ══════════════════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════════════════
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden', 'form-success');
  el.classList.add('form-error-msg');
  // Shake animation
  el.style.animation = 'none';
  requestAnimationFrame(() => { el.style.animation = 'shake 0.4s ease'; });
}

function showSuccess(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden', 'form-error-msg');
  el.classList.add('form-success');
}

function clearMessage(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = '';
  el.classList.add('hidden');
  el.classList.remove('form-error-msg', 'form-success');
}

function setButtonLoading(btn, isLoading, defaultText) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.innerHTML = isLoading
    ? `<span class="btn-spinner"></span> Please wait…`
    : defaultText;
}

function getInputVal(id) {
  return (document.getElementById(id)?.value ?? '').trim();
}

// ══════════════════════════════════════════════════════════
//  NAV / UI STATE SYNC
// ══════════════════════════════════════════════════════════
function syncAuthUI(user) {
  const loggedOutEl  = document.getElementById('auth-logged-out');
  const loggedInEl   = document.getElementById('auth-logged-in');
  const emailDisplay = document.getElementById('user-email-display');
  const userNameEl   = document.getElementById('user-name-display');

  if (user) {
    loggedOutEl?.classList.add('hidden');
    loggedInEl?.classList.remove('hidden');
    if (emailDisplay) emailDisplay.textContent = user.email ?? '';
    if (userNameEl) {
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
      userNameEl.textContent = name;
    }
  } else {
    loggedOutEl?.classList.remove('hidden');
    loggedInEl?.classList.add('hidden');
    if (emailDisplay) emailDisplay.textContent = '';
    if (userNameEl)   userNameEl.textContent   = '';
  }
}

// ══════════════════════════════════════════════════════════
//  AUTH OPERATIONS
// ══════════════════════════════════════════════════════════

/** SIGN UP */
async function handleSignUp() {
  const btn = document.getElementById('signup-submit-btn');
  clearMessage('signup-message');

  // Read fields
  const fullName        = getInputVal('signup-fullname');
  const email           = getInputVal('signup-email');
  const password        = document.getElementById('signup-password')?.value ?? '';
  const confirmPassword = document.getElementById('signup-confirm-password')?.value ?? '';

  // Client-side validation first (no network call wasted)
  const validationError = validateSignupFields({ email, password, confirmPassword, fullName });
  if (validationError) {
    showError('signup-message', validationError);
    return;
  }

  // Check Supabase is ready
  if (!window.sb) {
    showError('signup-message', 'Service unavailable. Please check the Supabase configuration.');
    return;
  }

  setButtonLoading(btn, true, btn.dataset.defaultText);

  const { data, error } = await window.safeQuery(
    window.sb.auth.signUp({
      email:    email.toLowerCase(),
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    })
  );

  setButtonLoading(btn, false, btn.dataset.defaultText);

  if (error) {
    console.error('[Auth] Sign-up error:', error.message);
    showError('signup-message', translateAuthError(error.message));
    return;
  }

  // Supabase may require email confirmation
  if (data?.user && !data?.session) {
    showSuccess(
      'signup-message',
      '✓ Account created! Please check your email inbox and click the confirmation link to activate your account.'
    );
  } else if (data?.session) {
    // Email confirmation disabled — user is immediately logged in
    window.closeAuthModal?.();
    window.showToast?.(`Welcome, ${fullName}! 🎉`);
    console.log('[Auth] Sign-up + auto-login:', data.user.email);
  }
}

/** SIGN IN */
async function handleSignIn() {
  const btn = document.getElementById('login-submit-btn');
  clearMessage('login-message');

  const email    = getInputVal('login-email');
  const password = document.getElementById('login-password')?.value ?? '';

  // Client-side validation
  const validationError = validateLoginFields({ email, password });
  if (validationError) {
    showError('login-message', validationError);
    return;
  }

  if (!window.sb) {
    showError('login-message', 'Service unavailable. Please check the Supabase configuration.');
    return;
  }

  setButtonLoading(btn, true, btn.dataset.defaultText);

  const { data, error } = await window.safeQuery(
    window.sb.auth.signInWithPassword({
      email:    email.toLowerCase(),
      password,
    })
  );

  setButtonLoading(btn, false, btn.dataset.defaultText);

  if (error) {
    console.error('[Auth] Sign-in error:', error.message);
    showError('login-message', translateAuthError(error.message));
    return;
  }

  window.closeAuthModal?.();
  const name = data.user?.user_metadata?.full_name || data.user?.email?.split('@')[0] || 'there';
  window.showToast?.(`Welcome back, ${name}! 👋`);
  console.log('[Auth] Signed in:', data.user.email);
}

/** SIGN OUT */
async function handleSignOut() {
  if (!window.sb) return;

  const { error } = await window.safeQuery(window.sb.auth.signOut());

  if (error) {
    console.error('[Auth] Sign-out error:', error.message);
    window.showToast?.('Could not sign out. Please try again.', 'error');
    return;
  }

  window.showToast?.('Signed out. See you soon!');
  console.log('[Auth] Signed out.');
}

/** GET CURRENT USER (used by checkout.js) */
async function getCurrentUser() {
  if (!window.sb) return null;
  const { data: { user } } = await window.safeQuery(window.sb.auth.getUser());
  return user ?? null;
}

// ══════════════════════════════════════════════════════════
//  INITIALISE — session restore + listener
// ══════════════════════════════════════════════════════════
async function initAuth() {
  if (!window.sb) {
    console.warn('[Auth] Supabase not configured — auth is in demo mode.');
    syncAuthUI(null);
    return;
  }

  // Restore session from localStorage (Supabase handles this automatically)
  const { data: { session }, error } = await window.safeQuery(window.sb.auth.getSession());

  if (error) {
    console.error('[Auth] getSession error:', error.message);
  } else {
    syncAuthUI(session?.user ?? null);
    if (session) console.log('[Auth] Session restored for:', session.user.email);
  }

  // Subscribe to auth changes (login, logout, token refresh, etc.)
  window.sb.auth.onAuthStateChange((_event, session) => {
    syncAuthUI(session?.user ?? null);
    console.log('[Auth] State →', _event, session?.user?.email ?? 'signed out');
  });
}

// ══════════════════════════════════════════════════════════
//  EXPOSE GLOBALLY
// ══════════════════════════════════════════════════════════
window.authModule = {
  handleSignUp,
  handleSignIn,
  handleSignOut,
  getCurrentUser,
};

// ══════════════════════════════════════════════════════════
//  DOM WIRING
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Capture default button labels for loading-state restore
  ['login-submit-btn', 'signup-submit-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.dataset.defaultText = el.textContent;
  });

  document.getElementById('login-submit-btn') ?.addEventListener('click', handleSignIn);
  document.getElementById('signup-submit-btn')?.addEventListener('click', handleSignUp);
  document.getElementById('logout-btn')       ?.addEventListener('click', handleSignOut);

  // Allow Enter key in password fields
  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSignIn();
  });
  document.getElementById('signup-confirm-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSignUp();
  });

  initAuth();
});
