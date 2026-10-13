#!/usr/bin/env bash
# userRouterStudio — ручная установка Telegram-webhook после деплоя.
# Используется, когда Cloudflare Builds не смог сам определить URL воркера
# (например, workers.dev включён уже ПОСЛЕ первого деплоя).
#
# Запуск:  bash scripts/setup-webhook.sh https://ваш-воркер.workers.dev
# Требуется только токен бота (и опционально WEBHOOK_SECRET) — НЕ Cloudflare!
set -euo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "Использование: bash scripts/setup-webhook.sh https://<worker>.workers.dev"
  exit 1
fi
URL="${URL%/}"

BOT="${TELEGRAM_BOT_TOKEN:-${2:-}}"
if [ -z "$BOT" ]; then
  read -rp "TELEGRAM_BOT_TOKEN (от @BotFather): " BOT
fi
SECRET="${WEBHOOK_SECRET:-${3:-}}"

echo ">> Проверка токена..."
curl -s "https://api.telegram.org/bot${BOT}/getMe" | head -c 300; echo

echo ">> setWebhook -> ${URL}/webhook"
if [ -n "$SECRET" ]; then
  RESP=$(curl -s "https://api.telegram.org/bot${BOT}/setWebhook?url=${URL}/webhook&secret_token=${SECRET}")
else
  RESP=$(curl -s "https://api.telegram.org/bot${BOT}/setWebhook?url=${URL}/webhook")
fi
echo "$RESP"

echo ">> getWebhookInfo:"
curl -s "https://api.telegram.org/bot${BOT}/getWebhookInfo"
echo
echo "Готово. Напишите боту +ping"
