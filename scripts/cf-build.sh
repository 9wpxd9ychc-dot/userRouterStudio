#!/usr/bin/env bash
# userRouterStudio — Build command для Cloudflare Workers Builds.
# НЕ требует CLOUDFLARE_API_TOKEN: секреты читаются из Variables & Secrets воркера.
set -euo pipefail
cd "$(dirname "$0")/.."

echo ">> Проверка синтаксиса всех JS-файлов..."
for f in src/index.js src/lib/*.js; do
  node --check "$f" || { echo "!! Синтаксис сломан в $f"; exit 1; }
done
echo ">> Синтаксис OK"

# KV опционален: если id не заполнен — убираем блок, бот работает в памяти isolate.
KV_ID=$(grep -A2 'kv_namespaces' wrangler.toml | grep -oE '[a-f0-9]{32}' | head -1 || true)
if [ -z "${KV_ID}" ] || [ "${KV_ID}" = "00000000000000000000000000000000" ]; then
  echo ">> KV id не задан — деплою без персистентности (данные живут в isolate + перезапусках теряются)."
  sed -i.bak '/^\[\[kv_namespaces\]\]/,+2d' wrangler.toml && rm -f wrangler.toml.bak
else
  echo ">> KV id: ${KV_ID}"
fi

# Деплой. В Cloudflare Builds токен подставляется автоматически (CF_API_TOKEN).
npx --yes wrangler@3.114.17 deploy
echo ">> Готово. Секреты TELEGRAM_BOT_TOKEN/OWNER_ID/WEBHOOK_SECRET берутся из Settings -> Variables and Secrets."
