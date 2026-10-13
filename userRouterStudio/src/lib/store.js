// userRouterStudio — state storage for Cloudflare Workers
// Uses KV if bound (persistent), falls back to in-memory Maps (ephemeral, per isolate).

const mem = {
  notes: new Map(),    // `${chatId}:${name}` -> text
  filters: new Map(),  // chatId -> Map(word -> answer)
  afk: new Map(),      // chatId -> Map(userId -> {reason, since})
  warns: new Map(),    // `${chatId}:${userId}` -> count
  toggles: new Map(),  // `${chatId}:${feature}` -> bool
  logs: [],            // pastebin-style log ring buffer
  mutedUntil: new Map(),
};

export class Store {
  constructor(kv) { this.kv = kv; }

  async getJSON(key, fallback) {
    if (this.kv) {
      try {
        const v = await this.kv.get(key);
        return v ? JSON.parse(v) : fallback;
      } catch { return fallback; }
    }
    return fallback;
  }

  async setJSON(key, value) {
    if (this.kv) {
      try { await this.kv.put(key, JSON.stringify(value)); } catch {}
    }
  }

  // ---------- notes ----------
  async saveNote(chatId, name, text) {
    await this.setJSON(`note:${chatId}:${name}`, text);
    const list = await this.getJSON(`notes:${chatId}`, []);
    if (!list.includes(name)) { list.push(name); await this.setJSON(`notes:${chatId}`, list.slice(-200)); }
  }
  async getNote(chatId, name) { return this.getJSON(`note:${chatId}:${name}`, null); }
  async delNote(chatId, name) {
    await this.setJSON(`note:${chatId}:${name}`, null);
    const list = (await this.getJSON(`notes:${chatId}`, [])).filter((n) => n !== name);
    await this.setJSON(`notes:${chatId}`, list);
  }
  async listNotes(chatId) { return this.getJSON(`notes:${chatId}`, []); }

  // ---------- filters ----------
  async addFilter(chatId, word, answer) {
    const f = await this.getJSON(`filters:${chatId}`, {});
    f[word.toLowerCase()] = answer;
    await this.setJSON(`filters:${chatId}`, f);
  }
  async delFilter(chatId, word) {
    const f = await this.getJSON(`filters:${chatId}`, {});
    delete f[word.toLowerCase()];
    await this.setJSON(`filters:${chatId}`, f);
  }
  async getFilters(chatId) { return this.getJSON(`filters:${chatId}`, {}); }

  // ---------- afk ----------
  async setAfk(chatId, userId, reason) {
    const m = await this.getJSON(`afk:${chatId}`, {});
    m[String(userId)] = { reason, since: Date.now() };
    await this.setJSON(`afk:${chatId}`, m);
  }
  async clearAfk(chatId, userId) {
    const m = await this.getJSON(`afk:${chatId}`, {});
    delete m[String(userId)];
    await this.setJSON(`afk:${chatId}`, m);
  }
  async getAfk(chatId) { return this.getJSON(`afk:${chatId}`, {}); }

  // ---------- warns ----------
  async incWarn(chatId, userId) {
    const key = `warn:${chatId}:${userId}`;
    const n = (await this.getJSON(key, 0)) + 1;
    await this.setJSON(key, n);
    return n;
  }
  async resetWarns(chatId, userId) { await this.setJSON(`warn:${chatId}:${userId}`, 0); }
  async getWarns(chatId, userId) { return this.getJSON(`warn:${chatId}:${userId}`, 0); }

  // ---------- feature toggles (autoread, alwaysonline, clone...) ----------
  async setToggle(chatId, feature, on) { await this.setJSON(`tog:${chatId}:${feature}`, on); }
  async getToggle(chatId, feature) { return this.getJSON(`tog:${chatId}:${feature}`, false); }

  // ---------- misc cache (user profiles seen, spam guard) ----------
  async rememberUser(user) {
    if (!user) return;
    await this.setJSON(`user:${user.id}`, user);
  }
  async lookupUser(id) { return this.getJSON(`user:${id}`, null); }

  // ---------- karma (rep) ----------
  async addKarma(userId, delta) {
    const key = `karma:${userId}`;
    const v = (await this.getJSON(key, 0)) + delta;
    await this.setJSON(key, Math.max(-1000, Math.min(1000, v)));
    return v;
  }
  async getKarma(userId) { return this.getJSON(`karma:${userId}`, 0); }

  // ---------- global ban list ----------
  async gbanList() { return this.getJSON('gbans', {}); }
  async gbanAdd(userId, reason) {
    const m = await this.getJSON('gbans', {});
    m[String(userId)] = { reason, since: Date.now() };
    await this.setJSON('gbans', m);
  }
  async gbanDel(userId) {
    const m = await this.getJSON('gbans', {});
    delete m[String(userId)];
    await this.setJSON('gbans', m);
  }

  // ---------- reply-notes: word -> note name auto-reply ----------
  async addReplyNote(chatId, trigger, noteName) {
    const f = await this.getJSON(`rnote:${chatId}`, {});
    f[trigger.toLowerCase()] = noteName.toLowerCase();
    await this.setJSON(`rnote:${chatId}`, f);
  }
  async delReplyNote(chatId, trigger) {
    const f = await this.getJSON(`rnote:${chatId}`, {});
    delete f[trigger.toLowerCase()];
    await this.setJSON(`rnote:${chatId}`, f);
  }
  async getReplyNotes(chatId) { return this.getJSON(`rnote:${chatId}`, {}); }

  // ---------- last message per chat (snipe) ----------
  async setLastMsg(chatId, data) { await this.setJSON(`lastmsg:${chatId}`, data); }
  async getLastMsg(chatId) { return this.getJSON(`lastmsg:${chatId}`, null); }

  // ---------- reminders ----------
  async addReminder(chatId, item) {
    const list = await this.getJSON(`reminders:${chatId}`, []);
    list.push(item);
    await this.setJSON(`reminders:${chatId}`, list.slice(-100));
  }
  async getReminders(chatId) { return this.getJSON(`reminders:${chatId}`, []); }
  async popDueReminders(chatId, nowSec) {
    const list = await this.getJSON(`reminders:${chatId}`, []);
    const due = list.filter((r) => r.at <= nowSec);
    const rest = list.filter((r) => r.at > nowSec);
    if (due.length) await this.setJSON(`reminders:${chatId}`, rest);
    return due;
  }

  // ---------- sticker packs registry ----------
  async registerPack(name) {
    const list = await this.getJSON('packs', []);
    if (!list.includes(name)) { list.push(name); await this.setJSON('packs', list.slice(-50)); }
  }
  async listPacks() { return this.getJSON('packs', []); }
  async unregisterPack(name) {
    const list = (await this.getJSON('packs', [])).filter((p) => p !== name);
    await this.setJSON('packs', list);
  }

  // ---------- games state (numberguess / mathgame / timer / trivia) ----------
  async getGame(chatId) { return this.getJSON(`game:${chatId}`, null); }
  async setGame(chatId, data) { await this.setJSON(`game:${chatId}`, data); }
  async delGame(chatId) { await this.setJSON(`game:${chatId}`, null); }

  // ---------- auto-pin rules ----------
  async addAutopin(chatId, regex) {
    const list = await this.getJSON(`autopin:${chatId}`, []);
    if (!list.includes(regex)) { list.push(regex); await this.setJSON(`autopin:${chatId}`, list.slice(-30)); }
  }
  async getAutopin(chatId) { return this.getJSON(`autopin:${chatId}`, []); }

  // ---------- chat rules / motd / bio / birthday ----------
  async setChatField(chatId, field, text) { await this.setJSON(`field:${chatId}:${field}`, text); }
  async getChatField(chatId, field) { return this.getJSON(`field:${chatId}:${field}`, null); }
  async setUserField(userId, field, text) { await this.setJSON(`ufield:${userId}:${field}`, text); }
  async getUserField(userId, field) { return this.getJSON(`ufield:${userId}:${field}`, null); }

  // ---------- ghost mute list ----------
  async ghostAdd(chatId, userId) {
    const m = await this.getJSON(`ghost:${chatId}`, {});
    m[String(userId)] = Date.now();
    await this.setJSON(`ghost:${chatId}`, m);
  }
  async ghostDel(chatId, userId) {
    const m = await this.getJSON(`ghost:${chatId}`, {});
    delete m[String(userId)];
    await this.setJSON(`ghost:${chatId}`, m);
  }
  async ghostList(chatId) { return this.getJSON(`ghost:${chatId}`, {}); }

  // ---------- reaction counters ----------
  async addReaction(chatId, emoji) {
    const key = `react:${chatId}`;
    const m = await this.getJSON(key, {});
    m[emoji] = (m[emoji] || 0) + 1;
    await this.setJSON(key, m);
  }
  async topReactions(chatId) { return this.getJSON(`react:${chatId}`, {}); }

  // ---------- logs (Pasture-style event log) ----------
  pushLog(entry) {
    mem.logs.unshift({ ...entry, t: Date.now() });
    if (mem.logs.length > 500) mem.logs.pop();
  }
  getLogs() { return mem.logs; }
}
