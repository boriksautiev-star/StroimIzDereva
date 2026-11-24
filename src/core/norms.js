// ============================================================
// core/norms.js — нормативы как редактируемые данные.
// Позже сюда добавятся таблицы пролётов, сортамент профилей и т.д.
// ============================================================
'use strict';

const NORMS = {
  // Шаг стоек, мм (СП 31-105, табл. 6.1 и практика)
  studSpacing: {
    options: [300, 400, 500, 600],
    default: 600,
    max: 625 // предельно допустимый шаг для стен
  },

  // Сортамент пиломатериала для каркаса: ширина x высота, мм
  lumberSections: [
    { w: 38, h: 89 },  // 38x89 — лёгкие перегородки
    { w: 38, h: 140 }, // 38x140 — базовая несущая
    { w: 38, h: 150 },
    { w: 50, h: 150 }, // 50x150 — усиленная
    { w: 50, h: 200 }  // 50x200 — перекрытия, большие пролёты
  ],

  // Минимальное расстояние от края стены до проёма, мм
  openingEdgeMin: 100,

  // Укосины обязательны, если длина стены больше, мм
  bracingMinWallLength: 1200
};

// Проверка шага стоек: возвращает список замечаний
function validateSpacing(spacing) {
  const errs = [];
  if (!NORMS.studSpacing.options.includes(spacing)) {
    errs.push('Шаг стоек ' + spacing + ' мм не из рекомендуемых: ' +
      NORMS.studSpacing.options.join(', ') + ' мм');
  }
  if (spacing > NORMS.studSpacing.max) {
    errs.push('Шаг стоек ' + spacing + ' мм превышает предельный ' +
      NORMS.studSpacing.max + ' мм (СП 31-105)');
  }
  return errs;
}

if (typeof module !== 'undefined') module.exports = { NORMS, validateSpacing };