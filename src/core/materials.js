// ============================================================
// core/materials.js — каталог материалов: категории, цены
// с датой фиксации, добавление своих материалов.
// Только данные и логика, без графики.
// ============================================================
'use strict';

const CATEGORIES = [
  'Пиломатериал',
  'Каркас металл',
  'Утеплители',
  'Плёнки и пароизоляция',
  'Плиты (ОСБ, ГКЛ)',
  'Кровля',
  'Крепёж',
  'Отделка'
];

function idNum(id) {
  // 'mat-0007' -> 7
  const parts = id.split('-');
  return parseInt(parts[parts.length - 1], 10) || 0;
}

// Создание материала. Поля зависят от категории:
//   Пиломатериал: kind (порода), grade (сорт), section {w,h}, unit 'м3'
//   Плиты:        size {len,w}, thickness, unit 'шт'
//   Остальные:    unit ('м2','упак','шт','кг') и цена за единицу
function createMaterial(props) {
  if (!props.name) throw new Error('Материал без названия');
  if (!props.category || !CATEGORIES.includes(props.category)) {
    throw new Error('Неизвестная категория: ' + props.category);
  }
  return {
    id: null,
    name: props.name,
    category: props.category,
    kind: props.kind || null,        // порода / тип
    grade: props.grade || null,      // сорт
    section: props.section || null,  // {w,h} мм — пиломатериал
    size: props.size || null,        // {len,w} мм — листовые
    thickness: props.thickness || null,
    unit: props.unit || 'шт',
    price: props.price || null,      // руб за единицу
    priceDate: props.priceDate || null,
    supplier: props.supplier || null,
    note: props.note || null
  };
}

// Стартовый каталог. Цены — базовые заглушки 2026 г.,
// пользователь заменяет их своими через setPrice().
function buildDefaultCatalog() {
  const c = new Catalog();
  const seed = [
    createMaterial({ name: 'Доска 38x89, сосна, сорт 1', category: 'Пиломатериал',
      kind: 'Сосна', grade: 'Сорт 1', section: { w: 38, h: 89 }, unit: 'м3', price: 13000 }),
    createMaterial({ name: 'Доска 38x140, сосна, сорт 1', category: 'Пиломатериал',
      kind: 'Сосна', grade: 'Сорт 1', section: { w: 38, h: 140 }, unit: 'м3', price: 13500 }),
    createMaterial({ name: 'Доска 50x150, сосна, сорт 1', category: 'Пиломатериал',
      kind: 'Сосна', grade: 'Сорт 1', section: { w: 50, h: 150 }, unit: 'м3', price: 14000 }),
    createMaterial({ name: 'Доска 50x200, сосна, сорт 1', category: 'Пиломатериал',
      kind: 'Сосна', grade: 'Сорт 1', section: { w: 50, h: 200 }, unit: 'м3', price: 15000 }),
    createMaterial({ name: 'ОСБ-3, 9 мм, 2500x1250', category: 'Плиты (ОСБ, ГКЛ)',
      size: { len: 2500, w: 1250 }, thickness: 9, unit: 'шт', price: 1200 }),
    createMaterial({ name: 'Минвата, плиты 100 мм, 0,3 м3', category: 'Утеплители',
      thickness: 100, unit: 'упак', price: 1900 }),
    createMaterial({ name: 'Пароизоляция, рулон 70 м2', category: 'Плёнки и пароизоляция',
      unit: 'шт', price: 1600 }),
    createMaterial({ name: 'Профнастил С8, 0,5 мм', category: 'Кровля',
      unit: 'м2', price: 650 }),
    createMaterial({ name: 'Гвозди 90 мм, 5 кг', category: 'Крепёж',
      unit: 'упак', price: 800 }),
    createMaterial({ name: 'Саморезы по дереву 4,5x70, 500 шт', category: 'Крепёж',
      unit: 'упак', price: 700 })
  ];
  for (const m of seed) c.add(m);
  return c;
}

class Catalog {
  constructor(items) {
    this.items = items || [];
    this._next = this.items.length
      ? Math.max(...this.items.map(m => idNum(m.id))) + 1
      : 1;
  }
  add(props) {
    const m = createMaterial(props);
    m.id = 'mat-' + String(this._next++).padStart(4, '0');
    this.items.push(m);
    return m;
  }
  get(id) {
    return this.items.find(m => m.id === id) || null;
  }
  byCategory(cat) {
    return this.items.filter(m => m.category === cat);
  }
  // Все варианты доски данного сечения (для нормативной сверки)
  findLumber(section) {
    return this.items.filter(m =>
      m.category === 'Пиломатериал' &&
      m.section && m.section.w === section.w && m.section.h === section.h);
  }
  // Обновить цену с фиксацией даты
  setPrice(id, price, date) {
    const m = this.get(id);
    if (!m) throw new Error('Материал не найден: ' + id);
    m.price = price;
    m.priceDate = date || new Date().toISOString().slice(0, 10);
    return m;
  }
  toJSON() {
    return { categories: CATEGORIES, items: this.items };
  }
  static fromJSON(json) {
    for (const cat of (json.categories || [])) {
      if (!CATEGORIES.includes(cat)) {
        throw new Error('Неизвестная категория в файле: ' + cat);
      }
    }
    return new Catalog(json.items || []);
  }
}

if (typeof module !== 'undefined') module.exports = { CATEGORIES, createMaterial, buildDefaultCatalog, Catalog };