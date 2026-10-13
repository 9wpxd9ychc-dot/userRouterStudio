#!/usr/bin/env bash
# Деплой userRouterStudio на Cloudflare Workers БЕЗ токена в GitHub Actions.
# Требуется только: установленный Node.js + ОДИН РАЗ выполненный `npx wrangler login`
# (откроется браузер — авторизуетесь через аккаунт Cloudflare, токен сохранится локально).
#
# Использование:
#   bash scripts/deploy-local.sh <TELEGRAM_BOT_TOKEN> <OWNER_ID> [WEBHOOK_SECRET]
set -euo pipefail

BOT_TOKEN="${1:?usage: deploy-local.sh BOT_TOKEN OWNER_ID [WEBHOOK_SECRET]}"
OWNER_ID="${2:?usage: deploy-local.sh BOT_TOKEN OWNER_ID [WEBHOOK_SECRET]}"
WEBHOOK_SECRET="${3:-$(head -c 24 /dev/urandom | base64 | tr -d '/+=')}"

cd "$(dirname "$0")/.."
W="npx --yes wrangler@latest"

# 1. KV-неймспейс (создаётся один раз, id пишется в wrangler.toml)
if ! grep -q '[[kv_namespaces]]' wrangler.toml; then
  echo ">> Создаю KV namespace userrouterstudio-db ..."
  ID=$($W kv namespace create userrouterstudio-db --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).id))')
  printf '\n[[kv_namespaces]]\nbinding = "DB"\nid = "%s"\n' "$ID" >> wrangler.toml
fi

# 2. Секреты (запрашиваются у Cloudflare напрямую, не через GitHub)
printf '%s' "$BOT_TOKEN"      | $W secret put TELEGRAM_BOT_TOKEN
printf '%s' "$OWNER_ID"       | $W secret put OWNER_ID
printf '%s' "$WEBHOOK_SECRET" | $W secret put WEBHOOK_SECRET

# 3. Деплой
echo ">> Deploy..."
$W deploy | tee /tmp/urs-deploy.log

# 4. Webhook Telegram
URL=$(grep -oE 'https://[a-z0-9._-]+\.workers\.dev' /tmp/urs-deploy.log | head -1)
if [ -z "$URL" ]; then
  echo "!! Не удалось определить URL воркера. Скопируйте его из https://dash.cloudflare.com"
  echo "   и выполните вручную:"
else
  echo ">> Worker: $URL"
fi
echo ">> Установка webhook:"
echo "curl 'https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${URL:-ВАШ_URL}/webhook&secret_token=${WEBHOOK_SECRET}'"
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${URL:-}/webhook&secret_token=${WEBHOOK_SECRET}" || true
echo
echo "✅ Готово. Напишите боту +ping"
