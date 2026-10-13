// =============================================================
// userRouterStudio — Telegram userbot control panel
// Runs 100% on Cloudflare Workers: webhook mode, KV storage,
// Cron Triggers for alwaysonline/autoread heartbeats.
// Zero Node.js dependencies — native fetch only.
// =============================================================
import { TG, escapeHtml, mention } from './lib/tg.js';
import { Store } from './lib/store.js';
import { Anim } from './lib/animations.js';
import { Handlers, HELP_TEXT } from './lib/handlers.js';
import GIF_ACTIONS, { RU_ALIASES, RU_RP } from './lib/gifs.js';

const ROUTE_PREFIX = '/webhook'; // must match WEBHOOK_PATH secret if customized

// ---------- per-isolate runtime cache (cheap, no KV writes) ----------
const CACHE = {
  chats: new Map(),        // chatId -> [messageId,...] recent ids
  msgs: new Map(),         // chatId -> [message,...] recent full msgs (for +search)
  myLast: new Map(),       // chatId -> last bot message id (for +edit)
  dialogs: new Map(),      // chatId -> {title, type}
  users: new Map(),        // userId -> user object
  firstSeen: new Map(),    // userId -> ts
  userChats: new Map(),    // userId -> Set(chatTitle)
  msgByUser: new Map(),    // userId -> count
  slowState: new Map(),    // chatId -> {lastTs, lastUser, streak}
  startedAt: Date.now(),
  count: 0,
};

function remember(m) {
  const cid = m.chat.id;
  if (!CACHE.chats.has(cid)) CACHE.chats.set(cid, []);
  const list = CACHE.chats.get(cid);
  list.push(m.message_id);
  if (list.length > 300) list.shift();

  if (!CACHE.msgs.has(cid)) CACHE.msgs.set(cid, []);
  const full = CACHE.msgs.get(cid);
  full.push(m);
  if (full.length > 200) full.shift();

  CACHE.dialogs.set(cid, { title: m.chat.title || (m.from ? mentionPlain(m.from) : String(cid)), type: m.chat.type });

  const u = m.from;
  if (u && !u.is_bot) {
    CACHE.users.set(u.id, u);
    if (!CACHE.firstSeen.has(u.id)) CACHE.firstSeen.set(u.id, m.date);
    if (!CACHE.userChats.has(u.id)) CACHE.userChats.set(u.id, new Set());
    CACHE.userChats.get(u.id).add(m.chat.title || (m.chat.type === 'private' ? 'ЛС' : String(cid)));
    CACHE.msgByUser.set(u.id, (CACHE.msgByUser.get(u.id) || 0) + 1);
  }
  CACHE.count++;
}
const mentionPlain = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || String(u.id);

// ---------- command router ----------
async function buildCtx(env) {
  const tg = new TG(env.TELEGRAM_BOT_TOKEN);
  return {
    tg,
    anim: new Anim(tg),
    store: new Store(env.DB),
    handlers: new Handlers(tg, new Anim(tg), new Store(env.DB), { startedAt: CACHE.startedAt, cache: CACHE }),
  };
}

function parseCommand(text) {
  if (!text) return null;
  const t = text.trim();
  if (!(t.startsWith('+') || t.startsWith('—'))) return null;
  const body = t.slice(1);
  const sp = body.indexOf(' ');
  const cmd = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? '' : body.slice(sp + 1).trim();
  return { cmd, rest, args: rest ? rest.split(/\s+/) : [] };
}

const ALIAS = {
  remove: 'del', kill_msg: 'del', delete: 'del',
  profile: 'info', user: 'whois', pfp: 'avatar',
  calculator: 'calc', math: 'calc',
  translate: 'tr', voice: 'tts', say: 'tts',
  g: 'google', ddg: 'google', urbandict: 'ud', wikipedia: 'wiki',
  steal: 'kang', sticker: 'kang', qrcode: 'qr', link: 'short', cut: 'short',
  exchange: 'curr', rate: 'curr', money: 'curr',
  away: 'afk', unaway: 'unafk',
  notes_list: 'notes', delnotes: 'delnote',
  autoanswer: 'filter', autor: 'filter',
  gag: 'mute', shut: 'mute', ungag: 'unmute',
  block: 'ban', unblock: 'unban', tempban: 'ban',
  settitle: 'title', setdesc: 'desc', description: 'desc',
  mentionall: 'tagall', tagonline: 'tagall',
  actions: 'rp', rpactions: 'rp',
  tt: 'tiktok', dl: 'tiktok',
  dossier: 'chaos', surveillance: 'chaos',
  eventlog: 'logs', pastebin: 'logs',
  up: 'alive', status: 'alive', health: 'alive',
  nettest: 'speedtest', speed: 'speedtest',
  dict: 'define', dic: 'define',
  btc: 'crypto', price: 'crypto',
  figlet: 'ascii', art: 'ascii',
  route: 'trace', where: 'trace',
  selfdestruct: 'type_del', boomb: 'type_del',
  faketyping: 'fakeaction', fakevoice: 'fakeaction',
  roll: 'dice', casino: 'slot', bow: 'bowling', fb: 'football', bas: 'basket',
  lunar: 'moon', time: 'clock', planet: 'earth',
  loveanim: 'love', pentagon: 'hack',
  quote_sticker: 'quote', quotesticker: 'quote',
  forward: 'fwd', copymsg: 'copy',
  pinmsg: 'pin', unpinmsg: 'unpin',
  purgeall: 'clear', wipe: 'clear', delflood: 'purge',
  dialoglist: 'chats', chatslist: 'chats',
  searchmsg: 'search', find: 'search',
  setowner: 'owner', sudo: 'owner',
  menu: 'help', commands: 'help', хелп: 'help', помощь: 'help',
  // --- extended feature aliases (130+ commands) ---
  reverse: 'revtext', переверни: 'revtext', залинк: 'linkid', link: 'short',
  embed: 'embed', preview: 'embed', button: 'btn', inline: 'btn',
  note_reply: 'replynote', автоответзаметкой: 'replynote',
  snipe: 'snipe', последнеесообщение: 'snipe', lastmsg: 'snipe',
  anticall: 'anticall', звонки: 'anticall',
  censor: 'censor', мат: 'censor', бля: 'censor',
  evaljs: 'evaljs', js: 'evaljs',
  flipimg: 'reverse', upside: 'upsidedown', вверхтормашками: 'upsidedown',
  emoji: 'emojimix', emojimix: 'emojimix',
  stickerinfo: 'stickerid', sid: 'stickerid',
  unsticker: 'delstick', removepack: 'delstick',
  packstats: 'packs', mypacks: 'packs', паки: 'packs',
  stickertopng: 'stopng', стикервpng: 'stopng',
  pngtosticker: 'sfromimg',
  convert: 'conv', unit: 'conv', конверт: 'conv',
  color: 'color', hex: 'color', цвет: 'color',
  hash: 'hash', md5: 'hash', sha256: 'hash',
  base64: 'b64', b64: 'b64', base: 'b64',
  uuid: 'uuid', guid: 'uuid',
  password: 'pass', пароль: 'pass', genpass: 'pass',
  roll_dice: 'dice', coin: 'flip', монета: 'flip', орелрешка: 'flip', flip: 'flip',
  rps: 'rps', каменьножницы: 'rps', кнб: 'rps',
  choose: 'choose', выбери: 'choose',
  rand: 'randnum', random: 'randnum',
  timeit: 'timer', таймер: 'timer', timer: 'timer',
  remind: 'remind', напоминание: 'remind', reminder: 'remind',
  poll: 'poll', опрос: 'poll', vote: 'poll',
  quoteoff: 'quotestop', цитатыофф: 'quotestop',
  quotemode: 'quotestart',
  react: 'react', реакция: 'react',
  unreact: 'unreact',
  reactions: 'topreactions', топреакций: 'topreactions',
  stats: 'userstats', статистика: 'userstats',
  blacklist: 'gban', globalban: 'gban', гбан: 'gban',
  ungban: 'ungban', unblacklist: 'ungban',
  gbans: 'gbans', gbanlist: 'gbans',
  unsilence: 'unsupergroup', silence: 'supergroup',
  ghostmute: 'ghost', призрак: 'ghost',
  savemedia: 'dlmedia', скачаймедиа: 'dlmedia', dlmedia: 'dlmedia',
  telegraph: 'telegraph', статья: 'telegraph',
  ocr: 'ocr', тексткартинки: 'ocr',
  img: 'image', картинка: 'image', photo: 'image',
  meme: 'meme', мем: 'meme',
  cat: 'cat', кот: 'cat', cats: 'cat',
  dog: 'dog', пёс: 'dog', пес: 'dog',
  fact: 'fact', факт: 'fact', facts: 'fact',
  urban_joke: 'joke',
  ip: 'ipinfo', whois_ip: 'ipinfo', мойайпи: 'ipinfo',
  dns: 'dns',
  ssl: 'sslcheck', cert: 'sslcheck',
  http: 'httpstatus', statuscode: 'httpstatus',
  ua: 'uaspoof',
  json: 'jsonfmt',
  regex: 'regex', regexp: 'regex',
  bin: 'binconv', dec: 'binconv', hexconv: 'binconv',
  ascii_art: 'ascii', figlet_text: 'ascii',
  qrwifi: 'qrwifi',
  shorten_all: 'short', isgd: 'short',
  currency: 'curr',
  btc_price: 'crypto', eth: 'crypto',
  define_en: 'define',
  news: 'news', новости: 'news',
  horoscope: 'horoscope', гороскоп: 'horoscope', zodiac: 'horoscope',
  dice_roll: 'dice',
  math_quiz: 'mathgame', математика: 'mathgame', game2048: 'numberguess',
  guess: 'numberguess', угадайчисло: 'numberguess', numberguess: 'numberguess',
  trivia: 'trivia', квиз: 'trivia', викторина: 'trivia',
  xkcd: 'xkcd', комикс: 'xkcd',
  duckduckgo: 'google',
  yt: 'youtube', ютуб: 'youtube', youtube: 'youtube', видео: 'youtube',
  gif_search: 'gifsearch', гиф: 'gifsearch',
  anime_search: 'anime',
  lyrics_find: 'lyrics',
  translate_auto: 'tr',
  tts_ru: 'tts', озвучь: 'tts', голосом: 'tts',
  weather_now: 'weather', погода: 'weather',
  calc_plus: 'calc',
  pin_all: 'pin',
  editcaption: 'editcap',
  caption: 'editcap',
  delchatphoto: 'unsetpp',
  chatpp: 'setpp', аватарчата: 'setpp',
  setusername: 'setuser', username: 'setuser',
  invite: 'invite', ссылкагруппы: 'invite', invitelink: 'invite',
  export: 'invite',
  info_all: 'chatinfo',
  rules: 'rules', правила: 'rules',
  motd: 'motd',
  bio: 'bio', описаниепрофиля: 'bio',
  birthday: 'birthday', др: 'birthday',
  karma: 'karma', карма: 'karma',
  };

async function dispatch(ctx, m) {
  const parsed = parseCommand(m.text || '');
  if (!parsed) return false;
  let { cmd } = parsed;
  if (ALIAS[cmd]) cmd = ALIAS[cmd];
  m.__args = parsed.args;
  m.__rest = parsed.rest;

  const h = ctx.handlers;

  // RP direct commands: +hug, +pet, +обнять, +погладить ... and +rp hug
  if (RU_RP.has(cmd)) cmd = RU_ALIASES[cmd];
  if (GIF_ACTIONS[cmd]) { await h.rp(m, cmd); return true; }
  if (cmd === 'rp' || cmd === 'actions') {
    const sub = (parsed.args[0] || '').toLowerCase();
    const key = RU_RP.has(sub) ? RU_ALIASES[sub] : sub;
    if (key && GIF_ACTIONS[key]) { await h.rp(m, key); return true; }
    await h.cmd_rp_list(m); return true;
  }

  const fn = h['cmd_' + cmd];
  if (typeof fn === 'function') {
    try { await fn.call(h, m); } catch (e) {
      await h.reply(m, '💥 Ошибка команды: <code>' + escapeHtml(String(e.message).slice(0, 200)) + '</code>');
    }
    return true;
  }
  // unknown "+" command → gentle hint
  if (parsed.cmd) {
    await h.reply(m, `🤷 Команда <code>+${escapeHtml(parsed.cmd)}</code> не найдена.\nНапишите <code>+help</code> — там 80+ команд.`);
    return true;
  }
  return false;
}

// ---------- passive features: afk notify, filters, autoread, clone, slow, anti-flood ----------
async function passive(ctx, m) {
  const { store, tg, handlers } = ctx;
  const h = handlers;
  const isCmd = !!parseCommand(m.text || '');

  // AFK notifications when someone mentions/replies to an afk user
  if (!isCmd && m.text) {
    const afkMap = await store.getAfk(m.chat.id);
    for (const [uidStr, info] of Object.entries(afkMap)) {
      const uid = Number(uidStr);
      if (uid === m.from?.id) continue;
      const mentioned = m.reply_to_message?.from?.id === uid ||
        (m.entities || []).some((e) => e.type === 'text_mention' && e.user?.id === uid) ||
        new RegExp(`@${(await store.lookupUser(uid))?.username || '\u0000'}\\b`, 'i').test(m.text);
      if (mentioned) {
        const mins = Math.floor((Date.now() - info.since) / 60000);
        await tg.send(m.chat.id,
          `🛌 ${mention(m.from)}! Пользователь сейчас AFK.\nПричина: <i>${escapeHtml(info.reason)}</i>\nОтсутствует: ${mins} мин.`,
          { reply_to: m.message_id }).catch(() => null);
        break;
      }
    }
  }

  // keyword filters (auto-answer)
  if (!isCmd && m.text) {
    const f = await store.getFilters(m.chat.id);
    const low = m.text.toLowerCase();
    for (const [word, answer] of Object.entries(f)) {
      if (low.includes(word)) { await tg.send(m.chat.id, escapeHtml(answer), { reply_to: m.message_id }).catch(() => null); break; }
    }
  }

  // autoread toggle: instantly "seen" via chat action (Bot API has no read receipts; we emulate with typing ack once per N msgs)
  if (!isCmd && await store.getToggle(m.chat.id, 'autoread')) {
    if (Math.random() < 0.34) await tg.sendChatAction(m.chat.id, 'typing');
  }

  // clone: duplicate the partner's message
  if (!isCmd && m.from && !m.from.is_bot && await store.getToggle(m.chat.id, 'clone')) {
    if (m.text) await tg.send(m.chat.id, m.text, { parse_mode: null }).catch(() => null);
  }

  // slow-mode emulation (anti-flood)
  const slowSec = await store.getJSON(`slow:${m.chat.id}`, 0);
  if (slowSec > 0 && m.from && !isOwnerSafe(m.from.id)) {
    const st = CACHE.slowState.get(m.chat.id) || { lastTs: 0, lastUser: 0, streak: 0 };
    const now = Date.now();
    if (st.lastUser === m.from.id && now - st.lastTs < slowSec * 1000) {
      st.streak++;
      if (st.streak >= 2) {
        await tg.deleteMessage(m.chat.id, m.message_id);
        await tg.send(m.chat.id, `🐢 Slow-mode: ${slowSec}с между сообщениями. Ждём...`).then((x) =>
          setTimeout(() => tg.deleteMessage(m.chat.id, x.message_id), 3500)).catch(() => null);
      }
    } else st.streak = 0;
    st.lastTs = now; st.lastUser = m.from.id;
    CACHE.slowState.set(m.chat.id, st);
  }
}

function isOwnerSafe(uid) {
  const o = Number(globalThis.__URS_OWNER || 0);
  return !o || uid === o;
}

// ---------- main update handler ----------
async function handleUpdate(ctx, upd) {
  const tg = ctx.tg;
  const store = ctx.store;

  if (upd.message) {
    const m = upd.message;
    remember(m);
    if (m.from) await store.rememberUser(m.from);
    // track our own outgoing for +edit
    if (m.from?.is_bot) { CACHE.myLast.set(m.chat.id, m.message_id); return; }
    const handled = await dispatch(ctx, m);
    if (!handled) await passive(ctx, m);
  } else if (upd.edited_message) {
    const m = upd.edited_message;
    remember(m);
    store.pushLog({ kind: 'EDIT', info: `${mentionPlain(m.from)} отредактировал: «${(m.text || '').slice(0, 120)}» в ${m.chat.title || 'ЛС'}` });
    const handled = await dispatch(ctx, m); // allow editing a command to re-trigger? no — just log
    void handled;
  } else if (upd.deleted_message) {
    store.pushLog({ kind: 'DELETE', info: `Кто-то удалил сообщение #${upd.deleted_message.message_id}` });
  } else if (upd.pinned_message) {
    store.pushLog({ kind: 'PIN', info: `Закреплено сообщение от ${upd.pinned_message.from?.first_name || '?'}` });
  } else if (upd.new_chat_member) {
    store.pushLog({ kind: 'JOIN', info: `${mentionPlain(upd.new_chat_member.from)} вошёл в чат` });
    if (upd.new_chat_member.from?.is_bot && upd.new_chat_member.from?.username === ctx.me?.username) {
      await tg.send(upd.chat.id, `🕺 <b>userRouterStudio на борту!</b>\nНапиши <code>+help</code> или <code>/start</code>. 👋`);
    }
  } else if (upd.left_chat_member) {
    store.pushLog({ kind: 'LEAVE', info: `${mentionPlain(upd.left_chat_member.from)} покинул чат` });
  } else if (upd.callback_query) {
    await tg.answerCbQuery(upd.callback_query.id);
  } else if (upd.inline_query) {
    const q = upd.inline_query.query || 'hello';
    const results = [{
      type: 'article', id: 'urs_help', title: 'userRouterStudio help',
      description: 'Полный список команд', message_content: { message_text: HELP_TEXT, parse_mode: 'HTML' },
    }];
    if (q) results.unshift({
      type: 'article', id: 'urs_qr', title: `QR для: ${q}`, description: 'Сгенерировать QR',
      message_content: { message_text: `🔗 Ссылка: ${q}\nQR откроется командой +qr в чате с ботом.` },
    });
    await tg.call('answerInlineQuery', { inline_query_id: upd.inline_query.id, results: JSON.stringify(results), cache_time: 5 });
  } else if (upd.channel_post) {
    remember(upd.channel_post);
  } else if (upd.edited_channel_post) {
    store.pushLog({ kind: 'CHAN_EDIT', info: `Edit в канале ${upd.edited_channel_post.chat.title}` });
  } else if (upd.chat_join_request) {
    store.pushLog({ kind: 'JOIN_REQ', info: `Запрос на вхождение: ${upd.chat_join_request.from?.first_name}` });
  }
}

// ---------- scheduled tasks (Cron Triggers) ----------
async function scheduled(env) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const tg = new TG(env.TELEGRAM_BOT_TOKEN);
  const store = new Store(env.DB);
  // alwaysonline heartbeat in all enabled chats
  for (const [cid] of CACHE.dialogs) {
    if (await store.getToggle(cid, 'alwaysonline')) {
      await tg.sendChatAction(cid, 'typing');
    }
  }
}

// ---------- webhook setup helper ----------
async function ensureWebhook(env, url) {
  const tg = new TG(env.TELEGRAM_BOT_TOKEN);
  const hookUrl = `${url.replace(/\/$/, '')}${ROUTE_PREFIX}`;
  const info = await tg.call('getWebhookInfo').catch(() => null);
  const wantSecret = env.WEBHOOK_SECRET || undefined;
  if (info?.url !== hookUrl || (wantSecret && info.secret_token !== wantSecret)) {
    await tg.call('deleteWebhook', { drop_pending_updates: false }).catch(() => null);
    await tg.call('setWebhook', {
      url: hookUrl,
      secret_token: wantSecret,
      allowed_updates: JSON.stringify([
        'message', 'edited_message', 'channel_post', 'edited_channel_post',
        'inline_query', 'callback_query', 'chat_member',
      ]),
      max_connections: 40,
    });
  }
  return hookUrl;
}

export default {
  async fetch(req, env, ctxWaitUntil) {
    const url = new URL(req.url);

    if (!env.TELEGRAM_BOT_TOKEN) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN not set. Run: npx wrangler secret put TELEGRAM_BOT_TOKEN',
        docs: 'https://github.com/userRouterStudio (см. README)',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // GET / — status page & one-click webhook installer info
    if (req.method === 'GET' && url.pathname === '/') {
      const tg = new TG(env.TELEGRAM_BOT_TOKEN);
      const me = await tg.me().catch(() => null);
      const hook = await tg.call('getWebhookInfo').catch(() => ({}));
      return new Response(
        `🕺 <b>userRouterStudio</b> работает на Cloudflare Workers<br><br>` +
        `Бот: <b>@${me?.username || '?'}</b><br>` +
        `Webhook: <code>${hook.url || 'не установлен'}</code>${hook.pending_update_count ? ` (pending: ${hook.pending_update_count})` : ''}<br>` +
        `Установить: <a href="/setup">GET /setup</a><br>` +
        `Статус ядра: ✅ OK · Обработано сообщений (в этом isolate): ${CACHE.count}`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // GET /setup — auto-install webhook (also sets owner via OWNER_ID env if provided)
    if (req.method === 'GET' && url.pathname === '/setup') {
      const hookUrl = await ensureWebhook(env, url.origin);
      if (env.OWNER_ID) globalThis.__URS_OWNER = Number(env.OWNER_ID);
      return new Response(JSON.stringify({ ok: true, webhook: hookUrl }, null, 2),
        { headers: { 'Content-Type': 'application/json' } });
    }

    // POST /webhook — telegram updates
    if (req.method === 'POST' && url.pathname === ROUTE_PREFIX) {
      if (env.WEBHOOK_SECRET && req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
      if (env.OWNER_ID) globalThis.__URS_OWNER = Number(env.OWNER_ID);
      let upd;
      try { upd = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
      const c = await buildCtx(env);
      try { c.me = await c.tg.me(); } catch {}
      // heavy work outside response window
      ctxWaitUntil.waitUntil(handleUpdate(c, upd).catch((e) => console.error('update error:', e)));
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, waitUntil) {
    waitUntil.waitUntil(scheduled(env).catch(() => null));
  },
};
