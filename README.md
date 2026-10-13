# 🕺 userRouterStudio

**Панель команд юзербота для Telegram — полностью на Cloudflare Workers.**
Без Node-зависимостей, без серверов, без Docker. Один воркер + webhook + KV + Cron.
**100+ команд**: анимации, сообщения, разведка, утилиты, автоматизация, администрация, RP-GIF, TikTok, логи-перехват.

```
Telegram ──webhook──▶ Cloudflare Worker (userrouterstudio) ──fetch──▶ Bot API / внешние API
                          ▲                                            (погода, перевод, TTS, QR, валюты…)
                       KV Store (заметки, фильтры, AFK, варны)
                       Cron Triggers (alwaysonline heartbeat)
```

## ⚡ Быстрый старт (деплой за 3 минуты)

Нужен **бот-токен от @BotFather** и бесплатный аккаунт Cloudflare.

```bash
git clone https://github.com/USERNAME/userRouterStudio && cd userRouterStudio
npm install -g wrangler          # или npx wrangler ...
wrangler login                   # откроет браузер — авторизация в Cloudflare

# секреты (токены НЕ хранятся в коде и НЕ коммитятся):
wrangler secret put TELEGRAM_BOT_TOKEN     # вставьте токен вида 123456:ABC...
wrangler secret put WEBHOOK_SECRET         # любая длинная случайная строка
wrangler secret put OWNER_ID               # ваш числовой Telegram ID (+id в @userinfobot)

# опционально, но рекомендуется — персистентные заметки/фильтры/варны:
wrangler kv namespace create DB            # скопируйте id в wrangler.toml [[kv_namespaces]]

wrangler deploy                  # ▶ публикация worker
curl https://userrouterstudio.<ваш-аккаунт>.workers.dev/setup   # ▶ сама установка webhook
```

Готово. Напишите боту `/start` или `+help`. Статус-страница — на корневом URL.

### 🤖 Автодеплой через GitHub Actions (без локальной машины)
Репозиторий содержит готовый workflow `.github/workflows/deploy.yml`: при пуше в `main`/`master` он сам создаёт KV-неймспейс, деплоит воркер, загружает секреты и ставит Telegram-webhook. Достаточно завести в **Settings → Secrets and variables → Actions**:

| Secret | Откуда |
|---|---|
| `CLOUDFLARE_API_TOKEN` | [dash.cloudflare.com](https://dash.cloudflare.com) → My Profile → API Tokens → *Edit Cloudflare Workers* (+ `Read & Write` для KV) |
| `CLOUDFLARE_ACCOUNT_ID` | правая панель любого раздела Cloudflare dashboard |
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `OWNER_ID` | ваш числовой ID (@userinfobot) |
| `WEBHOOK_SECRET` | любая длинная случайная строка |

Или одной командой с локальной машины:
```bash
./scripts/deploy.sh "123456:ABC-your-token" 11111111
```

### Локальная разработка
```bash
cp .dev.vars.example .dev.vars   # вписать токен
npx wrangler dev                 # локальный эмулятор worker
```

## 📦 Структура
```
src/index.js           роутер апдейтов, webhook-установка, cron, пассивные фичи (AFK/filters/clone/slow)
src/lib/tg.js          Bot API клиент (нативный fetch, HTML fallback, bulk delete, media)
src/lib/animations.js  все +анимации через editMessageText (с троттлингом flood-wait)
src/lib/handlers.js    ~90 команд
src/lib/utils.js       калькулятор, перевод, TTS, погода, wiki, UD, валюты, crypto, anime, lyrics, QR, paste…
src/lib/gifs.js        24 RP-GIF действия + русские алиасы
src/lib/store.js       KV-backed хранилище (notes/filters/afk/warns/toggles) + in-memory fallback
wrangler.toml          конфиг Cloudflare Workers
```

## 🎬 Анимации и приколы
| Команда | Что делает |
|---|---|
| `+type текст` | печатает по буквам (со статусом «печатает…») |
| `+hack` | взлом Пентагона с прогресс-баром и этапами |
| `+love` | растущее сердце ❤️ |
| `+matrix` | падающий код матрицы, «Wake up, Neo…» |
| `+dice` `+slot` `+darts` | кубик / слот-машина / дартс |
| `+basket` `+football` `+bowling` | баскет / футбол / боулинг со страйком |
| `+moon` `+clock` `+earth` | фазы луны / часы с московским временем / обороты Земли |
| `+fakeaction [typing\|voice\|video…] [сек]` | фейковый статус активности |
| `+type_del [сек] [текст]` | самоуничтожающееся сообщение 💣 |
| `+joke` | шуточки · `+ascii ТЕКСТ` | figlet-баннер |

## 💬 Сообщения
`+del` (ответом) · `+purge` (диапазон до ответа) · `+edit текст` (редакт своего последнего) · `+save` · `+quote` (цитата-карточка) · `+fwd` · `+copy` (без шапки пересылки) · `+pin`/`+unpin` · `+search слово` · `+clear` · `+chats запрос`

## 🕵️ Информация и шпионаж
`+id` · `+info` (досье: роль, аватары, premium) · `+avatar` · `+chatinfo` · `+spy @юзер` · `+ping` · `+alive` (аптайм ядра) · `+speedtest` (реальный замер через speed.cloudflare.com) · `+whois @юзер` (общие группы) · `+admins` · `+trace` (colo дата-центра CF)

## 🧰 Утилиты
`+calc 2+2*sqrt(16)` (безопасный eval) · `+tr [lang] текст` · `+tts текст` (голосовое из текста) · `+weather город` (open-meteo, 3 дня) · `+google запрос` (DDG instant) · `+ud слово` (Urban Dictionary) · `+wiki тема` · `+kang` (кража стикера в свой сет) · `+qr текст` · `+short ссылка` · `+curr USD RUB [кол-во]` · `+define word` · `+crypto btc` · `+anime наруто` · `+lyrics Artist - Song`

## 🤖 Автоматизация
`+afk [причина]`/`+unafk` (уведомления тем, кто вас упомянет) · `+autoread` · `+alwaysonline` (heartbeat через Cron Triggers) · `+clone`/`+unclone` (дублирование сообщений) · `+clonep`/`+unclonep` · `+note имя текст`/`+notes`/`+get имя`/`+delnote` · `+filter слово ответ`/`+unfilter`/`+filters`

## 🛡 Администрация
`+mute 10мин|2h`/`+unmute` (restrict = soft-delete mute) · `+ban [время]`/`+unban`/`+kick` · `+warn`/`+unwarn`/`+warns` (3/3 → автобан 24ч) · `+slow [сек]` (антифлуд-эмуляция) · `+title`/`+desc` · `+tagall [кол-во] [текст]` · `+spam [кол-во] [текст]` (параллельно через Promise.all, только owner)

## 🤝 RP / Медиа / Логи
24 GIF-действия: `+hug +pet +kiss +slap +bite +cry +laugh +poke +wave +dance +facepalm +shrug +happy +angry +blush +highfive +think +sleep +coffee +heart +kill +nom +wink +salute` и русские алиасы **`+обнять` `+погладить` `+поцеловать` …** · `+tiktok ссылка` (скачивание без вотермарки) · `+chaos`/`+chaos reset` (агрегированное досье слежки) · `+logs` — Pasture-перехват: edits, deletes, pins, join/leave, channel-edits → линк на pastebin

## 🔌 Алиасы (часть)
`/`-стиль тоже работает: `—help`, а также `roll=dice, casino=slot, pentagon=hack, pfp=avatar, block=ban, gag=mute, steal=kang, translate=tr, voice=tts, exchange=curr, dossier=chaos, eventlog=logs, status=alive, selfdelete=type_del, mentionall=tagall, хелп/помощь=help` и ещё 50+.

## ⚠️ Честно о Bot API vs Userbot
Cloudflare Workers не держат MTProto-сессии, поэтому всё работает через **Bot API**. Часть «юзерботных» команд имеют честные ограничения и бот об этом сообщает сам:
- `+save` (Избранное), полный `+spy`/`+chats` по всей истории, `+purge` старых сообщений, `+tagall` всех участников, настоящий slow_mode, отметки прочтения — требуют userbot-сессии (pyrogram на VPS). Здесь они эмулируются по максимуму (антифлуд, typing-ack, индекс новых сообщений, тег админов).
- Бот «помнит» только то, что видит с момента добавления в чат (`allowed_updates` включает edited/channel/join events — их ловит перехватчик логов).
- Сгорающие медиа: Bot API не отдаёт view-once файлы — команда честно предупредит. Для этого уровня нужен userbot-мост; архитектура воркера готова принимать второй токен (`USERBOT_TOKEN`) без переписывания роутера.

Использование spy/warn/ban-функций — только там, где вы имеете на это право (свои чаты, модерация своих групп).

## 🔐 Безопасность
- Токены только в `wrangler secret` — никогда в репозитории.
- Webhook защищён `secret_token` (проверка заголовка `X-Telegram-Bot-Api-Secret-Token`).
- Owner-gated команды (`+spam`, `+owner`) проверяют `OWNER_ID`.
- Калькулятор — whitelist-парсер, никакого произвольного eval.

## 📄 License
MIT © userRouterStudio
