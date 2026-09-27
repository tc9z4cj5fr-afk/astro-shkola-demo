/*
 * i18n.js — языки сайта (ru/en), словари, деньги и числа.
 * Подключается раньше data/*.js и экранов: здесь же создаётся window.DEMO.
 */
window.DEMO = window.DEMO || { screens: {}, data: {} };
window.DEMO.screens = window.DEMO.screens || {};
window.DEMO.data = window.DEMO.data || {};

(function (global) {
  'use strict';

  var LANGS = ['ru', 'en'];
  var STORE_KEY = 'astro-demo-lang';
  var RATE = 84.34; // ₽ за $1, ЦБ на 26.09.2026
  var LOCALES = { ru: 'ru-RU', en: 'en-US' };

  var dict = { ru: {}, en: {} };
  var listeners = [];
  var missing = [];
  var fmtCache = {};

  // Язык: сначала ?lang= в адресе, потом сохранённый, иначе русский
  function initialLang() {
    var l = null;
    try {
      var m = /[?&]lang=([a-z]{2})/i.exec(global.location.search || '');
      if (m) l = m[1].toLowerCase();
    } catch (e) { /* нет адреса */ }
    if (LANGS.indexOf(l) < 0) {
      try { l = global.localStorage.getItem(STORE_KEY); } catch (e) { l = null; }
    }
    return LANGS.indexOf(l) >= 0 ? l : 'ru';
  }

  // Вложенный словарь превращаем в плоские ключи «a.b.c»; массивы и строки храним как есть
  function flatten(obj, prefix, out) {
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      var key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = v;
    });
    return out;
  }

  function add(d) {
    if (!d) return;
    LANGS.forEach(function (l) {
      if (d[l]) flatten(d[l], '', dict[l]);
    });
  }

  function has(key) {
    return dict[I18N.lang][key] !== undefined || dict.ru[key] !== undefined;
  }

  // Текст по ключу; {name} в строке заменяется значением из vars
  function t(key, vars) {
    var v = dict[I18N.lang][key];
    if (v === undefined) v = dict.ru[key];
    if (v === undefined) {
      if (missing.indexOf(key) < 0) missing.push(key);
      return key;
    }
    if (typeof v === 'string' && vars) {
      v = v.replace(/\{(\w+)\}/g, function (m, k) {
        return vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m;
      });
    }
    return v;
  }

  // Выбор нужного из {ru, en}
  function pick(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    return obj[I18N.lang] !== undefined ? obj[I18N.lang] : obj.ru;
  }

  function fmt(opts) {
    var key = I18N.lang + JSON.stringify(opts || {});
    if (!fmtCache[key]) fmtCache[key] = new Intl.NumberFormat(LOCALES[I18N.lang], opts || {});
    return fmtCache[key];
  }

  function num(n, opts) {
    return fmt(opts).format(n);
  }

  function rubToUsd(rub) {
    return Math.round(rub / RATE);
  }

  // Деньги: ru «6 000 ₽», en «$71» по курсу. opts.step округляет рубли (например 1000)
  function money(rub, opts) {
    opts = opts || {};
    var n = Number(rub) || 0;
    if (I18N.lang === 'en') {
      return fmt({ style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 })
        .format(rubToUsd(n));
    }
    var step = opts.step || 1;
    n = Math.round(n / step) * step;
    return fmt({ maximumFractionDigits: 0 }).format(n) + ' ₽';
  }

  // Формы слова: ru [одна, две, пять], en [one, many]
  function plural(n, forms) {
    var a = Math.abs(n);
    if (I18N.lang === 'en') return a === 1 ? forms[0] : (forms[1] || forms[0]);
    var n10 = a % 10, n100 = a % 100;
    if (a % 1 !== 0) return forms[1];
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2] || forms[1];
  }

  function date(d, opts) {
    return new Intl.DateTimeFormat(LOCALES[I18N.lang], opts || { day: 'numeric', month: 'long', year: 'numeric' })
      .format(d instanceof Date ? d : new Date(d));
  }

  // Подставить тексты в разметку: data-i18n, data-i18n-html, data-i18n-attr="aria-label:key; title:key2"
  function apply(root) {
    root = root || global.document;
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-html]'), function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-attr]'), function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':');
        if (p.length === 2) el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
  }

  // Если язык пришёл из адреса, меняем его и там, чтобы обновление страницы не вернуло старый
  function syncUrl(l) {
    try {
      var s = global.location.search || '';
      if (!/[?&]lang=/.test(s)) return;
      var next = s.replace(/([?&]lang=)[a-z]{2}/i, '$1' + l);
      global.history.replaceState(null, '', global.location.pathname + next + global.location.hash);
    } catch (e) { /* с диска адрес может не меняться: не страшно */ }
  }

  function setLang(l) {
    if (LANGS.indexOf(l) < 0 || l === I18N.lang) return;
    I18N.lang = l;
    try { global.localStorage.setItem(STORE_KEY, l); } catch (e) { /* без памяти тоже работает */ }
    syncUrl(l);
    if (global.document) {
      global.document.documentElement.lang = l;
      apply(global.document);
    }
    listeners.slice().forEach(function (cb) {
      try { cb(l); } catch (e) { if (global.console) console.error(e); }
    });
  }

  function onChange(cb) {
    if (typeof cb === 'function') listeners.push(cb);
  }

  var I18N = {
    lang: initialLang(),
    langs: LANGS,
    rate: RATE,
    locale: function () { return LOCALES[I18N.lang]; },
    add: add,
    has: has,
    t: t,
    pick: pick,
    setLang: setLang,
    onChange: onChange,
    apply: apply,
    money: money,
    rubToUsd: rubToUsd,
    num: num,
    plural: plural,
    date: date,
    missing: missing
  };
  global.I18N = I18N;
  if (global.document) global.document.documentElement.lang = I18N.lang;

  // ---------- Общие тексты каркаса ----------
  add({
    ru: {
      brand: {
        name: 'Лестница звёзд',
        full: 'Лестница звёзд',
        sub: 'школа астрологии · рабочее название',
        home: 'Лестница звёзд, на главную',
        title: 'демо онлайн-школы астрологии'
      },
      strip: { text: 'Демо-версия: цифры, люди и ответы условные' },
      skip: 'Перейти к содержанию',
      lang: { label: 'Язык сайта', ru: 'Русский', en: 'English' },
      menu: { open: 'Открыть меню', close: 'Закрыть меню', title: 'Разделы' },
      nav: {
        label: 'Разделы сайта',
        group: { students: 'Для учеников', founder: 'Для автора школы' },
        home: 'Главная',
        karta: 'Бесплатная карта',
        put: 'Путь обучения',
        kabinet: 'Кабинет ученика',
        katalog: 'Астрологи школы',
        model: 'Модель',
        panel: 'Панель эксперта'
      },
      footer: {
        legal: 'Обучение астрологии. Не прогноз и не медицинская, финансовая или юридическая рекомендация. Демо-версия, рабочее название.'
      },
      tag: {
        example: 'пример',
        fictional: 'вымышленный пример',
        'demo-text': 'демо-текст',
        canned: 'заготовленный ответ',
        hypothesis: 'гипотеза'
      },
      tour: {
        start: 'Показать за 5 минут',
        label: 'Показ за 5 минут',
        step: 'шаг {n} из {total}',
        next: 'Дальше: {name}',
        finish: 'Завершить показ',
        exit: 'Выйти из показа'
      },
      common: {
        building: 'Экран в сборке',
        buildingNote: 'Скоро здесь появится содержимое.',
        screenError: 'Этот экран не открылся. Попробуйте обновить страницу.',
        close: 'Закрыть',
        demoStub: 'Это демо: здесь ничего не отправляется.',
        more: 'Подробнее',
        tip: 'Подсказка',
        noscript: 'Для демо нужен включённый JavaScript.'
      }
    },
    en: {
      brand: {
        name: 'Star Ladder',
        full: 'Star Ladder School of Astrology',
        sub: 'School of Astrology · working name',
        home: 'Star Ladder, home page',
        title: 'online astrology school demo'
      },
      strip: { text: 'Demo version: figures, people and answers are illustrative' },
      skip: 'Skip to content',
      lang: { label: 'Site language', ru: 'Русский', en: 'English' },
      menu: { open: 'Open menu', close: 'Close menu', title: 'Sections' },
      nav: {
        label: 'Site sections',
        group: { students: 'For students', founder: 'For the school founder' },
        home: 'Home',
        karta: 'Free chart',
        put: 'Learning path',
        kabinet: 'Student area',
        katalog: 'School astrologers',
        model: 'The model',
        panel: 'Expert dashboard'
      },
      footer: {
        legal: 'Astrology education. Not a prediction and not medical, financial or legal advice. Demo version, working name.'
      },
      tag: {
        example: 'example',
        fictional: 'fictional example',
        'demo-text': 'demo text',
        canned: 'pre-written answer',
        hypothesis: 'hypothesis'
      },
      tour: {
        start: 'Show it in 5 minutes',
        label: '5-minute tour',
        step: 'step {n} of {total}',
        next: 'Next: {name}',
        finish: 'Finish the tour',
        exit: 'Leave the tour'
      },
      common: {
        building: 'This screen is being built',
        buildingNote: 'Content will appear here soon.',
        screenError: 'This screen did not open. Please try reloading the page.',
        close: 'Close',
        demoStub: 'This is a demo: nothing is sent from here.',
        more: 'More',
        tip: 'Hint',
        noscript: 'The demo needs JavaScript turned on.'
      }
    }
  });

})(window);
