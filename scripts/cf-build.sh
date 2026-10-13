#!/usr/bin/env bash
# userRouterStudio — сборка ВНУТРИ Cloudflare Workers Builds.
# Не требует CLOUDFLARE_API_TOKEN / ACCOUNT_ID в GitHub:
# Cloudflare сам подставляет CF_API_TOKEN и CF_ACCOUNT_ID в build-окружение.
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}"
WRANGLER="npx --yes wrangler@3.114.17"

if [ -z "$TOKEN" ]; then
  echo "!! Нет CF-токена в окружении сборки."
  echo "!! Этот скрипт для Cloudflare Builds (токен подставляется автоматически)."
  echo "!! Для локального деплоя: bash scripts/deploy-local.sh"
  exit 1
fi
export CLOUDFLARE_API_TOKEN="$TOKEN"
[ -n "$ACCOUNT" ] && export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT"

# 1. KV-неймспейс (создаётся один раз, id сохраняется в wrangler.toml)
KV_ID=$(grep -A2 'kv_namespaces' wrangler.toml | grep -oE '[a-f0-9]{32}' | head -1 || true)
if [ -z "${KV_ID}" ]; then
  echo ">> Создаю KV-неймспейс userrouterstudio-db ..."
  KV_ID=$($WRANGLER kv namespace create DB --json 2>/dev/null | grep -oE '"id": ?"[a-f0-9]{32}"' | grep -oE '[a-f0-9]{32}' || true)
  if [ -z "$KV_ID" ]; then
    echo "!! Не удалось создать KV (нет прав?). Работаем без персистентности."
  else
    printf '\n[[kv_namespaces]]\nbinding = "DB"\nid = "%s"\n' "$KV_ID" >> wrangler.toml
    echo ">> KV id: $KV_ID"
  fi
fi

# 2. Секреты из переменных билда (Dashboard -> Settings -> Variables)
for VAR in TELEGRAM_BOT_TOKEN OWNER_ID WEBHOOK_SECRET; do
  VAL="${!VAR:-}"
  if [ -n "$VAL" ]; then
    printf '%s' "$VAL" | $WRANGLER secret put "$VAR" >/dev/null 2>&1 && echo ">> secret $VAR ✓" || echo "!! secret $VAR — ошибка"
  else
    echo "!! $VAR не задана в Variables сборки"
  fi
done

# 3. Деплой воркера (main = src/index.js, модули бандлит wrangler'ом)
$WRANGLER deploy

# 4. Webhook: если задан WORKER_URL — ставим сразу; иначе откройте <url>/setup
if [ -n "${WORKER_URL:-}" ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  U="${WORKER_URL%/}"
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${U}/webhook&secret_token=${WEBHOOK_SECRET:-}" && echo
else
  echo ">> Webhook НЕ установлен автоматически. После включения workers.dev"
  echo ">> просто откройте в браузере: https://<worker>.workers.dev/setup"
fi
echo ">> Готово."
