---
name: Bot + Mini App Architecture
description: Architecture of the Khmer coupon bot + Telegram Mini App on Cloudflare Workers
---

## Rule
All state is stored via Cloudflare KV REST API (not Supabase). The mini app and bot share the same KV namespace.

**Why:** No Supabase service role key available; KV REST API works in Cloudflare Workers environment.

## Key Files
- `src/lib/telegram/handler.ts` — main bot handler (Khmer, KhPay payments)
- `src/lib/telegram/storage.ts` — KV state (BotState + WebappOrder)
- `src/lib/telegram/tg.ts` — Telegram API calls (direct fetch, no Lovable gateway)
- `src/lib/telegram/verify-webapp.ts` — Telegram initData HMAC verification
- `src/routes/index.tsx` — Mini App UI (full Khmer SPA)
- `src/routes/api/public/telegram/webhook.ts` — Bot webhook
- `src/routes/api/webapp/products.ts` — Mini App: list products
- `src/routes/api/webapp/order.ts` — Mini App: create KhPay order
- `src/routes/api/webapp/check.ts` — Mini App: check payment + deliver coupons

## Mini App Flow
1. User opens mini app at worker root URL
2. Fetches `/api/webapp/products` → product list from KV
3. Selects product + quantity → POST `/api/webapp/order` → KhPay QR
4. Pays → auto-polls `/api/webapp/check` every 5s
5. On paid: coupons extracted from KV, sent via bot, returned to UI

## Webapp Orders
Stored in KV under key `webapp_order_{txId}` with 30-min TTL.
Interface: WebappOrder { userId, type, quantity, total_price, transaction_id, md5, khpayToken, created_at, delivered }

## Telegram Bot Menu Button
Set via setChatMenuButton to open Mini App directly from chat header.
Bot keyboard also includes "🛒 Mini App" web_app button when WEBAPP_URL env var is set.

## Secrets Strategy
- Sensitive: TELEGRAM_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID → Worker Secrets
- Config: CLOUDFLARE_KV_NAMESPACE_ID, WEBAPP_URL, SUPABASE_* → Worker Vars (in wrangler.json)
