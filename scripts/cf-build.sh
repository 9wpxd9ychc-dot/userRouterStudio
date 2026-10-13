#!/usr/bin/env bash
# userRouterStudio — деплой ВНУТРИ Cloudflare Workers Builds (Build command).
# Не требует CLOUDFLARE_API_TOKEN в GitHub: Cloudflare сам подставляет
# CF_API_TOKEN + CF_ACCOUNT_ID в окружение сборки.
set -uo pipefail
cd "$(dirname "$0")/.."

# Cloudflare Builds может называть авто-токен по-разному в разных версиях —
# перебираем все известные имена. Если ничего нет — подсказываем решение.
TOKEN=""
for V in CLOUDFLARE_API_TOKEN CF_API_TOKEN CLOUDFLARE_API_TOKEN_ENCRYPTED CF_TOKEN API_TOKEN; do
  VAL="$(printenv "$V" 2>/dev/null || true)"
  if [ -n "$VAL" ]; then TOKEN="$VAL"; echo ">> Найден CF-токен в переменной $V"; break; fi
done
ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}"
WRANGLER="npx --yes wrangler@3.114.17"

if [ -z "$TOKEN" ]; then
  echo "=============================================================="
  echo "!! В окружении сборки НЕ найдено ни одной CF-переменной с токеном."
  echo "!! Это значит, что билд запущен НЕ из Cloudflare Builds"
  echo "!!   (например, это GitHub Actions без секретов)."
  echo ""
  echo "!! РЕШЕНИЕ А (рекомендуется, без всяких токенов):"
  echo "!!   dash.cloudflare.com -> Workers & Pages -> Create Worker"
  echo "!!   Build settings -> Connect to Git -> репозиторий userRouterStudio,"
  echo "!!   branch master, Build command: bash scripts/cf-build.sh"
  echo "!!   Cloudflare САМ подставит токен при сборке."
  echo ""
  echo "!! РЕШЕНИЕ Б (если хотите через GitHub Actions):"
  echo "!!   добавьте секреты CLOUDFLARE_API_TOKEN и CLOUDFLARE_ACCOUNT_ID"
  echo "!!   в Settings -> Secrets and variables -> Actions"
  echo "=============================================================="
  exit 1
fi
export CLOUDFLARE_API_TOKEN="$TOKEN"
[ -n "$ACCOUNT" ] && export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT"
echo ">> Account ID: ${ACCOUNT:-не определён}"

# 0. Жёсткая проверка синтаксиса ВСЕХ файлов до бандлинга (esbuild не любит TS-аннотации)
for f in src/index.js src/lib/*.js; do
  node --check "$f" || { echo "!! Синтаксис сломан в $f"; exit 1; }
done
echo ">> Синтаксис всех файлов OK"

# 1. KV-неймспейс (создаётся один раз, id сохраняется в wrangler.toml)
KV_ID=$(grep -A2 'kv_namespaces' wrangler.toml | grep -oE '[a-f0-9]{32}' | head -1 || true)
if [ -z "${KV_ID}" ]; then
  echo ">> Создаю KV-неймспейс userrouterstudio-db ..."
  KV_JSON=$($WRANGLER kv namespace create DB --json 2>/dev/null || true)
  KV_ID=$(echo "$KV_JSON" | grep -oE '"id"[^"]*"[a-f0-9]{32}"' | grep -oE '[a-f0-9]{32}' | head -1 || true)
  if [ -z "$KV_ID" ]; then
    echo "!! Не удалось создать KV. Работаем без персистентности."
  else
    sed -i.bak 's|^# \[\[kv_namespaces\]\]|[[kv_namespaces]]|; s|^# binding = "DB"|binding = "DB"|; s|^# id = "<ваш-id>"|id = "'"$KV_ID"' "|' wrangler.toml
    rm -f wrangler.toml.bak
    echo ">> KV id: $KV_ID"
  fi
fi

# 2. Секреты из переменных билда (Dashboard -> Settings -> Variables & Secrets)
for VAR in TELEGRAM_BOT_TOKEN OWNER_ID WEBHOOK_SECRET; do
  VAL="$(printenv "$VAR" || true)"
  if [ -n "$VAL" ]; then
    printf '%s' "$VAL" | $WRANGLER secret put "$VAR" >/dev/null 2>&1 \
      && echo ">> secret $VAR ✓" || echo "!! secret $VAR — ошибка"
  else
    echo "!! $VAR не задана в Variables сборки (добавьте в Settings -> Variables & Secrets)"
  fi
done

# 3. Деплой воркера (wrangler бандлит src/index.js через esbuild)
$WRANGLER deploy || { echo "!! Deploy упал"; exit 1; }

# 4. Webhook: если задан WORKER_URL — ставим сразу; иначе откройте <url>/setup
if [ -n "${WORKER_URL:-}" ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  U="${WORKER_URL%/}"
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${U}/webhook&secret_token=${WEBHOOK_SECRET:-}" && echo
else
  echo ">> Webhook НЕ установлен автоматически. После включения workers.dev"
  echo ">> просто откройте в браузере: https://userrouterstudio.<ваш-prefix>.workers.dev/setup"
fi
echo ">> Готово."
