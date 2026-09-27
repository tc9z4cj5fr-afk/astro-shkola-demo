/*
 * astro-calc.js — расчёт натальной карты в браузере.
 *
 * Обычный скрипт (не ES-модуль), чтобы работал и при открытии файла
 * напрямую (file://), и на GitHub Pages. Требует глобальный объект
 * Astronomy из библиотеки astronomy-engine (MIT), подключённой заранее:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js"></script>
 *   <script src="js/astro-calc.js"></script>
 *
 * Все расчёты — тропический зодиак, геоцентрические видимые (apparent)
 * эклиптические долготы «на дату» (с нутацией и аберрацией), как принято
 * в западной астрологии. Дома — равнодомная система от асцендента.
 */
(function (global) {
  'use strict';

  // ---------- Словари знаков зодиака ----------
  var SIGNS = [
    { ru: 'Овен',      en: 'Aries',       symbol: '♈' },
    { ru: 'Телец',     en: 'Taurus',      symbol: '♉' },
    { ru: 'Близнецы',  en: 'Gemini',      symbol: '♊' },
    { ru: 'Рак',       en: 'Cancer',      symbol: '♋' },
    { ru: 'Лев',       en: 'Leo',         symbol: '♌' },
    { ru: 'Дева',      en: 'Virgo',       symbol: '♍' },
    { ru: 'Весы',      en: 'Libra',       symbol: '♎' },
    { ru: 'Скорпион',  en: 'Scorpio',     symbol: '♏' },
    { ru: 'Стрелец',   en: 'Sagittarius', symbol: '♐' },
    { ru: 'Козерог',   en: 'Capricorn',   symbol: '♑' },
    { ru: 'Водолей',   en: 'Aquarius',    symbol: '♒' },
    { ru: 'Рыбы',      en: 'Pisces',      symbol: '♓' }
  ];

  // ---------- Словарь планет (порядок — как в выдаче computeChart) ----------
  var PLANETS = [
    { key: 'Sun',     ru: 'Солнце',   en: 'Sun',     symbol: '☉' },
    { key: 'Moon',    ru: 'Луна',     en: 'Moon',    symbol: '☽' },
    { key: 'Mercury', ru: 'Меркурий', en: 'Mercury', symbol: '☿' },
    { key: 'Venus',   ru: 'Венера',   en: 'Venus',   symbol: '♀' },
    { key: 'Mars',    ru: 'Марс',     en: 'Mars',    symbol: '♂' },
    { key: 'Jupiter', ru: 'Юпитер',   en: 'Jupiter', symbol: '♃' },
    { key: 'Saturn',  ru: 'Сатурн',   en: 'Saturn',  symbol: '♄' },
    { key: 'Uranus',  ru: 'Уран',     en: 'Uranus',  symbol: '♅' },
    { key: 'Neptune', ru: 'Нептун',   en: 'Neptune', symbol: '♆' },
    { key: 'Pluto',   ru: 'Плутон',   en: 'Pluto',   symbol: '♇' }
  ];

  // ---------- Мелкие математические помощники ----------
  function norm360(x) {
    x = x % 360;
    if (x < 0) x += 360;
    return x;
  }
  function toRad(deg) { return deg * Math.PI / 180; }
  function toDeg(rad) { return rad * 180 / Math.PI; }

  function signIndex(longitude) {
    return Math.floor(norm360(longitude) / 30) % 12;
  }

  // Градус и минута внутри знака (0-29°, 0-59′), с корректным округлением на стыке.
  function degreeInSign(longitude) {
    var lon = norm360(longitude);
    var inSign = lon % 30;
    var deg = Math.floor(inSign);
    var min = Math.round((inSign - deg) * 60);
    if (min === 60) { min = 0; deg += 1; }
    if (deg === 30) { deg = 29; min = 59; } // 29°59.9' не превращаем в «0° того же знака»
    return { degree: deg, minute: min };
  }

  function pointInfo(longitude) {
    var idx = signIndex(longitude);
    var dm = degreeInSign(longitude);
    return {
      longitude: longitude,
      sign: { index: idx, ru: SIGNS[idx].ru, en: SIGNS[idx].en, symbol: SIGNS[idx].symbol },
      degree: dm.degree,
      minute: dm.minute
    };
  }

  // «23°30′ Рыбы» / «23°30' Pisces»
  function formatLongitude(longitude, lang) {
    lang = lang === 'en' ? 'en' : 'ru';
    var idx = signIndex(longitude);
    var dm = degreeInSign(longitude);
    var name = SIGNS[idx][lang];
    var minStr = (dm.minute < 10 ? '0' : '') + dm.minute;
    return dm.degree + '°' + minStr + '′ ' + name;
  }

  // ---------- Перевод местного времени рождения в UTC ----------

  // Смещение (в минутах) часового пояса timeZone относительно UTC в момент utcDate.
  // Считаем через Intl: берём utcDate, форматируем «как если бы» это время в нужной
  // зоне, и сравниваем с исходным UTC-моментом.
  function getOffsetMinutes(utcDate, timeZone) {
    var dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    var parts = dtf.formatToParts(utcDate);
    var map = {};
    for (var i = 0; i < parts.length; i++) map[parts[i].type] = parts[i].value;
    var hour = parseInt(map.hour, 10);
    if (hour === 24) hour = 0; // некоторые движки отдают полночь как "24"
    var asIfUtc = Date.UTC(
      parseInt(map.year, 10), parseInt(map.month, 10) - 1, parseInt(map.day, 10),
      hour, parseInt(map.minute, 10), parseInt(map.second, 10)
    );
    return (asIfUtc - utcDate.getTime()) / 60000;
  }

  // Местное время рождения (год, месяц 1-12, день, час, минута) + IANA-зона -> Date в UTC.
  // Итеративный подбор: 3-4 итерации гарантированно сходятся, корректно учитывают
  // переход на летнее/зимнее время.
  function localToUtc(year, month, day, hour, minute, ianaTimeZone) {
    var target = Date.UTC(year, month - 1, day, hour, minute, 0);
    var guess = new Date(target);
    for (var i = 0; i < 4; i++) {
      var offsetMin = getOffsetMinutes(guess, ianaTimeZone);
      var next = new Date(target - offsetMin * 60000);
      if (next.getTime() === guess.getTime()) { guess = next; break; }
      guess = next;
    }
    return guess;
  }

  // Тот же перевод, но когда зона неизвестна — просто фиксированное смещение в часах
  // (например +3 для Москвы). offsetHours — «местное минус UTC», как в быту.
  function localToUtcOffset(year, month, day, hour, minute, offsetHours) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offsetHours * 3600000);
  }

  // ---------- Долгота планеты ----------

  // Геоцентрическая видимая (apparent) эклиптическая долгота «на дату» (тропическая).
  function eclipticLongitudeOf(bodyKey, flexibleTime) {
    var Astronomy = global.Astronomy;
    var body = Astronomy.Body[bodyKey];
    var eqj = Astronomy.GeoVector(body, flexibleTime, true); // aberration = true
    var ecl = Astronomy.Ecliptic(eqj); // переводит в истинную эклиптику даты
    return norm360(ecl.elon);
  }

  // Ретроградность: сравниваем долготу за 12 часов до и после момента расчёта.
  function isRetrograde(bodyKey, dateUtc) {
    var before = new Date(dateUtc.getTime() - 12 * 3600000);
    var after = new Date(dateUtc.getTime() + 12 * 3600000);
    var lonBefore = eclipticLongitudeOf(bodyKey, before);
    var lonAfter = eclipticLongitudeOf(bodyKey, after);
    // разница с учётом перехода через 0°/360°, в диапазоне (-180, 180]
    var diff = ((lonAfter - lonBefore + 540) % 360) - 180;
    return diff < 0;
  }

  // ---------- Основной расчёт натальной карты ----------

  function computeChart(dateUtc, latitude, longitude) {
    var Astronomy = global.Astronomy;
    if (!Astronomy) {
      throw new Error('Не найден Astronomy (astronomy-engine). Подключите скрипт библиотеки раньше astro-calc.js');
    }

    var time = Astronomy.MakeTime(dateUtc);

    // Планеты
    var planets = {};
    for (var i = 0; i < PLANETS.length; i++) {
      var p = PLANETS[i];
      var lon = eclipticLongitudeOf(p.key, time);
      var info = pointInfo(lon);
      info.retrograde = isRetrograde(p.key, dateUtc);
      info.symbol = p.symbol;
      info.name = { ru: p.ru, en: p.en };
      planets[p.key] = info;
    }

    // Асцендент и MC через местное звёздное время
    var gastHours = Astronomy.SiderealTime(time);           // гринвичское видимое звёздное время, часы
    var eps = Astronomy.e_tilt(time).tobl;                  // истинный наклон эклиптики, градусы
    var ramc = norm360(gastHours * 15 + longitude);          // RAMC, градусы (долгота: восток +)

    var ramcRad = toRad(ramc);
    var epsRad = toRad(eps);
    var phiRad = toRad(latitude);

    var mcLon = norm360(toDeg(Math.atan2(
      Math.sin(ramcRad),
      Math.cos(ramcRad) * Math.cos(epsRad)
    )));

    var ascLon = norm360(toDeg(Math.atan2(
      Math.cos(ramcRad),
      -(Math.sin(ramcRad) * Math.cos(epsRad) + Math.tan(phiRad) * Math.sin(epsRad))
    )));

    // Равнодомная система: 12 домов по 30° от асцендента
    var houses = [];
    for (var h = 0; h < 12; h++) {
      houses.push(pointInfo(norm360(ascLon + h * 30)));
    }

    return {
      dateUtc: dateUtc,
      latitude: latitude,
      longitude: longitude,
      obliquity: eps,
      siderealTimeHours: gastHours,
      planets: planets,
      ascendant: pointInfo(ascLon),
      mc: pointInfo(mcLon),
      houses: houses,
      houseSystem: 'equal' // равные дома — честно указываем систему
    };
  }

  global.AstroCalc = {
    SIGNS: SIGNS,
    PLANETS: PLANETS,
    norm360: norm360,
    signIndex: signIndex,
    degreeInSign: degreeInSign,
    formatLongitude: formatLongitude,
    localToUtc: localToUtc,
    localToUtcOffset: localToUtcOffset,
    computeChart: computeChart
  };

})(typeof window !== 'undefined' ? window : globalThis);
