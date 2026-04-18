/**
 * products.js
 * ─────────────────────────────────────────────────────────
 * • Fetches products from Supabase `products` table
 * • Falls back gracefully to demo data when unconfigured
 * • Renders product cards with category filter
 * • Full cart system: add / remove / qty / persist to localStorage
 *
 * Depends on: supabase-config.js (window.sb, window.sbConfigured)
 */

// ══════════════════════════════════════════════════════════
//  DEMO FALLBACK DATA
//  Used when Supabase is not yet configured.
// ══════════════════════════════════════════════════════════
const DEMO_PRODUCTS = [
  { id: '1', name: 'Ceramic Pour-Over Set',      description: 'Hand-thrown stoneware with a matte finish. Brews the perfect cup.',    price: 2499, image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80', category: 'lifestyle',   badge: 'New',  rating: 4.8 },
  { id: '2', name: 'Linen Weekend Tote',          description: 'Washed linen with leather handles. Built for weekend escapes.',        price: 1899, image_url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80', category: 'accessories', badge: null,   rating: 4.7 },
  { id: '3', name: 'Merino Wool Crewneck',        description: 'Grade-A merino from New Zealand. Naturally temperature-regulating.',  price: 3999, image_url: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&q=80', category: 'apparel',     badge: 'Sale', rating: 4.9 },
  { id: '4', name: 'Walnut Desk Organiser',       description: 'Solid walnut with felt-lined compartments. Clears the chaos.',        price: 1649, image_url: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80', category: 'lifestyle',   badge: null,   rating: 4.6 },
  { id: '5', name: 'Hand-turned Brass Pen',       description: 'CNC-machined from solid brass. Gets better with age.',                price: 1299, image_url: 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=600&q=80', category: 'accessories', badge: 'New',  rating: 4.9 },
  { id: '6', name: 'Organic Cotton Shirt',        description: 'GOTS-certified organic cotton. Relaxed fit, refined drape.',          price: 2299, image_url: 'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=600&q=80', category: 'apparel',     badge: null,   rating: 4.5 },
  { id: '7', name: 'Stone-ground Coffee Blend',   description: 'Single-origin beans, medium roast. Notes of dark chocolate.',         price:  899, image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&q=80', category: 'lifestyle',   badge: 'New',  rating: 4.8 },
  { id: '8', name: 'Minimalist Card Wallet',      description: 'Full-grain veg-tanned leather. Holds 6 cards, slim as 4mm.',          price: 1099, image_url: 'https://images.unsplash.com/photo-1627123424574-724758594785?w=600&q=80', category: 'accessories', badge: null,   rating: 4.7 },
];

// ══════════════════════════════════════════════════════════
//  MODULE STATE
// ══════════════════════════════════════════════════════════
let allProducts   = [];  // Full list from Supabase / demo
let cart          = [];  // Active cart items

// ══════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════
function formatINR(amount) {
  return Number(amount ?? 0).toLocaleString('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0,
  });
}

/** Safely escape HTML to prevent XSS in dynamic rendering */
function esc(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str ?? ''));
  return div.innerHTML;
}

// ══════════════════════════════════════════════════════════
//  FETCH PRODUCTS FROM SUPABASE
// ══════════════════════════════════════════════════════════
async function loadProducts() {
  const loadingEl = document.getElementById('products-loading');
  const errorEl   = document.getElementById('products-error');
  const gridEl    = document.getElementById('product-grid');

  // Show loading state
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (errorEl)   errorEl.classList.add('hidden');
  if (gridEl)    gridEl.innerHTML = '';

  // ── No Supabase configured → use demo data ───────────
  if (!window.sbConfigured || !window.sb) {
    console.info('[Products] Demo mode — Supabase not configured.');
    await new Promise(r => setTimeout(r, 500)); // Simulate latency
    allProducts = DEMO_PRODUCTS;
    if (loadingEl) loadingEl.classList.add('hidden');
    renderProducts(allProducts);
    return;
  }

  // ── Fetch from Supabase ──────────────────────────────
  const { data, error } = await window.safeQuery(
    window.sb
      .from('products')
      .select('id, name, description, price, image_url, category, badge, rating')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
  );

  if (loadingEl) loadingEl.classList.add('hidden');

  if (error) {
    console.error('[Products] Supabase fetch error:', error.message);

    // Show error UI with retry button
    if (errorEl) {
      errorEl.classList.remove('hidden');
      const errorText = errorEl.querySelector('.error-text');
      if (errorText) errorText.textContent = `Could not load products: ${error.message}`;
    }

    // Graceful degradation — show demo products anyway
    console.info('[Products] Falling back to demo data.');
    allProducts = DEMO_PRODUCTS;
    if (errorEl) errorEl.classList.add('hidden');
    renderProducts(allProducts);
    return;
  }

  if (!data || data.length === 0) {
    console.info('[Products] No products found in DB — using demo data.');
    allProducts = DEMO_PRODUCTS;
  } else {
    allProducts = data;
    console.log(`[Products] Loaded ${allProducts.length} products from Supabase.`);
  }

  renderProducts(allProducts);
}

// ══════════════════════════════════════════════════════════
//  RENDER PRODUCTS
// ══════════════════════════════════════════════════════════
function renderProducts(products) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>No products found in this category.</p>
      </div>`;
    return;
  }

  grid.innerHTML = products.map((p, i) => `
    <article class="product-card" data-id="${esc(String(p.id))}" data-category="${esc(p.category ?? '')}">
      <div class="product-img-wrap">
        ${p.badge ? `<span class="product-badge">${esc(p.badge)}</span>` : ''}
        <img
          src="${esc(p.image_url ?? '')}"
          alt="${esc(p.name)}"
          loading="lazy"
          onerror="this.src='https://placehold.co/600x400/F0EDE8/7A7570?text=LUXE'"
        />
        <button
          class="quick-add-btn"
          data-product='${encodeProductData(p)}'
          aria-label="Add ${esc(p.name)} to cart"
        >
          Add to Cart
        </button>
      </div>
      <div class="product-info">
        <p class="product-category">${esc(p.category ?? 'General')}</p>
        <h3 class="product-name">${esc(p.name)}</h3>
        <p class="product-description">${esc(p.description ?? '')}</p>
        <div class="product-footer">
          <span class="product-price">${formatINR(p.price)}</span>
          ${p.rating ? `<span class="product-rating">★ ${Number(p.rating).toFixed(1)}</span>` : ''}
        </div>
      </div>
    </article>
  `).join('');

  // Attach add-to-cart listeners (event delegation on grid)
  grid.querySelectorAll('.quick-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const product = decodeProductData(btn.dataset.product);
      if (product) addToCart(product);
    });
  });

  // Staggered fade-in animation
  grid.querySelectorAll('.product-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    requestAnimationFrame(() => {
      setTimeout(() => {
        card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, i * 70);
    });
  });
}

// ── Safe product data encoding for data attributes ───────
function encodeProductData(product) {
  try {
    // encodeURIComponent to safely embed JSON in an HTML attribute
    return encodeURIComponent(JSON.stringify({
      id:        product.id,
      name:      product.name,
      price:     product.price,
      image_url: product.image_url,
      category:  product.category,
    }));
  } catch {
    return '';
  }
}

function decodeProductData(encoded) {
  try {
    return JSON.parse(decodeURIComponent(encoded));
  } catch (err) {
    console.error('[Products] Could not decode product data:', err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════
//  FILTER
// ══════════════════════════════════════════════════════════
function filterProducts(category) {
  if (category === 'all') {
    renderProducts(allProducts);
  } else {
    renderProducts(allProducts.filter(p =>
      (p.category ?? '').toLowerCase() === category.toLowerCase()
    ));
  }
}

// ══════════════════════════════════════════════════════════
//  CART — PERSISTENCE
// ══════════════════════════════════════════════════════════
const CART_KEY = 'luxe_cart_v2';

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    cart = raw ? JSON.parse(raw) : [];
    // Validate structure
    if (!Array.isArray(cart)) cart = [];
  } catch (err) {
    console.warn('[Cart] localStorage read error:', err.message);
    cart = [];
  }
}

function persistCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (err) {
    console.warn('[Cart] localStorage write error:', err.message);
  }
}

// ══════════════════════════════════════════════════════════
//  CART — OPERATIONS
// ══════════════════════════════════════════════════════════
function addToCart(product) {
  const existing = cart.find(item => String(item.id) === String(product.id));
  if (existing) {
    existing.qty = (existing.qty ?? 1) + 1;
  } else {
    cart.push({
      id:        product.id,
      name:      product.name,
      price:     Number(product.price),
      image_url: product.image_url ?? '',
      category:  product.category  ?? '',
      qty:       1,
    });
  }
  persistCart();
  renderCart();
  updateCartBadge();
  window.showToast?.(`"${product.name}" added to cart ✓`);
}

function removeFromCart(productId) {
  cart = cart.filter(item => String(item.id) !== String(productId));
  persistCart();
  renderCart();
  updateCartBadge();
}

function changeQty(productId, delta) {
  const item = cart.find(i => String(i.id) === String(productId));
  if (!item) return;
  item.qty = (item.qty ?? 1) + delta;
  if (item.qty < 1) {
    removeFromCart(productId);
    return;
  }
  persistCart();
  renderCart();
  updateCartBadge();
}

function clearCart() {
  cart = [];
  persistCart();
  renderCart();
  updateCartBadge();
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + (item.price * (item.qty ?? 1)), 0);
}

function getCartItemCount() {
  return cart.reduce((sum, item) => sum + (item.qty ?? 1), 0);
}

// ══════════════════════════════════════════════════════════
//  CART BADGE
// ══════════════════════════════════════════════════════════
function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = getCartItemCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ══════════════════════════════════════════════════════════
//  CART RENDER
// ══════════════════════════════════════════════════════════
function renderCart() {
  const emptyEl  = document.getElementById('cart-empty');
  const itemsEl  = document.getElementById('cart-items');
  const footerEl = document.getElementById('cart-footer');
  const totalEl  = document.getElementById('cart-total-price');

  if (!itemsEl) return;

  if (cart.length === 0) {
    emptyEl?.classList.remove('hidden');
    itemsEl.innerHTML = '';
    footerEl?.classList.add('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  footerEl?.classList.remove('hidden');

  itemsEl.innerHTML = cart.map(item => `
    <li class="cart-item" data-id="${esc(String(item.id))}">
      <div class="cart-item-img">
        <img
          src="${esc(item.image_url ?? '')}"
          alt="${esc(item.name)}"
          onerror="this.src='https://placehold.co/80x80/F0EDE8/7A7570?text=?'"
        />
      </div>
      <div class="cart-item-details">
        <p class="cart-item-name">${esc(item.name)}</p>
        <p class="cart-item-price">${formatINR(item.price)}</p>
        <div class="cart-qty-row">
          <button class="qty-btn" onclick="window.productsModule.changeQty('${esc(String(item.id))}', -1)" aria-label="Decrease">−</button>
          <span class="qty-val">${item.qty ?? 1}</span>
          <button class="qty-btn" onclick="window.productsModule.changeQty('${esc(String(item.id))}', 1)"  aria-label="Increase">+</button>
        </div>
      </div>
      <button
        class="cart-remove-btn"
        onclick="window.productsModule.removeFromCart('${esc(String(item.id))}')"
        aria-label="Remove ${esc(item.name)}"
      >✕</button>
    </li>
  `).join('');

  if (totalEl) totalEl.textContent = formatINR(getCartTotal());
}

// ══════════════════════════════════════════════════════════
//  EXPOSE GLOBALLY
// ══════════════════════════════════════════════════════════
window.productsModule = {
  loadProducts,
  filterProducts,
  addToCart,
  removeFromCart,
  changeQty,
  clearCart,
  getCart:          () => cart,
  getCartTotal,
  getCartItemCount,
};

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadCartFromStorage();
  renderCart();
  updateCartBadge();
  loadProducts();
});
