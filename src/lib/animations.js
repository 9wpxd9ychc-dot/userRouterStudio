// userRouterStudio — animated text effects via editMessageText
// All edits are throttled to respect Telegram limits (~1 edit/1.2s per chat safely;
// we use ~900ms and give up gracefully on flood errors).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Anim {
  constructor(tg) { this.tg = tg; }

  // run a sequence of frames onto one message (send first, then edit)
  async play(chat_id, frames, { reply_to, delay = 900, action } = {}) {
    if (!frames.length) return null;
    let msg;
    try {
      msg = await this.tg.send(chat_id, frames[0], { reply_to });
    } catch { return null; }
    for (let i = 1; i < frames.length; i++) {
      if (action) await this.tg.sendChatAction(chat_id, action);
      await sleep(delay);
      const ok = await this.tg.edit(chat_id, msg.message_id, frames[i]);
      if (ok === null) {
        // possible flood wait — back off once, then stop quietly
        await sleep(3000);
        const retry = await this.tg.edit(chat_id, msg.message_id, frames[i]);
        if (retry === null) break;
      }
    }
    return msg;
  }

  // +type — печатает по буквам
  async type(chat_id, text, { reply_to } = {}) {
    const frames = [];
    const step = Math.max(1, Math.ceil(text.length / 40)); // keep <= ~40 edits
    for (let i = step; i < text.length; i += step) frames.push(text.slice(0, i) + ' ▌');
    frames.push(text);
    return this.play(chat_id, frames, { reply_to, delay: 700, action: 'typing' });
  }

  // +hack — взлом Пентагона с прогресс-баром
  async hack(chat_id, { reply_to } = {}) {
    const stages = [
      '🖥 Инициализация эксплойта...',
      '🔓 Обход межсетевого экрана...',
      '💾 Взлом mainframe...',
      '🛰 Перехват спутникового канала...',
      '🔑 Подбор ключей шифрования...',
      '☢ Доступ к ядерному чемоданчику...',
      '🧹 Стирание логов...',
    ];
    const frames = ['```user@router:~$ ./pentagon_hack.sh --no-capcha\n```'];
    const bar = (p) => {
      const n = Math.round(p / 5);
      return '█'.repeat(n) + '░'.repeat(20 - n);
    };
    for (let s = 0; s < stages.length; s++) {
      for (let p = 0; p <= 100; p += 10) {
        frames.push(
          `🕵️ <b>ВЗЛОМ ПЕНТАГОНА</b>\n\n<code>[${bar(p)}] ${p}%</code>\n<b>${stages[s]}</b>`
        );
      }
    }
    frames.push(
      '🕵️ <b>ВЗЛОМ ПЕНТАГОНА</b>\n\n<code>[████████████████████] 100%</code>\n\n' +
      '✅ Успешно!\n\nОбнаруженные секреты:\n• кофе-машина в серверной: <b>2 уровня крепости</b>\n• пароль админа: <code>hunter2</code>\n• инопланетяне: <b>в отпуске</b>\n\n<i>Следы взлома удалены. Это был розыгрыш 😉</i>'
    );
    return this.play(chat_id, frames, { reply_to, delay: 800 });
  }

  // +love — растущее сердце
  async love(chat_id, { reply_to } = {}) {
    const small = [
      '',
      '❤️',
      '❤️ ❤️',
      '❤️ ❤️ ❤️',
      '❤️　❤️　❤️\n❤️❤️❤️❤️❤️',
      '❤️　❤️　❤️\n❤️❤️❤️❤️❤️\n❤️❤️❤️❤️❤️',
      '❤️　❤️　❤️\n❤️❤️❤️❤️❤️\n❤️❤️❤️❤️❤️\n　❤️❤️❤️',
      '❤️　❤️　❤️\n❤️❤️❤️❤️❤️\n❤️❤️❤️❤️❤️\n　❤️❤️❤️\n　　❤️',
    ];
    const frames = small.map((s, i) =>
      `<b>💘 ЛЮБОВЬ ЗАГРУЖАЕТСЯ 💘</b>\n\n${s || '♡'}\n\n<small>${'❤️'.repeat(i + 1)}</small>`
    );
    frames.push(
      '💖 <b>ЛЮБОВЬ ВЗЛОМАЛА ВАШЕ СЕРДЦЕ!</b> 💖\n\n' +
      '❤️　❤️　❤️　❤️\n❤️❤️❤️❤️❤️❤️❤️\n❤️❤️❤️❤️❤️❤️❤️\n　❤️❤️❤️❤️❤️\n　　❤️❤️❤️\n　　　❤️'
    );
    return this.play(chat_id, frames, { reply_to, delay: 900 });
  }

  // +matrix — падающий код
  async matrix(chat_id, { reply_to } = {}) {
    const chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﺋﺟﺣ01アイウエオカキクケコ';
    const rnd = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const frames = [];
    for (let i = 0; i < 8; i++) {
      frames.push('<code>' + [rnd(24), rnd(24), rnd(24), rnd(24), rnd(24)].join('\n') + '</code>\n\n🟢 <b>THE MATRIX HAS YOU...</b>');
    }
    frames.push('<code>' + [rnd(24), rnd(24), rnd(24)].join('\n') + '</code>\n\n🕶 <b>Wake up, Neo...</b>\n🐇 <b>Follow the white rabbit.</b>');
    return this.play(chat_id, frames, { reply_to, delay: 900 });
  }

  // +dice
  async dice(chat_id, { reply_to } = {}) {
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const frames = [];
    for (let i = 0; i < 6; i++) frames.push(`🎲 <b>${faces[Math.floor(Math.random() * 6)]}</b> крутится...`);
    const final = faces[Math.floor(Math.random() * 6)];
    frames.push(`🎲 <b>Результат: ${final} (${faces.indexOf(final) + 1})</b>`);
    return this.play(chat_id, frames, { reply_to, delay: 600 });
  }

  // +slot
  async slot(chat_id, { reply_to } = {}) {
    const sym = ['🍒', '🍋', '🍉', '🔔', '💎', '7️⃣'];
    const pick = () => sym[Math.floor(Math.random() * sym.length)];
    const frames = [];
    for (let i = 0; i < 6; i++) frames.push(`🎰 <b>${pick()} ${pick()} ${pick()}</b>\n<i>Крутим...</i>`);
    const a = pick(), b = pick(), c = pick();
    const win = a === b && b === c;
    frames.push(`🎰 <b>${a} ${b} ${c}</b>\n\n${win ? '🎉 ДЖЕКПОТ! Забирай миллион (фантики)! 🎉' : '😢 Не повезло. Попробуй ещё раз!'}`);
    return this.play(chat_id, frames, { reply_to, delay: 700 });
  }

  // +darts
  async darts(chat_id, { reply_to } = {}) {
    const board = [
      '　　　🎯',
      '　・　　　・',
      '・　🎯　・',
      '　・　　　・',
    ].join('\n');
    const frames = [`🎯 Цель:\n<code>${board}</code>\nПрицеливаюсь...`];
    const spots = ['📍', '📍', '📍'];
    for (let i = 0; i < 3; i++) {
      frames.push(`🎯 Метательное:\n<code>${board}</code>\n${spots.slice(0, i + 1).join(' ')} летит... 🏹`);
    }
    const score = Math.floor(Math.random() * 360) + 1;
    frames.push(`🎯 <b>Попадание! Очки: ${score}/360</b>\n${score > 300 ? '🏆 Робин Гуд одобряет!' : score > 150 ? '👍 Неплохо!' : '🙈 Мимо дерева...'}`);
    return this.play(chat_id, frames, { reply_to, delay: 800 });
  }

  // +basket
  async basket(chat_id, { reply_to } = {}) {
    const frames = [
      '🏀 Зажимаю мяч...\n\n🧍🏀',
      '🏀 Бросок!\n\n　　　🏀\n🧍　　·˙',
      '🏀 В воздухе...\n\n·˙🏀˙·\n🧍　　　🥅',
      '🏀 ...\n\n🧍　　　🏀\n　　　　🥅',
    ];
    const in_ = Math.random() > 0.35;
    frames.push(in_ ? '🏀 <b>СУКА ДА!!! ПОПАДАНИЕ! 🔥🔥🔥</b>\n\n🧍　🎉　🥅' : '🏀 <b>МИМО!</b> Кирпич! 🧱\n\n🧍　🧱　🥅');
    return this.play(chat_id, frames, { reply_to, delay: 800 });
  }

  // +football
  async football(chat_id, { reply_to } = {}) {
    const frames = [
      '⚽ Разбег...\n\n🏃  ⚽  |🥅|',
      '⚽ Удар!\n\n　🦵⚽→　|🥅|',
      '⚽ Летит...\n\n　　　⚽　|🥅|',
    ];
    const goal = Math.random() > 0.4;
    frames.push(goal ? '⚽ <b>ГОООООЛ!!! ⚽🥅🔥</b>\n\n🎉🏃 🥅⚽' : '⚽ <b>Штанга!</b> Не повезло 😤\n\n🏃　⚽⎡🥅');
    return this.play(chat_id, frames, { reply_to, delay: 800 });
  }

  // +bowling
  async bowling(chat_id, { reply_to } = {}) {
    const pins = '🎳'.repeat(0);
    const frames = [
      '🎳 Расставляю кегли...\n\n　　　🔺\n　　🔺🔺🔺\n　🔺🔺🔺🔺',
      '3.Roll... нет, БОУЛИНГ!\n\n🎳🌀 →　　🔺🔺🔺🔺',
      '🎳 Летит...\n\n　🎳 →　　🔺🔺🔺',
    ];
    const knocked = Math.floor(Math.random() * 11);
    frames.push(knocked === 10
      ? '🎳 <b>СТРАЙК!!! 🎳💥🔥</b>\n\nВсе кегли сбиты! Легенда!'
      : `🎳 <b>Сбито кеслей: ${knocked}/10</b>\n\n${pins}${'🔺'.repeat(10 - knocked)}\n${knocked >= 7 ? 'Почти страйк!' : knocked >= 3 ? 'Неплохо дляbeginner 😅' : 'Это было... мило 🥲'}`);
    return this.play(chat_id, frames, { reply_to, delay: 850 });
  }

  // +moon — фазы луны
  async moon(chat_id, { reply_to } = {}) {
    const phases = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    const names = ['Новолуние', 'Растущий серп', 'Первая четверть', 'Прибывающая', 'Полнолуние', 'Убывающая', 'Последняя четверть', 'Стареющий серп'];
    const frames = [];
    for (let i = 0; i < phases.length; i++) {
      frames.push(`${phases.join(' ')}\n\n<b>Луна:</b> ${phases[i]} ${names[i]}\n<i>Фаза ${i + 1}/8</i>`);
    }
    return this.play(chat_id, frames, { reply_to, delay: 800 });
  }

  // +clock — крутящиеся часы
  async clock(chat_id, { reply_to } = {}) {
    const hands = ['🕛', '🕧', '🕐', '🕜', '🕑', '🕝', '🕒', '🕞', '🕓', '🕟', '🕔', '🕠', '🕕', '🕡', '🕖', '🕢', '🕗', '🕣', '🕘', '🕤', '🕙', '🕥', '🕚', '🕦'];
    const frames = [];
    for (let i = 0; i < 12; i++) {
      frames.push(`🕰 <b>Время идёт...</b>\n\n${hands[(i * 2) % 24]} ${hands[(i * 2 + 6) % 24]}\n\n<code>${'▁▂▃▄▅▆▇█'.slice(i % 8)}${' '.repeat(7 - (i % 8))}</code>`);
    }
    const now = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
    frames.push(`🕰 <b>Часы остановлены!</b>\n\n🕛 Сейчас Москва: <code>${now}</code>`);
    return this.play(chat_id, frames, { reply_to, delay: 700 });
  }

  // +react — реакция эмодзи на сообщение (красивая анимация «прилипания»)
  async react(chat_id, message_id, emoji) {
    return this.tg.call('setMessageReaction', { chat_id, message_id, reaction: [{ type: 'emoji', emoji }] });
  }

  // +typewriter — печатная машинка с кареткой
  async typewriter(chat_id, text, { reply_to } = {}) {
    const frames = [];
    const t = String(text).slice(0, 300);
    const step = Math.max(1, Math.ceil(t.length / 35));
    for (let i = step; i < t.length; i += step) frames.push('<code>' + t.slice(0, i).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '▏</code>');
    frames.push('<pre>' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>\n⌨️ <i>Дзынь! Перевод каретки.</i>');
    return this.play(chat_id, frames, { reply_to, delay: 700, action: 'typing' });
  }

  // +countdown — обратный отсчёт
  async countdown(chat_id, from = 10, { reply_to } = {}) {
    const frames = [];
    for (let i = from; i >= 1; i--) {
      frames.push(`⏳ <b>Обратный отсчёт</b>\n\n${'🔢'.repeat(0)}<b style="font-size:2em">${i}</b>\n<code>${'█'.repeat(from - i)}${'░'.repeat(i)}</code>`);
    }
    frames.push('🎆 <b>НУЛЬ! ВРЕМЯ ВЫШЛО!</b> 🎊\n\n💥🚀🎉🥳🍾');
    return this.play(chat_id, frames, { reply_to, delay: 800 });
  }

  // +fireworks — фейерверк
  async fireworks(chat_id, { reply_to } = {}) {
    const bursts = ['✨', '🎇', '💥✨', '🎆', '✨💫✨', '🌟🎇🌟', '💥🎆💥'];
    const frames = [];
    for (let i = 0; i < 6; i++) {
      const row = Array.from({ length: 9 }, () => Math.random() > 0.55 ? bursts[Math.floor(Math.random() * bursts.length)] : '·').join('');
      frames.push(`🧨 <b>САЛЮТ!</b>\n\n${row}\n${Array.from({ length: 9 }, () => Math.random() > 0.6 ? bursts[Math.floor(Math.random() * bursts.length)] : ' ').join('')}\n\n<small>С Новым Годом каждый день! 🎉</small>`);
    }
    frames.push('🎆🎆🎆 <b>BOOM!</b> 🎆🎆🎆\n\n✨🎇✨🎉✨🎇✨');
    return this.play(chat_id, frames, { reply_to, delay: 750 });
  }

  // +rain — дождик
  async rain(chat_id, { reply_to } = {}) {
    const frames = [];
    for (let i = 0; i < 6; i++) {
      const drop = Array.from({ length: 12 }, () => ['🌧', '💧', '☔️', ' ', ' ', '·'][Math.floor(Math.random() * 6)]).join('');
      frames.push(`🌧 <b>Дождик идёт...</b>\n\n${drop}\n${Array.from({ length: 12 }, () => Math.random() > 0.5 ? '💧' : ' ').join('')}\n\n<i>Кап... кап... кап...</i>`);
    }
    frames.push('🌈 <b>Дождь закончился!</b>\n☀️🌈☀️\nРадуга для всех! 💖');
    return this.play(chat_id, frames, { reply_to, delay: 800 });
  }

  // +neon — неоновая вывеска
  async neon(chat_id, text, { reply_to } = {}) {
    const t = (text || 'userRouterStudio').toUpperCase().slice(0, 20);
    const styles = [`🔴 ${t} 🔴`, `🟠 ${t} 🟠`, `🟡 ${t} 🟡`, `🟢 ${t} 🟢`, `🔵 ${t} 🔵`, `🟣 ${t} 🟣`, `⚪️ ${t} ⚪️`, `💡 ${t} 💡`];
    const frames = [];
    for (let i = 0; i < 10; i++) frames.push(`<b>NEON SIGN</b>\n\n${styles[i % styles.length]}\n\n<code>${'~'.repeat((i % 3) + 1)} ток бежит по трубкам ${'~'.repeat(3 - (i % 3))}</code>`);
    frames.push(`<b>✨ ${t} ✨</b>\n\n💡 Горит. Не трогать руками. 💡`);
    return this.play(chat_id, frames, { reply_to, delay: 650 });
  }

  // +earth — вращение земли
  async earth(chat_id, { reply_to } = {}) {
    const seq = ['🌍', '🌎', '🌏'];
    const frames = [];
    for (let i = 0; i < 9; i++) {
      frames.push(`<b>🛰 Вращение планеты</b>\n\n　　{　${seq[i % 3]}　}\n🚀 ➜ 🌌\n\n<i>Оборот ${Math.floor(i / 3) + 1}/3 · скорость 1670 км/ч</i>`);
    }
    frames.push('🌍 <b>Планета Земля</b>\n\nВозраст: ~4.5 млрд лет\nНаселение: 8+ млрд\nПоложение: Млечный Путь, рукав Ориона\nСтатус: <i>крутится, не жалуются</i> ✅');
    return this.play(chat_id, frames, { reply_to, delay: 800 });
  }
}
