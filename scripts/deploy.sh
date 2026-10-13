#!/usr/bin/env bash
# One-shot deploy of userRouterStudio to Cloudflare Workers.
# Usage:  ./scripts/deploy.sh <bot-token> [owner-id]
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN="${1:?Usage: deploy.sh <TELEGRAM_BOT_TOKEN> [OWNER_ID]}"
OWNER="${2:-${OWNER_ID:-}}"

echo ">> Installing wrangler..."
npm i --no-save wrangler >/dev/null 2>&1

echo ">> Creating KV namespace (if missing)..."
if ! grep -q 'binding = "DB"' wrangler.toml; then
  KV_ID=$(npx wrangler kv namespace create DB_NAMESPACE 2>/dev/null | grep -oE 'id = "[^"]*"' | head -1 || true)
  if [ -n "${KV_ID:-}" ]; then
    { echo ""; echo '[[kv_namespaces]]'; echo 'binding = "DB"'; echo "$KV_ID"; } >> wrangler.toml
  fi
fi

echo ">> Uploading secrets..."
printf '%s' "$TOKEN" | npx wrangler secret put TELEGRAM_BOT_TOKEN
SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '=+/' | head -c 32)
printf '%s' "$SECRET" | npx wrangler secret put WEBHOOK_SECRET
[ -n "$OWNER" ] && printf '%s' "$OWNER" | npx wrangler secret put OWNER_ID

echo ">> Deploying worker..."
URL=$(npx wrangler deploy | grep -oE 'https://[a-z0-9._-]+\.workers\.dev' | head -1)
echo ">> Worker URL: $URL"

echo ">> Setting Telegram webhook..."
curl -s "https://api.telegram.org/bot${TOKEN}/setWebhook?url=${URL}/webhook&secret_token=${SECRET}"
echo
echo "Done! Write +help to your bot."
