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
  переверни: 'revtext', залинк: 'linkid', msglink: 'linkid', linkmsg: 'linkid',
  embed: 'embed', preview: 'embed', кнопка: 'btn', inline: 'btn', button: 'btn',
  note_reply: 'replynote', автоответзаметкой: 'replynote',
  snipe: 'snipe', последнеесообщение: 'snipe', lastmsg: 'snipe',
  звонки: 'anticall',
  censor: 'censor', мат: 'censor',
  evaljs: 'evaljs', js: 'evaljs', sandbox: 'evaljs',
  flipimg: 'reverse', вверхтормашками: 'upsidedown', upside: 'upsidedown',
  emoji: 'emojimix', emojimix: 'emojimix',
  stickerinfo: 'stickerid', sid: 'stickerid',
  unsticker: 'delstick', removepack: 'delstick',
  packstats: 'packs', mypacks: 'packs', паки: 'packs',
  stickertopng: 'stopng', стикервpng: 'stopng',
  pngtosticker: 'sfromimg', imgtosticker: 'sfromimg',
  convert: 'conv', unit: 'conv', конверт: 'conv', units: 'conv',
  color: 'color', hex: 'color', цвет: 'color',
  hash: 'hash', md5: 'hash', sha256: 'hash', sha1: 'hash',
  base64: 'b64', b64: 'b64', base: 'b64',
  uuid: 'uuid', guid: 'uuid',
  password: 'pass', пароль: 'pass', genpass: 'pass', passwd: 'pass',
  coin: 'flip', монета: 'flip', орелрешка: 'flip', flip: 'flip', подбрось: 'flip',
  rps: 'rps', кнб: 'rps', каменьножницы: 'rps',
  choose: 'choose', выбери: 'choose', судьба: 'choose',
  rand: 'randnum', random: 'randnum', рандом: 'randnum',
  timeit: 'timer', таймер: 'timer', timer: 'timer',
  remind: 'remind', напоминание: 'remind', reminder: 'remind',
  poll: 'poll', опрос: 'poll', vote: 'poll',
  quoteoff: 'quotestop', цитатыофф: 'quotestop',
  quotemode: 'quotestart', цитаты: 'quotestart',
  react: 'react', реакция: 'react',
  unreact: 'unreact',
  reactions: 'topreactions', топреакций: 'topreactions',
  stats: 'userstats', статистика: 'userstats', userstats: 'userstats',
  blacklist: 'gban', globalban: 'gban', гбан: 'gban',
  ungban: 'ungban', unblacklist: 'ungban', разгбан: 'ungban',
  gbans: 'gbans', gbanlist: 'gbans',
  unsilence: 'unsupergroup', silence: 'supergroup',
  ghostmute: 'ghost', призрак: 'ghost',
  savemedia: 'dlmedia', скачаймедиа: 'dlmedia', dlmedia: 'dlmedia', getfile: 'dlmedia',
  telegraph: 'telegraph', статья: 'telegraph',
  ocr: 'ocr', тексткартинки: 'ocr',
  img: 'image', картинка: 'image', photo: 'image',
  meme: 'meme', мем: 'meme',
  cat: 'cat', кот: 'cat', cats: 'cat', котики: 'cat',
  dog: 'dog', пёс: 'dog', пес: 'dog', собака: 'dog',
  fact: 'fact', факт: 'fact', facts: 'fact',
  ip: 'ipinfo', мойайпи: 'ipinfo', myip: 'ipinfo',
  dns: 'dns',
  ssl: 'sslcheck', cert: 'sslcheck',
  http: 'httpstatus', statuscode: 'httpstatus', pingurl: 'httpstatus',
  ua: 'uaspoof',
  json: 'jsonfmt', jsonfmt: 'jsonfmt',
  regex: 'regex', regexp: 'regex',
  bin: 'binconv', dec: 'binconv', hexconv: 'binconv',
  qrwifi: 'qrwifi', wifiqr: 'qrwifi',
  news: 'news', новости: 'news',
  horoscope: 'horoscope', гороскоп: 'horoscope', zodiac: 'horoscope',
  math_quiz: 'mathgame', математика: 'mathgame', mathgame: 'mathgame',
  guess: 'numberguess', угадайчисло: 'numberguess', numberguess: 'numberguess',
  trivia: 'trivia', квиз: 'trivia', викторина: 'trivia',
  xkcd: 'xkcd', комикс: 'xkcd',
  yt: 'youtube', ютуб: 'youtube', youtube: 'youtube', видео: 'youtube',
  gif_search: 'gifsearch', гиф: 'gifsearch', gifsearch: 'gifsearch',
  wordgame: 'wordgame', анаграмма: 'wordgame',
  editcaption: 'editcap', caption: 'editcap',
  delchatphoto: 'unsetpp',
  chatpp: 'setpp', аватарчата: 'setpp', setavatar: 'setpp',
  setusername: 'setuser', username: 'setuser',
  invite: 'invite', ссылкагруппы: 'invite', invitelink: 'invite', ref: 'invite',
  rules: 'rules', правила: 'rules',
  motd: 'motd',
  bio: 'bio', описаниепрофиля: 'bio',
  birthday: 'birthday', др: 'birthday', ддр: 'birthday',
  karma: 'karma', карма: 'karma', репутация: 'karma',
  autopin: 'autopin', автораспилить: 'autopin',
  supergroup: 'supergroup', unsupergroup: 'unsupergroup',
  geo: 'geo', гео: 'geo', локация: 'geo',
  dist: 'distance', расстояние: 'distance', distance: 'distance',
  wc: 'wc', words: 'wc', статтекста: 'wc',
  reverseimg: 'reverse', перевернутькартинку: 'reverse',
  hide: 'hide', скрыть: 'hide',
  greet: 'greet', приветствие: 'greet', встречай: 'greet',
  bye: 'bye', прощание: 'bye',
  warnlog: 'warnlog',
  speedmsg: 'speedmsg', latency: 'speedmsg',
  debug: 'debug',
  pingall: 'pingall',
  promote: 'promote', повысь: 'promote', admin: 'promote',
  demote: 'demote', понизь: 'demote', unmuteadmin: 'demote',
  lock: 'lock', закрой: 'lock',
  unlock: 'unlock', открой: 'unlock',
  settings: 'settings', настройки: 'settings', config: 'settings',
  exportcfg: 'export', дамп: 'export',
  donate: 'donate', донат: 'donate', поддержать: 'donate',
  version: 'version', версия: 'version', changelog: 'version',
  antiflood: 'antiflood', антифлуд: 'antiflood',
  nsfwguard: 'nsfwguard', nsfw: 'nsfwguard',
  setmycommands: 'commands', menuupdate: 'commands',
  trickortreat: 'trivia',
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
    await h.reply(m, `🤷 Команда <code>+${escapeHtml(parsed.cmd)}</code> не найдена.\nНапишите <code>+help</code> — там 210+ команд.`);
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

  // ---------- passive: snipe, quotemode, censor, autopin, ghostmute, supergroup, nsfw, antiflood, games ----------
  if (!isCmd && m.from && !m.from.is_bot) {
    // remember last message for +snipe
    if (m.text) await store.setLastMsg(m.chat.id, { text: m.text.slice(0, 800), name: mentionPlain(m.from), date: m.date });

    // ghost-mute & supergroup & nsfw-guard: silent delete
    const ghosts = await store.getGhostList(m.chat.id);
    const superOn = await store.getToggle(m.chat.id, 'supergroup');
    const nsfwOn = await store.getToggle(m.chat.id, 'nsfw');
    const isAdminish = isOwnerSafe(m.from.id);
    if (!isAdminish && (ghosts[String(m.from.id)] || superOn)) {
      await tg.deleteMessage(m.chat.id, m.message_id);
      return;
    }
    if (!isAdminish && nsfwOn && (m.photo || m.video || m.animation || m.document || m.voice || m.audio)) {
      await tg.deleteMessage(m.chat.id, m.message_id);
      await tg.send(m.chat.id, `🔞 ${mention(m.from)}, медиа в этом чате запрещены.`, { reply_to: null }).then((x) =>
        setTimeout(() => tg.deleteMessage(m.chat.id, x.message_id).catch(() => null), 4000)).catch(() => null);
      return;
    }

    // censor toggle: rewrite message with masked profanity
    if (m.text && await store.getToggle(m.chat.id, 'censor')) {
      const c = U2.censorText(m.text);
      if (c.hits > 0) {
        await tg.deleteMessage(m.chat.id, m.message_id);
        await tg.send(m.chat.id, `${mention(m.from)} → <code>${escapeHtml(c.text)}</code>`).then((x) =>
          setTimeout(() => tg.deleteMessage(m.chat.id, x.message_id).catch(() => null), 6000)).catch(() => null);
      }
    }

    // auto-pin by regex rules
    if (m.text) {
      const rules = await store.getAutopin(m.chat.id);
      for (const re of rules) {
        try {
          if (new RegExp(re, 'i').test(m.text)) { await tg.pin(m.chat.id, m.message_id, true); break; }
        } catch {}
      }
    }

    // quote mode: mirror next messages as quotes
    if (m.text && await store.getToggle(m.chat.id, 'quotemode')) {
      await tg.call('sendMessage', {
        chat_id: m.chat.id,
        text: m.text.slice(0, 4096),
        reply_parameters: { message_id: m.message_id },
      }).catch(() => null);
    }

    // anti-flood (separate from slow-mode): 5+ msgs in 3s -> mute 60s
    if (await store.getToggle(m.chat.id, 'antiflood') && !isAdminish) {
      const st = CACHE.slowState.get('fl:' + m.chat.id + ':' + m.from.id) || [];
      const now = Date.now();
      const recent = [...st, now].filter((t) => now - t < 3000);
      CACHE.slowState.set('fl:' + m.chat.id + ':' + m.from.id, recent);
      if (recent.length >= 5) {
        const until = Math.floor(now / 1000) + 60;
        await tg.restrict(m.chat.id, m.from.id, {
          can_send_messages: false, can_send_audios: false, can_send_documents: false, can_send_photos: false,
          can_send_videos: false, can_send_video_notes: false, can_send_voice_notes: false, can_send_polls: false,
          can_send_other_messages: false, can_add_web_page_previews: false,
        }, until).catch(() => null);
        await tg.send(m.chat.id, `🛡 Антифлуд: ${mention(m.from)} замучен на 60 сек.`).catch(() => null);
      }
    }

    // mini-games: numberguess / mathgame / trivia — plain-number/letter answers
    const game = await store.getGame(m.chat.id);
    if (game && m.text) {
      const t = m.text.trim().toLowerCase();
      if (game.type === 'guess') {
        const n = Number(t); game.tries++;
        if (Number.isFinite(n) && n === game.secret) {
          await store.addKarma(m.from.id, 5);
          await store.delGame(m.chat.id);
          await tg.send(m.chat.id, `🎉 ${mention(m.from)} угадал число <b>${game.secret}</b> за ${game.tries} попыток! +5 кармы.`, { reply_to: m.message_id });
        } else if (game.tries >= 10) {
          await store.delGame(m.chat.id);
          await tg.send(m.chat.id, `😿 Игра окончена. Число было <b>${game.secret}</b>. Новая: <code>+guess</code>`, { reply_to: m.message_id });
        } else if (Number.isFinite(n)) {
          await tg.send(m.chat.id, `${n > game.secret ? '⬇️ Меньше' : '⬆️ Больше'}! Попытка ${game.tries}/10`, { reply_to: m.message_id });
        }
        return;
      }
      if (game.type === 'math') {
        const n = Number(t.replace(',', '.')); game.tries++;
        if (n === game.ans) {
          await store.addKarma(m.from.id, 3);
          await store.delGame(m.chat.id);
          await tg.send(m.chat.id, `✅ Верно! ${mention(m.from)} решает задачи за ${game.tries} попыток (+3 кармы).`, { reply_to: m.message_id });
        } else if (game.tries >= 5) {
          await store.delGame(m.chat.id);
          await tg.send(m.chat.id, `❌ Ответ был <b>${game.ans}</b>. Ещё раз: <code>+mathgame</code>`, { reply_to: m.message_id });
        } else {
          await tg.send(m.chat.id, `🤔 Не то, попробуй ещё (попытка ${game.tries}/5)`, { reply_to: m.message_id });
        }
        return;
      }
      if (game.type === 'trivia') {
        const pick = t[0];
        if ('abcd'.includes(pick)) {
          const ok = pick === game.ans.toLowerCase();
          if (ok) await store.addKarma(m.from.id, 4);
          await store.delGame(m.chat.id);
          await tg.send(m.chat.id, ok ? `🏆 ${mention(m.from)} верно! (+4 кармы)` : `😵 Неправильно. Верный ответ — <b>${game.ans.toUpperCase()}</b>.`, { reply_to: m.message_id });
          return;
        }
      }
    }
  }
}

// ---------- chat-member join/leave side effects ----------
async function memberEvents(ctx, upd) {
  const { store, tg } = ctx;

  // join events: greet / motd / gban enforcement / birthday check
  if (upd.new_chat_member) {
    const j = upd.new_chat_member.new_chat_member;
    store.pushLog({ kind: 'JOIN', info: `${j ? mentionPlain(j) : '?'} вошёл в чат` });
    if (j?.is_bot && j?.username === ctx.me?.username) {
      await tg.send(upd.chat.id, `🕺 <b>userRouterStudio на борту!</b>\nНапиши <code>+help</code> или <code>/start</code>. 👋`);
    } else if (j && !j.is_bot) {
      const gbans = await store.gbanList();
      if (gbans[String(j.id)]) {
        await tg.ban(upd.chat.id, j.id).catch(() => null);
        await tg.send(upd.chat.id, `🌍 ${mention(j)} в глобальном бане (${escapeHtml(gbans[String(j.id)].reason || '')}) → забанен здесь автоматически.`).catch(() => null);
      } else {
        const greet = await store.getChatField(upd.chat.id, 'greet');
        const motd = await store.getChatField(upd.chat.id, 'motd');
        const line = (greet || motd || '').replace(/\{user\}/g, mention(j)).replace(/\{chat\}/g, upd.chat.title || 'чат');
        if (line) await tg.send(upd.chat.id, line).catch(() => null);
        else if (greet || motd) await tg.send(upd.chat.id, `👋 Добро пожаловать, ${mention(j)}!`).catch(() => null);
      }
    }
  }
  if (upd.left_chat_member) {
    const l = upd.left_chat_member.left_chat_member;
    store.pushLog({ kind: 'LEAVE', info: `${l ? mentionPlain(l) : '?'} покинул чат` });
    const bye = await store.getChatField(upd.chat.id, 'bye');
    if (bye && l) await tg.send(upd.chat.id, bye.replace(/\{user\}/g, escapeHtml(mentionPlain(l))).replace(/\{chat\}/g, upd.chat.title || 'чат')).catch(() => null);
  }
}

// ---------- slow-mode enforcement (per chat) ----------
async function slowMode(ctx, m) {
  const { store, tg } = ctx;
  const slowSec = Number((await store.getChatField(m.chat.id, 'slow')) || 0);
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
    await slowMode(ctx, m).catch(() => null);
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
  } else if (upd.new_chat_member || upd.left_chat_member) {
    await memberEvents(ctx, upd).catch(() => null);
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
  const hookUrl = `${url.replace(/\/$/, '')}${ROUTE_PREFIX}`;
  // секреты приходят в воркер только после РЕДЕПЛОЯ (wrangler secret put).
  // Если их нет — берём из query (?token=...&secret=...), чтобы /setup
  // можно было выполнить одним кликом в браузере.
  let token = env.TELEGRAM_BOT_TOKEN;
  let wantSecret = env.WEBHOOK_SECRET || undefined;
  try {
    const q = new URL(url).searchParams;
    if (!token && q.get('token')) token = q.get('token');
    if (!wantSecret && q.get('secret')) wantSecret = q.get('secret');
  } catch {}
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан: используйте /setup?token=<токен_бота>&secret=Roum14');
  const tg2 = new TG(token);
  const info = await tg2.call('getWebhookInfo').catch(() => null);
  if (info?.url !== hookUrl || (wantSecret && info.secret_token !== wantSecret)) {
    await tg2.call('deleteWebhook', { drop_pending_updates: false }).catch(() => null);
    await tg2.call('setWebhook', {
      url: hookUrl,
      secret_token: wantSecret,
      allowed_updates: JSON.stringify([
        'message', 'edited_message', 'channel_post', 'edited_channel_post',
        'inline_query', 'callback_query',
        'my_chat_member', 'chat_member',
      ]),
      max_connections: 40,
    });
  }
  return hookUrl;
}

async function helloStub() {
  return new Response(
    '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">' +
    '<title>userRouterStudio — placeholder</title>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="font-family:system-ui;background:#0b0f1a;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0">' +
    '<div style="max-width:640px;padding:24px;text-align:center">' +
    '<h1>🕺 userRouterStudio</h1>' +
    '<p>Это <b>placeholder-воркер</b>: он нужен, чтобы Cloudflare Workers Builds было во что деплоиться ' +
    '(Builds умеет обновлять только уже существующий воркер).</p>' +
    '<p>Настоящий бот задеплоится сюда автоматически после успешного первого билда из репозитория.</p>' +
    '<p>Если вы видите эту страницу после билда — значит build command не выполнился. ' +
    'Проверьте логи: Workers &amp; Pages → userrouterstudio → Deployments.</p>' +
    '</div></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export default {
  async fetch(req, env, ctxWaitUntil) {
    const url = new URL(req.url);

    // GET /setup?token=<TELEGRAM_BOT_TOKEN>&secret=Roum14 — одноразовая инициализация:
    // ставит Telegram-webhook (с секретом) даже на placeholder-воркере.
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/setup') {
      const token = url.searchParams.get('token') || env.TELEGRAM_BOT_TOKEN || '';
      if (!token || !/^\d+:[\w-]+$/.test(token)) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'нужен ?token=<токен_бота_от_BotFather>&secret=<WEBHOOK_SECRET>',
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      const tg = new TG(token);
      const me = await tg.me().catch(() => null);
      if (!me) {
        return new Response(JSON.stringify({ ok: false, error: 'Telegram отклонил токен (getMe failed)' }),
          { headers: { 'Content-Type': 'application/json' } });
      }
      const hookUrl = `${url.origin}${ROUTE_PREFIX}`;
      const secret = url.searchParams.get('secret') || env.WEBHOOK_SECRET || '';
      const hook = await tg.call('setWebhook', {
        url: hookUrl,
        ...(secret ? { secret_token: secret } : {}),
        allowed_updates: JSON.stringify([
          'message', 'edited_message', 'channel_post', 'edited_channel_post',
          'inline_query', 'callback_query', 'my_chat_member', 'chat_member',
        ]),
        drop_pending_updates: true,
      }).catch((e) => ({ ok: false, error: String(e) }));
      return new Response(JSON.stringify({
        ok: !!hook.ok, bot: `@${me.username}`, webhook: hookUrl, secret_set: !!secret,
        next: 'напишите боту +ping. Для полноценной работы перезадеплойте воркер из репо (cf-build.sh) — он добавит KV и OWNER_ID',
      }, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    if (!env.TELEGRAM_BOT_TOKEN) {
      // Воркер ещё не инициализирован секретами (первый заход / placeholder).
      // Отдаём заглушку вместо ошибки — Cloudflare Builds так есть во что деплоиться.
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '')) return helloStub();
      return new Response(JSON.stringify({
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN not set. Откройте /setup?token=<токен_бота> или используйте scripts/cf-build.sh',
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
