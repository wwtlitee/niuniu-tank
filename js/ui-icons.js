/* Shared tactical symbols: authored SVG paths, no emoji fonts or remote requests. */
(function (root) {
  'use strict';
  const paths = {
    base: 'M4 21V9l8-6 8 6v12H4Zm4 0v-7h8v7M4 10h16M10 6h4',
    wall: 'M3 7h18v14H3V7Zm0 7h18M8 7v7m8-7v7M12 14v7',
    factory: 'M3 21V10l6 3V9l6 3V4h4v17H3Zm3-4h2m4 0h2m3 0h1',
    research: 'M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10',
    house: 'm3 11 9-8 9 8M5 9v12h14V9m-10 12v-7h6v7',
    coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3 5h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9m3-10v12',
    people:
      'M8 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-5 17v-5a5 5 0 0 1 10 0v5m2-16a3 3 0 0 1 0 6m3 2a4 4 0 0 1 3 4v4',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
    turret: 'M4 20h16M6 20v-5h12v5M8 15V8h8v7m-4-7 8-5 2 3-6 4M5 11h3',
    laser: 'M3 19h11M6 19v-5h5v5M8 14l6-6 3 3-6 3M15 6l5-3m-1 5 3-1',
    tank: 'M3 15h18v6H3v-6Zm3 3h1m4 0h1m4 0h1M6 15V9h11v6M12 9V5h9M9 9V6',
    repair: 'M14 3a6 6 0 0 0-7 8l-5 7 4 4 7-7a6 6 0 0 0 8-7l-4 4-5-5 2-4',
    health: 'M8 3h8v5h5v8h-5v5H8v-5H3V8h5V3',
    attack: 'M12 3v5m0 8v5M3 12h5m8 0h5M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z',
    move: 'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4m10-8 4 4-4 4',
    stop: 'M5 5h14v14H5Z',
    patrol: 'M4 9a8 8 0 0 1 14-3l2 2M20 3v5h-5M20 15a8 8 0 0 1-14 3l-2-2M4 21v-5h5',
    upgrade: 'm5 11 7-7 7 7M5 18l7-7 7 7',
    demolish: 'm4 7 13 13M3 4l4-1 5 5-4 4-5-5V4Zm9 11 7-7',
    build: 'M4 20 16 8l-4-4 3-2 7 7-2 3-4-4M2 18l4 4',
    flag: 'M5 22V3h14l-3 5 3 5H5',
    mine: 'M3 8c5-5 12-5 18 0M12 5v16m-2-1h4',
    flame: 'M12 2c2 6-4 7-4 11 0 2 2 3 4 3 2-2 3-4 2-7 5 3 7 8 3 12H7c-7-6 0-14 5-19Z',
    blast: 'm12 2 2 6 6-4-3 7 5 3-7 1-2 7-3-6-7 3 4-7-5-4 7 1 3-7',
    zombie: 'M7 21v-4c-5-3-5-11 1-13 7-4 15 4 10 10l-1 3v4H7Zm1-11h2m4 0h2m-6 11v-3m4 3v-3',
    speed: 'm3 8 6 4-6 4m7-8 6 4-6 4m7-8 5 4-5 4',
    airstrike: 'm12 2 2 7 8 5v3l-8-2v4l3 3H7l3-3v-4l-8 2v-3l8-5 2-7',
    settings:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    audio: 'M3 9h4l5-5v16l-5-5H3V9Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16',
    star: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v6l4 2',
    close: 'm6 6 12 12M6 18 18 6',
  };
  const cache = new Map();
  function svg(key) {
    key = paths[key] ? key : 'shield';
    if (!cache.has(key))
      cache.set(
        key,
        '<svg class="uiIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
          paths[key] +
          '"/></svg>',
      );
    return cache.get(key);
  }
  root.UIIcons = { svg, keys: Object.keys(paths) };
})(typeof window === 'undefined' ? globalThis : window);
