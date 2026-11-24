'use strict';

// ============================================================
// ui/viewer3d.js — v5.9. Перемычка на ребре (высота = глубина
// доски, поперёк стены — 2 ширины). Каждому брусу добавлены
// рёбра-грани (EdgesGeometry), чтобы доски не сливались.
// Диагностическая окраска обвязки убрана — вся древесина
// натуральных цветов.
// ============================================================

class Viewer3D {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14181f);

    this.camera = new THREE.PerspectiveCamera(55, 1, 10, 500000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(-1, 2, 1.5);
    this.scene.add(dir);

    this.scene.add(new THREE.GridHelper(20000, 20, 0x3a4a5a, 0x24303a));

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.preview = null;
    this.marker = null;
    this.handleGroup = null;
    this.inputLocked = false;

    this.target = new THREE.Vector3(3000, 1400, 0);
    this.radius = 18000;
    this.theta = Math.PI / 4;
    this.phi = Math.PI / 3;

    this._raycaster = new THREE.Raycaster();

    this._bindMouse();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._animate();
  }

  screenToGround(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(ndc, this.camera);
    const o = this._raycaster.ray.origin, d = this._raycaster.ray.direction;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = -o.y / d.y;
    if (t < 0) return null;
    const p = o.clone().addScaledVector(d, t);
    return {
      x: Math.round(p.x / 100) * 100,
      z: Math.round(p.z / 100) * 100
    };
  }

  worldToScreen(x, z) {
    const v = new THREE.Vector3(x, 0, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: (v.x + 1) / 2 * rect.width + rect.left,
      y: (-v.y + 1) / 2 * rect.height + rect.top
    };
  }

  orbitBy(dx, dy) {
    this.theta += dx * 0.005;
    this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.phi - dy * 0.005));
    this._updateCamera();
  }

  showHandles(walls) {
    this.clearHandles();
    this.handleGroup = new THREE.Group();
    for (const w of walls) {
      const pts = [
        { x: w.x1, z: w.y1, end: 1 },
        { x: w.x2, z: w.y2, end: 2 }
      ];
      for (const p of pts) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(250, 250, 250),
          new THREE.MeshBasicMaterial({ color: 0x00e5a0 }));
        m.position.set(p.x, 125, p.z);
        m.userData = { wall: w, end: p.end };
        this.handleGroup.add(m);
      }
    }
    this.scene.add(this.handleGroup);
  }
  clearHandles() {
    if (this.handleGroup) {
      this.scene.remove(this.handleGroup);
      this.handleGroup = null;
    }
  }
  pickHandle(pt, tol) {
    if (!this.handleGroup) return null;
    const tolFinal = tol || Math.max(300, this.radius * 0.06);
    let best = null, bestD = tolFinal;
    for (const m of this.handleGroup.children) {
      const d = Math.hypot(m.position.x - pt.x, m.position.z - pt.z);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best ? best.userData : null;
  }

  showFirstPoint(pt) {
    this.clearFirstPoint();
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(200, 200, 200),
      new THREE.MeshBasicMaterial({ color: 0xff5544 }));
    m.position.set(pt.x, 100, pt.z);
    this.scene.add(m);
    this.marker = m;
  }
  clearFirstPoint() {
    if (this.marker) { this.scene.remove(this.marker); this.marker = null; }
  }

  clearPreview() {
    if (this.preview) {
      while (this.preview.children.length) this.preview.remove(this.preview.children[0]);
      this.root.remove(this.preview);
      this.preview = null;
    }
  }

  showPreview(x1, z1, x2, z2, section) {
    this.clearPreview();
    if (Math.hypot(x2 - x1, z2 - z1) < 100) return;
    this.preview = new THREE.Group();
    const w = new Wall(x1, z1, x2, z2, 2800, section || { w: 38, h: 140 });
    const layout = layoutStuds(w, 600);
    this._placeWall(w, layout, 0, this._colors(false), this.preview);
    this.root.add(this.preview);
  }

  _colors(selected) {
    if (selected) {
      return {
        end: 0xff5040, common: 0xffc040, king: 0x6fc2ff,
        jack: 0xaee0ff, cripple: 0xa8e07d,
        header: 0xffa050, plate: 0xd08a3a, sill: 0xd0a060, glass: 0x99ddff
      };
    }
    return {
      end: 0xd9534f, common: 0xd8a15a, king: 0x5a9bd8,
      jack: 0x9fd0ee, cripple: 0x93c47d,
      header: 0xe08840, plate: 0x8a5a2a, sill: 0xb08d55, glass: 0x88ccee
    };
  }

  _bindMouse() {
    const el = this.renderer.domElement;
    let dragBtn = null, lx = 0, ly = 0;

    el.addEventListener('contextmenu', e => e.preventDefault());

    el.addEventListener('mousedown', e => {
      dragBtn = e.button;
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('mouseup', () => { dragBtn = null; });

    window.addEventListener('mousemove', e => {
      if (dragBtn === null || dragBtn === 0 || this.inputLocked) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;

      const speed = this.radius * 0.0015;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
      this.target.addScaledVector(right, -dx * speed);
      this.target.addScaledVector(up, dy * speed);
      this._updateCamera();
    });

    el.addEventListener('wheel', e => {
      e.preventDefault();
      this.radius *= e.deltaY > 0 ? 1.1 : 0.9;
      this.radius = Math.max(2000, Math.min(100000, this.radius));
      this._updateCamera();
    }, { passive: false });
  }

  _updateCamera() {
    const sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.cos(this.theta),
      this.target.y + this.radius * cp,
      this.target.z + this.radius * sp * Math.sin(this.theta));
    this.camera.lookAt(this.target);
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.renderer.render(this.scene, this.camera);
  }

  clear() {
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    this.preview = null;
  }

  // Брус = залитая доска + тёмные рёбра-грани.
  // Возвращает группу: position/rotation задаются через _place.
  _box(parent, dx, dy, dz, color, opacity) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(dx, dy, dz),
      new THREE.MeshLambertMaterial({
        color, transparent: !!opacity, opacity: opacity || 1 }));
    g.add(mesh);
    // Рёбра — тонкий контур чуть темнее тела доски
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({
        color: 0x201810, transparent: !!opacity,
        opacity: opacity ? Math.min(0.8, opacity || 1) : 1 }));
    g.add(edges);
    parent.add(g);
    return g;
  }

  _place(mesh, x, z, ang, y) {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ang;
    return mesh;
  }

  _placeWall(w, layout, z0, C, parent) {
    const SW = (w.section && w.section.w) || 38;  // лицевая ширина
    const SD = (w.section && w.section.h) || 140; // глубина = толщина стены
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    const L = w.length();
    if (L < 1) return 0;
    const ang = -Math.atan2(dy, dx);
    const dirx = dx / L, diry = dy / L;
    const H = w.height;
    const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;

    // Обвязки плашмя: высота SW, глубина SD — натуральный цвет
    this._place(this._box(parent, L, SW, SD, C.plate), mx, my, ang, z0 + SW / 2);
    this._place(this._box(parent, L, SW, SD, C.plate), mx, my, ang, z0 + H - SW * 1.5);
    this._place(this._box(parent, L, SW, SD, C.plate), mx, my, ang, z0 + H - SW / 2);

    // Стойки — пластинки: ширина SW, глубина SD
    for (const s of layout.studs) {
      const cx = w.x1 + dirx * (s.offset + SW / 2);
      const cz = w.y1 + diry * (s.offset + SW / 2);
      this._place(this._box(parent, SW, s.length, SD, C[s.role] || C.common),
        cx, cz, ang, z0 + s.y0 + s.length / 2);
    }

    // Перемычка на ребре: высота SD, поперёк стены 2 × SW
    for (const h of layout.headers) {
      const cx = w.x1 + dirx * (h.offset + h.width / 2);
      const cz = w.y1 + diry * (h.offset + h.width / 2);
      this._place(this._box(parent, h.width, h.height, h.thickness, C.header),
        cx, cz, ang, z0 + h.bottomZ + h.height / 2);
    }

    // Подоконная доска плашмя
    for (const sl of (layout.sills || [])) {
      const cx = w.x1 + dirx * (sl.offset + sl.width / 2);
      const cz = w.y1 + diry * (sl.offset + sl.width / 2);
      this._place(this._box(parent, sl.width, sl.z1 - sl.z0, SD, C.sill),
        cx, cz, ang, z0 + (sl.z0 + sl.z1) / 2);
    }

    // Стёкла проёмов — полупрозрачные
    for (const op of w.openings) {
      const cx = w.x1 + dirx * (op.offset + op.width / 2);
      const cz = w.y1 + diry * (op.offset + op.width / 2);
      this._place(this._box(parent, op.width, op.height, SD, C.glass, 0.35),
        cx, cz, ang, z0 + op.sill + op.height / 2);
    }
    return layout.studs.length;
  }

  buildFromModel(project, spacing, selectedIds) {
    this.clear();
    spacing = spacing || 600;
    const sel = selectedIds || new Set();
    let studsTotal = 0;
    for (const story of project.stories) {
      for (const w of story.walls) {
        const layout = layoutStuds(w, spacing);
        studsTotal += this._placeWall(w, layout, story.elevation,
          this._colors(sel.has(w.id)), this.root);
      }
    }
    this._updateCamera();
    return { studsTotal };
  }
}