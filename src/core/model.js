// ============================================================
// core/model.js — модель дома. Только данные и логика,
// никакой графики. Схема сохранения: SCHEMA_VERSION = 1.
// ============================================================
'use strict';

const SCHEMA_VERSION = 1;

// --- Единицы: внутри модели всё в миллиметрах ---

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
    this.sill = sill;        // подоконник (высота от низа стены), мм
    this.materialId = null;  // заполнение — ссылка на материал
  }
}

// --- Стена ---
class Wall {
  constructor(x1, y1, x2, y2, height = 2800, thickness = 150) {
    this.id = null;
    this.x1 = x1; this.y1 = y1;   // мм, начало
    this.x2 = x2; this.y2 = y2;   // мм, конец
    this.height = height;          // мм
    this.thickness = thickness;    // мм
    this.openings = [];            // Opening[]
    this.materialId = null;        // доска каркаса
    this.skinOutId = null;         // наружная обшивка
    this.skinInId = null;          // внутренняя
    this.insulationId = null;      // утеплитель
  }
  length() {
    return Math.hypot(this.x2 - this.x1, this.y2 - this.y1);
  }
  addOpening(opening) {
    opening.id = null; // id присвоит модель
    this.openings.push(opening);
  }
}

// --- Этаж ---
class Story {
  constructor(name, elevation) {
    this.id = null;
    this.name = name;        // 'Первый этаж', 'Мансарда'
    this.elevation = elevation; // высота низа стены, мм
    this.walls = [];         // Wall[]
    this.floorId = null;     // конструкция пола
  }
}

// --- Проект целиком ---
class Project {
  constructor(name = 'Новый проект') {
    this.schemaVersion = SCHEMA_VERSION;
    this.name = name;
    this.idGen = new IdGen();
    this.stories = [];
    this.roof = null;        // появится в следующих шагах
    this.materials = [];     // каталог материалов проекта
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

  // --- Сериализация: JSON в файл и обратно ---
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
    p.roof = json.roof || null;
    p.materials = json.materials || [];
    return p;
  }
}

// Экспорт: в браузере и в тестах
if (typeof module !== 'undefined') module.exports = { Project, Story, Wall, Opening, SCHEMA_VERSION };