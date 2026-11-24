'use strict';

// ============================================================
// ui/viewer3d.js — 3D-визуализация каркаса. Ничего не считает:
// читает модель и готовую раскладку из core/calc.js.
// ЛКМ — вращение, ПКМ/СКМ — панорама, колесо — зум.
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

    this.target = new THREE.Vector3(3000, 1400, 0);
    this.radius = 18000;
    this.theta = Math.PI / 4;
    this.phi = Math.PI / 3;

    this._bindMouse();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._animate();
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
      if (dragBtn === null) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;

      if (dragBtn === 0) {
        // ЛКМ — вращение вокруг цели
        this.theta += dx * 0.005;
        this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05,
          this.phi - dy * 0.005));
      } else {
        // ПКМ или СКМ — панорама в плоскости экрана
        const speed = this.radius * 0.0015;
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
        this.target.addScaledVector(right, -dx * speed);
        this.target.addScaledVector(up, dy * speed);
      }
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
  }

  _box(dx, dy, dz, color, opacity) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(dx, dy, dz),
      new THREE.MeshLambertMaterial({
        color, transparent: !!opacity, opacity: opacity || 1 }));
    this.root.add(mesh);
    return mesh;
  }

  _place(mesh, x, z, ang, y) {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ang;
    return mesh;
  }

  // Координаты: модель (x, y) — план, z — высота.
  // В three.js: x = x, z = y (план), y = z (высота).
  buildFromModel(project, spacing) {
    this.clear();
    spacing = spacing || 600;
    const C = {
      end: 0xd9534f, common: 0xd8a15a, king: 0x5a9bd8,
      header: 0xe08840, plate: 0x8a5a2a, glass: 0x88ccee
    };
    let studsTotal = 0;

    for (const story of project.stories) {
      const z0 = story.elevation;
      for (const w of story.walls) {
        const layout = layoutStuds(w, spacing);
        studsTotal += layout.studs.length;

        const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
        const L = w.length();
        const ang = -Math.atan2(dy, dx);
        const dirx = dx / L, diry = dy / L;
        const t = w.thickness, H = w.height;
        const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;

        // Обвязка: нижняя и две верхние
        this._place(this._box(L, 38, t, C.plate), mx, my, ang, z0 + 19);
        this._place(this._box(L, 38, t, C.plate), mx, my, ang, z0 + H - 57);
        this._place(this._box(L, 38, t, C.plate), mx, my, ang, z0 + H - 19);

        // Стойки
        for (const s of layout.studs) {
          const cx = w.x1 + dirx * (s.offset + 19);
          const cz = w.y1 + diry * (s.offset + 19);
          this._place(this._box(38, s.length, t, C[s.role] || C.common),
            cx, cz, ang, z0 + 38 + s.length / 2);
        }

        // Перемычки над проёмами
        for (const h of layout.headers) {
          const cx = w.x1 + dirx * (h.offset + h.width / 2);
          const cz = w.y1 + diry * (h.offset + h.width / 2);
          this._place(this._box(h.width, 38, h.depth, C.header),
            cx, cz, ang, z0 + h.bottomZ + 19);
        }

        // Стёкла проёмов — полупрозрачные
        for (const op of w.openings) {
          const cx = w.x1 + dirx * (op.offset + op.width / 2);
          const cz = w.y1 + diry * (op.offset + op.width / 2);
          this._place(this._box(op.width, op.height, t, C.glass, 0.35),
            cx, cz, ang, z0 + op.sill + op.height / 2);
        }
      }
    }
    this._updateCamera();
    return { studsTotal };
  }
}