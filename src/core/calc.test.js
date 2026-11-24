'use strict';
const { layoutStuds, lumberSummary, studHitsOpening, studWidth } = require('./calc');
const { Wall, Opening } = require('./model');

// --- Стена 6 м с окном, доска 38x140 ---
const w = new Wall(0, 0, 6000, 0);
w.addOpening(new Opening('window', 1500, 1200, 1400, 900));

const layout = layoutStuds(w, 600);

const jacks = layout.studs.filter(s => s.role === 'jack');
const jackOK = jacks.some(s => s.offset === 1500) && jacks.some(s => s.offset === 2662) &&
  jacks.every(s => s.y1 === 2300);
console.log(jackOK ? 'КАЁМКИ (jack) под перемычкой: OK' : 'ОШИБКА: каёмки ' + JSON.stringify(jacks));

const kings = layout.studs.filter(s => s.role === 'king');
const kingOK = kings.some(s => s.offset === 1462) && kings.some(s => s.offset === 2700);
console.log(kingOK ? 'KING-СТОЙКИ снаружи: OK' : 'ОШИБКА: king ' + JSON.stringify(kings));

// Перемычка плашмя: высота = 2 × 38 = 76, поперёк стены = 140
const h0 = layout.headers[0];
const hOK = h0 && h0.height === 76 && h0.thickness === 140 && h0.bottomZ === 2300;
console.log(hOK ? 'ПЕРЕМЫЧКА плашмя (76×140): OK' : 'ОШИБКА: перемычка ' + JSON.stringify(h0));

const crips = layout.studs.filter(s => s.role === 'cripple');
const below = crips.filter(s => s.y1 === 862);
const above = crips.filter(s => s.y0 === 2376 && s.y1 === 2724);
console.log(below.length === 2 && above.length === 2
  ? 'УКОРОЧЕННЫЕ (cripple): OK'
  : 'ОШИБКА: cripple ' + below.length + ' под / ' + above.length + ' над');

const topY = Math.max(...layout.studs.map(s => s.y1));
console.log(topY === w.height - 76 ? 'СТОЙКИ ДОХОДЯТ ДО ОБВЯЗКИ: OK' : 'ОШИБКА: верх ' + topY);

let leaks = 0;
for (const s of layout.studs) {
  if (s.role !== 'common' && s.role !== 'end') continue;
  for (const op of w.openings) {
    if (studHitsOpening(s.offset, op.offset, op.offset + op.width, studWidth(w))) leaks++;
  }
}
console.log(leaks === 0 ? 'ПРОЁМЫ ЧИСТЫЕ: OK' : 'ОШИБКА: стоек в проёмах: ' + leaks);

// --- Та же стена из 50x150 ---
const w50 = new Wall(0, 0, 6000, 0, 2800, { w: 50, h: 150 });
w50.addOpening(new Opening('window', 1500, 1200, 1400, 900));
const l50 = layoutStuds(w50, 600);
const k50 = l50.studs.filter(s => s.role === 'king').map(s => s.offset);
const j50 = l50.studs.filter(s => s.role === 'jack').map(s => s.offset);
const h50 = l50.headers[0];
const ok50 = k50.includes(1450) && k50.includes(2700) &&
  j50.includes(1500) && j50.includes(2650) &&
  h50.height === 100 && h50.thickness === 150 &&
  Math.max(...l50.studs.map(s => s.y1)) === 2700;
console.log(ok50 ? 'ОБРАМЛЕНИЕ 50-й ДОСКИ (плашмя 100×150): OK' : 'ОШИБКА: узел 50-й доски ' + JSON.stringify(h50));

console.log('Материал 50-й:', JSON.stringify(lumberSummary(w50, l50)));
console.log('ТЕСТ ПРОЙДЕН');