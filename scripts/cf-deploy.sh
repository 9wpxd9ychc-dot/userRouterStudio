#!/usr/bin/env bash
# userRouterStudio — деплой из Cloudflare Builds (Deploy command).
# CF_API_TOKEN подставляется Cloudflare автоматически. Секреты кладёт cf-build.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "!! Нет CF-токена в окружении сборки — это нормально для локального запуска."
  echo "!! Для локального деплоя: bash scripts/deploy-local.sh"
  exit 1
fi
export CLOUDFLARE_API_TOKEN="$TOKEN"
[ -n "${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}" ] && export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}"

npx --yes wrangler@3.114.17 deploy

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  U="${WORKER_URL:-https://userrouterstudio.${CF_ACCOUNT_ID:-}.workers.dev}"
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${U}/webhook&secret_token=${WEBHOOK_SECRET:-}" >/dev/null || true
fi
echo ">> Deploy done."
