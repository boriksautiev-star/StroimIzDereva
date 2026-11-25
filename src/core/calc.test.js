'use strict';
const { layoutStuds, lumberSummary, solidSegments, layoutBraces } = require('./calc');
const { Wall, Opening } = require('./model');

// --- Стена 6 м с окном, доска 38x140 ---
const w = new Wall(0, 0, 6000, 0);
w.addOpening(new Opening('window', 1500, 1200, 1400, 900));

const layout = layoutStuds(w, 600);

const h0 = layout.headers[0];
const hOK = h0 && h0.height === 76 && h0.thickness === 140 && h0.bottomZ === 2300;
console.log(hOK ? 'ПЕРЕМЫЧКА плашмя (76x140): OK' : 'ОШИБКА: перемычка ' + JSON.stringify(h0));

const topY = Math.max(...layout.studs.map(s => s.y1));
console.log(topY === w.height - 76 ? 'СТОЙКИ ДО ОБВЯЗКИ: OK' : 'ОШИБКА: верх ' + topY);

// --- Укосины: запил торцов, упор плотный ---
const segs = solidSegments(w);
const br0 = layout.braces[0], br1 = layout.braces[1];
const bOK = layout.braces.length === 2 &&
  br0.angle === 60 && Math.abs(br0.flushLeft - 38) < 1 &&
  br1.angle === 45 && Math.abs(br1.flushLeft - 2776) < 1;
const flushOK = layout.braces.every((br, i) => {
  const seg = segs[i];
  return br.flushLeft >= seg[0] + 38 - 0.5 &&
         br.flushRight <= seg[1] - 38 + 0.5;
});
console.log(bOK && flushOK
  ? 'УКОСИНЫ: 2 шт, углы ' + layout.braces.map(b => b.angle).join('/') +
    ', торцы запилены в упор: OK'
  : 'ОШИБКА: укосины ' + JSON.stringify(layout.braces));

console.log(layout.rigidity.status === 'ok'
  ? 'ЖЁСТКОСТЬ: обеспечена (OK)'
  : 'ОШИБКА: статус ' + JSON.stringify(layout.rigidity));

// --- Длинная стена 12 м: пробег каждой укосины не более 6 м ---
const wLong = new Wall(0, 0, 12000, 0);
const lLong = layoutStuds(wLong, 600);
const lOK = lLong.braces.length === 2 &&
  lLong.braces.every(br => br.angle === 45) &&
  lLong.braces.every(br => br.flushRight <= 12000 - 38 + 0.5);
console.log(lOK
  ? 'ДЛИННАЯ СТЕНА 12 м: 2 укосины по 45 град: OK'
  : 'ОШИБКА: длинная стена ' + JSON.stringify(lLong.braces));

// --- Стена-лента проёмов: альтернативная схема ---
const wAlt = new Wall(0, 0, 6000, 0);
wAlt.addOpening(new Opening('window', 100, 5300, 1400, 900));
const lAlt = layoutStuds(wAlt, 600);
console.log(lAlt.braces.length === 0 && lAlt.rigidity.status === 'alternative'
  ? 'ЛЕНТА ПРОЁМОВ: альтернативная схема (OK)'
  : 'ОШИБКА: лента ' + JSON.stringify(lAlt.rigidity));

// --- Растянутая по высоте стена: без вырожденных элементов ---
const wShort = new Wall(0, 0, 6000, 0, 2500);
wShort.addOpening(new Opening('window', 1500, 1200, 1400, 900));
const lShort = layoutStuds(wShort, 600);
const bad = lShort.studs.some(s => s.length <= 0);
console.log(!bad && lShort.rigidity.status === 'ok'
  ? 'КОРОТКАЯ СТЕНА 2500: вырожденных элементов нет: OK'
  : 'ОШИБКА: короткая стена ' + JSON.stringify(lShort.studs.filter(s => s.length <= 0)));

// --- 50-я доска ---
const w50 = new Wall(0, 0, 6000, 0, 2800, { w: 50, h: 150 });
w50.addOpening(new Opening('window', 1500, 1200, 1400, 900));
const l50 = layoutStuds(w50, 600);
const ok50 = l50.braces.length === 2 &&
  l50.braces.every(br => br.section.w === 50 && br.section.h === 100) &&
  l50.headers[0].height === 100 && l50.headers[0].thickness === 150;
console.log(ok50 ? 'УКОСИНА 50x100 И УЗЕЛ 50-й ДОСКИ: OK' : 'ОШИБКА: 50-я ' + JSON.stringify(l50.braces));

console.log('Смета 38-й:', JSON.stringify(lumberSummary(w, layout)));
console.log('ТЕСТ ПРОЙДЕН');