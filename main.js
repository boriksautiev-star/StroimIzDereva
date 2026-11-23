// ============================================================
// Файл: D:/Projects/StroimIzDereva/main.js
// Главный процесс Electron: смета, шаблоны, Excel.
// Вариант сборки крыши подбирается в norms/roof-norms.js
// ============================================================
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const roofNorms = require('./norms/roof-norms');
const openingsNorms = require('./norms/openings-norms');
const STUD_W = 0.15, STUD_T = 0.05, PLATE_H = 0.05, WINDOW_SILL = 0.9;

// Сегментная раскладка стоек (как в 3D): зоны проёмов с обрамлением
// вырезаются, в каждом сегменте шаг не более 0.6 м,
// у проёмов стойки не дублируются с king-стойками
function studsCountForWall(len, wallOpenings) {
  const zones = wallOpenings.map(o => {
    const jacks = o.width > 1.8 ? 2 : 1;
    const half = o.width / 2 + (jacks + 1) * STUD_T;
    return { a: o.offset - half, b: o.offset + half };
  }).sort((p, q) => p.a - q.a);
  const segs = [];
  let cur = 0;
  for (const z of zones) {
    if (z.a > cur + 0.05) segs.push({ a: cur, b: z.a });
    cur = Math.max(cur, z.b);
  }
  if (cur < len - 0.05) segs.push({ a: cur, b: len });
  let count = 0;
  for (const sg of segs) {
    const d = sg.b - sg.a;
    const k = Math.max(1, Math.ceil(d / 0.6));
    for (let i = 0; i <= k; i++) {
      if (i === 0 && Math.abs(sg.a) > 0.01) continue;
      if (i === k && Math.abs(sg.b - len) > 0.01) continue;
      count++;
    }
  }
  return count;
}

const NORMS = {
  studSpacing: 0.6, studWaste: 0.1, roofWaste: 0.12,
  snowLoad: 1.2, liveLoad: 0.2, pilePerTon: 0.35,
  insulThickness: 0.2, insulWaste: 0.05, filmWaste: 0.1
};

const PRICES = {
  'Обвязка нижняя 50×150 (двойная)': 19000,
  'Лаги пола 50×200': 21000,
  'Доска 50×150 (стойки)': 19000,
  'Доска 50×150 (перегородки)': 19000,
  'Доска 50×150 (обрамление проёмов)': 19000,
  'Обвязка верхняя 50×150': 19000,
  'Доска 50×150 (стропила)': 21000,
  'Доска 50×200 (стропила)': 21000,
  'Доска 50×250 (стропила)': 21000,
  'Ригель 50×150 (ферма)': 19000,
  'Стойка 50×150 (ферма)': 19000,
  'Коньковый брус 50×250': 21000,
  'Обрамление проёмов 50×150 (king/jack, царги, подоконные)': 19000,
  'Перемычка проёма 50×150 (двойная)': 19000,
  'Перемычка проёма 50×200 (двойная)': 21000,
  'Перемычка проёма 50×250 (двойная)': 21000,
  'Обрешётка 25×100': 18000,
  'ОСП 9 мм': 23000,
  'Утеплитель минвата 200 мм': 1900,
  'Пароизоляция (плёнка)': 60,
  'Мембрана ветро-влагозащитная': 80
};

const WALL_IDS = ['front', 'back', 'left', 'right'];
const WALL_NAMES = { front: 'фасад', back: 'задняя', left: 'левая', right: 'правая' };

const DEFAULT_TEMPLATES = [
  { name: 'Дом 10×8', length: 10, width: 8, wallHeight: 3, ridgeHeight: 5.5, windows: 4, doors: 2, partitionsLength: 6 },
  { name: 'Баня 6×4', length: 6, width: 4, wallHeight: 2.5, ridgeHeight: 4.2, windows: 2, doors: 1, partitionsLength: 3 },
  { name: 'Гараж 6×6', length: 6, width: 6, wallHeight: 3, ridgeHeight: 4.5, windows: 1, doors: 1, partitionsLength: 0 },
  { name: 'Дачный домик 5×5', length: 5, width: 5, wallHeight: 2.7, ridgeHeight: 4.5, windows: 2, doors: 1, partitionsLength: 2 }
];

function calcRoof(width, ridgeHeight, wallHeight) {
  const halfWidth = width / 2;
  const rise = ridgeHeight - wallHeight;
  const rafterLength = Math.sqrt(halfWidth * halfWidth + rise * rise);
  const roofArea = rafterLength * width * 2;
  return { rafterLength, roofArea, rise };
}

function calcStuds(length, height, spacing, waste) {
  const count = Math.ceil(length / spacing) + 1;
  const volPerStud = height * 0.15 * 0.05;
  return { count, volPerStud, totalVol: count * volPerStud * (1 + waste) };
}

function calcHouse(state) {
  const { length, width, wallHeight, ridgeHeight } = state.dimensions;
  const openings = Array.isArray(state.openings) ? state.openings : [];
  const partitionsLength = Number(state.partitionsLength) || 0;
  const halfW = width / 2;

  const frontOps = openings.filter(o => o.wall === 'front' || o.wall === 'back');
  const sideOps = openings.filter(o => o.wall === 'left' || o.wall === 'right');
  const totalStudsCount = 2 * studsCountForWall(length, frontOps) + 2 * studsCountForWall(width, sideOps);
  const totalStudsVol = totalStudsCount * (wallHeight - PLATE_H) * STUD_W * 0.05 * (1 + NORMS.studWaste);

  const partStudsCount = partitionsLength > 0 ? Math.ceil(partitionsLength / NORMS.studSpacing) + 1 : 0;
  const partVol = partStudsCount * wallHeight * 0.15 * 0.05 * (1 + NORMS.studWaste);

  let osbSubtract = 0;
  let framingVol = 0;
  const headerItems = {};
  openings.forEach(o => {
    osbSubtract += o.width * o.height;
    const hd = openingsNorms.headerFor(o.width);
    const jacks = openingsNorms.jacksFor(o.width);
    const top = o.type === 'window' ? WINDOW_SILL + o.height : o.height;
    const headerLen = o.width + 2 * STUD_T;
    headerItems[hd.name] = (headerItems[hd.name] || 0) + headerLen * 0.15 * hd.h;
    framingVol += 2 * wallHeight * 0.15 * 0.05;                 // king-стойки
    framingVol += 2 * jacks * top * 0.15 * 0.05;                // jack-стойки
    if (o.type === 'window') {
      framingVol += o.width * 0.15 * 0.1;                       // подоконная доска (2 слоя)
      const cb = Math.ceil(o.width / openingsNorms.CRIPPLE_SPACING) + 1;
      framingVol += cb * Math.max(0, WINDOW_SILL - 0.1) * 0.15 * 0.05; // царги под окном
    }
    const ca = Math.ceil(o.width / openingsNorms.CRIPPLE_SPACING) + 1;
    framingVol += ca * Math.max(0, wallHeight - PLATE_H - (top + hd.h)) * 0.15 * 0.05; // царги над перемычкой
  });
  framingVol = framingVol * (1 + NORMS.studWaste);
  for (const k in headerItems) headerItems[k] = headerItems[k] * (1 + NORMS.studWaste);

  const perimeter = 2 * (length + width);
  const bottomFrameVol = perimeter * 0.15 * 0.05 * 2 * (1 + NORMS.studWaste);
  const joistCount = Math.ceil(length / NORMS.studSpacing) + 1;
  const joistsVol = joistCount * width * 0.05 * 0.2 * (1 + NORMS.studWaste);
  const topPlateVol = perimeter * 0.15 * 0.05 * (1 + NORMS.studWaste);

  const asm = roofNorms.selectAssembly({ span: width, rise: ridgeHeight - wallHeight, snowLoad: NORMS.snowLoad });

  const roof = calcRoof(width, ridgeHeight, wallHeight);
  const floorArea = length * width;
  const wallArea = 2 * (length + width) * wallHeight;

  const totalLoadTons = (wallArea * 0.18) + (floorArea * (NORMS.liveLoad + NORMS.snowLoad));
  const pilesCount = Math.ceil(totalLoadTons * NORMS.pilePerTon);

  const strCount = 2 * Math.ceil(length / NORMS.studSpacing);
  const strVol = strCount * roof.rafterLength * 0.05 * asm.section.h * (1 + NORMS.studWaste);
  const ridgeVol = length * 0.05 * 0.25 * (1 + NORMS.studWaste);

  let tieCount = 0, tieVol = 0;
  if (asm.tie) {
    tieCount = strCount / 2;
    const zInner = Math.max(0.3, halfW * (1 - asm.tieHeightFrac) - 0.03);
    tieVol = tieCount * (zInner * 2) * 0.15 * 0.05 * (1 + NORMS.studWaste);
  }

  let postCount = 0, postVol = 0;
  if (asm.posts) {
    postCount = Math.floor(length / asm.postSpacing) + 1;
    const postH = Math.max(0.2, (ridgeHeight - wallHeight) - 0.35);
    postVol = postCount * postH * 0.05 * 0.15 * (1 + NORMS.studWaste);
  }

  const battensVol = roof.roofArea * 0.025 * 0.1 * (1 + NORMS.roofWaste);
  const osbVol = Math.max(0, wallArea * (1 + NORMS.studWaste) * 0.009 - osbSubtract * 0.009);

  // Утепление и плёнки: по площадям конструкций
  const insulVol = (wallArea + floorArea + roof.roofArea) * NORMS.insulThickness * (1 + NORMS.insulWaste);
  const vaporArea = (floorArea + roof.roofArea) * (1 + NORMS.filmWaste);
  const membraneArea = (wallArea + roof.roofArea) * (1 + NORMS.filmWaste);

  const billOfMaterials = [
    { item: 'Обвязка нижняя 50×150 (двойная)', vol: bottomFrameVol.toFixed(3), unit: 'м³' },
    { item: 'Лаги пола 50×200', count: joistCount, vol: joistsVol.toFixed(3), unit: 'м³' },
    { item: 'Доска 50×150 (стойки)', count: totalStudsCount, vol: totalStudsVol.toFixed(3), unit: 'м³' }
  ];
  if (partVol > 0) billOfMaterials.push({ item: 'Доска 50×150 (перегородки)', count: partStudsCount, vol: partVol.toFixed(3), unit: 'м³' });
  if (framingVol > 0) billOfMaterials.push({ item: 'Обрамление проёмов 50×150 (king/jack, царги, подоконные)', vol: framingVol.toFixed(3), unit: 'м³' });
  for (const k in headerItems) billOfMaterials.push({ item: 'Перемычка проёма ' + k + ' (двойная)', vol: headerItems[k].toFixed(3), unit: 'м³' });
  billOfMaterials.push(
    { item: 'Обвязка верхняя 50×150', vol: topPlateVol.toFixed(3), unit: 'м³' },
    { item: 'Доска ' + asm.section.name + ' (стропила)', count: strCount, vol: strVol.toFixed(3), unit: 'м³' }
  );
  if (tieCount > 0) billOfMaterials.push({ item: 'Ригель 50×150 (ферма)', count: tieCount, vol: tieVol.toFixed(3), unit: 'м³' });
  if (postCount > 0) billOfMaterials.push({ item: 'Стойка 50×150 (ферма)', count: postCount, vol: postVol.toFixed(3), unit: 'м³' });
  billOfMaterials.push(
    { item: 'Коньковый брус 50×250', vol: ridgeVol.toFixed(3), unit: 'м³' },
    { item: 'Обрешётка 25×100', vol: battensVol.toFixed(3), unit: 'м³' },
    { item: 'ОСП 9 мм', vol: osbVol.toFixed(3), unit: 'м³' },
    { item: 'Утеплитель минвата 200 мм', vol: insulVol.toFixed(3), unit: 'м³' },
    { item: 'Пароизоляция (плёнка)', vol: vaporArea.toFixed(1), unit: 'м²' },
    { item: 'Мембрана ветро-влагозащитная', vol: membraneArea.toFixed(1), unit: 'м²' }
  );

  const winCount = openings.filter(o => o.type === 'window').length;
  const doorCount = openings.filter(o => o.type === 'door').length;

  return {
    dimensions: state.dimensions,
    openings: { windows: winCount, doors: doorCount, partitionsLength },
    roofAssembly: asm,
    roof: {
      rafterLength: roof.rafterLength.toFixed(2),
      area: roof.roofArea.toFixed(1),
      rise: roof.rise.toFixed(2)
    },
    load: { totalTons: totalLoadTons.toFixed(1) },
    foundation: { type: 'сваи', count: pilesCount },
    materials: billOfMaterials
  };
}

function buildWorkbook(result) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Смета материалов');
  ws.columns = [
    { header: 'Материал', key: 'item', width: 36 },
    { header: 'Количество', key: 'count', width: 15 },
    { header: 'Объём/площадь', key: 'vol', width: 16 },
    { header: 'Цена, ₽', key: 'price', width: 14 },
    { header: 'Итого, ₽', key: 'total', width: 16 }
  ];
  result.materialsCost.forEach(mat => {
    ws.addRow({ item: mat.item + (mat.unit ? ', ' + mat.unit : ''), count: mat.count !== undefined ? mat.count : '', vol: mat.vol, price: mat.price, total: mat.total });
  });
  const totalRow = ws.addRow({ item: 'ИТОГО ПО СМЕТЕ', count: '', vol: '', price: '', total: result.grandTotal });
  totalRow.font = { bold: true };
  ws.insertRow(1, ['Дом:', result.dimensions.length + '×' + result.dimensions.width + ' м']);
  ws.insertRow(2, ['Стена / Конёк:', result.dimensions.wallHeight + ' / ' + result.dimensions.ridgeHeight + ' м']);
  ws.insertRow(3, ['Окна / Двери:', result.openings.windows + ' шт. / ' + result.openings.doors + ' шт.']);
  ws.insertRow(4, ['Перегородки:', result.openings.partitionsLength + ' м']);
  ws.insertRow(5, ['Сборка крыши:', result.roofAssembly.name]);
  ws.insertRow(6, ['Параметры крыши:', result.roofAssembly.description]);
  result.roofAssembly.recommendations.forEach((rec, idx) => {
    ws.insertRow(7 + idx, ['Примечание:', rec]);
  });
  return workbook;
}

const templatesPath = path.join(__dirname, 'templates.json');
function loadTemplates() {
  if (!fs.existsSync(templatesPath)) {
    fs.writeFileSync(templatesPath, JSON.stringify(DEFAULT_TEMPLATES, null, 2));
    return DEFAULT_TEMPLATES;
  }
  try { return JSON.parse(fs.readFileSync(templatesPath, 'utf8')); } catch (e) { return DEFAULT_TEMPLATES; }
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, title: 'StroimIzDereva — конструктор каркасного дома',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile('index.html');
}

ipcMain.handle('get-templates', () => loadTemplates());

ipcMain.handle('save-template', (event, tpl) => {
  const name = (tpl.name || '').trim();
  if (!name) return { error: 'Название шаблона не может быть пустым.' };
  const list = loadTemplates();
  const entry = {
    name,
    length: Number(tpl.length), width: Number(tpl.width),
    wallHeight: Number(tpl.wallHeight), ridgeHeight: Number(tpl.ridgeHeight),
    windows: Number(tpl.windows) || 0, doors: Number(tpl.doors) || 0,
    partitionsLength: Number(tpl.partitionsLength) || 0
  };
  const idx = list.findIndex(t => t.name === name);
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  fs.writeFileSync(templatesPath, JSON.stringify(list, null, 2));
  return { ok: true, templates: list };
});

ipcMain.handle('calculate', (event, state) => {
  const d = state.dimensions || {};
  const length = Number(d.length), width = Number(d.width);
  const wallHeight = Number(d.wallHeight), ridgeHeight = Number(d.ridgeHeight);

  if ([length, width, wallHeight, ridgeHeight].some(v => !v || Number.isNaN(v) || v <= 0)) {
    return { error: 'Все размеры должны быть положительными числами.' };
  }
  if (length < 2 || length > 30 || width < 2 || width > 30) return { error: 'Длина и ширина должны быть от 2 до 30 метров.' };
  if (wallHeight < 2 || wallHeight > 10) return { error: 'Высота стены должна быть от 2 до 10 метров.' };
  if (ridgeHeight < wallHeight + 0.3) return { error: 'Конёк должен быть выше стены минимум на 0.3 м (иначе крыша не построится).' };

  const openings = Array.isArray(state.openings) ? state.openings : [];
  if (openings.length > 50) return { error: 'Слишком много проёмов (максимум 50).' };
  for (const o of openings) {
    if (!WALL_IDS.includes(o.wall)) return { error: 'Некорректная стена у проёма.' };
    if (!['window', 'door'].includes(o.type)) return { error: 'Некорректный тип проёма.' };
    if (!(o.width > 0) || !(o.height > 0)) return { error: 'Размеры проёма должны быть положительными.' };
    if (o.width > 4 || o.height > 3) return { error: 'Проём слишком большой (макс. 4×3 м).' };
    if (o.width > Number(d.length) - 0.4 && o.width > Number(d.width) - 0.4) {
      return { error: 'Проём шире самой маленькой стены дома.' };
    }
    if (o.type === 'door' && o.height > Number(d.wallHeight) - 0.1) return { error: 'Дверь не может быть выше стены (нужен запас под обвязку).' };
  }

  const byWall = {};
  for (const o of openings) { (byWall[o.wall] = byWall[o.wall] || []).push(o); }
  for (const wall in byWall) {
    const list = byWall[wall].slice().sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < list.length; i++) {
      const prevEnd = list[i - 1].offset + list[i - 1].width / 2;
      const curStart = list[i].offset - list[i].width / 2;
      if (prevEnd + 0.05 > curStart) {
        return { error: 'На стене «' + (WALL_NAMES[wall] || wall) + '» проёмы пересекаются. Разнесите их или уменьшите.' };
      }
    }
  }

  const result = calcHouse({ dimensions: d, openings, partitionsLength: state.partitionsLength });

  let grandTotal = 0;
  result.materialsCost = result.materials.map(mat => {
    const price = PRICES[mat.item] || 0;
    const total = Math.round(price * parseFloat(mat.vol));
    grandTotal += total;
    return { ...mat, price, total };
  });
  result.grandTotal = grandTotal;
  return result;
});

ipcMain.handle('save-excel', async (event, { result, projectName }) => {
  const name = projectName && projectName.trim() ? projectName.trim() : 'Project_' + Date.now();
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Сохранить смету', defaultPath: 'bill_' + safeName + '.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (canceled || !filePath) return null;
  const workbook = buildWorkbook(result);
  await workbook.writeFile(filePath);
  const projectsDir = path.join(__dirname, 'projects');
  if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir);
  fs.writeFileSync(path.join(projectsDir, 'project_' + safeName + '.json'), JSON.stringify(result, null, 2));
  return filePath;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { app.quit(); });