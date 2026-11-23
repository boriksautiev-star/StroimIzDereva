// ============================================================
// Файл: D:/Projects/StroimIzDereva/norms/openings-norms.js
// Обрамление проёмов (окон/дверей) по СП 31-105-2002,
// упрощённая таблица. Правится блокнотом без изменения кода.
// ============================================================
'use strict';

// Перемычка (ригель) проёма: 2 доски, сечение по ширине проёма
const HEADER_RULES = [
  { maxSpan: 1.2, name: '50×150', h: 0.10 },
  { maxSpan: 2.2, name: '50×200', h: 0.10 },
  { maxSpan: 3.2, name: '50×250', h: 0.10 },
  { maxSpan: Infinity, name: '50×250', h: 0.10 }
];

function headerFor(span) {
  for (const r of HEADER_RULES) {
    if (span <= r.maxSpan) return { name: r.name, layers: 2, h: r.h };
  }
  return HEADER_RULES[HEADER_RULES.length - 1];
}

// Jack-стойки с каждой стороны: 1 обычная, 2 для широких проёмов
function jacksFor(span) {
  return span > 1.8 ? 2 : 1;
}

const CRIPPLE_SPACING = 0.6; // шаг царг, м

module.exports = { headerFor, jacksFor, CRIPPLE_SPACING, HEADER_RULES };