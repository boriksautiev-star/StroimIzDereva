// ============================================================
// core/calc.js — расчётный движок. Раскладка стоек по стене
// с учётом проёмов, обрамление проёмов. Только логика, без графики.
// ============================================================
'use strict';

// Раскладка стоек в стене.
// wall — Wall из model.js, spacing — шаг стоек в мм.
// Возвращает: { studs: [{ offset, length, role }], headers: [...] }
// offset — расстояние от начала стены до стойки, мм
// role: 'end' | 'common' | 'king' | 'jack' | 'cripple'
// length — длина стойки, мм (высота стены за вычетом обвязки)
function layoutStuds(wall, spacing) {
  spacing = spacing || 600;
  const L = wall.length();
  const wallH = wall.height;
  const studs = [];
  const BOTTOM_PLATE = 38;
  const TOP_PLATES = 2 * 38;

  const addStud = (offset, role) => {
    if (offset < 0 || offset > L) return;
    for (const s of studs) {
      if (Math.abs(s.offset - offset) < 30) return;
    }
    studs.push({ offset, length: wallH - BOTTOM_PLATE - TOP_PLATES, role });
  };

  addStud(0, 'end');
  addStud(L, 'end');

  for (let off = spacing; off < L; off += spacing) {
    addStud(off, 'common');
  }

  const headers = [];
  const sorted = [...wall.openings].sort((a, b) => a.offset - b.offset);
  for (const op of sorted) {
    const start = op.offset;
    const end = op.offset + op.width;
    addStud(start, 'king');
    addStud(end, 'king');
    headers.push({
      offset: start,
      width: op.width,
      depth: 2 * 38,
      bottomZ: op.sill + op.height
    });
  }

  studs.sort((a, b) => a.offset - b.offset);
  return { studs, headers, spacing };
}

// Сводка по материалу: сколько погонных метров доски нужно на стену
function lumberSummary(wall, layout) {
  const meters = layout.studs.reduce((sum, s) => sum + s.length, 0) / 1000;
  const headersM = layout.headers.reduce((sum, h) =>
    sum + (h.width / 1000) * 2, 0);
  const platesM = wall.length() * 3 / 1000;
  return {
    studsCount: layout.studs.length,
    studsMeters: Math.round(meters * 100) / 100,
    headersMeters: Math.round(headersM * 100) / 100,
    platesMeters: Math.round(platesM * 100) / 100
  };
}

if (typeof module !== 'undefined') module.exports = { layoutStuds, lumberSummary };