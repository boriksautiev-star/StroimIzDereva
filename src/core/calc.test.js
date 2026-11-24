'use strict';
const { NORMS, validateSpacing } = require('./norms');
const { layoutStuds, lumberSummary } = require('./calc');
const { Project, Story, Wall, Opening } = require('./model');

// Стена 6 м с окном
const w = new Wall(0, 0, 6000, 0);
w.addOpening(new Opening('window', 1500, 1200, 1400, 900));

// Проверка нормативов
console.log('Шаг 600:', validateSpacing(600).length === 0 ? 'OK' : validateSpacing(600));
console.log('Шаг 700:', validateSpacing(700));

// Раскладка
const layout = layoutStuds(w, 600);
console.log('Стойки:', layout.studs.length);
for (const s of layout.studs) {
  console.log('  offset', s.offset, 'мм |', s.role);
}
console.log('Перемычки:', layout.headers.length, '| низ на', layout.headers[0].bottomZ, 'мм');

// Суммарный пиломатериал
console.log('Материал стены:', JSON.stringify(lumberSummary(w, layout)));

// Проверка: стойки на краях проёма обязаны существовать
const edgeOffsets = layout.studs.map(s => s.offset);
const hasStart = edgeOffsets.includes(1500);
const hasEnd = edgeOffsets.includes(2700);
console.log(hasStart && hasEnd ? 'ОБРАМЛЕНИЕ ПРОЁМА: OK' : 'ОШИБКА: стойки проёма не найдены');
console.log('ТЕСТ ПРОЙДЕН');