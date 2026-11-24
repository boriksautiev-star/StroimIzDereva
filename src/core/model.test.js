'use strict';
const { Project, Story, Wall, Opening } = require('./model');

const p = new Project('Тест');
const s = p.addStory(new Story('Первый этаж', 0));
const w = new Wall(0, 0, 6000, 0);
s.walls.push(w);
w.addOpening(new Opening('window', 1500, 1200, 1400, 900));
p.assignIds();

console.log('Стена:', w.id, 'длина', w.length(), 'мм');
console.log('Проём:', w.openings[0].id);

// Круг: сохранить -> загрузить
const json = JSON.stringify(p.toJSON());
const p2 = Project.fromJSON(JSON.parse(json));
console.log('Восстановлено стен:', p2.stories[0].walls.length,
  '| Проём:', p2.stories[0].walls[0].openings[0].id);
console.log('ТЕСТ ПРОЙДЕН');