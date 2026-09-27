/*
 * geo.js — поиск координат города по названию через бесплатный геокодер
 * Open-Meteo (без ключа, с CORS для браузера). Обычный скрипт, не модуль.
 *
 * Подключение:
 *   <script src="js/geo.js"></script>
 *   AstroGeo.search('Ульяновск', 'ru').then(function (list) { ... });
 */
(function (global) {
  'use strict';

  var API_URL = 'https://geocoding-api.open-meteo.com/v1/search';

  // query — название города (латиницей или на языке lang), lang — 'ru'/'en'/...
  // Возвращает Promise<Array<{name, country, admin1, latitude, longitude, timezone}>>
  function search(query, lang) {
    lang = lang || 'ru';
    if (!query || !query.trim()) {
      return Promise.resolve([]);
    }
    var url = API_URL
      + '?name=' + encodeURIComponent(query.trim())
      + '&count=6'
      + '&language=' + encodeURIComponent(lang)
      + '&format=json';

    return fetch(url)
      .then(function (resp) {
        if (!resp.ok) {
          throw new Error('Геокодер ответил ошибкой: ' + resp.status);
        }
        return resp.json();
      })
      .then(function (data) {
        var results = (data && data.results) || [];
        return results.map(function (r) {
          return {
            name: r.name,
            country: r.country,
            admin1: r.admin1 || '',
            latitude: r.latitude,
            longitude: r.longitude,
            timezone: r.timezone
          };
        });
      });
  }

  global.AstroGeo = {
    search: search
  };

})(typeof window !== 'undefined' ? window : globalThis);
