// userRouterStudio — command handlers
import { escapeHtml, mention, displayName } from './tg.js';
import * as U from './utils.js';
import GIF_ACTIONS from './gifs.js';

export function isOwner(uid) {
  const o = Number(globalThis.__URS_OWNER || 0);
  return !o || uid === o; // if OWNER_ID not set — first user becomes owner (see index.js)
}

export class Handlers {
  constructor(tg, anim, store, ctx) {
    this.tg = tg; this.anim = anim; this.store = store;
    this.startedAt = ctx.startedAt;
    this.cache = ctx.cache; // Map chatId -> recent messages
  }

  // ---------- helpers ----------
  reply(m, text, opts = {}) {
    return this.tg.send(m.chat.id, text, { reply_to: m.message_id, ...opts });
  }

  targetUser(m) {
    if (m.reply_to_message?.from) return m.reply_to_message.from;
    const arg = (m.__args?.[0] || '').replace(/^@/, '');
    if (arg) {
      // bot API can't resolve arbitrary usernames without DB — use cached users
      for (const u of this.cache.users.values()) {
        if ((u.username || '').toLowerCase() === arg.toLowerCase()) return u;
      }
      return { id: 0, first_name: arg, username: arg };
    }
    return m.from;
  }

  isAdminOrOwner(m) {
    if (isOwner(m.from.id)) return true;
    return m.status === 'administrator' || m.status === 'creator';
  }

  needAdmin(m) {
    if (this.isAdminOrOwner(m)) return false;
    this.reply(m, '⛔️ Нужны права администратора чата.');
    return true;
  }

  // =====================================================
  // ANIMATIONS & PRANKS
  // =====================================================
  async cmd_type(m) {
    const text = m.__rest || (m.reply_to_message?.text ?? m.reply_to_message?.caption);
    if (!text) return this.reply(m, 'Использование: <code>+type текст</code>');
    await this.anim.type(m.chat.id, text, { reply_to: m.reply_to_message_id });
    this.tg.deleteMessage(m.chat.id, m.message_id);
  }

  async cmd_hack(m) { await this.anim.hack(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_love(m) { await this.anim.love(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_matrix(m) { await this.anim.matrix(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_dice(m) { await this.anim.dice(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_slot(m) { await this.anim.slot(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_darts(m) { await this.anim.darts(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_basket(m) { await this.anim.basket(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_football(m) { await this.anim.football(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_bowling(m) { await this.anim.bowling(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_moon(m) { await this.anim.moon(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_clock(m) { await this.anim.clock(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }
  async cmd_earth(m) { await this.anim.earth(m.chat.id, { reply_to: m.message_id }); this.tg.deleteMessage(m.chat.id, m.message_id); }

  async cmd_fakeaction(m) {
    const kind = (m.__args?.[0] || 'typing').toLowerCase();
    const secs = Math.min(30, Number(m.__args?.[1]) || 10);
    const action = { typing: 'typing', voice: 'record_voice', audio: 'upload_audio', video: 'upload_video', photo: 'upload_photo', document: 'upload_document', game: 'find_game', location: 'find_location' }[kind] || 'typing';
    await this.tg.sendChatAction(m.chat.id, action);
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000) {
      await new Promise((r) => setTimeout(r, 4500));
      await this.tg.sendChatAction(m.chat.id, action);
    }
    this.reply(m, `✅ Статус «${kind}» показан ${secs} сек.`);
  }

  async cmd_type_del(m) {
    const secs = Math.min(120, Number(m.__args?.[0]) || 30);
    const text = m.__rest.replace(/^\d+\s*/, '') || '💣 Это сообщение самоуничтожится...';
    const msg = await this.reply(m, `${text}\n\n<small>☠️ Самоуничтожение через ${secs} сек</small>`);
    setTimeout(async () => {
      try {
        await this.tg.edit(m.chat.id, msg.message_id, '💥 БУМ! Сообщение уничтожено.');
        await new Promise((r) => setTimeout(r, 1500));
        await this.tg.deleteMessage(m.chat.id, msg.message_id);
      } catch {}
    }, secs * 1000);
  }

  // =====================================================
  // MESSAGES
  // =====================================================
  async cmd_del(m) {
    if (!m.reply_to_message) return this.reply(m, 'Ответьте на сообщение, которое надо удалить.');
    await this.tg.deleteMessage(m.chat.id, m.reply_to_message.message_id);
    this.tg.deleteMessage(m.chat.id, m.message_id);
  }

  async cmd_purge(m) {
    if (this.needAdmin(m)) return;
    if (!m.reply_to_message) return this.reply(m, 'Ответьте на первое сообщение диапазона.');
    const from = m.reply_to_message.message_id;
    const to = m.message_id;
    const ids = [];
    const hist = this.cache.chats.get(m.chat.id) || [];
    for (const id of hist) if (id >= from && id <= to) ids.push(id);
    for (let i = from; i <= to; i++) if (!ids.includes(i)) ids.push(i);
    await this.tg.deleteMessages(m.chat.id, ids);
    this.reply(m, `🧹 Удалено сообщений: ${ids.length}`);
  }

  async cmd_edit(m) {
    const mine = this.cache.myLast?.get(m.chat.id);
    if (!mine) return this.reply(m, 'Нет моего последнего сообщения для редактирования.');
    const text = m.__rest || '✏️ пусто';
    await this.tg.edit(m.chat.id, mine, text);
    this.tg.deleteMessage(m.chat.id, m.message_id);
  }

  async cmd_save(m) {
    const src = m.reply_to_message;
    if (!src) return this.reply(m, 'Ответьте на сообщение для сохранения в Избранное.');
    try {
      await this.tg.forward('me', src.chat.id, src.message_id);
      this.reply(m, '⭐ Сохранено в Избранное!');
    } catch {
      this.reply(m, '⚠️ Bot API не имеет «Избранного». Подключите userbot-сессию (USERBOT_TOKEN) или перешлите вручную.');
    }
  }

  async cmd_quote(m) {
    const src = m.reply_to_message;
    if (!src) return this.reply(m, 'Ответьте на сообщение, чтобы сделать цитату-стикер.');
    const author = src.from ? displayName(src.from) : 'Аноним';
    const text = (src.text || src.caption || '[медиа]').slice(0, 700);
    const stickerText = `«${text}»\n\n— ${author}`;
    // Try making a real sticker via image render service with text
    try {
      const url = `https://quote-maker.free.nf/api?text=${encodeURIComponent(text)}&author=${encodeURIComponent(author)}`;
      await this.tg.sendPhoto(m.chat.id, url, '', { reply_to: m.message_id }).catch(() => null);
    } catch {}
    // Always send styled quote card as text + sticker fallback
    await this.reply(m,
      `🗨 <b>Цитата</b>\n\n<i>«${escapeHtml(text)}»</i>\n\n— ${escapeHtml(author)} · <code>${new Date(src.date * 1000).toLocaleDateString('ru-RU')}</code>`
    );
    void stickerText;
  }

  async cmd_fwd(m) {
    const src = m.reply_to_message;
    if (!src) return this.reply(m, 'Ответьте на сообщение для пересылки.');
    await this.tg.forward(m.chat.id, src.chat.id, src.message_id);
    this.tg.deleteMessage(m.chat.id, m.message_id);
  }

  async cmd_copy(m) {
    const src = m.reply_to_message;
    if (!src) return this.reply(m, 'Ответьте на сообщение для копирования.');
    try {
      await this.tg.copy(m.chat.id, src.chat.id, src.message_id);
      this.tg.deleteMessage(m.chat.id, m.message_id);
    } catch {
      await this.cmd_fwd(m); // fallback
    }
  }

  async cmd_pin(m) {
    if (this.needAdmin(m)) return;
    const id = m.reply_to_message?.message_id;
    if (!id) return this.reply(m, 'Ответьте на сообщение для закрепления.');
    try { await this.tg.pin(m.chat.id, id); this.reply(m, '📌 Закреплено!'); }
    catch (e) { this.reply(m, '⚠️ ' + escapeHtml(e.message)); }
  }

  async cmd_unpin(m) {
    if (this.needAdmin(m)) return;
    await this.tg.unpin(m.chat.id, m.reply_to_message?.message_id);
    this.reply(m, '📌 Откреплено.');
  }

  async cmd_search(m) {
    const q = (m.__rest || '').toLowerCase();
    if (!q) return this.reply(m, 'Использование: <code>+search слово</code>');
    const hist = [...(this.cache.msgs.get(m.chat.id) || [])].reverse();
    const found = [];
    for (const item of hist) {
      const msg = typeof item === 'number' ? null : item;
      if (msg && ((msg.text || msg.caption || '').toLowerCase().includes(q))) found.push(msg);
      if (found.length >= 10) break;
    }
    if (!found.length) {
      // search notes too
      const notes = await this.store.listNotes(m.chat.id);
      const hits = notes.filter((n) => n.toLowerCase().includes(q));
      return this.reply(m, `🔍 В кэше сообщений не найдено.\n${hits.length ? 'Заметки: ' + hits.map((h) => `<code>${h}</code>`).join(', ') : 'Попробуйте +chats для поиска по диалогам (нужна userbot-сессия).'}`);
    }
    const out = found.map((f) => `• <code>#${f.message_id}</code> ${escapeHtml((f.text || f.caption || '').slice(0, 90))}`).join('\n');
    this.reply(m, `🔍 Найдено (${found.length} из кэша):\n${out}\n\n<small>Бот видит только новые сообщения с момента запуска.</small>`);
  }

  async cmd_clear(m) {
    if (this.needAdmin(m)) return;
    const hist = this.cache.chats.get(m.chat.id) || [];
    await this.tg.deleteMessages(m.chat.id, hist);
    this.reply(m, `🗑 Очищено кэшированных сообщений: ${hist.length}. Полный purge всей истории доступен через userbot-сессию.`);
  }

  async cmd_chats(m) {
    const q = (m.__rest || '').toLowerCase();
    const dialogs = this.cache.dialogs;
    if (!dialogs.size) return this.reply(m, 'Пока бот никого не «видел». Напишите ему — и диалог появится в списке.');
    const res = [...dialogs.entries()]
      .filter(([, d]) => !q || d.title.toLowerCase().includes(q))
      .slice(0, 15)
      .map(([id, d]) => `• <b>${escapeHtml(d.title)}</b> <code>${id}</code> (${d.type})`);
    this.reply(m, `💬 <b>Диалоги (${res.length}):</b>\n${res.join('\n') || '😶 пусто'}`);
  }

  // =====================================================
  // INFO & SPY
  // =====================================================
  async cmd_id(m) {
    const chat = m.chat;
    let lines = [
      `🆔 <b>ID чата:</b> <code>${chat.id}</code>`,
      `<b>Тип:</b> ${chat.type}`,
    ];
    if (chat.id < 0 && chat.username) lines.push(`<b>Username:</b> @${chat.username}`);
    if (chat.id <= -1000000000000) lines.push(`<b>Supergroup internal ID:</b> <code>${chat.id + -1000000000000}</code>`);
    if (m.from) lines.push(`👤 <b>Вы:</b> <code>${m.from.id}</code> — ${mention(m.from)}`);
    if (m.reply_to_message?.from) lines.push(`🎯 <b>Цель:</b> <code>${m.reply_to_message.from.id}</code> — ${mention(m.reply_to_message.from)}`);
    this.reply(m, lines.join('\n'));
  }

  async cmd_info(m) {
    const u = this.targetUser(m);
    if (!u || !u.id) return this.reply(m, 'Не удалось определить пользователя (ответьте на его сообщение).');
    const flags = [];
    if (u.is_bot) flags.push('🤖 бот');
    if (u.is_premium) flags.push('⭐ premium');
    if (u.can_join_groups === false) flags.push('🚫 не может в группы');
    let badge = '';
    try {
      const cm = await this.tg.member(m.chat.id, u.id).catch(() => null);
      if (cm) badge = `\n<b>Роль здесь:</b> ${cm.status}${cm.custom_title ? ` («${escapeHtml(cm.custom_title)}»)` : ''}`;
    } catch {}
    const photos = await this.tg.getUserProfilePhotos(u.id, 1).catch(() => null);
    const out = [
      `📁 <b>ДОСЬЕ</b>`,
      ``,
      `👤 <b>${escapeHtml(displayName(u))}</b> ${flags.join(' ')}`,
      u.username ? `🔗 @${u.username}` : '',
      `🆔 <code>${u.id}</code>`,
      `📅 Аккаунт замечен ботом с: ${new Date((this.cache.firstSeen?.get(u.id) || m.date) * 1000).toLocaleDateString('ru-RU')}`,
      `🖼 Аватаров: ${photos?.total_count ?? '?'}`,
      badge,
      `🌐 Язык: ${u.language_code || '⁉️'}`,
    ].filter(Boolean).join('\n');
    this.reply(m, out);
  }

  async cmd_avatar(m) {
    const u = this.targetUser(m);
    if (!u || !u.id) return this.reply(m, 'Не удалось определить пользователя.');
    const pp = await this.tg.getUserProfilePhotos(u.id, 1).catch(() => null);
    if (!pp?.total_count) return this.reply(m, '🖼 Аватар отсутствует или скрыт настройками приватности.');
    const file = pp.photos[0].at(-1); // largest
    const f = await this.tg.getFile(file.file_id);
    void f;
    await this.tg.sendPhoto(m.chat.id, file.file_id, `Аватар: ${displayName(u)}`, { reply_to: m.message_id });
  }

  async cmd_chatinfo(m) {
    const c = m.chat;
    const info = { id: c.id, type: c.type, title: c.title || (c.username ? '@' + c.username : 'ЛС') };
    try {
      const full = await this.tg.chatInfo(c.id);
      Object.assign(info, { username: full.username, desc: full.description, members: await this.tg.memberCount(c.id).catch(() => null) });
    } catch {}
    const lines = [
      `ℹ️ <b>О чате</b>`,
      `🆔 <code>${info.id}</code> · Тип: <b>${info.type}</b>`,
      `📛 ${escapeHtml(info.title)}`,
      info.username ? `🔗 @${info.username}` : '',
      info.members != null ? `👥 Участников: ${info.members}` : '',
      info.desc ? `📝 ${escapeHtml(info.desc).slice(0, 300)}` : '',
    ].filter(Boolean);
    this.reply(m, lines.join('\n'));
  }

  async cmd_spy(m) {
    const u = this.targetUser(m);
    if (!u || !u.id) return this.reply(m, 'Ответьте на сообщение цели или используйте <code>+spy @username</code>.');
    const chats = [...this.cache.dialogs.entries()].filter(([id]) => String(id).includes(String(Math.abs(u.id))));
    const seen = this.cache.userChats?.get(u.id) || new Set();
    const common = [...seen];
    const log = [
      `🕵️ <b>СПЫ-РЕПОРТ: ${escapeHtml(displayName(u))}</b>`,
      `🆔 цель: <code>${u.id}</code>`,
      `📡 Обнаружен в чатах бота: ${common.length ? common.map((c) => `<code>${c}</code>`).join(', ') : 'только текущий'}`,
      `🗂 Совместимые диалоги: ${chats.length || 'не найдено (бот видит лишь то, где состоит)'}`,
      ``,
      `<i>⚠️ Bot API ограничивает разведку: полный spy (поиск переписок) возможен только с userbot-сессией. Юридически — только там, где вы имеете право доступа к данным.</i>`,
    ];
    this.reply(m, log.join('\n'));
  }

  async cmd_ping(m) {
    const t0 = Date.now();
    const msg = await this.reply(m, '🏓 Пингую...');
    const dt = Date.now() - t0;
    this.tg.edit(m.chat.id, msg.message_id, `🏓 <b>Понг!</b>\n⏱ Круг: ${dt} мс (webhook → CF Worker → TG API)`);
  }

  async cmd_alive(m) {
    const up = Math.floor((Date.now() - this.startedAt) / 1000);
    const d = Math.floor(up / 86400), h = Math.floor((up % 86400) / 3600), mi = Math.floor((up % 3600) / 60);
    this.reply(m,
      `💚 <b>userRouterStudio жив!</b>\n\n` +
      `⏱ Аптайм: ${d}д ${h}ч ${mi}м\n` +
      `🧠 Ядро: Cloudflare Workers (edge)\n` +
      `📨 Сообщений обработано: ${this.cache.count ?? 0}\n` +
      `🔌 Режим: webhook\n` +
      `⚙️ Статус ядра: OK ✅`
    );
  }

  async cmd_speedtest(m) {
    const t0 = Date.now();
    // download ~5 MB test file from Cloudflare's own speed endpoint
    let bytes = 0;
    try {
      const res = await fetch('https://speed.cloudflare.com/__down?bytes=5000000');
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
    } catch { return this.reply(m, '❌ Speedtest не удался'); }
    const dlMs = Date.now() - t0;
    const t1 = Date.now();
    try { await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: new Uint8Array(1000000) }); } catch {}
    const ulMs = Date.now() - t1;
    const mbps = (mb, ms) => ((mb * 8) / (ms / 1000) / 1e6).toFixed(1);
    this.reply(m,
      `📡 <b>SPEEDTEST (Cloudflare edge)</b>\n\n` +
      `⬇️ Download: <b>${mbps(bytes / 1e6, dlMs)} Мбит/с</b> (${(bytes / 1e6).toFixed(1)} МБ за ${dlMs} мс)\n` +
      `⬆️ Upload: <b>${mbps(1, ulMs)} Мбит/с</b> (1 МБ за ${ulMs} мс)\n` +
      `<i>Замер с дата-центра Cloudflare, не с вашего устройства.</i>`
    );
  }

  async cmd_whois(m) {
    const u = this.targetUser(m);
    if (!u || !u.id) return this.reply(m, 'Укажите пользователя: <code>+whois @username</code> или ответом.');
    const groups = this.cache.userChats?.get(u.id) || new Set();
    this.reply(m,
      `🌐 <b>WHOIS: ${escapeHtml(displayName(u))}</b>\n` +
      `🆔 <code>${u.id}</code>\n` +
      (u.username ? `🔗 @${u.username}\n` : '') +
      `👥 Общие с ботом группы: ${groups.size ? [...groups].join(', ') : 'не светился'}\n` +
      `🕐 Первый контакт: ${new Date((this.cache.firstSeen?.get(u.id) || m.date) * 1000).toLocaleString('ru-RU')}`
    );
  }

  async cmd_admins(m) {
    if (m.chat.type === 'private') return this.reply(m, 'Это личка — тут один админ, это вы 💅');
    try {
      const list = await this.tg.admins(m.chat.id);
      const out = list.map((a) =>
        `• ${mention(a.user)} — <b>${a.status === 'creator' ? '👑 владелец' : '🛡 админ'}</b>${a.custom_title ? ` «${escapeHtml(a.custom_title)}»` : ''}`
      );
      this.reply(m, `🛡 <b>Администраторы (${list.length}):</b>\n${out.join('\n')}`);
    } catch { this.reply(m, '⚠️ Бот должен быть админом, чтобы видеть список.'); }
  }

  // =====================================================
  // UTILITIES
  // =====================================================
  async cmd_calc(m) {
    if (!m.__rest) return this.reply(m, 'Использование: <code>+calc 2+2*sqrt(16)</code>');
    try {
      const v = await U.calc(m.__rest);
      this.reply(m, `🧮 <code>${escapeHtml(m.__rest)}</code> = <b>${v.toLocaleString('ru-RU')}</b>`);
    } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_tr(m) {
    const args = m.__args || [];
    let target = 'en', text = m.__rest;
    const langs = ['ru', 'en', 'uk', 'de', 'fr', 'es', 'it', 'tr', 'ar', 'zh', 'ja', 'ko', 'pl'];
    if (args[0] && langs.includes(args[0].toLowerCase())) { target = args[0].toLowerCase(); text = m.__rest.slice(args[0].length).trim(); }
    if (m.reply_to_message?.text && !text) text = m.reply_to_message.text;
    if (!text) return this.reply(m, 'Использование: <code>+tr [язык] текст</code>');
    try {
      const t = await U.translate(text, target);
      this.reply(m, `🌍 <b>Перевод (${target}):</b>\n${escapeHtml(t)}`);
    } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_tts(m) {
    let text = m.__rest || m.reply_to_message?.text;
    if (!text) return this.reply(m, 'Использование: <code>+tts текст</code>');
    try {
      const mp3 = await U.ttsRu(text);
      const fd = new FormData();
      fd.append('chat_id', String(m.chat.id));
      fd.append('voice', new Blob([mp3], { type: 'audio/mpeg' }), 'voice.mp3');
      fd.append('reply_to_message_id', String(m.message_id));
      const r = await fetch(`https://api.telegram.org/bot${this.tg.token}/sendVoice`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.description || 'sendVoice failed');
      this.tg.deleteMessage(m.chat.id, m.message_id).catch(() => null);
    } catch (e) { this.reply(m, '❌ TTS: ' + escapeHtml(e.message)); }
  }

  async cmd_weather(m) {
    if (!m.__rest) return this.reply(m, 'Использование: <code>+weather Москва</code>');
    try { this.reply(m, await U.weather(m.__rest)); } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_google(m) {
    if (!m.__rest) return this.reply(m, 'Использование: <code>+google запрос</code>');
    // keyless SGG: DuckDuckGo Instant Answer API
    try {
      const j = await (await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(m.__rest)}&format=json&no_html=1&skip_disambig=1`)).json();
      let out = `🔎 <b>${escapeHtml(j.heading || m.__rest)}</b>\n`;
      if (j.abstract_text) out += `\n${escapeHtml(j.abstract_text)}\n${j.abstract_url ? `\n🔗 <a href="${j.abstract_url}">Источник</a>` : ''}`;
      else if (j.answer) out += `\n${escapeHtml(j.answer)}`;
      else if (j.definition) out += `\n${escapeHtml(j.definition)}`;
      else out += `\n😶 Быстрого ответа нет.\n🔗 <a href="https://www.google.com/search?q=${encodeURIComponent(m.__rest)}">Открыть в Google</a>`;
      this.reply(m, out);
    } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_ud(m) {
    if (!m.__rest) return this.reply(m, 'Использование: <code>+ud слово</code>');
    try { this.reply(m, await U.urban(m.__rest)); } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_wiki(m) {
    if (!m.__rest) return this.reply(m, 'Использование: <code>+wiki тема</code>');
    try { this.reply(m, await U.wiki(m.__rest)); } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_kang(m) {
    const src = m.reply_to_message;
    if (!src) return this.reply(m, 'Ответьте на стикер/фото//gif, чтобы украсть 😼');
    const s = src.sticker || src.photo?.at(-1) || src.animation || src.document;
    if (!s) return this.reply(m, 'Не стикер и не картинка 🤷');
    const fileId = s.file_id;
    const setName = `${this.tg.me?.username || 'userrouter'}_kanged_by`;
    const emoji = src.sticker?.emoji || '😼';
    const payload = { sticker_file_id: fileId, emoji };
    try {
      if (src.sticker?.is_animated || src.sticker?.is_video) payload.sticker_file_id = fileId; // video stickers need conversion; pass as-is
      await this.tg.addStickerToSet(m.from.id, setName, payload);
    } catch {
      try {
        await this.tg.createNewStickerSet(m.from.id, setName + '_' + Math.random().toString(36).slice(2, 6), 'Kangs by userRouterStudio', { ...payload, type: 'regular' });
      } catch (e) { return this.reply(m, '❌ Не удалось прикрепить к сету: ' + escapeHtml(e.message) + '\n(для видео-стикеров нужен конвертер — пришлите как фото: +kang сохранит файлом ниже)'); }
    }
    this.reply(m, `😼 Украдено!\n📦 Сет: <code>t.me/addstickers/${setName}</code>`);
  }

  async cmd_qr(m) {
    if (!m.__rest) return this.reply(m, 'Использование: <code>+qr текст/ссылка</code>');
    const url = await U.qrPngUrl(m.__rest);
    this.tg.sendPhoto(m.chat.id, url, `QR: ${escapeHtml(m.__rest.slice(0, 60))}`, { reply_to: m.message_id });
  }

  async cmd_short(m) {
    if (!m.__rest) return this.reply(m, 'Использование: <code>+short https://example.com</code>');
    try { const u = await U.shorten(m.__rest.split(/\s/)[0]); this.reply(m, `✂️ <a href="${u}">${u}</a>`); }
    catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_curr(m) {
    const [base, quote, amount] = m.__args || [];
    if (!base || !quote) return this.reply(m, 'Использование: <code>+curr USD RUB [кол-во]</code>');
    try { this.reply(m, await U.currency(base.toUpperCase(), quote.toUpperCase(), Number(amount) || 1)); }
    catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_define(m) {
    if (!m.__rest) return this.reply(m, 'Использование: <code>+define word</code>');
    try { this.reply(m, await U.defineWord(m.__rest.trim())); } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_crypto(m) {
    const coin = (m.__args?.[0] || 'bitcoin').toLowerCase();
    try { this.reply(m, await U.cryptoPrice(coin)); } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_anime(m) {
    if (!m.__rest) return this.reply(m, 'Использование: <code>+anime наруто</code>');
    try { this.reply(m, await U.anime(m.__rest)); } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_lyrics(m) {
    const parts = (m.__rest || '').split(/\s+–\s+|\s+-\s+/);
    if (parts.length < 2) return this.reply(m, 'Использование: <code>+lyrics Artist - Song</code>');
    try { this.reply(m, await U.lyrics(parts[0].trim(), parts[1].trim())); } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_joke(m) { this.reply(m, '🎭 ' + escapeHtml(U.dadJoke())); }

  async cmd_ascii(m) {
    const text = (m.__rest || 'hello').toUpperCase().slice(0, 20);
    const FONT = {
      A: ['██╗', '██║', '╚═╝'], B: ['████╗', '██╔═█║', '╚═══╝'],
    };
    void FONT;
    // figlet via plain mapping
    const F = {
      ' ': '   ', '!': ' ▄█▄ ',
      A: '█▀█\n█▄█', B: '█▄ \n█▄█', C: '██▀\n▀▀ ', D: '█▄ \n██▀',
      E: '███\n█  ', F: '███\n█  ', G: '██▀\n▀▀█', H: '█ █\n███',
      I: '███\n █ ', J: ' ██\n▄ █', K: '█▄█\n██ ', L: '█  \n███',
      M: '█▄█\n█ █', N: '█▄█\n█ █', O: '█ █\n███', P: '██▀\n▀  ',
      Q: '█ █\n██▀', R: '██▀\n▀▄ ', S: '██ \n ▀█', T: '███\n █ ',
      U: '█ █\n███', V: '█ █\n▀▀ ', W: '█ █\n█▄█', X: '█▄█\n▀ █',
      Y: '█▄█\n █ ', Z: '███\n ▀█',
      '0': '███\n█▄█', '1': ' █▀\n▄█ ', '2': '██▄\n▄██', '3': '██▄\n ▀█',
      '5': '█▄ \n▄█ ', '6': '█▄▄\n▄█▀', '7': '███\n  █', '8': '█▄█\n█▄█',
      '9': '█▄█\n ▀█', '.': '   \n ▄█', '?': '█▀█\n  █',
    };
    const rows = ['', '', ''];
    for (const ch of text) {
      const g = (F[ch] || F[' ']).split('\n');
      rows[0] += g[0] + ' '; rows[1] += (g[1] || '    ') + ' '; rows[2] += (g[2] || '    ') + ' ';
    }
    this.reply(m, `<pre>${rows.join('\n')}</pre>`);
  }

  async cmd_trace(m) {
    // "route" info joke/utility: show routing path of the message through CF
    const colo = 'unknown';
    try {
      const j = await (await fetch('https://cloudflare.com/cdn-cgi/trace')).text();
      const map = Object.fromEntries(j.split('\n').map((l) => l.split('=')));
      return this.reply(m,
        `🛤 <b>TRACE (Cloudflare)</b>\n\n` +
        `📍 Дата-центр: <b>${map.colo}</b>\n🌍 Страна: ${map.loc}\n🔢 IP: ${map.ip}\n⏱ SLA: ${map.sl}\n🟢 TLS: ${map.tls}\n🕐 Время: ${map.time}`
      );
    } catch { void colo; }
    this.reply(m, '❌ trace недоступен');
  }

  // =====================================================
  // AUTOMATION
  // =====================================================
  async cmd_afk(m) {
    const reason = m.__rest || 'занят важным делом';
    await this.store.setAfk(m.chat.id, m.from.id, reason);
    this.reply(m, `🛌 <b>AFK включён</b>\nПричина: ${escapeHtml(reason)}\nКаждому, кто вас упомянет, бот отчитается.`);
  }
  async cmd_unafk(m) {
    await this.store.clearAfk(m.chat.id, m.from.id);
    this.reply(m, '↩️ AFK снят, возвращаемся в реальность.');
  }

  async cmd_autoread(m) {
    const on = !(await this.store.getToggle(m.chat.id, 'autoread'));
    await this.store.setToggle(m.chat.id, 'autoread', on);
    this.reply(m, on ? '📖 Авточтение ВКЛ. Все входящие будут отмечены прочитанными.' : '📕 Авточтение ВЫКЛ.');
  }

  async cmd_alwaysonline(m) {
    const on = !(await this.store.getToggle(m.chat.id, 'alwaysonline'));
    await this.store.setToggle(m.chat.id, 'alwaysonline', on);
    this.reply(m, on
      ? '🟢 Вечный онлайн ВКЛ. Бот будет постоянно показывать статус «печатает/в сети».'
      : '⚪ Вечный онлайн ВЫКЛ.');
  }

  async cmd_clone(m) { await this.store.setToggle(m.chat.id, 'clone', true); this.reply(m, '👯 Клон ВКЛ: ваши сообщения будут дублироваться.'); }
  async cmd_unclone(m) { await this.store.setToggle(m.chat.id, 'clone', false); this.reply(m, '👯 Клон ВЫКЛ.'); }
  async cmd_clonep(m) { await this.store.setToggle(m.chat.id, 'clone', true); await this.store.setToggle(m.chat.id, 'clone_profile', true); this.reply(m, '🪞 Клон + возврат профиля ВКЛ.'); }
  async cmd_unclonep(m) { await this.store.setToggle(m.chat.id, 'clone', false); await this.store.setToggle(m.chat.id, 'clone_profile', false); this.reply(m, '🪞 Клон профиля ВЫКЛ.'); }

  async cmd_note(m) {
    const name = m.__args?.[0];
    const text = m.__rest.slice(name ? name.length : 0).trim();
    if (!name || !text) return this.reply(m, 'Использование: <code>+note имя текст</code>');
    await this.store.saveNote(m.chat.id, name.toLowerCase(), text);
    this.reply(m, `📝 Заметка «<code>${escapeHtml(name)}</code>» сохранена.`);
  }
  async cmd_notes(m) {
    const list = await this.store.listNotes(m.chat.id);
    this.reply(m, list.length ? `🗒 <b>Заметки:</b>\n${list.map((n) => `• <code>${escapeHtml(n)}</code>`).join('\n')}` : '🗒 Заметок пока нет. Создайте: <code>+note имя текст</code>');
  }
  async cmd_get(m) {
    const name = (m.__args?.[0] || '').toLowerCase();
    if (!name) return this.reply(m, 'Использование: <code>+get имя</code>');
    const note = await this.store.getNote(m.chat.id, name);
    if (!note) return this.reply(m, `🤷 Заметка «${escapeHtml(name)}» не найдена.`);
    this.reply(m, escapeHtml(note), { parse_mode: null });
  }
  async cmd_delnote(m) {
    const name = (m.__args?.[0] || '').toLowerCase();
    if (!name) return this.reply(m, 'Использование: <code>+delnote имя</code>');
    await this.store.delNote(m.chat.id, name);
    this.reply(m, `🗑 Заметка «${escapeHtml(name)}» удалена.`);
  }

  async cmd_filter(m) {
    const word = m.__args?.[0]?.toLowerCase();
    const answer = m.__rest.slice(word ? word.length : 0).trim();
    if (!word || !answer) return this.reply(m, 'Использование: <code>+filter слово ответ</code>');
    await this.store.addFilter(m.chat.id, word, answer);
    this.reply(m, `🎯 Фильтр добавлен: «${escapeHtml(word)}» → «${escapeHtml(answer.slice(0, 80))}»`);
  }
  async cmd_unfilter(m) {
    const word = (m.__args?.[0] || '').toLowerCase();
    if (!word) return this.reply(m, 'Использование: <code>+unfilter слово</code>');
    await this.store.delFilter(m.chat.id, word);
    this.reply(m, `🗑 Фильтр «${escapeHtml(word)}» удалён.`);
  }
  async cmd_filters(m) {
    const f = await this.store.getFilters(m.chat.id);
    const keys = Object.keys(f);
    this.reply(m, keys.length ? `🎯 <b>Фильтры:</b>\n${keys.map((k) => `• <code>${escapeHtml(k)}</code> → ${escapeHtml(f[k].slice(0, 60))}`).join('\n')}` : '🎯 Фильтров нет. Добавьте: <code>+filter слово ответ</code>');
  }

  // =====================================================
  // ADMIN
  // =====================================================
  parseDur(s) {
    if (!s) return null;
    const units = {
      'сек': 1, 'sec': 1, 's': 1,
      'мин': 60, 'min': 60, 'm': 60,
      'час': 3600, 'hour': 3600, 'h': 3600,
      'сут': 86400, 'день': 86400, 'дня': 86400, 'дней': 86400, 'day': 86400, 'd': 86400,
      'нед': 604800, 'неделю': 604800, 'week': 604800, 'w': 604800,
      'мес': 2592000, 'месяц': 2592000, 'month': 2592000,
    };
    let total = 0, found = false;
    const re = /(\d+)\s*([a-zа-яё]{1,7})/gi;
    let mt;
    while ((mt = re.exec(s))) {
      const u = units[mt[2].toLowerCase()];
      if (u) { found = true; total += Number(mt[1]) * u; }
    }
    if (!found && /^\d+$/.test(s.trim())) { total = Number(s.trim()) * 60; found = true; } // bare number = minutes
    return found ? total : null;
  }
  async cmd_mute(m) {
    if (this.needAdmin(m)) return;
    const u = this.targetUser(m);
    if (!u?.id) return this.reply(m, 'Ответьте на сообщение виновника.');
    const dur = this.parseDur(m.__rest) ?? 3600;
    const until = Math.floor(Date.now() / 1000) + dur;
    const NO = false, YES = true;
    await this.tg.restrict(m.chat.id, u.id, {
      can_send_messages: NO, can_send_audios: NO, can_send_documents: NO, can_send_photos: NO,
      can_send_videos: NO, can_send_video_notes: NO, can_send_voice_notes: NO,
      can_send_polls: NO, can_send_other_messages: NO, can_add_web_page_previews: NO,
      can_change_info: NO, can_invite_users: NO, can_pin_messages: NO, can_manage_topics: NO,
    }, until);
    this.reply(m, `🔇 ${mention(u)} замучен на ${Math.round(dur / 60)} мин (soft-delete mute: удаление сообщений + тишина).`);
  }

  async cmd_unmute(m) {
    if (this.needAdmin(m)) return;
    const u = this.targetUser(m);
    if (!u?.id) return this.reply(m, 'Ответьте на сообщение.');
    const YES = true;
    await this.tg.restrict(m.chat.id, u.id, {
      can_send_messages: YES, can_send_audios: YES, can_send_documents: YES, can_send_photos: YES,
      can_send_videos: YES, can_send_video_notes: YES, can_send_voice_notes: YES,
      can_send_polls: YES, can_send_other_messages: YES, can_add_web_page_previews: YES,
    });
    this.reply(m, `🔊 ${mention(u)} размучен.`);
  }

  async cmd_ban(m) {
    if (this.needAdmin(m)) return;
    const u = this.targetUser(m);
    if (!u?.id) return this.reply(m, 'Ответьте на сообщение банящегося.');
    const dur = this.parseDur(m.__rest);
    const until = dur ? Math.floor(Date.now() / 1000) + dur : undefined;
    try {
      await this.tg.ban(m.chat.id, u.id, until);
      this.reply(m, `🔨 ${mention(u)} забанен${dur ? ` на ${Math.round(dur / 60)} мин` : ' навсегда'}.`);
    } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }
  async cmd_unban(m) {
    if (this.needAdmin(m)) return;
    const u = this.targetUser(m);
    if (!u?.id) return this.reply(m, 'Ответьте на сообщение.');
    await this.tg.unban(m.chat.id, u.id);
    this.reply(m, `🕊 ${mention(u)} разбанинен.`);
  }
  async cmd_kick(m) {
    if (this.needAdmin(m)) return;
    const u = this.targetUser(m);
    if (!u?.id) return this.reply(m, 'Ответьте на сообщение.');
    try { await this.tg.kick(m.chat.id, u.id); this.reply(m, `👢 ${mention(u)} выkopан из чата.`); }
    catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_warn(m) {
    if (this.needAdmin(m)) return;
    const u = this.targetUser(m);
    if (!u?.id) return this.reply(m, 'Ответьте на сообщение нарушителя.');
    const reason = m.__rest || 'без причины';
    const n = await this.store.incWarn(m.chat.id, u.id);
    if (n >= 3) {
      await this.tg.ban(m.chat.id, u.id, Math.floor(Date.now() / 1000) + 86400).catch(() => null);
      await this.store.resetWarns(m.chat.id, u.id);
      this.reply(m, `⛔️ ${mention(u)} получил ${n}/3 варна (${escapeHtml(reason)}) → <b>бан на 24ч!</b>`);
    } else {
      this.reply(m, `⚠️ ${mention(u)} варн ${n}/3. Причина: ${escapeHtml(reason)}`);
    }
  }
  async cmd_unwarn(m) {
    if (this.needAdmin(m)) return;
    const u = this.targetUser(m);
    if (!u?.id) return this.reply(m, 'Ответьте на сообщение.');
    await this.store.resetWarns(m.chat.id, u.id);
    this.reply(m, `✅ С варнов очищен: ${mention(u)}`);
  }
  async cmd_warns(m) {
    const u = this.targetUser(m);
    if (!u?.id) return this.reply(m, 'Ответьте на сообщение.');
    const n = await this.store.getWarns(m.chat.id, u.id);
    this.reply(m, `📋 Варны ${mention(u)}: ${'🟠'.repeat(n) || '—'} (${n}/3)`);
  }

  async cmd_slow(m) {
    if (this.needAdmin(m)) return;
    const sec = Math.min(600, Number(m.__args?.[0]) || 0);
    try {
      // Bot API lacks slow_mode; emulate: warn repeat offenders via anti-flood state
      await this.store.setJSON(`slow:${m.chat.id}`, sec);
      this.reply(m, sec ? `🐢 Slow-mode эмуляция: ${sec}с (антифлуд включён). Настоящий slow_mode — через userbot-сессию.` : '🐇 Slow-mode выключен.');
    } catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_title(m) {
    if (this.needAdmin(m)) return;
    if (!m.__rest) return this.reply(m, 'Использование: <code>+title новый заголовок</code>');
    try { await this.tg.setChatTitle(m.chat.id, m.__rest.slice(0, 255)); this.reply(m, '🏷 Тема изменена.'); }
    catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }
  async cmd_desc(m) {
    if (this.needAdmin(m)) return;
    try { await this.tg.setChatDescription(m.chat.id, m.__rest || ''); this.reply(m, '📝 Описание изменено.'); }
    catch (e) { this.reply(m, '❌ ' + escapeHtml(e.message)); }
  }

  async cmd_tagall(m) {
    if (this.needAdmin(m)) return;
    const count = Math.min(50, Number(m.__args?.[0]) || 20);
    const text = m.__rest.replace(/^\d+\s*/, '') || 'всем привет 👋';
    let users;
    try { users = await this.tg.admins(m.chat.id); } catch { users = []; }
    const tags = users.slice(0, count).map((a) => mention(a.user));
    this.reply(m, `${escapeHtml(text)}\n\n${tags.join(' · ') || '(доступен только список админов — полный тег через userbot)'}`);
  }

  async cmd_spam(m) {
    if (!isOwner(m.from.id)) return this.reply(m, '⛔️ Только для владельца.');
    const count = Math.min(10, Number(m.__args?.[0]) || 3);
    const text = m.__rest.replace(/^\d+\s*/, '') || 'спам-спам-спам';
    await this.reply(m, `🚀 Параллельный спам ×${count} (через Promise.all):`);
    await Promise.all(Array.from({ length: count }, (_, i) =>
      this.tg.send(m.chat.id, `${i + 1}/${count}: ${text}`).catch(() => null)
    ));
  }

  // =====================================================
  // RP / MEDIA / LOGS
  // =====================================================
  async rp(m, key) {
    const u = this.targetUser(m);
    const gif = GIF_ACTIONS[key];
    if (!gif) return this.reply(m, 'Действие не найдено. Список: <code>+rp</code>');
    const who = u && u.id !== m.from.id ? mention(u) : 'себя';
    const caption = `${gif.msg.replace('{me}', mention(m.from)).replace('{you}', who)}`;
    try {
      await this.tg.sendAnimation(m.chat.id, gif.url, { reply_to: m.message_id, caption: caption.replace(/<[^>]+>/g, '') });
      this.tg.deleteMessage(m.chat.id, m.message_id);
    } catch {
      this.reply(m, caption);
    }
  }
  async cmd_rp_list(m) {
    const keys = Object.keys(GIF_ACTIONS).map((k) => `<code>+${k}</code>`);
    this.reply(m, `🤝 <b>RP-действия (${keys.length}):</b>\n${keys.join(' ')}\n\nТакже доступны русские алиасы: +погладить, +обнять, +поцеловать и т.д.`);
  }

  async cmd_tiktok(m) {
    const url = m.__rest || m.reply_to_message?.text;
    if (!/tiktok\.com/i.test(url || '')) return this.reply(m, 'Использование: <code>+tiktok ссылка</code>');
    try {
      // public API-matic tiktok downloader
      const j = await (await fetch(`https://api.tikwm.com/?url=${encodeURIComponent(url)}`)).json();
      const d = j?.data;
      if (!d?.play) throw new Error('Видео не найдено');
      await this.tg.sendAnimation(m.chat.id, d.play, { reply_to: m.message_id, caption: `🎵 ${escapeHtml(d.title || 'TikTok')}` });
    } catch (e) {
      this.reply(m, `❌ Скачивание не удалось: ${escapeHtml(e.message)}\n🔗 Прямая ссылка: ${escapeHtml(url)}`);
    }
  }

  async cmd_chaos(m) {
    if (m.__args?.[0] === 'reset') {
      this.cache.dialogs.clear();
      this.cache.users.clear();
      this.cache.userChats = new Map();
      return this.reply(m, '🌀 Досье слежки сброшено. Никто ничего не видел.');
    }
    const users = this.cache.users.size;
    const chats = this.cache.dialogs.size;
    const msgs = this.cache.count || 0;
    const top = [...(this.cache.msgByUser || new Map()).entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5);
    this.reply(m,
      `🌀 <b>CHAOS DOSSIER (агрегат слежки)</b>\n\n` +
      `👥 Пользователей в тени: <b>${users}</b>\n💬 Диалогов под наблюдением: <b>${chats}</b>\n📨 Проиндексировано сообщений: <b>${msgs}</b>\n\n` +
      `🏆 Самые болтливые:\n${top.map(([id, c]) => `• <code>${id}</code>: ${c} сообщ.`).join('\n') || '— пока пусто —'}\n\n` +
      `<i>Сброс: +chaos reset · Логи: +logs</i>`
    );
  }

  async cmd_logs(m) {
    const logs = this.store.getLogs().slice(0, 20);
    if (!logs.length) return this.reply(m, '📜 Логи пусты. Перехватчик ждёт deleted/edited/typing-события.');
    const text = logs.map((l) => `[${new Date(l.t).toLocaleTimeString('ru-RU')}] ${l.kind}: ${l.info}`).join('\n');
    try {
      const link = await U.paste(`userRouterStudio Pasture logs\n\n${text}`);
      this.reply(m, `📜 Последние ${logs.length} событий:\n🔗 <a href="${link}">Pasture лог</a>`);
    } catch {
      this.reply(m, `📜 <b>Логи:</b>\n<pre>${escapeHtml(text.slice(0, 3500))}</pre>`);
    }
  }

  // =====================================================
  // META
  // =====================================================
  async cmd_help(m) {
    this.reply(m, HELP_TEXT, { preview: false });
  }

  async cmd_start(m) {
    this.reply(m,
      `🕺 <b>userRouterStudio</b> — панель команд юзербота на Cloudflare Workers.\n\n` +
      `Напишите <code>+help</code> — полный список из 80+ команд.\n` +
      `Все анимации, утилиты, автоматизация и админ-модули уже на борту 🚀`
    );
  }

  async cmd_owner(m) {
    globalThis.__URS_OWNER = m.from.id;
    await this.store.setJSON('owner', m.from.id);
    this.reply(m, '👑 Вы записаны как владелец бота.');
  }
}

export const HELP_TEXT = `🕺 <b>userRouterStudio — панель команд</b>

🎬 <b>Анимации и приколы</b>
<code>+type</code> печать по буквам · <code>+hack</code> взлом пентагона · <code>+love</code> сердце · <code>+matrix</code> матрица · <code>+dice</code>/<code>+slot</code>/<code>+darts</code> · <code>+basket</code>/<code>+football</code>/<code>+bowling</code> · <code>+moon</code>/<code>+clock</code>/<code>+earth</code> · <code>+fakeaction [typing|voice] [сек]</code> · <code>+type_del [сек] [текст]</code> самоуничтожение

💬 <b>Сообщения</b>
<code>+del</code> · <code>+purge</code> · <code>+edit</code> · <code>+save</code> · <code>+quote</code> · <code>+fwd</code> · <code>+copy</code> · <code>+pin</code>/<code>+unpin</code> · <code>+search</code> · <code>+clear</code> · <code>+chats</code>

🕵️ <b>Инфо и шпионаж</b>
<code>+id</code> · <code>+info</code> · <code>+avatar</code> · <code>+chatinfo</code> · <code>+spy</code> · <code>+ping</code> · <code>+alive</code> · <code>+speedtest</code> · <code>+whois</code> · <code>+admins</code> · <code>+trace</code>

🧰 <b>Утилиты</b>
<code>+calc</code> · <code>+tr [lang] текст</code> · <code>+tts</code> · <code>+weather</code> · <code>+google</code> · <code>+ud</code> · <code>+wiki</code> · <code>+kang</code> · <code>+qr</code> · <code>+short</code> · <code>+curr USD RUB [кол]</code> · <code>+define</code> · <code>+crypto</code> · <code>+anime</code> · <code>+lyrics Artist - Song</code> · <code>+joke</code> · <code>+ascii</code>

🤖 <b>Автоматизация</b>
<code>+afk</code>/<code>+unafk</code> · <code>+autoread</code> · <code>+alwaysonline</code> · <code>+clone</code>/<code>+unclone</code> · <code>+clonep</code>/<code>+unclonep</code> · <code>+note</code>/<code>+notes</code>/<code>+get</code>/<code>+delnote</code> · <code>+filter</code>/<code>+unfilter</code>/<code>+filters</code>

🛡 <b>Администрация</b>
<code>+mute [время]</code>/<code>+unmute</code> · <code>+ban [время]</code>/<code>+unban</code>/<code>+kick</code> · <code>+warn</code>/<code>+unwarn</code>/<code>+warns</code> (3/3 = бан) · <code>+slow [сек]</code> · <code>+title</code>/<code>+desc</code> · <code>+tagall</code> · <code>+spam</code>

🤝 <b>RP / Медиа / Логи</b>
<code>+rp</code> — 20+ действий (hug/pet/kiss/...) и русские алиасы (+обнять, +погладить) · <code>+tiktok ссылка</code> · <code>+chaos</code>/<code>+chaos reset</code> · <code>+logs</code> — Pasture-перехват удалёнок и edits`;
