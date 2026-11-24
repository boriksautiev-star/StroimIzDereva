'use strict';
const { layoutStuds, lumberSummary, studHitsOpening } = require('./calc');
const { Wall, Opening } = require('./model');

// Стена 6 м с окном 1200x1400, подоконник 900
const w = new Wall(0, 0, 6000, 0);
w.addOpening(new Opening('window', 1500, 1200, 1400, 900));

const layout = layoutStuds(w, 600);
console.log('Стойки:', layout.studs.length);
for (const s of layout.studs) {
  console.log('  offset', s.offset, 'мм |', s.role, '| y', s.y0, '..', s.y1);
}

// Стойки обязаны доходить до верхней обвязки (y1 = низ верхней обвязки)
const topY = Math.max(...layout.studs.map(s => s.y1));
console.log(topY === w.height - 76
  ? 'СТОЙКИ ДОХОДЯТ ДО ОБВЯЗКИ: OK'
  : 'ОШИБКА: верх стоек ' + topY + ', ожидалось ' + (w.height - 76));

// Каёмки: внутри проёма, под концами перемычки, высотой до её низа
const jacks = layout.studs.filter(s => s.role === 'jack');
const jackOK = jacks.some(s => s.offset === 1500) && jacks.some(s => s.offset === 2662) &&
  jacks.every(s => s.y1 === 2300);
console.log(jackOK ? 'КАЁМКИ (jack) под перемычкой: OK' : 'ОШИБКА: каёмки не на месте');

// King-стойки снаружи проёма
const kings = layout.studs.filter(s => s.role === 'king');
const kingOK = kings.some(s => s.offset === 1462) && kings.some(s => s.offset === 2700);
console.log(kingOK ? 'KING-СТОЙКИ снаружи: OK' : 'ОШИБКА: king не на месте');

// Подоконная доска: под проёмом, на всю ширину окна
const sill = layout.sills[0];
const sillOK = sill && sill.offset === 1500 && sill.width === 1200 &&
  sill.z0 === 862 && sill.z1 === 900;
console.log(sillOK ? 'ПОДОКОННАЯ ДОСКА: OK' : 'ОШИБКА: подоконная доска ' + JSON.stringify(sill));

// Укороченные: под доской и над перемычкой
const crips = layout.studs.filter(s => s.role === 'cripple');
const below = crips.filter(s => s.y1 === 862);
const above = crips.filter(s => s.y0 === 2376 && s.y1 === 2724);
console.log(below.length === 2 && above.length === 2
  ? 'УКОРОЧЕННЫЕ (cripple): OK'
  : 'ОШИБКА: cripple ' + below.length + ' под / ' + above.length + ' над');

// Полноценные стойки не пересекают проём
let leaks = 0;
for (const s of layout.studs) {
  if (s.role !== 'common' && s.role !== 'end') continue;
  for (const op of w.openings) {
    if (studHitsOpening(s.offset, op.offset, op.offset + op.width)) leaks++;
  }
}
console.log(leaks === 0 ? 'ПРОЁМЫ ЧИСТЫЕ: OK' : 'ОШИБКА: стоек в проёмах: ' + leaks);

console.log('Материал стены:', JSON.stringify(lumberSummary(w, layout)));
console.log('ТЕСТ ПРОЙДЕН');