'use strict';

// ============================================================
// core/calc.js — расчётный движок. Раскладка стоек по стене
// с полным обрамлением проёмов: king, jack, header, cripple, sill.
// Только логика, без графики.
// ============================================================

const BOTTOM_PLATE = 38;
const TOP_PLATES = 2 * 38;
const HEADER_DEPTH = 2 * 38; // сдвоенная перемычка (v5.0; по пролёту — в v5.1)

// Пересекается ли стойка [off, off+38] с проёмом [start, end]
function studHitsOpening(off, start, end) {
  return off < end && off + 38 > start;
}

// Раскладка стоек в стене.
// Возвращает: { studs: [{ offset, role, y0, y1, length }],
//                headers, sills, spacing }
// y0/y1 — низ/верх стойки от низа стены, мм.
// Узел проёма: king снаружи, jack внутри под концом перемычки,
// перемычка опирается на каёмки, под окном — подоконная доска.
function layoutStuds(wall, spacing) {
  spacing = spacing || 600;
  const L = wall.length();
  const wallH = wall.height;
  const studs = [];
  const fullBottom = BOTTOM_PLATE;      // верх нижней обвязки
  const fullTop = wallH - TOP_PLATES;   // низ верхней обвязки

  const addStud = (offset, role, y0, y1) => {
    if (offset < 0 || offset > L) return;
    for (const s of studs) {
      if (Math.abs(s.offset - offset) < 30 &&
          y0 < s.y1 - 1 && y1 > s.y0 + 1) return;
    }
    studs.push({ offset, role, y0, y1, length: y1 - y0 });
  };

  const sorted = [...wall.openings].sort((a, b) => a.offset - b.offset);

  // 1. Углы стены
  addStud(0, 'end', fullBottom, fullTop);
  addStud(L, 'end', fullBottom, fullTop);

  // 2. Рядовые стойки по шагу — не попадающие в проёмы
  for (let off = spacing; off < L; off += spacing) {
    let blocked = false;
    for (const op of sorted) {
      if (studHitsOpening(off, op.offset, op.offset + op.width)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) addStud(off, 'common', fullBottom, fullTop);
  }

  // 3. Обрамление проёмов и укороченные стойки
  const headers = [];
  const sills = [];
  for (const op of sorted) {
    const s = op.offset, e = op.offset + op.width;
    const headerBottom = op.sill + op.height;
    const headerTop = headerBottom + HEADER_DEPTH;

    // king — снаружи проёма, jack — внутри, под концами перемычки
    addStud(s - 38, 'king', fullBottom, fullTop);
    addStud(e, 'king', fullBottom, fullTop);
    addStud(s, 'jack', fullBottom, headerBottom);
    addStud(e - 38, 'jack', fullBottom, headerBottom);

    headers.push({ offset: s, width: op.width, depth: HEADER_DEPTH, bottomZ: headerBottom });

    // Укороченные над перемычкой — до верхней обвязки
    for (let off = spacing; off + 38 <= e; off += spacing) {
      if (off <= s) continue;
      addStud(off, 'cripple', headerTop, fullTop);
    }

    // Окно: подоконная доска под проёмом + стойки под ней
    if (op.type === 'window') {
      sills.push({ offset: s, width: op.width, z0: op.sill - 38, z1: op.sill });
      if (op.sill - 38 > fullBottom) {
        for (let off = spacing; off + 38 <= e; off += spacing) {
          if (off <= s) continue;
          addStud(off, 'cripple', fullBottom, op.sill - 38);
        }
      }
    }
  }

  studs.sort((a, b) => a.offset - b.offset || a.y0 - b.y0);
  return { studs, headers, sills, spacing };
}

// Сводка по материалу: сколько погонных метров доски нужно на стену
function lumberSummary(wall, layout) {
  const meters = layout.studs.reduce((sum, s) => sum + s.length, 0) / 1000;
  const headersM = layout.headers.reduce((sum, h) =>
    sum + (h.width / 1000) * 2, 0);
  const sillsM = (layout.sills || []).reduce((sum, sl) => sum + sl.width / 1000, 0);
  const platesM = wall.length() * 3 / 1000;
  return {
    studsCount: layout.studs.length,
    studsMeters: Math.round(meters * 100) / 100,
    headersMeters: Math.round(headersM * 100) / 100,
    sillsMeters: Math.round(sillsM * 100) / 100,
    platesMeters: Math.round(platesM * 100) / 100
  };
}

if (typeof module !== 'undefined') module.exports = { layoutStuds, lumberSummary, studHitsOpening };