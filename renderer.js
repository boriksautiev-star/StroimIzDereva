// ============================================================
// Файл: D:/Projects/StroimIzDereva/renderer.js
// Рендер 3D-сцены (Three.js), ввод, смета, шаблоны
// Обрамление проёмов дублирует norms/openings-norms.js
// ============================================================
const RENDERER_VERSION = '4.10-frame-layout';

let state = {
  dimensions: { length: 10, width: 8, wallHeight: 3, ridgeHeight: 5.5 },
  openings: [],
  partitionsLength: 0
};
let currentResult = null;
let currentAssembly = null;
let templates = [];
let tool = null;
let selectedId = null;
let selectedMesh = null;

const WALL_NAMES = { front: 'фасад', back: 'задняя', left: 'левая', right: 'правая' };

const STUD_W = 0.15, STUD_T = 0.05;
const PLATE_H = 0.05, PLATE_W = 0.15;
const JOIST_H = 0.2, JOIST_T = 0.05;
let RAFTER_H = 0.2;
const RAFTER_T = 0.05;
const FRAME_LEVEL = 0.1;
const FLOOR = FRAME_LEVEL + JOIST_H;
const WINDOW_SILL = 0.9;
const HEADER_H = 0.10;

function fmt(n) { return Number(n).toLocaleString('ru-RU'); }

function setStatus(text, isError) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = isError ? 'err' : 'ok';
  el.style.display = 'block';
}

window.addEventListener('error', (e) => {
  setStatus('Ошибка скрипта: ' + e.message + ' (строка ' + e.lineno + ')', true);
});

function readFormDims() {
  return {
    length: document.getElementById('length').value.replace(',', '.'),
    width: document.getElementById('width').value.replace(',', '.'),
    wallHeight: document.getElementById('wallHeight').value.replace(',', '.'),
    ridgeHeight: document.getElementById('ridgeHeight').value.replace(',', '.'),
    partitionsLength: document.getElementById('partitionsLength').value.replace(',', '.') || '0'
  };
}

function fillForm(d, part) {
  document.getElementById('length').value = d.length;
  document.getElementById('width').value = d.width;
  document.getElementById('wallHeight').value = d.wallHeight;
  document.getElementById('ridgeHeight').value = d.ridgeHeight;
  document.getElementById('partitionsLength').value = part || 0;
}

const sceneWrap = document.getElementById('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef2f7);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
const renderer3d = new THREE.WebGLRenderer({ antialias: true });
sceneWrap.appendChild(renderer3d.domElement);

const target = new THREE.Vector3(0, 2.3, 0);
let theta = Math.PI / 5, phi = 1.05, radius = 20;

function updateCamera() {
  camera.position.set(
    target.x + radius * Math.sin(phi) * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(target);
}

function resize3d() {
  const w = sceneWrap.clientWidth, h = sceneWrap.clientHeight;
  if (w && h) { renderer3d.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
}
window.addEventListener('resize', resize3d);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.7);
sun.position.set(15, 25, 10);
scene.add(sun);
scene.add(new THREE.GridHelper(60, 60, 0xcccccc, 0xe4e4e4));

let houseGroup = null;
let pickables = [];
let sheathingMeshes = [];
let sheathingVisible = true;

function clearHouse() {
  pickables = [];
  sheathingMeshes = [];
  if (houseGroup) {
    scene.remove(houseGroup);
    houseGroup.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
    houseGroup = null;
  }
}

function wallDefs() {
  const L = state.dimensions.length, W = state.dimensions.width;
  return [
    { id: 'front', len: L, pos: new THREE.Vector3(0, 0, -W / 2), rotY: 0 },
    { id: 'back', len: L, pos: new THREE.Vector3(0, 0, W / 2), rotY: 0 },
    { id: 'left', len: W, pos: new THREE.Vector3(-L / 2, 0, 0), rotY: Math.PI / 2 },
    { id: 'right', len: W, pos: new THREE.Vector3(L / 2, 0, 0), rotY: Math.PI / 2 }
  ];
}

function buildWall(w) {
  const H = state.dimensions.wallHeight;
  const g = new THREE.Group();
  g.position.set(w.pos.x, FLOOR, w.pos.z);
  g.rotation.y = w.rotY;


  const inward = (w.id === 'front' || w.id === 'left') ? 1 : -1;
  const frameZ = inward * STUD_T / 2;

  const studMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4f });
  const plateMat = new THREE.MeshLambertMaterial({ color: 0x8f6b43 });

  function addBox(len, hgt, x, y, mat, userData, depth) {
    const d = depth || STUD_W;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, hgt, d), mat);
    mesh.position.set(x, y, inward * d / 2);
    if (userData) { mesh.userData = userData; pickables.push(mesh); }
    g.add(mesh);
    return mesh;
  }

  const openings = state.openings.filter(o => o.wall === w.id).sort((a, b) => a.offset - b.offset);

  for (const o of openings) {
    const cx = o.offset - w.len / 2;
    const span = o.width;
    const xL = cx - span / 2, xR = cx + span / 2;
    const top = o.type === 'window' ? WINDOW_SILL + o.height : o.height;
    const jacks = span > 1.8 ? 2 : 1;
    const studH = H - PLATE_H;

    const kingOff = jacks * STUD_T + STUD_T / 2;
    addBox(STUD_T, studH, xL - kingOff, studH / 2, studMat);
    addBox(STUD_T, studH, xR + kingOff, studH / 2, studMat);
    for (let j = 0; j < jacks; j++) {
      addBox(STUD_T, top, xL - STUD_T / 2 - j * STUD_T, top / 2, studMat);
      addBox(STUD_T, top, xR + STUD_T / 2 + j * STUD_T, top / 2, studMat);
    }
    addBox(span + 2 * STUD_T, HEADER_H, cx, top + HEADER_H / 2, plateMat);
    if (o.type === 'window') addBox(span + 2 * STUD_T, 0.1, cx, WINDOW_SILL - 0.05, plateMat);

    const cripples = (y0, y1) => {
      const h = y1 - y0;
      if (h < 0.05) return;
      const n = Math.ceil(span / 0.6) + 1;
      for (let i = 0; i < n; i++) {
        const x = span < 0.6 ? cx : xL + STUD_T / 2 + (span - STUD_T) * (i / (n - 1));
        addBox(STUD_T, h, x, y0 + h / 2, studMat);
      }
    };
    cripples(top + HEADER_H, H - PLATE_H);
    if (o.type === 'window') cripples(0, WINDOW_SILL - 0.1);
  }

  // Раскладка рядовых стоек по СП 31-105-2002: сегменты между
  // углами и зонами проёмов (с обрамлением), шаг не более 0.6 м.
  // Края сегментов у проёмов не дублируются (там стоят king-стойки),
  // в углах стены стойка ставится всегда.
  const zones = openings.map(o => {
    const jacks = o.width > 1.8 ? 2 : 1;
    const off = o.offset;
    const half = o.width / 2 + (jacks + 1) * STUD_W;
    return { a: off - half, b: off + half };
  }).sort((p, q) => p.a - q.a);

  const segsStuds = [];
  let cur = 0;
  for (const z of zones) {
    if (z.a > cur + 0.05) segsStuds.push({ a: cur, b: z.a });
    cur = Math.max(cur, z.b);
  }
  if (cur < w.len - 0.05) segsStuds.push({ a: cur, b: w.len });

  for (const sg of segsStuds) {
    const d = sg.b - sg.a;
    const k = Math.max(1, Math.ceil(d / 0.6));
    const step = d / k;
    const atWallStart = Math.abs(sg.a) < 0.01;
    const atWallEnd = Math.abs(sg.b - w.len) < 0.01;
    for (let i = 0; i <= k; i++) {
      if (i === 0 && !atWallStart) continue; // у проёма — уже есть king-стойка
      if (i === k && !atWallEnd) continue;
      const x = sg.a + step * i - w.len / 2;
      addBox(STUD_T, H - PLATE_H, x, (H - PLATE_H) / 2, studMat);
    }
  }

  addBox(w.len, PLATE_H, 0, H - PLATE_H / 2, plateMat);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d0 });
  const segs = [];
  let cursor = 0;
  for (const o of openings) {
    const left = Math.max(cursor, o.offset - o.width / 2);
    if (left > cursor + 0.02) segs.push({ a: cursor, b: left, y0: 0, y1: H });
    if (o.type === 'window') {
      const top = WINDOW_SILL + o.height;
      if (WINDOW_SILL > 0.02) segs.push({ a: o.offset - o.width / 2, b: o.offset + o.width / 2, y0: 0, y1: Math.min(WINDOW_SILL, H) });
      if (H - top > 0.02) segs.push({ a: o.offset - o.width / 2, b: o.offset + o.width / 2, y0: top, y1: H });
    }
    cursor = Math.max(cursor, o.offset + o.width / 2);
  }
  if (cursor < w.len - 0.02) segs.push({ a: cursor, b: w.len, y0: 0, y1: H });

  for (const s of segs) {
    if (s.b - s.a < 0.03 || s.y1 - s.y0 < 0.03) continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.b - s.a, s.y1 - s.y0, 0.012), wallMat);
    mesh.position.set((s.a + s.b) / 2 - w.len / 2, (s.y0 + s.y1) / 2, 0);
    mesh.userData = { kind: 'wall', wallId: w.id };
    g.add(mesh); pickables.push(mesh);
    sheathingMeshes.push(mesh);
  }

  for (const o of openings) {
    const sill = o.type === 'window' ? WINDOW_SILL : 0;
    const mat = o.type === 'window'
      ? new THREE.MeshLambertMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.65 })
      : new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.width, o.height, 0.02), mat);
    mesh.position.set(o.offset - w.len / 2, sill + o.height / 2, inward * 0.008);
    mesh.userData = { kind: 'opening', id: o.id };
    g.add(mesh); pickables.push(mesh);
  }
  return g;
}

function buildRoof() {
  const L = state.dimensions.length, W = state.dimensions.width;
  const baseY = FLOOR + state.dimensions.wallHeight;
  const ridgeY = FLOOR + state.dimensions.ridgeHeight;
  const g = new THREE.Group();
  const halfW = W / 2;
  const overhang = 0.4;
  const seatDepth = 0.07;

  let slope = (ridgeY - baseY) / halfW;
  for (let i = 0; i < 5; i++) {
    slope = (ridgeY - RAFTER_H / Math.cos(Math.atan(slope)) - baseY) / halfW;
  }
  const dropThk = RAFTER_H / Math.cos(Math.atan(slope));

  const yTopAt = z => ridgeY - slope * z;
  const yBotAt = z => ridgeY - slope * z - dropThk;

  function rafterGeometry(side) {
    const zSeatIn = halfW - seatDepth;
    const zTail = halfW + overhang;
    const pts = [
      [0, yTopAt(0)], [0, yBotAt(0)],
      [zSeatIn, yBotAt(zSeatIn)], [zSeatIn, baseY], [halfW, baseY],
      [zTail, yBotAt(zTail)], [zTail, yTopAt(zTail)]
    ];
    const shape = new THREE.Shape();
    const px = p => side > 0 ? p[0] : -p[0];
    shape.moveTo(px(pts[0]), pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(px(pts[i]), pts[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: RAFTER_T, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2);
    geo.translate(RAFTER_T / 2, 0, 0);
    return geo;
  }

  const rafterMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3e });
  const studMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4f });
  const boltMat = new THREE.MeshLambertMaterial({ color: 0x555a60 });

  const ridgeTopY = ridgeY - dropThk - 0.004;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(L, 0.25, 0.05), rafterMat);
  ridge.position.set(0, ridgeTopY - 0.125, 0);
  g.add(ridge);

  const n = Math.ceil(L / 0.6);
  for (let i = 0; i <= n; i++) {
    const x = Math.min(i * 0.6, L) - L / 2;
    for (const side of [-1, 1]) {
      const r = new THREE.Mesh(rafterGeometry(side), rafterMat);
      r.position.x = x;
      g.add(r);
    }
    if (currentAssembly && currentAssembly.tie) {
      const yTie = baseY + (ridgeY - baseY) * 0.4;
      const zInner = Math.max(0.3, (ridgeY - dropThk - yTie) / slope - 0.03);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(PLATE_W, PLATE_H, zInner * 2), rafterMat);
      tie.position.set(x, yTie + PLATE_H / 2, 0);
      g.add(tie);
      for (const s of [-1, 1]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, RAFTER_T + PLATE_W, 8), boltMat);
        bolt.position.set(x, yTie + PLATE_H / 2, s * (zInner - 0.12));
        g.add(bolt);
      }
    }
    if (currentAssembly && currentAssembly.posts && i % 2 === 0) {
      const postTop = ridgeTopY - 0.25;
      const postH = Math.max(0.1, postTop - baseY);
      const post = new THREE.Mesh(new THREE.BoxGeometry(STUD_T, postH, STUD_W), studMat);
      post.position.set(x, baseY + postH / 2, 0);
      g.add(post);
    }
  }
  return g;
}

function buildFloorFrame() {
  const L = state.dimensions.length, W = state.dimensions.width;
  const g = new THREE.Group();
  const plateMat = new THREE.MeshLambertMaterial({ color: 0x8f6b43 });
  const joistMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4f });

  for (const y of [PLATE_H / 2, FRAME_LEVEL - PLATE_H / 2]) {
    const bx1 = new THREE.Mesh(new THREE.BoxGeometry(L, PLATE_H, PLATE_W), plateMat);
    bx1.position.set(0, y, -W / 2); g.add(bx1);
    const bx2 = new THREE.Mesh(new THREE.BoxGeometry(L, PLATE_H, PLATE_W), plateMat);
    bx2.position.set(0, y, W / 2); g.add(bx2);
    const bz1 = new THREE.Mesh(new THREE.BoxGeometry(PLATE_W, PLATE_H, W), plateMat);
    bz1.position.set(-L / 2, y, 0); g.add(bz1);
    const bz2 = new THREE.Mesh(new THREE.BoxGeometry(PLATE_W, PLATE_H, W), plateMat);
    bz2.position.set(L / 2, y, 0); g.add(bz2);
  }

  const n = Math.ceil(L / 0.6);
  for (let i = 0; i <= n; i++) {
    const x = Math.min(i * 0.6, L) - L / 2;
    const j = new THREE.Mesh(new THREE.BoxGeometry(JOIST_T, JOIST_H, W), joistMat);
    j.position.set(x, FRAME_LEVEL + JOIST_H / 2, 0);
    g.add(j);
  }

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(L, 0.02, W),
    new THREE.MeshLambertMaterial({ color: 0xcdb28e })
  );
  deck.position.y = FLOOR;
  g.add(deck);
  return g;
}

function buildFoundation() {
  const L = state.dimensions.length, W = state.dimensions.width;
  const g = new THREE.Group();
  const pileMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
  const step = 2.5;
  const pts = [];
  for (let x = -L / 2; x <= L / 2 + 0.001; x += step) { pts.push([x, -W / 2]); pts.push([x, W / 2]); }
  for (let z = -W / 2 + step; z < W / 2; z += step) { pts.push([-L / 2, z]); pts.push([L / 2, z]); }
  for (const p of pts) {
    const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), pileMat);
    pile.position.set(p[0], -0.25, p[1]);
    g.add(pile);
  }
  return g;
}

const edgeMat = new THREE.LineBasicMaterial({ color: 0x2f2013 });

function rebuild3d() {
  console.log('rebuild3d: openings =', JSON.stringify(state.openings.map(o => ({ id: o.id, wall: o.wall, type: o.type, offset: Math.round(o.offset * 1000) / 1000, width: o.width }))));
  clearHouse();
  houseGroup = new THREE.Group();
  houseGroup.add(buildFloorFrame());
  for (const w of wallDefs()) houseGroup.add(buildWall(w));
  houseGroup.add(buildRoof());
  houseGroup.add(buildFoundation());
  houseGroup.traverse(obj => {
    if (obj.isMesh) {
      obj.add(new THREE.LineSegments(new THREE.EdgesGeometry(obj.geometry, 10), edgeMat));
    }
  });
  scene.add(houseGroup);
  sheathingMeshes.forEach(m => { m.visible = sheathingVisible; });
  if (selectedId) highlightSelection();
}

window.addEventListener('keydown', e => {
  if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
    sheathingVisible = !sheathingVisible;
    sheathingMeshes.forEach(m => { m.visible = sheathingVisible; });
    setStatus('Режим каркаса (клавиша F): ' + (sheathingVisible ? 'обшивка видна' : 'обшивка скрыта'), false);
  }
});

function highlightSelection() {
  if (!houseGroup || !selectedId) return;
  houseGroup.traverse(obj => {
    if (obj.userData && obj.userData.kind === 'opening' && obj.userData.id === selectedId) {
      selectedMesh = obj;
      obj.material.emissive && obj.material.emissive.setHex(0x3355ff);
    }
  });
}

let isDown = false, downX = 0, downY = 0, moved = 0;
let isPan = false, panX = 0, panY = 0;

renderer3d.domElement.addEventListener('contextmenu', e => e.preventDefault());

renderer3d.domElement.addEventListener('pointerdown', e => {
  if (e.button === 0) {
    if (!tool && startDrag(e)) return;
    isDown = true; downX = e.clientX; downY = e.clientY; moved = 0;
  } else if (e.button === 2 || e.button === 1) {
    isPan = true; panX = e.clientX; panY = e.clientY;
    e.preventDefault();
  }
});

window.addEventListener('pointermove', e => {
  if (dragInfo) {
    const rect = renderer3d.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(m, camera);
    const p = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, p)) {
      const w = dragInfo.wall;
      const o = state.openings.find(x => x.id === dragInfo.id);
      let offset = p.clone().sub(w.pos).dot(dragInfo.dir) + w.len / 2;
      offset = Math.max(o.width / 2, Math.min(w.len - o.width / 2, offset));
      dragInfo.moved += Math.abs(e.clientX - dragInfo.lastX) + Math.abs(e.clientY - dragInfo.lastY);
      dragInfo.lastX = e.clientX; dragInfo.lastY = e.clientY;
      dragInfo.newOffset = offset;
      if (!dragInfo.logged) {
        dragInfo.logged = true;
        console.log('Перетаскивание: первый сдвиг, offset =', offset.toFixed(3), 'м, limit =', (w.len - o.width / 2).toFixed(3));
      }
      dragInfo.mesh.position.x = offset - w.len / 2;
    }
    return;
  }
  if (isPan) {
    const dx = e.clientX - panX, dy = e.clientY - panY;
    panX = e.clientX; panY = e.clientY;
    const k = radius * 0.0016;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    camera.matrix.extractBasis(right, up, new THREE.Vector3());
    target.addScaledVector(right, -dx * k);
    target.addScaledVector(up, dy * k);
    updateCamera();
    return;
  }
  if (!isDown) return;
  const dx = e.clientX - downX, dy = e.clientY - downY;
  moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
  theta -= dx * 0.006;
  phi = Math.min(1.5, Math.max(0.25, phi - dy * 0.006));
  downX = e.clientX; downY = e.clientY;
  updateCamera();
});

window.addEventListener('pointerup', e => {
  if (e.button === 2 || e.button === 1) { isPan = false; return; }
  if (dragInfo) {
    const info = dragInfo; dragInfo = null;
    if (info.moved < 6) { select(info.id); return; }
    const o = state.openings.find(x => x.id === info.id);
    const w = info.wall;
    const ext = newExtent(info.newOffset, o.width);
    const busy = wallBusyZones(w.id, info.id);
    if (busy.find(z => ext.a < z.b && z.a < ext.b)) {
      info.mesh.position.x = info.offset0 - w.len / 2;
      const zones = freeCenterZones(w.len, busy, ext.b - info.newOffset);
      const msg = zones.length
        ? 'Здесь проёму тесно с обрамлением. Свободные зоны для центра: ' +
          zones.map(z => (Math.round(z.a * 10) / 10).toFixed(1) + '–' + (Math.round(z.b * 10) / 10).toFixed(1) + ' м').join(', ')
        : 'На стене нет свободного места для этого проёма.';
      setStatus(msg, true);
      return;
    }
    o.offset = info.newOffset;
    select(null);
    console.log('Перетаскивание: новый offset =', info.newOffset.toFixed(3), 'м — жду пересчёт');
    Promise.resolve(updateAll())
      .then(() => {
        console.log('Перетаскивание: пересчёт готов, пересобираю сцену');
        rebuild3d();
      })
      .catch(err => {
        console.error('Перетаскивание: ошибка пересчёта/пересборки:', err);
        setStatus('Ошибка после перетаскивания: ' + (err && err.message ? err.message : String(err)), true);
        try { rebuild3d(); } catch (e2) { console.error('Повторная пересборка тоже упала:', e2); }
      });
    return;
  }
  if (!isDown) return;
  isDown = false;
  if (moved < 6 && e.target === renderer3d.domElement) {
    try { onPick(e); } catch (err) { setStatus('Ошибка клика: ' + err.message, true); }
  }
});

renderer3d.domElement.addEventListener('wheel', e => {
  radius = Math.min(60, Math.max(4, radius * (e.deltaY > 0 ? 1.1 : 0.9)));
  updateCamera();
  e.preventDefault();
}, { passive: false });

const raycaster = new THREE.Raycaster();

// ---- перетаскивание проёмов вдоль стены ----
let dragInfo = null;
const dragPlane = new THREE.Plane();

function startDrag(e) {
  const rect = renderer3d.domElement.getBoundingClientRect();
  const m = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(m, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (!hits.length) return false;
  const ud = hits[0].object.userData;
  if (!ud || ud.kind !== 'opening') return false;
  const o = state.openings.find(x => x.id === ud.id);
  if (!o) return false;
  const w = wallDefs().find(x => x.id === o.wall);
  const dir = new THREE.Vector3(Math.cos(w.rotY), 0, -Math.sin(w.rotY));
  const n = new THREE.Vector3(-dir.z, 0, dir.x);
  dragPlane.setFromNormalAndCoplanarPoint(n, w.pos);
  dragInfo = { id: o.id, wall: w, offset0: o.offset, mesh: hits[0].object, dir, moved: 0, lastX: e.clientX, lastY: e.clientY };
  return true;
}

function onPick(e) {
  const rect = renderer3d.domElement.getBoundingClientRect();
  const m = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(m, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (!hits.length) {
    if (tool) setStatus('Кликните по стене дома, чтобы поставить ' + (tool === 'window' ? 'окно' : 'дверь') + '.', true);
    else select(null);
    return;
  }
  const ud = hits[0].object.userData;
  if (ud.kind === 'opening') { select(ud.id); return; }
  if (tool) { addOpening(tool, ud.wallId, hits[0].point); }
  else select(null);
}

function openingExtent(o) {
  const jacks = o.width > 1.8 ? 2 : 1;
  const half = o.width / 2 + (jacks + 1) * STUD_T;
  return { a: o.offset - half, b: o.offset + half };
}

function newExtent(center, width) {
  const jacks = width > 1.8 ? 2 : 1;
  const half = width / 2 + (jacks + 1) * STUD_T;
  return { a: center - half, b: center + half };
}

function wallBusyZones(wallId, excludeId) {
  return state.openings
    .filter(x => x.wall === wallId && x.id !== excludeId)
    .map(openingExtent)
    .sort((p, q) => p.a - q.a);
}

function freeCenterZones(len, busy, newHalf) {
  const gaps = [];
  let cur = 0;
  for (const z of busy) {
    if (z.a > cur) gaps.push({ a: cur, b: z.a });
    cur = Math.max(cur, z.b);
  }
  if (cur < len) gaps.push({ a: cur, b: len });
  return gaps
    .map(gp => ({ a: gp.a + newHalf, b: gp.b - newHalf }))
    .filter(gp => gp.b - gp.a > 0.01);
}

function addOpening(type, wallId, worldPoint) {
  const w = wallDefs().find(x => x.id === wallId);
  const dir = new THREE.Vector3(Math.cos(w.rotY), 0, -Math.sin(w.rotY));
  let offset = worldPoint.clone().sub(w.pos).dot(dir) + w.len / 2;
  const defW = type === 'window' ? 1.5 : 1.0;
  const defH = type === 'window' ? 1.5 : 2.1;
  offset = Math.max(defW / 2, Math.min(w.len - defW / 2, offset));

  const busy = wallBusyZones(wallId, null);
  const ext = newExtent(offset, defW);
  const hit = busy.find(z => ext.a < z.b && z.a < ext.b);
  if (hit) {
    const newHalf = ext.b - offset;
    const zones = freeCenterZones(w.len, busy, newHalf);
    const msg = zones.length
      ? 'На стене «' + WALL_NAMES[wallId] + '» здесь проём. Свободные зоны для центра: ' +
        zones.map(z => (Math.round(z.a * 10) / 10).toFixed(1) + '–' + (Math.round(z.b * 10) / 10).toFixed(1) + ' м').join(', ')
      : 'На стене «' + WALL_NAMES[wallId] + '» нет места: уменьшите или удалите существующие проёмы.';
    setStatus(msg, true);
    return;
  }

  state.openings.push({ id: 'o' + Date.now() + Math.floor(Math.random() * 1000), type, wall: wallId, offset, width: defW, height: defH });
  tool = null; setToolUI();
  select(null);
  updateAll();
}

function select(id) {
  if (selectedMesh) { selectedMesh.material.emissive && selectedMesh.material.emissive.setHex(0x000000); selectedMesh = null; }
  selectedId = id;
  const panel = document.getElementById('opening-editor');
  if (!id) { panel.style.display = 'none'; return; }
  const o = state.openings.find(x => x.id === id);
  if (!o) { panel.style.display = 'none'; return; }
  document.getElementById('sel-type').textContent = o.type === 'window'
    ? 'окно (стена: ' + WALL_NAMES[o.wall] + ')'
    : 'дверь (стена: ' + WALL_NAMES[o.wall] + ')';
  document.getElementById('sel-width').value = o.width;
  document.getElementById('sel-height').value = o.height;
  panel.style.display = 'block';
  highlightSelection();
}

document.getElementById('sel-apply').addEventListener('click', () => {
  const o = state.openings.find(x => x.id === selectedId);
  if (!o) return;
  const w = parseFloat(document.getElementById('sel-width').value.replace(',', '.'));
  const h = parseFloat(document.getElementById('sel-height').value.replace(',', '.'));
  if (!(w > 0) || !(h > 0) || w > 4 || h > 3) { setStatus('Размер проёма: 0–4 м по ширине, 0–3 м по высоте.', true); return; }
  if (o.type === 'door' && h > state.dimensions.wallHeight - 0.1) { setStatus('Дверь не может быть выше стены (нужен запас под обвязку).', true); return; }

  const others = state.openings.filter(x => x.id !== o.id && x.wall === o.wall).map(openingExtent);
  const ext2 = newExtent(o.offset, w);
  if (others.find(z => ext2.a < z.b && z.a < ext2.b)) {
    setStatus('Изменённый проём налезает на соседний вместе с обрамлением. Уменьшите размеры или удалите соседний проём.', true);
    return;
  }

  o.width = w; o.height = h;
  select(null);
  updateAll();
});

document.getElementById('sel-delete').addEventListener('click', () => {
  state.openings = state.openings.filter(x => x.id !== selectedId);
  select(null);
  updateAll();
});

function setToolUI() {
  document.getElementById('tool-window').className = tool === 'window' ? 'active' : '';
  document.getElementById('tool-door').className = tool === 'door' ? 'active' : '';
  document.getElementById('tool-hint').textContent = tool
    ? 'Кликните по стене, чтобы добавить ' + (tool === 'window' ? 'окно' : 'дверь')
    : 'v' + RENDERER_VERSION + ' | ЛКМ — вращать, ПКМ — сдвиг, колесо — зум. Окна и двери можно перетаскивать. F — режим каркаса.';
}
document.getElementById('tool-window').addEventListener('click', () => { tool = tool === 'window' ? null : 'window'; select(null); setToolUI(); });
document.getElementById('tool-door').addEventListener('click', () => { tool = tool === 'door' ? null : 'door'; select(null); setToolUI(); });
document.getElementById('tool-cancel').addEventListener('click', () => { tool = null; select(null); setToolUI(); });

async function updateAll() {
  try {
    if (!window.api) throw new Error('preload не загрузился (window.api отсутствует)');
    const res = await window.api.calculate(state);
    if (res.error) { setStatus('Ошибка: ' + res.error, true); return; }
    currentResult = res;
    currentAssembly = res.roofAssembly || null;
    if (currentAssembly) RAFTER_H = currentAssembly.section.h;
    renderTable(res);
    rebuild3d();
    document.getElementById('status').style.display = 'none';
    document.getElementById('result').style.display = 'block';
  } catch (err) {
    setStatus('Ошибка пересчёта: ' + err.message, true);
    console.error(err);
  }
}

function renderTable(res) {
  const d = res.dimensions, o = res.openings;
  document.getElementById('info').innerHTML =
    'Дом: <b>' + d.length + '×' + d.width + ' м</b> | Стена: <b>' + d.wallHeight +
    ' м</b> | Конёк: <b>' + d.ridgeHeight + ' м</b> | Окна: <b>' + o.windows + '</b> | Двери: <b>' + o.doors +
    '</b> | Нагрузка: <b>' + res.load.totalTons + ' т</b> | Сваи: <b>' + res.foundation.count + ' шт.</b>' +
    (res.roofAssembly
      ? '<br>Сборка крыши: <b>' + res.roofAssembly.name + '</b> — ' + res.roofAssembly.description +
        (res.roofAssembly.recommendations && res.roofAssembly.recommendations.length ? '<br>' + res.roofAssembly.recommendations.join(' ') : '')
      : '');

  let html = '<tr><th>Материал</th><th>Кол-во</th><th>Объём/площадь</th><th>Цена, ₽</th><th>Итого, ₽</th></tr>';
  res.materialsCost.forEach(mat => {
    html += '<tr><td>' + mat.item + '</td><td>' + (mat.count !== undefined ? mat.count : '') +
      '</td><td>' + mat.vol + (mat.unit ? ' ' + mat.unit : '') + '</td><td>' + fmt(mat.price) + '</td><td>' + fmt(mat.total) + '</td></tr>';
  });
  html += '<tr class="total"><td>ИТОГО ПО СМЕТЕ</td><td></td><td></td><td></td><td>' + fmt(res.grandTotal) + '</td></tr>';
  document.getElementById('materials-table').innerHTML = html;
}

document.getElementById('calc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  state.dimensions = { ...state.dimensions, ...readFormDims() };
  state.partitionsLength = parseFloat(state.dimensions.partitionsLength) || 0;
  await updateAll();
});

function refreshTemplateSelect() {
  const sel = document.getElementById('templateSelect');
  sel.innerHTML = '<option value="">— выберите —</option>' +
    templates.map(t => '<option value="' + encodeURIComponent(t.name) + '">' + t.name + '</option>').join('');
}

async function loadTemplates() {
  templates = await window.api.getTemplates();
  refreshTemplateSelect();
}

function layoutTemplateOpenings(L, winCount, doorCount) {
  const out = [];
  let w = winCount, d = doorCount;
  const maxW = 1.5;
  const cap = Math.max(1, Math.floor((L - 0.6) / (maxW + 0.5)));
  const stamp = Date.now();
  let seq = 0;

  function placeOn(wall, doorsHere, winsHere) {
    const n = doorsHere + winsHere;
    if (n === 0) return;
    const step = L / (n + 1);
    let di = 0, wi = 0;
    for (let i = 0; i < n; i++) {
      const edge = (i === 0 || i === n - 1);
      let type;
      if (edge && di < doorsHere) { type = 'door'; di++; }
      else if (wi < winsHere) { type = 'window'; wi++; }
      else if (di < doorsHere) { type = 'door'; di++; }
      else { type = 'window'; wi++; }
      out.push({
        id: 'o' + stamp + seq++,
        type,
        wall,
        offset: step * (i + 1),
        width: type === 'window' ? 1.5 : 1.0,
        height: type === 'window' ? 1.5 : 2.1
      });
    }
  }

  const dFront = Math.min(d, 2); d -= dFront;
  const wFront = Math.min(w, Math.max(0, cap - dFront)); w -= wFront;
  placeOn('front', dFront, wFront);

  if (w + d > 0) {
    const nBack = Math.min(w + d, cap);
    const dB = Math.min(d, Math.min(2, nBack)); d -= dB;
    const wB = Math.min(w, nBack - dB); w -= wB;
    placeOn('back', dB, wB);
  }
  return out;
}

document.getElementById('apply-template').addEventListener('click', () => {
  const name = decodeURIComponent(document.getElementById('templateSelect').value);
  const tpl = templates.find(t => t.name === name);
  if (!tpl) return;
  fillForm(tpl, tpl.partitionsLength);
  state.dimensions = { length: Number(tpl.length), width: Number(tpl.width), wallHeight: Number(tpl.wallHeight), ridgeHeight: Number(tpl.ridgeHeight) };
  state.partitionsLength = Number(tpl.partitionsLength) || 0;
  state.openings = layoutTemplateOpenings(Number(tpl.length), Number(tpl.windows) || 0, Number(tpl.doors) || 0);
  setStatus('Шаблон «' + tpl.name + '» применён.', false);
  updateAll();
});

document.getElementById('save-template-btn').addEventListener('click', async () => {
  const name = document.getElementById('templateName').value.trim();
  if (!name) { setStatus('Введите имя для нового шаблона.', true); return; }
  const d = { ...state.dimensions, ...readFormDims() };
  const tpl = {
    name,
    length: d.length, width: d.width, wallHeight: d.wallHeight, ridgeHeight: d.ridgeHeight,
    windows: state.openings.filter(o => o.type === 'window').length,
    doors: state.openings.filter(o => o.type === 'door').length,
    partitionsLength: state.partitionsLength || 0
  };
  const res = await window.api.saveTemplate(tpl);
  if (res.error) { setStatus('Ошибка: ' + res.error, true); return; }
  templates = res.templates;
  refreshTemplateSelect();
  setStatus('Шаблон «' + name + '» сохранён.', false);
});

document.getElementById('save-btn').addEventListener('click', async () => {
  if (!currentResult) return;
  const projectName = document.getElementById('projectName').value.trim() || null;
  const savedPath = await window.api.saveExcel({ result: currentResult, projectName });
  if (savedPath) setStatus('Смета сохранена: ' + savedPath, false);
});

fillForm(state.dimensions, 0);
setToolUI();
loadTemplates();
updateAll();
resize3d();
updateCamera();
console.log('renderer.js версия:', RENDERER_VERSION);

function animate() {
  requestAnimationFrame(animate);
  renderer3d.render(scene, camera);
}
animate();