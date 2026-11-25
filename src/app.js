'use strict';

// ============================================================
// app.js — v5.16. Стена ловится мышью по всей высоте лица
// (выборка по пяти уровням от обвязки до обвязки).
// PageUp/PageDown — растяжение стены по высоте (±100 мм,
// минимум по нормам и не ниже, чем вмещают проёмы),
// Shift+PageUp/PageDown — подъём/спуск отметки.
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
  const VERSION = '5.16';
  const MIN_WALL_HEIGHT = 1000; // мм — абсолютный минимум по нормам

  const project = new Project('Демо-дом v5');
  const story = project.addStory(new Story('Первый этаж', 0));

  const w1 = new Wall(0, 0, 6000, 0);
  w1.addOpening(new Opening('window', 1500, 1200, 1400, 900));
  story.walls.push(w1);
  const w2 = new Wall(6000, 0, 6000, 5000);
  w2.addOpening(new Opening('door', 2500, 900, 2100, 0));
  story.walls.push(w2);
  project.assignIds();

  const viewer = new Viewer3D(document.getElementById('scene'));
  const info = document.getElementById('info');
  const btnDraw = document.getElementById('drawBtn');
  const btnDelete = document.getElementById('deleteBtn');
  const selSection = document.getElementById('sectionSel');
  const el = viewer.renderer.domElement;

  function normSection(s) {
    if (!s) return null;
    if (typeof s === 'string') {
      const m = /(\d+)\s*[xх]\s*(\d+)/i.exec(s);
      return m ? { w: +m[1], h: +m[2] } : null;
    }
    if (typeof s === 'object') {
      const w = s.w || s.width || s.thickness;
      const h = s.h || s.height || s.breadth;
      if (w && h) return { w: +w, h: +h };
    }
    return null;
  }

  const FALLBACK = [
    { w: 38, h: 89 }, { w: 38, h: 140 }, { w: 50, h: 150 }, { w: 50, h: 200 }
  ];
  const rawSections = (typeof NORMS !== 'undefined' && NORMS.lumberSections)
    ? NORMS.lumberSections : [];
  const parsed = rawSections.map(normSection).filter(Boolean);
  const merged = [];
  const seen = new Set();
  for (const s of parsed.concat(FALLBACK)) {
    const key = s.w + 'x' + s.h;
    if (!seen.has(key)) { seen.add(key); merged.push(s); }
  }
  merged.sort((a, b) => (a.w - b.w) || (a.h - b.h));
  for (const s of merged) {
    const o = document.createElement('option');
    o.value = s.w + 'x' + s.h;
    o.textContent = 'Доска ' + s.w + '×' + s.h;
    selSection.appendChild(o);
  }
  const def = merged.findIndex(s => s.w === 38 && s.h === 140);
  if (def >= 0) selSection.selectedIndex = def;

  function currentSection() {
    const m = /^(\d+)x(\d+)$/.exec(selSection.value);
    return m ? { w: +m[1], h: +m[2] } : { w: 38, h: 140 };
  }

  // Минимальная высота стены: абсолютный минимум либо
  // самый высокий проём + перемычка (2 доски плашмя) +
  // верхняя обвязка (2 доски)
  function minWallHeight(w) {
    const SW = (w.section && w.section.w) || 38;
    let mh = MIN_WALL_HEIGHT;
    for (const op of w.openings) {
      const need = op.sill + op.height + SW * 2 + SW * 2;
      if (need > mh) mh = need;
    }
    return mh;
  }

  const SPACING = 600;
  const selected = new Set();
  let stats = viewer.buildFromModel(project, SPACING, selected);

  let drawMode = false;
  let first = null;
  let downX = 0, downY = 0;
  let dragging = null;
  let wallDrag = null;
  let orbiting = false;
  let lastMX = 0, lastMY = 0;
  let selStart = null, selCur = null;
  const rubber = document.createElement('div');
  rubber.style.cssText =
    'position:absolute;display:none;pointer-events:none;z-index:5;';
  viewer.container.style.position = 'relative';
  viewer.container.appendChild(rubber);

  window.__debug = {
    get project() { return project; },
    get story() { return story; },
    get selected() { return selected; },
    currentSection,
    viewer
  };

  function sectionsOfSelected() {
    return [...selected].map(id => {
      const w = project.findWall(id);
      return w && w.section ? w.section.w + '×' + w.section.h : '?';
    }).join(', ');
  }

  function updateInfo(extra) {
    const sec = currentSection();
    let s = 'v' + VERSION + ' | Стен: ' + story.walls.length +
      ', стоек: ' + stats.studsTotal + ', укосин: ' + stats.bracesTotal +
      ', доска: ' + sec.w + '×' + sec.h;
    if (selected.size) s += ' | выделено: ' + selected.size +
      ' (' + sectionsOfSelected() + ')';
    if (extra) s += ' | ' + extra;
    else if (drawMode) s += ' | РИСОВАНИЕ: ЛКМ — угол, ещё ЛКМ — стена (15°, Alt — свободный), ПКМ/Esc — отмена';
    else s += ' | тащить — перенос, Alt+тащить — поворот, PageUp/Down — высота, Shift+PageUp/Down — отметка, рамка — выделение, Ctrl+ЛКМ — орбита';
    info.textContent = s;
  }

  function rebuild(extra) {
    stats = viewer.buildFromModel(project, SPACING, selected);
    viewer.showHandles(story.walls.filter(w => selected.has(w.id)));
    updateInfo(extra);
  }

  function setDraw(on) {
    drawMode = on;
    btnDraw.classList.toggle('active', on);
    el.style.cursor = on ? 'crosshair' : 'default';
    first = null;
    viewer.clearPreview();
    viewer.clearFirstPoint();
    updateInfo();
  }

  btnDraw.addEventListener('click', () => setDraw(!drawMode));

  btnDelete.addEventListener('click', () => {
    if (!selected.size) { updateInfo('ничего не выделено'); return; }
    const n = selected.size;
    story.walls = story.walls.filter(w => !selected.has(w.id));
    selected.clear();
    rebuild('удалено стен: ' + n);
  });

  selSection.addEventListener('change', () => {
    const sec = currentSection();
    if (!selected.size) { updateInfo(); return; }
    for (const id of selected) {
      const w = project.findWall(id);
      if (w) { w.section = { w: sec.w, h: sec.h }; w.thickness = sec.h; }
    }
    rebuild('ПРИМЕНЕНО: ' + selected.size + ' стен(ы) -> доска ' +
      sec.w + '×' + sec.h);
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (wallDrag) {
        const w = wallDrag.wall, o = wallDrag.orig;
        w.x1 = o.x1; w.y1 = o.y1; w.x2 = o.x2; w.y2 = o.y2;
        wallDrag = null;
        viewer.inputLocked = false;
        rebuild('перемещение отменено');
        return;
      }
      if (drawMode) { first = null; viewer.clearPreview(); viewer.clearFirstPoint(); }
      else if (selected.size) { selected.clear(); rebuild(); }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !drawMode) {
      btnDelete.click();
      return;
    }
    if ((e.key === 'PageUp' || e.key === 'PageDown') && !drawMode && selected.size) {
      const d = e.key === 'PageUp' ? 100 : -100;

      if (e.shiftKey) {
        // Подъём/спуск отметки
        for (const id of selected) {
          const w = project.findWall(id);
          if (w) w.elevation = Math.max(0, (w.elevation || 0) + d);
        }
        rebuild((e.key === 'PageUp' ? 'поднято' : 'опущено') + ' на 100 мм');
        return;
      }

      // Растяжение по высоте с нормативной защитой
      let blocked = null, minH = 0;
      for (const id of selected) {
        const w = project.findWall(id);
        if (!w) continue;
        const nh = w.height + d;
        const mh = minWallHeight(w);
        if (nh < mh) { blocked = w; minH = mh; continue; }
        w.height = nh;
      }
      if (blocked) {
        rebuild('не ниже ' + minH + ' мм: мешает проём в ' + blocked.id);
      } else {
        const hs = [...selected].map(id => {
          const w = project.findWall(id);
          return w ? w.height : 0;
        }).join('/');
        rebuild('высота: ' + hs + ' мм');
      }
    }
  });

  // Выбор стены по всей высоте лица: пять уровней от низа до верха
  function pickWallScreen(mx, my) {
    let best = null, bestD = 15;
    const LEVELS = [0, 0.25, 0.5, 0.75, 1];
    for (const w of story.walls) {
      const z0 = (story.elevation || 0) + (w.elevation || 0);
      const SW = (w.section && w.section.w) || 38;
      const ys = [SW / 2,
        z0 + w.height * 0.25,
        z0 + w.height * 0.5,
        z0 + w.height * 0.75,
        z0 + w.height - SW / 2];
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = w.x1 + (w.x2 - w.x1) * t;
        const z = w.y1 + (w.y2 - w.y1) * t;
        for (const y of ys) {
          const p = viewer.worldToScreen(x, z, y);
          const d = Math.hypot(p.x - mx, p.y - my);
          if (d < bestD) { bestD = d; best = w; }
        }
      }
    }
    return best;
  }

  function rubberRect() {
    return {
      x1: Math.min(selStart.x, selCur.x), y1: Math.min(selStart.y, selCur.y),
      x2: Math.max(selStart.x, selCur.x), y2: Math.max(selStart.y, selCur.y)
    };
  }
  function showRubber() {
    const r = rubberRect();
    rubber.style.display = 'block';
    rubber.style.left = r.x1 + 'px';
    rubber.style.top = r.y1 + 'px';
    rubber.style.width = (r.x2 - r.x1) + 'px';
    rubber.style.height = (r.y2 - r.y1) + 'px';
    rubber.style.border = selCur.x < selStart.x
      ? '1px dashed #00e5a0' : '1px solid #00e5a0';
    rubber.style.background = 'rgba(0,229,160,0.08)';
  }
  function pointInRect(p, r) {
    return p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2;
  }
  function selectByRect(r, crossing, addTo) {
    const hit = new Set();
    for (const w of story.walls) {
      const N = 24;
      let fullyIn = true, touched = false;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = viewer.worldToScreen(
          w.x1 + (w.x2 - w.x1) * t, w.y1 + (w.y2 - w.y1) * t);
        if (!pointInRect(p, r)) fullyIn = false;
        else touched = true;
      }
      if (fullyIn || (crossing && touched)) hit.add(w.id);
    }
    if (!addTo) selected.clear();
    for (const id of hit) selected.add(id);
  }

  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    downX = e.clientX; downY = e.clientY;

    if (e.ctrlKey) {
      orbiting = true;
      lastMX = e.clientX; lastMY = e.clientY;
      return;
    }

    if (drawMode) return;

    const pt = viewer.screenToGround(e.clientX, e.clientY);
    if (pt) {
      const h = viewer.pickHandle(pt);
      if (h) { dragging = h; viewer.inputLocked = true; return; }
    }

    const hitWall = pickWallScreen(e.clientX, e.clientY);
    if (hitWall && pt) {
      wallDrag = {
        wall: hitWall,
        orig: { x1: hitWall.x1, y1: hitWall.y1, x2: hitWall.x2, y2: hitWall.y2 },
        startPt: pt,
        center: { x: (hitWall.x1 + hitWall.x2) / 2, z: (hitWall.y1 + hitWall.y2) / 2 },
        startAng: Math.atan2(hitWall.y2 - hitWall.y1, hitWall.x2 - hitWall.x1),
        moved: false,
        rotate: e.altKey
      };
      viewer.inputLocked = true;
      return;
    }

    selStart = { x: e.clientX, y: e.clientY };
    selCur = null;
  });

  window.addEventListener('mouseup', e => {
    if (e.button !== 0) return;
    viewer.inputLocked = false;
    const onCanvas = e.target === el;

    if (orbiting) { orbiting = false; return; }

    if (wallDrag) {
      const wd = wallDrag;
      wallDrag = null;
      if (wd.moved) {
        if (!selected.has(wd.wall.id)) {
          selected.clear();
          selected.add(wd.wall.id);
        }
        project.assignIds();
        rebuild(wd.wall.id + (wd.rotate ? ' развёрнута' : ' перемещена'));
      } else {
        if (onCanvas) {
          if (e.shiftKey) {
            if (selected.has(wd.wall.id)) selected.delete(wd.wall.id);
            else selected.add(wd.wall.id);
          } else {
            selected.clear();
            selected.add(wd.wall.id);
          }
        }
        rebuild();
      }
      return;
    }

    if (dragging) {
      dragging = null;
      if (onCanvas) rebuild();
      return;
    }

    if (!onCanvas) { selStart = null; selCur = null; rubber.style.display = 'none'; return; }

    if (drawMode) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const pt = viewer.screenToGround(e.clientX, e.clientY);
      if (!pt) return;
      if (!first) {
        first = pt;
        viewer.showFirstPoint(pt);
        updateInfo('первый угол ' + pt.x + ',' + pt.z);
      } else {
        const L = Math.hypot(pt.x - first.x, pt.z - first.z);
        if (L < 500) {
          updateInfo('слишком короткая стена (' + Math.round(L) + ' мм), минимум 500');
          return;
        }
        const sec = currentSection();
        const wall = new Wall(first.x, first.z, pt.x, pt.z, 2800, sec);
        story.walls.push(wall);
        project.assignIds();
        first = null;
        viewer.clearPreview();
        viewer.clearFirstPoint();
        rebuild('создана ' + wall.id + ', доска ' + sec.w + '×' + sec.h);
      }
      return;
    }

    if (selStart && selCur) {
      const r = rubberRect();
      selectByRect(r, selCur.x < selStart.x, e.shiftKey);
      selStart = null; selCur = null;
      rubber.style.display = 'none';
      rebuild();
      return;
    }
    selStart = null;

    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    const hit = pickWallScreen(e.clientX, e.clientY);
    if (!hit) selected.clear();
    else if (e.shiftKey) {
      if (selected.has(hit.id)) selected.delete(hit.id);
      else selected.add(hit.id);
    } else {
      selected.clear();
      selected.add(hit.id);
    }
    rebuild();
  });

  el.addEventListener('mousemove', e => {
    if (orbiting) {
      viewer.orbitBy(e.clientX - lastMX, e.clientY - lastMY);
      lastMX = e.clientX; lastMY = e.clientY;
      return;
    }

    if (!drawMode && wallDrag) {
      if (!wallDrag.moved &&
          Math.hypot(e.clientX - downX, e.clientY - downY) <= 5) return;
      const pt = viewer.screenToGround(e.clientX, e.clientY);
      if (!pt) return;
      wallDrag.moved = true;
      const w = wallDrag.wall, o = wallDrag.orig;

      if (wallDrag.rotate) {
        let da = Math.atan2(pt.z - wallDrag.center.z,
                            pt.x - wallDrag.center.x) - wallDrag.startAng;
        if (!e.shiftKey) {
          const step = Math.PI / 12;
          da = Math.round(da / step) * step;
        }
        const c = Math.cos(da), s = Math.sin(da);
        const cx = wallDrag.center.x, cz = wallDrag.center.z;
        const rot = (x, z) => {
          const dx0 = x - cx, dz0 = z - cz;
          return { x: cx + dx0 * c - dz0 * s, z: cz + dx0 * s + dz0 * c };
        };
        const p1 = rot(o.x1, o.y1), p2 = rot(o.x2, o.y2);
        w.x1 = Math.round(p1.x); w.y1 = Math.round(p1.z);
        w.x2 = Math.round(p2.x); w.y2 = Math.round(p2.z);
      } else {
        const dx = pt.x - wallDrag.startPt.x;
        const dz = pt.z - wallDrag.startPt.z;
        w.x1 = Math.round(o.x1 + dx); w.y1 = Math.round(o.y1 + dz);
        w.x2 = Math.round(o.x2 + dx); w.y2 = Math.round(o.y2 + dz);
      }
      viewer.buildFromModel(project, SPACING, selected);
      viewer.showHandles(story.walls.filter(x => selected.has(x.id)));
      return;
    }

    if (!drawMode && selStart && !dragging) {
      if (Math.hypot(e.clientX - selStart.x, e.clientY - selStart.y) > 5) {
        selCur = { x: e.clientX, y: e.clientY };
        showRubber();
      }
      return;
    }

    if (!drawMode && dragging) {
      const pt = viewer.screenToGround(e.clientX, e.clientY);
      if (!pt) return;
      const wall = dragging.wall;
      const old = { x: dragging.end === 1 ? wall.x1 : wall.x2,
                    z: dragging.end === 1 ? wall.y1 : wall.y2 };
      if (dragging.end === 1) { wall.x1 = pt.x; wall.y1 = pt.z; }
      else { wall.x2 = pt.x; wall.y2 = pt.z; }
      if (wall.length() < 500) {
        if (dragging.end === 1) { wall.x1 = old.x; wall.y1 = old.z; }
        else { wall.x2 = old.x; wall.y2 = old.z; }
        return;
      }
      viewer.buildFromModel(project, SPACING, selected);
      viewer.showHandles(story.walls.filter(w => selected.has(w.id)));
      return;
    }

    if (!drawMode || !first) return;
    const pt = viewer.screenToGround(e.clientX, e.clientY);
    if (!pt) return;
    let dx = pt.x - first.x, dz = pt.z - first.z;
    let len = Math.hypot(dx, dz);
    let ang = Math.atan2(dz, dx);
    if (!e.altKey) {
      const step = Math.PI / 12;
      ang = Math.round(ang / step) * step;
      len = Math.round(len / 100) * 100;
    }
    viewer.showPreview(first.x, first.z,
      first.x + len * Math.cos(ang), first.z + len * Math.sin(ang),
      currentSection());
  });

  el.addEventListener('contextmenu', () => {
    if (drawMode) {
      first = null;
      viewer.clearPreview();
      viewer.clearFirstPoint();
    }
  });

  updateInfo();
});