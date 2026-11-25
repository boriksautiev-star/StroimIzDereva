'use strict';

// ============================================================
// core/calc.js — v5.16. Укосины (врезные, СП 31-105-2002):
// торцы запилены горизонтально, упор плотный в обвязки,
// пробег не более 6000 мм, толщина в паз = ширине доски стены.
// Защита от растяжения по высоте: элементы короче 50 мм
// не создаются (укороченные стойки при впритык сжатой стене).
// ============================================================

const TOP_PLATES_COUNT = 2;
const HEADER_PLIES = 2;

const BRACE_MIN_SEGMENT = 1200;
const BRACE_MAX_RUN = 6000;
const BRACE_MAX_ANGLE = 60;
const BRACE_HEIGHT = 100;
const MIN_ELEMENT_MM = 50; // минимальная длина элемента каркаса

function studWidth(wall) {
  return (wall.section && wall.section.w) || 38;
}
function studDepth(wall) {
  return (wall.section && wall.section.h) || 140;
}

function studHitsOpening(off, start, end, sw) {
  sw = sw || 38;
  return off < end && off + sw > start;
}

// Сплошные участки стены (края + зоны проёмов с king исключены)
function solidSegments(wall) {
  const SW = studWidth(wall);
  const L = wall.length();
  const bars = [[0, L]];
  const sorted = [...wall.openings].sort((a, b) => a.offset - b.offset);
  for (const op of sorted) {
    const s = op.offset - SW, e = op.offset + op.width + SW;
    const next = [];
    for (const [a, b] of bars) {
      if (e <= a || s >= b) { next.push([a, b]); continue; }
      if (s > a) next.push([a, Math.min(s, b)]);
      if (e < b) next.push([Math.max(e, a), b]);
    }
    bars.length = 0;
    bars.push(...next);
  }
  return bars.filter(([a, b]) => b - a >= BRACE_MIN_SEGMENT);
}

// Укосины: центральная линия + запил торцов
function layoutBraces(wall) {
  const SW = studWidth(wall);
  const H = wall.height;
  const yBottom = SW;
  const yTop = H - SW * TOP_PLATES_COUNT;
  const fullSpan = yTop - yBottom;
  const braces = [];
  const section = { w: SW, h: BRACE_HEIGHT };

  const hw = BRACE_HEIGHT / 2;
  const m = hw / Math.sin(Math.PI / 4);

  for (const [a0, b0] of solidSegments(wall)) {
    const usable = b0 - a0 - 2 * SW;
    if (usable < 500) continue;

    let n = Math.max(1, Math.ceil(usable / BRACE_MAX_RUN));
    while (n > 1 && usable / n < BRACE_MIN_SEGMENT) n--;

    const sub = usable / n;
    for (let i = 0; i < n; i++) {
      const Lb = (i === 0) ? a0 + SW : a0 + SW + i * sub;
      const Rb = (i === n - 1) ? b0 - SW : a0 + SW + (i + 1) * sub;
      const span = Rb - Lb - 2 * m;
      if (span < 400) continue;

      let dx, dy;
      if (span >= fullSpan) {
        dx = fullSpan; dy = fullSpan;
      } else {
        dx = span;
        dy = Math.min(fullSpan, dx * Math.tan(BRACE_MAX_ANGLE * Math.PI / 180));
      }
      const x0 = Lb + m;
      const s = Math.sin(Math.atan2(dy, dx));
      braces.push({
        x0, y0: yBottom,
        x1: x0 + dx, y1: yBottom + dy,
        flushLeft: Math.round((x0 - hw / s) * 10) / 10,
        flushRight: Math.round((x0 + dx + hw / s) * 10) / 10,
        length: Math.round(Math.hypot(dx, dy)),
        angle: Math.round(Math.atan2(dy, dx) * 180 / Math.PI * 10) / 10,
        section: { ...section }
      });
    }
  }
  return braces;
}

function rigidityStatus(wall, layout) {
  const n = (layout.braces || []).length;
  return n > 0
    ? { status: 'ok', braces: n }
    : { status: 'alternative', braces: 0 };
}

function layoutStuds(wall, spacing) {
  spacing = spacing || 600;
  const SW = studWidth(wall);
  const SD = studDepth(wall);
  const L = wall.length();
  const wallH = wall.height;
  const studs = [];
  const fullBottom = SW;
  const fullTop = wallH - SW * TOP_PLATES_COUNT;

  const addStud = (offset, role, y0, y1) => {
    if (offset < 0 || offset > L) return;
    if (y1 - y0 < MIN_ELEMENT_MM) return; // защиты от вырожденных элементов
    for (const s of studs) {
      if (Math.abs(s.offset - offset) < 30 &&
          y0 < s.y1 - 1 && y1 > s.y0 + 1) return;
    }
    studs.push({ offset, role, y0, y1, length: y1 - y0 });
  };

  const sorted = [...wall.openings].sort((a, b) => a.offset - b.offset);

  addStud(0, 'end', fullBottom, fullTop);
  addStud(L, 'end', fullBottom, fullTop);

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

  const headers = [];
  const sills = [];
  for (const op of sorted) {
    const s = op.offset, e = op.offset + op.width;
    const headerBottom = op.sill + op.height;
    const headerTop = headerBottom + HEADER_PLIES * SW;

    addStud(s - SW, 'king', fullBottom, fullTop);
    addStud(e, 'king', fullBottom, fullTop);
    addStud(s, 'jack', fullBottom, headerBottom);
    addStud(e - SW, 'jack', fullBottom, headerBottom);

    headers.push({
      offset: s,
      width: op.width,
      height: HEADER_PLIES * SW,
      thickness: SD,
      bottomZ: headerBottom
    });

    for (let off = spacing; off + SW <= e; off += spacing) {
      if (off <= s) continue;
      addStud(off, 'cripple', headerTop, fullTop);
    }

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

  const braces = layoutBraces(wall);
  const rigidity = rigidityStatus(wall, { braces });

  studs.sort((a, b) => a.offset - b.offset || a.y0 - b.y0);
  return { studs, headers, sills, braces, rigidity, spacing };
}

function lumberSummary(wall, layout) {
  const meters = layout.studs.reduce((sum, s) => sum + s.length, 0) / 1000;
  const headersM = layout.headers.reduce((sum, h) =>
    sum + (h.width / 1000) * HEADER_PLIES, 0);
  const sillsM = (layout.sills || []).reduce((sum, sl) => sum + sl.width / 1000, 0);
  const platesM = wall.length() * (1 + TOP_PLATES_COUNT) / 1000;
  const bracesM = (layout.braces || []).reduce((sum, br) => sum + br.length / 1000, 0);
  return {
    studsCount: layout.studs.length,
    studsMeters: Math.round(meters * 100) / 100,
    headersMeters: Math.round(headersM * 100) / 100,
    sillsMeters: Math.round(sillsM * 100) / 100,
    platesMeters: Math.round(platesM * 100) / 100,
    bracesCount: (layout.braces || []).length,
    bracesMeters: Math.round(bracesM * 100) / 100,
    rigidity: layout.rigidity,
    section: wall.section
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    layoutStuds, lumberSummary, studHitsOpening,
    studWidth, studDepth, solidSegments, layoutBraces, rigidityStatus
  };
}