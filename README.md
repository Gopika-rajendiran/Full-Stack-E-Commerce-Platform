# LUXE Shop — Complete Setup Guide

## File Structure
```
luxe-shop/
├── schema.sql          ← Run this in Supabase SQL Editor FIRST
├── supabase-config.js  ← Paste your Supabase URL + anon key here
├── index.html
├── style.css
├── auth.js
├── products.js
└── checkout.js
```

---

## Step 1 — Supabase: Run the SQL Schema

1. Go to https://supabase.com → open your project
2. Click **SQL Editor** → **New Query**
3. Paste the entire contents of `schema.sql` and click **Run**
4. This creates: `profiles`, `products`, `orders` tables + RLS policies + 8 seed products

---

## Step 2 — Supabase: Get Your API Keys

1. In your Supabase project → **Settings** → **API**
2. Copy:
   - **Project URL** (e.g. `https://abcxyz.supabase.co`)
   - **anon / public** key
3. Open `supabase-config.js` and replace:
   ```js
   const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```

---

## Step 3 — Razorpay: Get Your Key

1. Sign up / log in at https://dashboard.razorpay.com
2. **Settings** → **API Keys** → **Generate Key**
3. Copy the **Key ID** (starts with `rzp_test_` for test mode)
4. Open `checkout.js` and replace:
   ```js
   const RAZORPAY_KEY_ID = 'rzp_test_YOUR_KEY_ID';
   ```

---

## Step 4 — Run Locally

Open `index.html` directly in a browser, or use a local server:
```bash
# Option A — Python
python -m http.server 8080

# Option B — Node
npx serve .

# Option C — VS Code
Install "Live Server" extension → right-click index.html → "Open with Live Server"
```

**No build step required.** Pure HTML, CSS, JavaScript.

---

## Demo Mode (Zero Config)

Without configuring Supabase or Razorpay, the site runs in full demo mode:
- 8 sample products are shown (defined in `products.js → DEMO_PRODUCTS`)
- Auth forms show validation errors correctly but won't create real accounts
- Cart works and persists across page refreshes (localStorage)
- Checkout shows a readable summary alert instead of Razorpay popup

---

## Supabase Auth Settings (Important)

In your Supabase project → **Authentication** → **Settings**:

| Setting | Recommended Value |
|---------|------------------|
| Email confirmations | **Disabled** for dev, Enable for prod |
| Minimum password length | 6 |
| Site URL | `http://localhost:8080` (dev) or your domain (prod) |

To disable email confirmation (easiest for dev):
- Auth → Settings → **Email** → uncheck "Enable email confirmations"

---

## Error Reference

| Error Shown in UI | Cause | Fix |
|---|---|---|
| "An account with this email already exists" | Email already registered | Sign in instead |
| "Incorrect email or password" | Wrong credentials | Check email/password |
| "Please confirm your email address" | Email confirmation required | Check inbox |
| "Password must be at least 6 characters" | Short password | Use 6+ chars |
| "Network error" | No internet / wrong Supabase URL | Check URL in supabase-config.js |
| "Service unavailable" | Supabase URL/Key not set | Update supabase-config.js |

---

## Supabase Products Table

If you want to add your own products instead of using seed data:

```sql
INSERT INTO products (name, description, price, image_url, category, badge, rating)
VALUES ('Your Product', 'Description here', 999.00, 'https://...', 'lifestyle', 'New', 4.5);
```

Or use the Supabase **Table Editor** GUI to insert rows visually.

---

## Production Checklist

- [ ] Replace `rzp_test_` key with `rzp_live_` key
- [ ] Enable email confirmation in Supabase Auth settings
- [ ] Create Razorpay orders server-side (Supabase Edge Function)
- [ ] Add `razorpay_signature` verification on server
- [ ] Set correct `Site URL` in Supabase Auth settings
- [ ] Enable HTTPS (required by Razorpay in production)
