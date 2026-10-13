#!/usr/bin/env bash
# userRouterStudio — БУТСТРЕП без токенов Cloudflare в GitHub.
# 1) npx wrangler login (OAuth в браузере — токены руками не копировать)
# 2) деплой placeholder-воркера userrouterstudio (нужен, чтобы git-билдам было что обновлять)
# 3) загоняет секреты TELEGRAM_BOT_TOKEN / OWNER_ID / WEBHOOK_SECRET
# 4) ставит Telegram-webhook через /setup
set -euo pipefail

BOT_TOKEN="${1:?usage: bootstrap.sh TELEGRAM_BOT_TOKEN OWNER_ID [WEBHOOK_SECRET]}"
OWNER_ID="${2:?usage: bootstrap.sh TELEGRAM_BOT_TOKEN OWNER_ID [WEBHOOK_SECRET]}"
WEBHOOK_SECRET="${3:-Roum14}"

W="npx --yes wrangler@3.114.17"

echo ">> 1/4 Логин в Cloudflare (откроется браузер — подтвердите)"
$W login

echo ">> 2/4 Создаю воркер userrouterstudio..."
TMP=$(mktemp -d)
cat > "$TMP/index.js" <<'JS'
export default { async fetch() { return new Response("userRouterStudio placeholder"); } };
JS
cat > "$TMP/wrangler.toml" <<'TOML'
name = "userrouterstudio"
main = "index.js"
compatibility_date = "2024-09-23"
TOML
(cd "$TMP" && $W deploy | tee /tmp/urs-boot.log)
rm -rf "$TMP"

echo ">> 3/4 Секреты..."
printf '%s' "$BOT_TOKEN"      | $W secret put TELEGRAM_BOT_TOKEN
printf '%s' "$OWNER_ID"       | $W secret put OWNER_ID          
printf '%s' "$WEBHOOK_SECRET" | $W secret put WEBHOOK_SECRET    

echo ">> 4/4 Webhook..."
URL=$(grep -oE 'https://[a-z0-9._-]+\.workers\.dev' /tmp/urs-boot.log | head -1 || true)
if [ -z "$URL" ]; then URL="https://userrouterstudio.workers.dev"; fi
RESP=$(curl -s "${URL}/setup?token=${BOT_TOKEN}&secret=${WEBHOOK_SECRET}")
echo "   ${RESP}"
if echo "$RESP" | grep -q '"ok": *true'; then
  echo ">> ГОТОВО! Webhook: ${URL}/webhook"
else
  echo "!! Проверьте URL воркера в Dashboard и повторите:"
  echo "   curl \"https://<worker-url>/setup?token=<токен>&secret=${WEBHOOK_SECRET}\""
fi
