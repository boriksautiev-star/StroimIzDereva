'use strict';

// ============================================================
// core/model.js — модель дома. Только данные и логика,
// никакой графики. Схема сохранения: SCHEMA_VERSION = 1.
// section: w — ширина лицевой стороны доски (шаг стоек),
//          h — глубина доски = толщина стены.
// ============================================================

const SCHEMA_VERSION = 1;

class IdGen {
  constructor() { this._next = 1; }
  next(prefix) { return prefix + '-' + String(this._next++).padStart(4, '0'); }
  static fromJSON(o) { const g = new IdGen(); g._next = o.next || 1; return g; }
  toJSON() { return { next: this._next }; }
}

// --- Проём в стене: окно или дверь ---
class Opening {
  constructor(type, offset, width, height, sill = 0) {
    this.id = null;
    this.type = type;        // 'window' | 'door'
    this.offset = offset;    // от начала стены, мм
    this.width = width;      // мм
    this.height = height;    // мм
    this.sill = sill;        // подоконник, мм от низа стены
    this.materialId = null;  // заполнение — ссылка на материал
  }
}

// --- Стена ---
class Wall {
  constructor(x1, y1, x2, y2, height = 2800, section = { w: 38, h: 140 }) {
    this.id = null;
    this.x1 = x1; this.y1 = y1;   // мм, начало
    this.x2 = x2; this.y2 = y2;   // мм, конец
    this.height = height;          // мм
    this.section = { w: section.w, h: section.h }; // доска каркаса
    this.thickness = this.section.h; // толщина стены = глубина доски
    this.openings = [];
    this.materialId = null;
    this.skinOutId = null;
    this.skinInId = null;
    this.insulationId = null;
  }
  length() {
    return Math.hypot(this.x2 - this.x1, this.y2 - this.y1);
  }
  addOpening(opening) {
    opening.id = null;
    this.openings.push(opening);
  }
}

// --- Этаж ---
class Story {
  constructor(name, elevation) {
    this.id = null;
    this.name = name;
    this.elevation = elevation;
    this.walls = [];
    this.floorId = null;
  }
}

// --- Проект целиком ---
class Project {
  constructor(name = 'Новый проект') {
    this.schemaVersion = SCHEMA_VERSION;
    this.name = name;
    this.idGen = new IdGen();
    this.stories = [];
    this.roof = null;
    this.materials = [];
  }

  assignIds() {
    for (const s of this.stories) {
      if (!s.id) s.id = this.idGen.next('story');
      for (const w of s.walls) {
        if (!w.id) w.id = this.idGen.next('wall');
        for (const o of w.openings) {
          if (!o.id) o.id = this.idGen.next('op');
        }
      }
    }
    for (const m of this.materials) {
      if (!m.id) m.id = this.idGen.next('mat');
    }
  }

  addStory(story) {
    this.stories.push(story);
    this.assignIds();
    return story;
  }

  findWall(id) {
    for (const s of this.stories)
      for (const w of s.walls)
        if (w.id === id) return w;
    return null;
  }

  toJSON() {
    this.assignIds();
    return {
      schemaVersion: SCHEMA_VERSION,
      name: this.name,
      idGen: this.idGen.toJSON(),
      stories: this.stories,
      roof: this.roof,
      materials: this.materials
    };
  }

  static fromJSON(json) {
    if (!json || json.schemaVersion !== SCHEMA_VERSION) {
      throw new Error('Неподдерживаемая версия схемы: ' +
        (json && json.schemaVersion));
    }
    const p = new Project(json.name);
    p.idGen = IdGen.fromJSON(json.idGen || {});
    p.stories = json.stories || [];
    for (const s of p.stories)
      for (const w of (s.walls || [])) {
        if (!w.section) { w.section = { w: 38, h: 140 }; }
        w.thickness = w.section.h;
      }
    p.roof = json.roof || null;
    p.materials = json.materials || [];
    return p;
  }
}

if (typeof module !== 'undefined') module.exports = { Project, Story, Wall, Opening, SCHEMA_VERSION };