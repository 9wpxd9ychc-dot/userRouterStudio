// userRouterStudio — utility integrations (all free, keyless APIs via native fetch)

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (userRouterStudio CF Worker)' } };

export async function calc(expr) {
  // Tokenizer + recursive-descent parser. No eval, no Function().
  const src = String(expr).replace(/×/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt');
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const FN = ['sqrt','abs','sin','cos','tan','asin','acos','atan','log','log2','log10','exp','round','floor','ceil','min','max','pow'];
  function parseExpr() { // + -
    let v = parseTerm();
    ws();
    while (src[i] === '+' || src[i] === '-') { const op = src[i++]; ws(); const r = parseTerm(); v = op === '+' ? v + r : v - r; ws(); }
    return v;
  }
  function parseTerm() { // * / %
    let v = parseFactor();
    ws();
    while (src[i] === '*' || src[i] === '/' || src[i] === '%') {
      const op = src[i++]; ws(); const r = parseFactor();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r; ws();
    }
    return v;
  }
  function parseFactor() { // unary
    ws();
    if (src[i] === '-') { i++; return -parseFactor(); }
    if (src[i] === '+') { i++; return parseFactor(); }
    return parsePower();
  }
  function parsePower() { // ^ right-assoc via factor chain
    const base = parseAtom();
    ws();
    if (src[i] === '^') { i++; return Math.pow(base, parseFactor()); }
    return base;
  }
  function parseAtom() {
    ws();
    if (src[i] === '(') { i++; const v = parseExpr(); ws(); if (src[i] !== ')') throw new Error('Скобка не закрыта'); i++; return v; }
    const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = /^[a-zA-Z]+/.exec(src.slice(i));
    if (id) {
      const name = id[0].toLowerCase(); i += name.length; ws();
      if (name === 'pi') return Math.PI;
      if (name === 'e' && src[i] !== '(') return Math.E;
      if (FN.includes(name)) {
        if (src[i] !== '(') throw new Error(`Нужна скобка: ${name}(...)`);
        i++; const args = [parseExpr()]; ws();
        while (src[i] === ',') { i++; ws(); args.push(parseExpr()); ws(); }
        if (src[i] !== ')') throw new Error('Скобка не закрыта'); i++;
        return applyFn(name, args);
      }
      throw new Error(`Неизвестно: ${name}`);
    }
    throw new Error('Пустое или неверное выражение');
  }
  function applyFn(n, a) {
    switch (n) {
      case 'sqrt': return Math.sqrt(a[0]); case 'abs': return Math.abs(a[0]);
      case 'sin': return Math.sin(a[0]); case 'cos': return Math.cos(a[0]); case 'tan': return Math.tan(a[0]);
      case 'asin': return Math.asin(a[0]); case 'acos': return Math.acos(a[0]); case 'atan': return Math.atan(a[0]);
      case 'log': return Math.log(a[0]); case 'log2': return Math.log2(a[0]); case 'log10': return Math.log10(a[0]);
      case 'exp': return Math.exp(a[0]); case 'round': return Math.round(a[0]);
      case 'floor': return Math.floor(a[0]); case 'ceil': return Math.ceil(a[0]);
      case 'min': return Math.min(...a); case 'max': return Math.max(...a); case 'pow': return Math.pow(a[0], a[1]);
    }
    throw new Error('fn?');
  }
  const v = parseExpr(); ws();
  if (i < src.length) throw new Error('Мусор в конце выражения');
  if (!isFinite(v)) throw new Error('Результат не является числом');
  return v;
}

export async function translate(text, target = 'en') {
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${target}`,
    UA
  );
  const j = await res.json();
  const t = j?.responseData?.translatedText;
  if (!t || /INVALID|NO QUERY/i.test(t)) throw new Error('Переводчик не смог перевести');
  return t;
}

export async function ttsRu(text) {
  // Google Translate TTS endpoint returns mp3 for a given lang
  const lang = 'ru';
  const chunks = [];
  let rest = String(text).slice(0, 480);
  while (rest.length) {
    let cut = rest.length > 200 ? rest.lastIndexOf(' ', 200) : rest.length;
    if (cut <= 0) cut = 200;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  const parts = [];
  for (const c of chunks) {
    const res = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(c.trim())}&tl=${lang}&client=tw-ob`, UA);
    if (!res.ok) throw new Error('TTS недоступен');
    parts.push(new Uint8Array(await res.arrayBuffer()));
  }
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export async function weather(city) {
  const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru`, UA)).json();
  const loc = g.results?.[0];
  if (!loc) throw new Error(`Город «${city}» не найден`);
  const w = await (await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,relative_humidity_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`,
    UA
  )).json();
  const codes = {
    0: '☀️ Ясно', 1: '🌤 Переменная облачность', 2: '⛅ Облачно с прояснениями', 3: '☁️ Пасмурно',
    45: '🌫 Туман', 48: '🌫 Изморозь', 51: '🌦 Морось', 53: '🌧 Дождь', 55: '🌧 Ливень',
    61: '🌧 Дождь', 63: '🌧 Дождь', 65: '⛈ Ливень', 71: '🌨 Снег', 73: '🌨 Снег', 75: '❄️ Метель',
    80: '🌦 Кратковременный дождь', 81: '🌧 Дождь', 82: '⛈ Ливень', 95: '⛈ Гроза', 96: '⛈ Гроза с градом', 99: '⛈ Гроза с градом',
  };
  const cur = w.current;
  let out = `🌍 <b>${loc.name}, ${loc.country ?? ''}</b>\n\n`;
  out += `${codes[cur.weather_code] ?? '🌡'} <b>${Math.round(cur.temperature_2m)}°C</b> (ощущается ${Math.round(cur.apparent_temperature)}°C)\n`;
  out += `💧 Влажность: ${cur.relative_humidity_2m}% · 🌬 Ветер: ${Math.round(cur.wind_speed_10m)} км/ч\n\n<b>Прогноз на 3 дня:</b>\n`;
  w.daily.time.forEach((d, i) => {
    out += `• ${d}: 🌡${Math.round(w.daily.temperature_2m_max[i])}°/+${Math.round(w.daily.temperature_2m_min[i])}°, 🌧${w.daily.precipitation_probability_max[i] ?? 0}%\n`;
  });
  return out;
}

export async function urban(word) {
  try {
    const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(word)}`, UA);
    const j = await res.json();
    const d = j.list?.[0];
    if (d) {
      const clean = (s) => String(s).replace(/[[\]]/g, '').slice(0, 500);
      return `📖 <b>${word}</b>\n\n<i>${clean(d.definition)}</i>\n\nПример: ${clean(d.example)}`;
    }
  } catch {}
  // fallback: Wiktionary via api
  const res = await fetch(
    `https://en.wiktionary.org/w/api.php?action=query&format=json&exintro=1&explaintext=1&titles=${encodeURIComponent(word)}`,
    UA
  );
  const j = await res.json();
  const page = Object.values(j.query?.pages ?? {})[0];
  if (page?.extract) return `📖 <b>${word}</b> (Wiktionary)\n\n${page.extract.slice(0, 600)}`;
  throw new Error('Значение не найдено');
}

export async function wiki(topic, lang = 'ru') {
  const res = await fetch(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`, UA
  );
  if (!res.ok) {
    const s = await (await fetch(
      `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(topic)}&limit=1&format=json`, UA
    )).json();
    if (!s[3]?.[0]) throw new Error('В Википедии не найдено');
    const r2 = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s[3][0])}`, UA);
    const j2 = await r2.json();
    return build(j2);
  }
  const j = await res.json();
  return build(j);
  function build(d) {
    if (!d.extract) throw new Error('Пустая статья');
    return `📚 <b>${d.title}</b>\n\n${d.extract.slice(0, 900)}\n\n🔗 <a href="${d.content_urls?.desktop?.page ?? 'https://wikipedia.org'}">Читать полностью</a>`;
  }
}

export async function shorten(url) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`, UA);
  const j = await res.json();
  if (j.shorturl) return j.shorturl;
  throw new Error(j.errormessage || 'Не удалось сократить');
}

export async function currency(base = 'USD', quote = 'RUB', amount = 1) {
  const j = await (await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`, UA)).json();
  const rate = j?.rates?.[quote];
  if (!rate) throw new Error('Пара валют не найдена');
  const val = rate * amount;
  return `💱 <b>${fmt(amount)} ${base} → ${fmt(val)} ${quote}</b>\nКурс: 1 ${base} = ${rate.toFixed(4)} ${quote}\nДата: ${j.date}`;
}
const fmt = (n) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

export async function defineWord(word) {
  const j = await (await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, UA)).json();
  const e = Array.isArray(j) ? j[0] : null;
  if (!e) throw new Error('Слово не найдено в словаре');
  const meanings = e.meanings.slice(0, 3).map((m) => {
    const defs = m.definitions.slice(0, 2).map((d) => `   • ${d.definition}`).join('\n');
    return `<b>${m.partOfSpeech}</b>\n${defs}`;
  }).join('\n\n');
  const phon = e.phonetic || e.phonetics?.find((p) => p.text)?.text || '';
  return `📖 <b>${e.word}</b> ${phon}\n\n${meanings}`;
}

export async function cryptoPrice(coin = 'bitcoin') {
  const j = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,rub&include_24hr_change=true`, UA)).json();
  const d = j[coin];
  if (!d) throw new Error('Монета не найдена (примеры: bitcoin, ethereum, toncoin, solana)');
  return `🪙 <b>${coin.toUpperCase()}</b>\n💵 $${d.usd} · 🇷🇺 ${d.rub} ₽\n📈 За 24ч: ${d.usd_24h_change?.toFixed(2)}%`;
}

export async function anime(search) {
  const j = await (await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(search)}&limit=5&sfw=true`, UA)).json();
  const list = j.data ?? [];
  if (!list.length) throw new Error('Аниме не найдено');
  return '🎌 <b>Результаты:</b>\n\n' + list.map((a) =>
    `• <b>${a.title}</b> (${a.year ?? '?'}) — ⭐${a.score ?? '—'}/10\n  👉 <a href="${a.url}">MyAnimeList</a>`
  ).join('\n');
}

export async function lyrics(artist, title) {
  const j = await (await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, UA)).json();
  if (!j.lyrics) throw new Error('Текст песни не найден');
  return `🎤 <b>${artist} — ${title}</b>\n\n${String(j.lyrics).slice(0, 3500)}`;
}

export async function qrPngUrl(text) {
  const size = text.length > 300 ? 300 : Math.min(560, Math.max(200, text.length * 3));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
}

export async function paste(text) {
  // Best-effort public pastebin; returns null on any failure (caller shows inline log instead).
  try {
    const res = await fetch('https://dpaste.org/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ content: text.slice(0, 100000), syntax: 'text', expiry_days: '1' }),
    });
    const t = await res.text();
    if (res.ok && /^https?:\/\//.test(t.trim())) return t.trim() + '/raw';
  } catch {}
  return null;
}

export function dadJoke() {
  const jokes = [
    '— Доктор, я буду жить?\n— Вы имеете в виду, на свете или вообще?',
    'Штирлиц стрелял вслепую. Слепая упала.',
    'Заговорил с компьютером на Python. Теперь он требует кормить его багами.',
    '— Почему программист путает Хэллоуин и Рождество?\n— Потому что OCT 31 == DEC 25.',
    'Умер файл index.html. Похороны были отменены — не было доступа.',
    'Жена говорит программисту: «Сходи к магазину, если будут яйца — возьми одно». Яйца были. Программист вернулся с одним хлебом... то есть с одной яйцой логики.',
    '— Алло, это прачечная?\n— No, this is Telegram bot.',
    'Купил WiFi-усилитель. Теперь ловлю интернет даже в подъезде соседа. Легально ли — не знаю.',
  ];
  return jokes[Math.floor(Math.random() * jokes.length)];
}
