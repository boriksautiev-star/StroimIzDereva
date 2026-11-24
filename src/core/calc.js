'use strict';

// ============================================================
// core/calc.js — расчётный движок. Раскладка стоек по стене
// с полным обрамлением проёмов.
// section.w — ширина лицевой стороны доски (шаг стоек),
// section.h — глубина доски = толщина стены.
// Перемычка: две доски плашмя друг на друге —
// высота = 2 × section.w, поперёк стены = section.h.
// ============================================================

const TOP_PLATES_COUNT = 2;
const HEADER_PLIES = 2; // доски перемычки — плашмя, друг на друге

function studWidth(wall) {
  return (wall.section && wall.section.w) || 38;  // лицевая ширина
}
function studDepth(wall) {
  return (wall.section && wall.section.h) || 140; // глубина доски
}

// Пересекается ли стойка [off, off+SW] с проёмом [start, end]
function studHitsOpening(off, start, end, sw) {
  sw = sw || 38;
  return off < end && off + sw > start;
}

// Возвращает: { studs: [{ offset, role, y0, y1, length }],
//                headers, sills, spacing }
function layoutStuds(wall, spacing) {
  spacing = spacing || 600;
  const SW = studWidth(wall);
  const SD = studDepth(wall);
  const L = wall.length();
  const wallH = wall.height;
  const studs = [];
  const fullBottom = SW;                         // верх нижней обвязки (плашмя)
  const fullTop = wallH - SW * TOP_PLATES_COUNT; // низ верхней обвязки

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
      if (studHitsOpening(off, op.offset, op.offset + op.width, SW)) {
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
    const headerTop = headerBottom + HEADER_PLIES * SW; // плашмя: 2 доски стопкой

    // king снаружи проёма, jack внутри под концами перемычки
    addStud(s - SW, 'king', fullBottom, fullTop);
    addStud(e, 'king', fullBottom, fullTop);
    addStud(s, 'jack', fullBottom, headerBottom);
    addStud(e - SW, 'jack', fullBottom, headerBottom);

    headers.push({
      offset: s,
      width: op.width,
      height: HEADER_PLIES * SW,  // плашмя: высота = две толщины лицевой стороны
      thickness: SD,              // поперёк стены — вся глубина доски
      bottomZ: headerBottom
    });

    // Укороченные над перемычкой
    for (let off = spacing; off + SW <= e; off += spacing) {
      if (off <= s) continue;
      addStud(off, 'cripple', headerTop, fullTop);
    }

    // Окно: подоконная доска (плашмя) + стойки под ней
    if (op.type === 'window') {
      sills.push({ offset: s, width: op.width, z0: op.sill - SW, z1: op.sill });
      if (op.sill - SW > fullBottom) {
        for (let off = spacing; off + SW <= e; off += spacing) {
          if (off <= s) continue;
          addStud(off, 'cripple', fullBottom, op.sill - SW);
        }
      }
    }
  }

  studs.sort((a, b) => a.offset - b.offset || a.y0 - b.y0);
  return { studs, headers, sills, spacing };
}

// Сводка по материалу: погонные метры доски на стену
function lumberSummary(wall, layout) {
  const meters = layout.studs.reduce((sum, s) => sum + s.length, 0) / 1000;
  const headersM = layout.headers.reduce((sum, h) =>
    sum + (h.width / 1000) * HEADER_PLIES, 0);
  const sillsM = (layout.sills || []).reduce((sum, sl) => sum + sl.width / 1000, 0);
  const platesM = wall.length() * (1 + TOP_PLATES_COUNT) / 1000;
  return {
    studsCount: layout.studs.length,
    studsMeters: Math.round(meters * 100) / 100,
    headersMeters: Math.round(headersM * 100) / 100,
    sillsMeters: Math.round(sillsM * 100) / 100,
    platesMeters: Math.round(platesM * 100) / 100,
    section: wall.section
  };
}

if (typeof module !== 'undefined') {
  module.exports = { layoutStuds, lumberSummary, studHitsOpening, studWidth, studDepth };
}