// userRouterStudio — Telegram Bot API client for Cloudflare Workers
// Zero dependencies, native fetch only.

export class TG {
  constructor(token) {
    this.token = token;
    this.base = `https://api.telegram.org/bot${token}`;
  }

  async call(method, params = {}) {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!data.ok) {
      const err = new Error(data.description || `Telegram API error on ${method}`);
      err.error_code = data.error_code;
      err.parameters = data.parameters;
      throw err;
    }
    return data.result;
  }

  // ---- sending ----
  send(chat_id, text, opts = {}) {
    return this.call('sendMessage', {
      chat_id,
      text,
      parse_mode: opts.parse_mode ?? 'HTML',
      disable_web_page_preview: opts.preview ?? true,
      reply_to_message_id: opts.reply_to,
      reply_markup: opts.keyboard ? JSON.stringify(opts.keyboard) : undefined,
      message_thread_id: opts.thread,
    }).catch((e) => {
      // fallback: strip HTML if parse failed
      if (String(e.message).includes('can\'t parse') || e.error_code === 400) {
        const plain = String(text).replace(/<\/?(b|i|u|s|code|pre|a|tg-emoji)[^>]*>/g, '');
        return this.call('sendMessage', { chat_id, text: plain, reply_to_message_id: opts.reply_to });
      }
      throw e;
    });
  }

  edit(chat_id, message_id, text, opts = {}) {
    return this.call('editMessageText', {
      chat_id,
      message_id,
      text,
      parse_mode: opts.parse_mode ?? 'HTML',
      reply_markup: opts.keyboard ? JSON.stringify(opts.keyboard) : undefined,
    }).catch(() => null); // "message is not modified" -> ignore
  }

  deleteMessage(chat_id, message_id) {
    return this.call('deleteMessage', { chat_id, message_id }).catch(() => null);
  }

  deleteMessages(chat_id, ids) {
    if (!ids.length) return Promise.resolve(null);
    return this.call('deleteMessages', { chat_id, message_ids: ids.slice(0, 100) })
      .catch(() => Promise.all(ids.map((id) => this.deleteMessage(chat_id, id))));
  }

  forward(chat_id, from_chat_id, message_id) {
    return this.call('forwardMessage', { chat_id, from_chat_id, message_id });
  }

  copy(chat_id, from_chat_id, message_id, opts = {}) {
    return this.call('copyMessage', {
      chat_id, from_chat_id, message_id,
      caption_entities: opts.entities,
      parse_mode: 'HTML',
    });
  }

  sendChatAction(chat_id, action) {
    return this.call('sendChatAction', { chat_id, action }).catch(() => null);
  }

  // ---- media ----
  sendPhoto(chat_id, photo, caption = '', opts = {}) {
    return this.call('sendPhoto', {
      chat_id, photo, caption,
      parse_mode: opts.parse_mode ?? 'HTML',
      reply_to_message_id: opts.reply_to,
    });
  }

  sendDocument(chat_id, file, opts = {}) {
    return this.call('sendDocument', {
      chat_id, document: file,
      caption: opts.caption,
      parse_mode: 'HTML',
      reply_to_message_id: opts.reply_to,
    });
  }

  sendVoice(chat_id, voice, opts = {}) {
    return this.call('sendVoice', {
      chat_id, voice,
      caption: opts.caption,
      reply_to_message_id: opts.reply_to,
    });
  }

  sendAnimation(chat_id, url, opts = {}) {
    return this.call('sendAnimation', {
      chat_id, animation: url,
      reply_to_message_id: opts.reply_to,
      caption: opts.caption,
    });
  }

  sendDice(chat_id, emoji = '🎲', opts = {}) {
    return this.call('sendDice', { chat_id, emoji, reply_to_message_id: opts.reply_to });
  }

  sendPoll(chat_id, question, options, opts = {}) {
    return this.call('sendPoll', {
      chat_id, question,
      options: JSON.stringify(options),
      type: opts.type || 'regular',
      allows_multiple_answers: !!opts.multiple,
      is_anonymous: opts.anonymous !== false,
      reply_to_message_id: opts.reply_to,
    });
  }

  pollAnswers(chat_id, message_id) {
    return this.call('getPollVotes', { chat_id, message_id }).catch(() => []);
  }

  stopPoll(chat_id, message_id) {
    return this.call('stopPoll', { chat_id, message_id }).catch(() => null);
  }

  setMyCommands(list) {
    return this.call('setMyCommands', { commands: list.slice(0, 100) }).catch(() => null);
  }

  // ---- stickers ----
  createNewStickerSet(user_id, name, title, sticker) {
    return this.call('createNewStickerSet', {
      user_id, name, title,
      stickers: [sticker],
    });
  }

  addStickerToSet(user_id, name, sticker) {
    return this.call('addStickerToSet', { user_id, name, sticker });
  }

  getStickerSet(name) {
    return this.call('getStickerSet', { name });
  }

  sendSticker(chat_id, sticker_file_id, opts = {}) {
    return this.call('sendSticker', { chat_id, sticker: sticker_file_id, reply_to_message_id: opts.reply_to });
  }

  // ---- pins / chat admin ----
  pin(chat_id, message_id, silent = false) {
    return this.call('pinChatMessage', { chat_id, message_id, disable_notification: silent });
  }

  unpin(chat_id, message_id) {
    return this.call('unpinChatMessage', { chat_id, message_id }).catch(() =>
      this.call('unpinAllChatMessages', { chat_id })
    );
  }

  setChatTitle(chat_id, title) {
    return this.call('setChatTitle', { chat_id, title });
  }

  setChatDescription(chat_id, description) {
    return this.call('setChatDescription', { chat_id, description });
  }

  setChatPhoto(chat_id, photo_url) {
    return this.call('setChatPhoto', { chat_id, photo: photo_url });
  }

  leaveChat(chat_id) {
    return this.call('leaveChat', { chat_id });
  }

  // ---- members ----
  ban(chat_id, user_id, until_date) {
    return this.call('banChatMember', { chat_id, user_id, until_date });
  }

  unban(chat_id, user_id) {
    return this.call('unbanChatMember', { chat_id, user_id, only_if_banned: true });
  }

  kick(chat_id, user_id) {
    return this.ban(chat_id, user_id); // permanent ban == kick
  }

  restrict(chat_id, user_id, permissions, until_date) {
    return this.call('restrictChatMember', { chat_id, user_id, permissions, until_date });
  }

  promote(chat_id, user_id, flags) {
    return this.call('promoteChatMember', { chat_id, user_id, ...flags });
  }

  admins(chat_id) {
    return this.call('getChatAdministrators', { chat_id });
  }

  member(chat_id, user_id) {
    return this.call('getChatMember', { chat_id, user_id });
  }

  memberCount(chat_id) {
    return this.call('getChatMemberCount', { chat_id });
  }

  // ---- info ----
  me() { return this.call('getMe'); }
  chatInfo(chat_id) { return this.call('getChat', { chat_id }); }
  getUserProfilePhotos(user_id, limit = 1) { return this.call('getUserProfilePhotos', { user_id, limit }); }
  getFile(file_id) { return this.call('getFile', { file_id }); }

  fileInfo(file_id) {
    return this.getFile(file_id).then((f) => ({
      ...f,
      url: f.file_path ? `https://api.telegram.org/file/bot${this.token}/${f.file_path}` : null,
    }));
  }

  async fileBytes(file_id) {
    const f = await this.getFile(file_id);
    if (!f.file_path) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${f.file_path}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  answerCbQuery(id, text = '') {
    return this.call('answerCallbackQuery', { callback_query_id: id, text }).catch(() => null);
  }
}

// helpers to resolve a target user from @username via bot API (limited without userbot session)
export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function mention(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  if (user.username) return `<a href="tg://user/@${user.username}">@${escapeHtml(user.username)}</a>`;
  return `<a href="tg://user?id=${user.id}">${escapeHtml(name || 'user')}</a>`;
}

export function displayName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || `id ${user.id}`;
}
