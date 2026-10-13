#!/usr/bin/env bash
# Сборка userRouterStudio внутри Cloudflare Pages/Workers Builds.
# НЕ требует CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID в GitHub —
# Cloudflare сам подставляет CLOUDFLARE_API_TOKEN и CLOUDFLARE_ACCOUNT_ID
# в свои build-окружения (built-in токен аккаунта).
#
# Использование в Cloudflare Dashboard:
#   Workers & Pages -> Create application -> Pages -> Connect to Git
#   Framework preset: None
#   Build command:  bash scripts/cf-build.sh <ACCOUNT_ID>
#   Output:         dist
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. KV-неймспейс (id можно заранее записать в wrangler.toml; если пусто — создаём)
KV_ID=$(grep -oP '(?<=^id = ")[a-f0-9]{32}' wrangler.toml || true)
if [ -z "${KV_ID}" ]; then
  echo ">> Creating KV namespace userrouterstudio-db ..."
  KV_ID=$(npx --yes wrangler@latest kv namespace create userrouterstudio-db --json | grep -oP '(?<="id":")[a-f0-9]{32}')
  printf '\n[[kv_namespaces]]\nbinding = "DB"\nid = "%s"\n' "$KV_ID" >> wrangler.toml
fi
echo ">> KV id: $KV_ID"

# 2. Секреты берём из переменных окружения билда (Pages env vars) или .dev.vars
for VAR in TELEGRAM_BOT_TOKEN OWNER_ID WEBHOOK_SECRET; do
  if [ -n "${!VAR:-}" ]; then
    printf '%s' "${!VAR}" | npx --yes wrangler@latest secret put "$VAR"
  else
    echo "!! Warning: $VAR not set in build environment"
  fi
done

# 3. Деплой воркера (в Pages-билде это тоже работает через wrangler)
npx --yes wrangler@latest deploy

# 4. URL воркера + Telegram webhook
WORKER_URL="https://userrouterstudio.${CF_PAGES_URL#https://*.}"
# надёжнее: берём из вывода deploy ниже; но для Pages используем стандартный домен
APP_NAME=$(grep -oP '(?<=^name = ")[^"]+' wrangler.toml)
URL="https://${APP_NAME}.$(echo "${CLOUDFLARE_ACCOUNT_ID:-default}")" # fallback
# Реальный способ: спросить API
URL=$(curl -s -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${APP_NAME}" \
  | grep -oP '"route":"[^"]+"' | head -1 | cut -d'"' -f4 || true)
[ -z "$URL" ] && URL="${CF_PAGES_URL:-}"
echo ">> Worker URL: $URL"

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "$URL" ]; then
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${URL}/webhook&secret_token=${WEBHOOK_SECRET:-}" || true
fi

mkdir -p dist && echo "ok" > dist/_worker.js 2>/dev/null || true
