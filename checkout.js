/**
 * checkout.js
 * ─────────────────────────────────────────────────────────
 * Razorpay payment integration.
 *
 * ⚙️  SETUP:
 *   1. Go to https://dashboard.razorpay.com
 *   2. Settings → API Keys → Generate Key
 *   3. Replace RAZORPAY_KEY_ID below with your "rzp_test_…" key
 *
 * ⚠️  PRODUCTION NOTE:
 *   In production, generate `order_id` via your backend / Supabase
 *   Edge Function (POST /v1/orders) using your Key Secret.
 *   Never expose the Key Secret in client-side code.
 *
 * Depends on: supabase-config.js, auth.js, products.js
 */

const RAZORPAY_KEY_ID = 'rzp_test_YOUR_KEY_ID'; // ← REPLACE

const STORE = {
  name:     'LUXE Shop',
  logo:     'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=80&q=60',
  currency: 'INR',
  email:    'support@luxeshop.in',
};

// ══════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════
function toPaise(inr) {
  // Razorpay requires amounts in smallest unit (paise = INR × 100)
  return Math.round(Number(inr) * 100);
}

function isRazorpayReady() {
  return typeof Razorpay !== 'undefined';
}

function isKeyConfigured() {
  return !RAZORPAY_KEY_ID.includes('YOUR_KEY_ID');
}

// ══════════════════════════════════════════════════════════
//  MAIN CHECKOUT FLOW
// ══════════════════════════════════════════════════════════
async function initiateCheckout() {
  const cart  = window.productsModule?.getCart?.()  ?? [];
  const total = window.productsModule?.getCartTotal?.() ?? 0;

  // ── Guard: empty cart ──────────────────────────────────
  if (cart.length === 0) {
    window.showToast?.('Your cart is empty — add a product first!', 'error');
    return;
  }

  // ── Guard: user must be logged in ─────────────────────
  const user = await window.authModule?.getCurrentUser?.();
  if (!user) {
    window.showToast?.('Please sign in to complete your purchase.', 'error');
    // Give toast a moment to show before modal opens
    setTimeout(() => window.openAuthModal?.('login'), 400);
    return;
  }

  // ── Guard: Razorpay SDK loaded ─────────────────────────
  if (!isRazorpayReady()) {
    console.error('[Checkout] Razorpay SDK not loaded.');
    window.showToast?.('Payment service unavailable. Please refresh the page.', 'error');
    return;
  }

  // ── Demo mode ─────────────────────────────────────────
  if (!isKeyConfigured()) {
    showDemoCheckout(cart, total, user);
    return;
  }

  // ── Build Razorpay options ─────────────────────────────
  const description = cart.length === 1
    ? `${cart[0].name} × ${cart[0].qty}`
    : `${cart.length} items from ${STORE.name}`;

  const options = {
    key:          RAZORPAY_KEY_ID,
    amount:       toPaise(total),
    currency:     STORE.currency,
    name:         STORE.name,
    description,
    image:        STORE.logo,
    // order_id: 'order_XXXXXX',   // ← Uncomment + set from your backend in production

    prefill: {
      email:   user.email ?? '',
      name:    user.user_metadata?.full_name ?? '',
      contact: user.user_metadata?.phone ?? '',
    },

    notes: {
      user_id:    user.id,
      item_count: cart.length,
    },

    theme: { color: '#C8A96E' },

    handler: function (response) {
      // Called on successful payment
      console.log('[Checkout] ✓ Payment success:', response.razorpay_payment_id);
      onPaymentSuccess(response, cart, total, user);
    },

    modal: {
      ondismiss: function () {
        console.log('[Checkout] Modal dismissed by user.');
        window.showToast?.('Payment cancelled.', 'error');
      },
      escape:     true,
      backdropclose: false,
    },
  };

  // ── Open Razorpay ──────────────────────────────────────
  try {
    const rzp = new Razorpay(options);

    rzp.on('payment.failed', function (response) {
      const { code, description, reason, source, step } = response.error ?? {};
      console.error('[Checkout] ✗ Payment failed:', { code, description, reason, source, step });
      onPaymentFailure({ code, description, reason });
    });

    rzp.open();
    console.log('[Checkout] Razorpay modal opened. Total:', total, STORE.currency);

  } catch (err) {
    console.error('[Checkout] Could not open Razorpay:', err.message);
    window.showToast?.('Could not start payment. Please try again.', 'error');
  }
}

// ══════════════════════════════════════════════════════════
//  SUCCESS HANDLER
// ══════════════════════════════════════════════════════════
async function onPaymentSuccess(response, cart, total, user) {
  const paymentId = response.razorpay_payment_id;

  // ── Save order to Supabase ──────────────────────────
  if (window.sb && window.sbConfigured) {
    const { error } = await window.safeQuery(
      window.sb.from('orders').insert({
        user_id:    user.id,
        user_email: user.email,
        payment_id: paymentId,
        order_id:   response.razorpay_order_id   ?? null,
        amount:     total,
        currency:   STORE.currency,
        status:     'paid',
        items:      cart,          // JSONB snapshot of cart
      })
    );

    if (error) {
      // Non-fatal: payment succeeded, just log the save failure
      console.warn('[Checkout] Order save failed (non-fatal):', error.message);
    } else {
      console.log('[Checkout] Order saved to Supabase.');
    }
  }

  // ── Clear cart ─────────────────────────────────────
  window.productsModule?.clearCart?.();

  // ── Close cart drawer ──────────────────────────────
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.getElementById('cart-overlay')?.classList.remove('active');
  document.body.style.overflow = '';

  // ── Show confirmation ──────────────────────────────
  showConfirmationModal(paymentId, total);
}

// ══════════════════════════════════════════════════════════
//  FAILURE HANDLER
// ══════════════════════════════════════════════════════════
function onPaymentFailure({ code, description, reason }) {
  const log = {
    timestamp: new Date().toISOString(),
    code, description, reason,
  };
  console.error('[Checkout] Payment failure log:', JSON.stringify(log, null, 2));

  // User-friendly message based on error code
  let userMsg = 'Payment failed. Please try again or use a different payment method.';

  if (code === 'BAD_REQUEST_ERROR')  userMsg = 'Payment declined. Please check your card details.';
  if (code === 'GATEWAY_ERROR')      userMsg = 'Payment gateway error. Please try again in a moment.';
  if (code === 'NETWORK_ERROR')      userMsg = 'Network error during payment. Check your connection.';

  window.showToast?.(userMsg, 'error');
}

// ══════════════════════════════════════════════════════════
//  DEMO CHECKOUT (when Razorpay not configured)
// ══════════════════════════════════════════════════════════
function showDemoCheckout(cart, total, user) {
  const lines = cart
    .map(i => `  • ${i.name} × ${i.qty}  —  ₹${(i.price * i.qty).toLocaleString('en-IN')}`)
    .join('\n');

  alert(
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `  DEMO MODE — Razorpay not configured\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Customer: ${user.email}\n\n` +
    `Order Summary:\n${lines}\n\n` +
    `Total: ₹${total.toLocaleString('en-IN')}\n\n` +
    `To enable real payments:\n` +
    `  → Replace RAZORPAY_KEY_ID in checkout.js\n` +
    `  → with your rzp_test_XXXX key from\n` +
    `    dashboard.razorpay.com`
  );
}

// ══════════════════════════════════════════════════════════
//  CONFIRMATION MODAL
// ══════════════════════════════════════════════════════════
function showConfirmationModal(paymentId, total) {
  // Remove any existing confirmation
  document.getElementById('order-confirm-modal')?.remove();

  const el = document.createElement('div');
  el.id = 'order-confirm-modal';
  el.className = 'confirm-modal-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Order Confirmed');

  el.innerHTML = `
    <div class="confirm-modal">
      <div class="confirm-icon">🎉</div>
      <h2>Order Confirmed!</h2>
      <p>Thank you for your purchase. You'll receive a confirmation email shortly.</p>
      <div class="confirm-details">
        <div class="confirm-row">
          <span>Payment ID</span>
          <strong>${paymentId}</strong>
        </div>
        <div class="confirm-row">
          <span>Amount Paid</span>
          <strong>₹${Number(total).toLocaleString('en-IN')}</strong>
        </div>
      </div>
      <button class="btn-confirm-close" id="confirm-close-btn">Continue Shopping</button>
    </div>
  `;

  document.body.appendChild(el);

  function closeConfirm() {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }

  document.getElementById('confirm-close-btn')?.addEventListener('click', closeConfirm);
  el.addEventListener('click', e => { if (e.target === el) closeConfirm(); });

  console.log('[Checkout] Confirmation shown. Payment ID:', paymentId);
}

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('checkout-btn');
  if (btn) {
    btn.addEventListener('click', initiateCheckout);
    console.log('[Checkout] Wired checkout button.');
  }

  if (!isKeyConfigured()) {
    console.warn(
      '%c[Checkout] DEMO MODE — Razorpay key not configured.\n' +
      'Replace RAZORPAY_KEY_ID in checkout.js to enable real payments.',
      'color: orange; font-weight: bold'
    );
  }
});
