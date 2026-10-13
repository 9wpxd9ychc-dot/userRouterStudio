// userRouterStudio — extended utilities, part 2 (dev/devtools/fun/games/geo)
// All keyless APIs via native fetch; pure-JS where possible. Works on Cloudflare Workers.

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (userRouterStudio CF Worker)' } };

export async function hashText(algo, text) {
  const name = String(algo || 'sha256').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const map = { md5: null, sha1: 'SHA-1', 'sha-1': 'SHA-1', sha256: 'SHA-256', 'sha-256': 'SHA-256', sha384: 'SHA-384', 'sha-384': 'SHA-384', sha512: 'SHA-512', 'sha-512': 'SHA-512' };
  if (!(name in map)) throw new Error('Алгоритмы: md5, sha1, sha256, sha384, sha512');
  if (name === 'md5') return `MD5:\n<code>${md5(text)}</code>`;
  const buf = await crypto.subtle.digest(map[name], new TextEncoder().encode(text));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${map[name]}:\n<code>${hex}</code>`;
}

function md5(s) {
  // Canonical iterative MD5 (RFC 1321)
  const rl = (n, c) => (n << c) | (n >>> (32 - c));
  const add32 = (a, b) => (a + b) & 0xFFFFFFFF;
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
             5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
             4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
             6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  const bytes = unescape(encodeURIComponent(s));
  const n = bytes.length;
  const words = [];
  for (let i = 0; i < n; i++) words[i >> 2] = (words[i >> 2] || 0) | (bytes.charCodeAt(i) << ((i % 4) * 8));
  words[n >> 2] = (words[n >> 2] || 0) | (0x80 << ((n % 4) * 8));
  words[(((n + 8) >> 6) << 4) + 14] = n * 8;
  for (let k = 0; k <= (((n + 8) >> 6) << 4) + 15; k++) if (words[k] === undefined) words[k] = 0;
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < words.length; i += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    for (let j = 0; j < 64; j++) {
      let f, g;
      if (j < 16) { f = (b & c) | (~b & d); g = j; }
      else if (j < 32) { f = (d & b) | (~d & c); g = (5 * j + 1) % 16; }
      else if (j < 48) { f = b ^ c ^ d; g = (3 * j + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * j) % 16; }
      const tmp = d; d = c; c = b;
      b = add32(b, rl(add32(add32(a, f), add32(words[i + g], K[j])), S[j]));
      a = tmp;
    }
    a = add32(a, AA); b = add32(b, BB); c = add32(c, CC); d = add32(d, DD);
  }
  const tb = (n2) => { let o = ''; for (let i = 0; i < 4; i++) o += ((n2 >> (i * 8)) & 0xFF).toString(16).padStart(2, '0'); return o; };
  return (tb(a) + tb(b) + tb(c) + tb(d)).toUpperCase();
}

export function b64(mode, text) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  if (mode === 'decode') {
    const bin = atob(text.replace(/\s+/g, ''));
    return dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  let bin = '';
  for (const byte of enc.encode(text)) bin += String.fromCharCode(byte);
  const std = btoa(bin);
  return mode === 'url' ? std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : std;
}

export function uuidv4() { return crypto.randomUUID(); }

export function genPass(len = 20) {
  const L = Math.max(8, Math.min(64, Number(len) || 20));
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*()-_=+[]{}'];
  const pool = sets.join('');
  const arr = new Uint32Array(L);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < L; i++) out += pool[arr[i] % pool.length];
  // guarantee variety
  const extra = new Uint32Array(4);
  crypto.getRandomValues(extra);
  const chars = out.split('');
  sets.forEach((set, i) => { const pos = extra[i] % L; chars[pos] = set[extra[i] % set.length]; });
  return chars.join('');
}

const UNITS = {
  length: { м: 1, km: 1000, см: 0.01, mm: 0.001, dm: 0.1, mi: 1609.344, ft: 0.3048, in: 0.0254, yd: 0.9144 },
  mass: { кг: 1, г: 0.001, mg: 1e-6, т: 1000, lb: 0.45359237, oz: 0.0283495 },
  volume: { л: 1, мл: 0.001, m3: 1000, l: 1, gal: 3.78541, pint: 0.473176 },
  data: { б: 1, кб: 1024, мб: 1024 ** 2, гб: 1024 ** 3, тб: 1024 ** 4, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4, bit: 0.125 },
  time: { с: 1, мин: 60, ч: 3600, сут: 86400, нед: 604800, sec: 1, min: 60, h: 3600, day: 86400, week: 604800, ms: 0.001 },
  speed: { 'м/с': 1, 'км/ч': 1 / 3.6, mph: 0.44704, knot: 0.514444 },
};
function unitGroup(u) {
  u = u.toLowerCase();
  for (const [g, map] of Object.entries(UNITS)) if (map[u]) return g;
  return null;
}
export function convertUnits(expr) {
  const m = /^([\d.,]+)\s*([a-zA-Zа-яёА-ЯЁ/²³^0-9]+)\s*(?:->|→|в|to|=)\s*([a-zA-Zа-яёА-ЯЁ/²³^0-9]+)$/i.exec(expr.trim());
  if (!m) throw new Error('Формат: <code>+conv 10 км/ч -> м/с</code>');
  const val = parseFloat(m[1].replace(',', '.'));
  const from = m[2], to = m[3];
  const fl = from.toLowerCase(), tl = to.toLowerCase();
  const toC = (f, v) => f === 'c' ? v : f === 'f' ? (v - 32) * 5 / 9 : f === 'k' ? v - 273.15 : null;
  const fromC = (c, t) => t === 'c' ? c : t === 'f' ? c * 9 / 5 + 32 : t === 'k' ? c + 273.15 : null;
  if (['c', 'f', 'k'].includes(fl) && ['c', 'f', 'k'].includes(tl)) {
    return `🌡 <b>${val}°${from.toUpperCase()} = ${fromC(toC(fl, val), tl).toFixed(2)}°${to.toUpperCase()}</b>`;
  }
  const g1 = unitGroup(fl), g2 = unitGroup(tl);
  if (!g1 || g1 !== g2) throw new Error('Несовместимые/неизвестные единицы. Группы: длина, масса, объём, данные, время, скорость, температура (C/F/K)');
  const v = (val * UNITS[g1][fl]) / UNITS[g1][tl];
  return `📐 <b>${val} ${from} = ${v.toLocaleString('ru-RU', { maximumFractionDigits: 6 })} ${to}</b>\n<i>(${g1})</i>`;
}

export function colorInfo(hexOrName) {
  const names = { red: '#FF0000', green: '#00FF00', blue: '#0000FF', yellow: '#FFFF00', black: '#000000', white: '#FFFFFF', orange: '#FFA500', purple: '#800080', pink: '#FFC0CB', cyan: '#00FFFF', gray: '#808080', grey: '#808080', brown: '#A52A2A', gold: '#FFD700', navy: '#000080', teal: '#008080' };
  let hex = String(hexOrName).toLowerCase();
  if (names[hex]) hex = names[hex];
  if (!/^#?[0-9a-f]{6}$/i.test(hex)) throw new Error('Нужен HEX (#RRGGBB) или имя цвета (red, gold...)');
  hex = hex.startsWith('#') ? hex : '#' + hex;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2;
  const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (mx !== mn) {
    const R = r / 255, G = g / 255, B = b / 255;
    if (mx === R) h = 60 * (((G - B) / (mx - mn)) % 6);
    else if (mx === G) h = 60 * ((B - R) / (mx - mn) + 2);
    else h = 60 * ((R - G) / (mx - mn) + 4);
  }
  if (h < 0) h += 360;
  return `🎨 <b>${hex.toUpperCase()}</b>\nRGB: <code>${r}, ${g}, ${b}</code>\nHSL: <code>${Math.round(h)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%</code>\nHSV value: <code>${Math.round(mx * 100)}%</code>`;
}

export function upsideDown(text) {
  const map = { a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'l', m: 'ɯ', n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z',
    A: '∀', B: '𐐒', C: 'Ↄ', D: '◖', E: 'Ǝ', F: 'Ⅎ', G: '⅁', H: 'H', I: 'I', J: 'ſ', K: 'ʞ', L: '˥', M: 'W', N: 'N', O: 'O', P: 'Ԁ', Q: 'Ό', R: 'ᴚ', S: 'S', T: '⊥', U: '∩', V: 'Λ', W: 'M', X: 'X', Y: '⅄', Z: 'Z',
    '1': 'Ɩ', '2': 'ᄅ', '3': 'Ɛ', '4': 'ㄴ', '5': 'ϛ', '6': '9', '7': 'ㄥ', '8': '8', '9': '6', '0': '0', '.': '·', ',': "'", '?': '¿', '!': '¡', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '&': '⅋', '_': '‾' };
  return [...String(text)].reverse().map((c) => map[c] || map[c.toLowerCase()] || c).join('');
}

export function revText(text) { return [...String(text)].reverse().join(''); }

export function jsonFormat(raw) {
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { throw new Error('Невалидный JSON: ' + e.message); }
  const pretty = JSON.stringify(obj, null, 2);
  const cut = pretty.length > 3800 ? pretty.slice(0, 3800) + '\n…обрезано' : pretty;
  return `<pre>${cut.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
}

export function regexTest(pattern, text) {
  let re;
  const m = /^\/(.+)\/([gimsuy]*)$/.exec(pattern.trim());
  try { re = new RegExp(m ? m[1] : pattern, (m ? m[2] : 'g') || 'g'); } catch (e) { throw new Error('Плохой regex: ' + e.message); }
  const hits = [];
  let mt; let guard = 0;
  while ((mt = re.exec(text)) !== null && guard++ < 30) {
    hits.push(`• [${mt.index}] <code>${mt[0].replace(/</g, '&lt;')}</code>${mt[1] ? ` → grp: <code>${String(mt[1]).replace(/</g, '&lt;')}</code>` : ''}`);
    if (mt.index === re.lastIndex) re.lastIndex++;
  }
  if (!hits.length) return `🎯 По паттерну <code>${pattern.replace(/</g, '&lt;')}</code> совпадений нет.`;
  return `🎯 <b>Совпадений: ${hits.length}</b>\n${hits.join('\n')}`;
}

export function binConv(numStr) {
  const s = String(numStr).trim().toLowerCase();
  let n;
  try { n = s.startsWith('0x') ? BigInt(s) : s.startsWith('0b') ? BigInt(s) : /^\d+$/.test(s) ? BigInt(s) : (() => { throw 0; })(); }
  catch { throw new Error('Ожидается целое число (десятичное, 0x... или 0b...)'); }
  return `🔢 <b>CONVERTER</b>\nDEC: <code>${n}</code>\nBIN: <code>${n.toString(2)}</code>\nOCT: <code>${n.toString(8)}</code>\nHEX: <code>${n.toString(16).toUpperCase()}</code>`;
}

export async function ipInfo(ipOrEmpty) {
  let url = 'https://ipinfo.io/json';
  if (ipOrEmpty) {
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/.test(ipOrEmpty)) throw new Error('Похоже, это не IP-адрес');
    url = `https://ipinfo.io/${ipOrEmpty}/json`;
  }
  const j = await (await fetch(url, UA)).json();
  return `🌍 <b>IP-РАЗВЕДКА</b>\n🔢 IP: <code>${j.ip}</code>\n🏙 Город: ${j.city || '?'}\n🗺 Регион: ${j.region || '?'}\n🌐 Страна: ${j.country || '?'}\n📮 Индекс: ${j.postal || '?'}\n🛰 Geo: <code>${j.loc}</code>\n🏢 Провайдер: ${j.org || '?'}`;
}

export async function dnsLookup(domain) {
  const clean = String(domain).replace(/^https?:\/\//, '').split('/')[0];
  if (!/^[a-z0-9.-]+$/i.test(clean)) throw new Error('Странный домен');
  const j = await (await fetch(`https://dns.google/resolve?name=${encodeURIComponent(clean)}&type=A`, UA)).json();
  const recs = (j.Answer || []).map((a) => `• <code>${a.name}</code> → <code>${a.data}</code> (TTL ${a.TTL})`);
  if (!recs.length) throw new Error('A-записей не найдено');
  return `🧬 <b>DNS: ${clean}</b>\n${recs.join('\n')}`;
}

export async function httpStatus(url) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const t0 = Date.now();
  const res = await fetch(url, { redirect: 'follow', ...UA }).catch(() => null);
  if (!res) throw new Error('Хост недоступен');
  const ms = Date.now() - t0;
  const hdr = [...res.headers.entries()].slice(0, 8).map(([k, v]) => `  ${k}: ${String(v).slice(0, 60)}`).join('\n');
  return `📶 <b>HTTP ${res.status}</b>\n🔗 ${res.url.replace(/</g, '&lt;')}\n⏱ ${ms} мс · редирект: ${res.redirected ? 'да' : 'нет'}\n<pre>${hdr.replace(/</g, '&lt;')}</pre>`;
}

export async function uaCheck(reqHeaders) {
  const ua = reqHeaders?.get?.('user-agent') || navigator.userAgent;
  return `🕵️ <b>User-Agent запроса:</b>\n<code>${String(ua).replace(/</g, '&lt;').slice(0, 300)}</code>\n<small>Это заголовок, с которым запрос пришёл в Cloudflare Worker.</small>`;
}

export async function telegraphPost(title, text, author = 'userRouterStudio') {
  const acc = await (await fetch(`https://api.telegra.ph/createAccount?short_name=userRouterStudio&author_name=${encodeURIComponent(author)}`, { method: 'POST' })).json();
  if (!acc.ok) throw new Error('Telegraph недоступен');
  const nodes = String(text).slice(0, 3000).split(/\n\n+/).map((p) => [{ tag: 'p', children: [p] }]);
  const res = await (await fetch('https://api.telegra.ph/createPage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: acc.result.access_token, title: title.slice(0, 200), author_name: author, content: nodes }),
  })).json();
  if (!res.ok) throw new Error(res.error || 'Ошибка публикации');
  return `📰 Опубликовано на Telegraph!\n🔗 <a href="${res.result.url}">${res.result.url}</a>`;
}

export async function horoscope(sign) {
  const s = String(sign || '').toLowerCase();
  const en = { 'овен': 'aries', 'телец': 'taurus', 'близнецы': 'gemini', 'рак': 'cancer', 'лев': 'leo', 'дева': 'virgo', 'весы': 'libra', 'скорпион': 'scorpio', 'стрелец': 'sagittarius', 'козерог': 'capricorn', 'водолей': 'aquarius', 'рыбы': 'pisces',
    aries: 'aries', taurus: 'taurus', gemini: 'gemini', cancer: 'cancer', leo: 'leo', virgo: 'virgo', libra: 'libra', scorpio: 'scorpio', sagittarius: 'sagittarius', capricorn: 'capricorn', aquarius: 'aquarius', pisces: 'pisces' };
  if (!en[s]) throw new Error('Знаки: овен, телец, близнецы, рак, лев, дева, весы, скорпион, стрелец, козерог, водолей, рыбы');
  const j = await (await fetch(`https://ohmanda.com/api/horoscope/${en[s]}`, UA)).json();
  return `🔮 <b>${sign} — гороскоп на сегодня</b>\n\n${j.horoscope || 'Звёзды молчат...'}`;
}

export async function newsFeed(query = '') {
  if (query) {
    const j = await (await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query + ' news')}&format=json&no_html=1`, UA)).json();
    return `📰 <b>${(j.heading || query).replace(/</g, '&lt;')}</b>\n${(j.abstract_text || 'Быстрого ответа по новостям нет. +news без аргументов — мировая лента.').replace(/</g, '&lt;')}`;
  }
  const xml = await (await fetch('https://feeds.bbci.co.uk/news/world/rss.xml', UA)).text();
  const items = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([^<]+)[\s\S]*?<description>(?:<!\[CDATA\[)?([^<]*)/g)].slice(0, 6);
  if (!items.length) throw new Error('Лента новостей недоступна');
  return `📰 <b>Мировые новости (BBC World):</b>\n\n` + items.map(([, t, d]) => `• <b>${t.trim().replace(/</g, '&lt;')}</b>\n  <i>${d.trim().replace(/</g, '&lt;').slice(0, 120)}</i>`).join('\n');
}

export async function youtubeSearch(q) {
  const page = await (await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, UA)).text();
  const m = /"videoId":"([\w-]{11})"/.exec(page);
  if (!m) throw new Error('Ничего не нашлось');
  return `▶️ <b>YouTube: ${q.replace(/</g, '&lt;')}</b>\n🔗 <a href="https://youtu.be/${m[1]}">https://youtu.be/${m[1]}</a>\n<small>Первое видео по релевантности.</small>`;
}

export async function gifSearchUrl(q) {
  try {
    const j = await (await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=LIVDSRZULELM&limit=1`, UA)).json();
    const g = j.results?.[0]?.media?.[0]?.gif?.url;
    if (g) return g;
  } catch {}
  return null;
}

export async function numberTrivia(n) {
  const res = await fetch(`https://numbersapi.com/${encodeURIComponent(n)}/math?json`, UA).catch(() => null);
  if (!res) throw new Error('Numbers API не ответил');
  const d = await res.json();
  return `🔢 <b>${String(d.text).replace(/</g, '&lt;')}</b>`;
}

export async function triviaQuestion() {
  let j;
  try { j = await (await fetch('https://the-trivia-api.com/api/questions?limit=1', UA)).json(); }
  catch { j = null; }
  const q = Array.isArray(j) ? j[0] : j?.questions?.[0];
  if (!q) throw new Error('Викторина временно молчит');
  const shuffled = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
  const idx = shuffled.indexOf(q.correct_answer);
  return {
    text: `❓ <b>${String(q.question).replace(/</g, '&lt;')}</b>\n<small>Категория: ${q.category || '?'}</small>\n\n` + shuffled.map((a, i) => `${'ABCD'[i]}) ${String(a).replace(/</g, '&lt;')}`).join('\n'),
    answer: 'ABCD'[idx],
  };
}

export function mathGameSeed() {
  const a = 2 + Math.floor(Math.random() * 40), b = 2 + Math.floor(Math.random() * 40);
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const ans = op === '+' ? a + b : op === '-' ? a - b : a * b;
  return { q: `${a} ${op} ${b} = ?`, ans };
}

export function chooseOne(list) {
  const arr = String(list).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  if (arr.length < 2) throw new Error('Дайте хотя бы два варианта через запятую');
  return `🎲 Судьба выбирает: <b>${arr[Math.floor(Math.random() * arr.length)].replace(/</g, '&lt;')}</b>!`;
}

export function qrWifi(ssid, pass) {
  const esc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');
  const payload = `WIFI:T:WPA;S:${esc(ssid)};P:${esc(pass || '')};;`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;
}

export function wordCount(text) {
  const words = (text.match(/[\p{L}\p{N}'’-]+/gu) || []).length;
  const chars = text.length;
  const noSpace = text.replace(/\s/g, '').length;
  const lines = text.split('\n').length;
  const readMin = Math.max(1, Math.round(words / 200));
  return `📏 <b>Статистика текста</b>\nСлов: <b>${words}</b>\nСимволов (с пробелами): <b>${chars}</b>\nБез пробелов: <b>${noSpace}</b>\nСтрок: <b>${lines}</b>\nЧтение вслух: ~${readMin} мин`;
}

export async function geoLocate(lat, lon) {
  const j = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ru`, UA)).json();
  return `🗺 <b>ГЕОТОЧКА ${lat}, ${lon}</b>\n🏙 ${j.city || j.locality || '?'}\n🗾 ${j.principalSubdivision || ''} ${j.countryName || ''}\n🧭 ${j.countryCode || ''}\n🕐 Часовой пояс: ${j.utcOffset ?? '?'}`;
}

export function distanceKm(aLat, aLon, bLat, bLon) {
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  return `📏 Расстояние: <b>${km.toFixed(1)} км</b> (~${(km / 850).toFixed(2)} ч полёта ✈️)`;
}

export function censorText(text) {
  const bad = /(бля|сука|хуй|пизд|ебан|мудак|говно|пидор|шлюха|swine|damn|fuck|shit)/gi;
  let hits = 0;
  const out = String(text).replace(bad, (w) => { hits++; return w[0] + '█'.repeat(w.length - 1); });
  return { text: out, hits };
}
