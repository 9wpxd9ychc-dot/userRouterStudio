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

  // ---------- logs (Pasture-style event log) ----------
  pushLog(entry) {
    mem.logs.unshift({ ...entry, t: Date.now() });
    if (mem.logs.length > 500) mem.logs.pop();
  }
  getLogs() { return mem.logs; }
}
