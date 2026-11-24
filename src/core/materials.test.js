'use strict';
const { buildDefaultCatalog, Catalog } = require('./materials');

const cat = buildDefaultCatalog();

// Группировка по категориям
for (const group of ['Пиломатериал', 'Крепёж']) {
  console.log('---', group, '---');
  for (const m of cat.byCategory(group)) {
    console.log(' ', m.id, m.name, '|', m.price, 'руб/' + m.unit);
  }
}

// Свой материал от пользователя
const my = cat.add({
  name: 'Доска 50x150, лиственница, сорт А',
  category: 'Пиломатериал',
  kind: 'Лиственница', grade: 'Сорт А',
  section: { w: 50, h: 150 },
  unit: 'м3', price: 28000,
  supplier: 'База "Лесторг"'
});
console.log('Добавлен свой материал:', my.id, my.name);

// Поиск доски по сечению (для будущей нормативной сверки)
const options = cat.findLumber({ w: 50, h: 150 });
console.log('Варианты 50x150:', options.map(m => m.name).join(' | '));

// Обновление цены с датой
cat.setPrice(my.id, 26500, '2026-11-25');
console.log('Новая цена:', cat.get(my.id).price, 'от', cat.get(my.id).priceDate);

// Круг: сохранить -> загрузить
const cat2 = Catalog.fromJSON(JSON.parse(JSON.stringify(cat.toJSON())));
console.log('Восстановлено материалов:', cat2.items.length);
console.log('Цена после загрузки:', cat2.get(my.id).price);
console.log('ТЕСТ ПРОЙДЕН');