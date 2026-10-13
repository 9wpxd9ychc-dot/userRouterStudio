#!/usr/bin/env bash
# userRouterStudio — сборка внутри Cloudflare Workers Builds.
# НЕ требует CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID в GitHub:
# Cloudflare сам подставляет эти переменные в свои build-окружения.
#
# Настройка в Dashboard (Workers & Pages -> Create -> Workers -> Build settings):
#   Connect to Git  : репозиторий userRouterStudio, ветка master
#   Framework preset: None
#   Build command   : bash scripts/cf-build.sh
#   Deploy bucket    : dist
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "!! CLOUDFLARE_API_TOKEN отсутствует."
  echo "!! Этот скрипт рассчитан на сборку ВНУТРИ Cloudflare Builds,"
  echo "!! где токен подставляется автоматически. Для локального деплоя"
  echo "!! используйте: bash scripts/deploy-local.sh"
  exit 1
fi

# 1. KV-неймспейс для заметок/фильтров/AFK (создаётся один раз)
KV_ID=$(grep -A2 'kv_namespaces' wrangler.toml | grep -oP '(?<=id = ")[a-f0-9]{32}' || true)
if [ -z "${KV_ID}" ]; then
  echo ">> Создаю KV-неймспейс userrouterstudio-db ..."
  KV_ID=$(npx --yes wrangler@latest kv namespace create userrouterstudio-db --json | grep -oP '(?<="id":")[a-f0-9]{32}')
  printf '\n[[kv_namespaces]]\nbinding = "DB"\nid = "%s"\n' "$KV_ID" >> wrangler.toml
fi
echo ">> KV id: $KV_ID"

# 2. Секреты берём из переменных окружения билда (заполняются в Dashboard)
for VAR in TELEGRAM_BOT_TOKEN OWNER_ID WEBHOOK_SECRET; do
  if [ -n "${!VAR:-}" ]; then
    printf '%s' "${!VAR}" | npx --yes wrangler@latest secret put "$VAR"
  else
    echo "!! ВНИМАНИЕ: $VAR не задана в настройках сборки (Settings -> Variables)"
  fi
done

# 3. Деплой воркера
npx --yes wrangler@latest deploy

# 4. Деплой-вывод: Cloudflare сам печатает реальный URL воркера.
#    Ставим webhook, если задан WORKER_URL (в Variables билда) — иначе
#    после первого деплоя скопируйте URL из Dashboard и выполните:
#      bash scripts/setup-webhook.sh https://<worker>.workers.dev
if [ -n "${WORKER_URL:-}" ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  U="${WORKER_URL%/}"
  RESP=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${U}/webhook&secret_token=${WEBHOOK_SECRET:-}")
  echo ">> setWebhook -> ${U}/webhook : $RESP"
else
  echo ">> WORKER_URL/TELEGRAM_BOT_TOKEN не заданы — webhook НЕ установлен."
  echo ">> После включения workers.dev выполните вручную:"
  echo "   bash scripts/setup-webhook.sh https://<ваш-workder>.workers.dev <BOT_TOKEN> <WEBHOOK_SECRET>"
fi

# 5. Заглушка для Pages-совместимости (не используется при Workers-билде)
mkdir -p dist && echo "// deployed via wrangler" > dist/_worker.js
