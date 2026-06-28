---
name: Cloudflare Workers Deploy
description: How to rebuild and redeploy this TanStack Start + Nitro app to Cloudflare Workers
---

## Rule
Always use wrangler@3, never wrangler@4.

**Why:** wrangler v4 has a non-interactive mode bug that causes deploy failures in CI/scripted environments.

## Build + Deploy Steps (run every time code changes)
```bash
bun run build
rm -f .wrangler/deploy/config.json   # prevent config conflict

# Inject required fields into wrangler.json
bun -e "
import fs from 'fs';
const WEBAPP_URL = fs.readFileSync('/tmp/webapp_url.txt','utf8').trim();
const cfg = JSON.parse(fs.readFileSync('.output/server/wrangler.json','utf8'));
cfg.account_id = process.env.CLOUDFLARE_ACCOUNT_ID;
cfg.workers_dev = true;
cfg.vars = {
  CLOUDFLARE_KV_NAMESPACE_ID: '6d68ada68c4046b88d704f8cf2c524d7',
  WEBAPP_URL,
  SUPABASE_URL: 'https://pemxxfhwbxtikahyvrls.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: '<anon_key>',
};
fs.writeFileSync('.output/server/wrangler.json', JSON.stringify(cfg, null, 2));
"

cd .output/server && CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID bunx wrangler@3 deploy
```

## Worker Secrets (already set, persist across deploys)
- TELEGRAM_API_KEY
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID

## Worker Vars (must be injected each build into wrangler.json)
- CLOUDFLARE_KV_NAMESPACE_ID = 6d68ada68c4046b88d704f8cf2c524d7
- WEBAPP_URL = stored in /tmp/webapp_url.txt (or reconstruct from subdomain API)
- SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (for client auth only)

## Worker Name
shopnowkh-cloud-clon

## KV Namespace
ID: 6d68ada68c4046b88d704f8cf2c524d7 (name: shopnowkh-bot-kv)
