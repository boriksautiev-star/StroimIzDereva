const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const NORMS = {
  studSpacing: 0.6,
  studWaste: 0.1,
  roofWaste: 0.12,
  snowLoad: 1.2,
  liveLoad: 0.2,
  woodDensity: 0.55,
  pilePerTon: 0.35
};

// Цены за м³ (руб) — можно менять здесь
const PRICES = {
  'Доска 50×150 (стойки)': 19000,
  'Доска 50×200 (стропила)': 21000,
  'Обрешётка 25×100': 18000,
  'ОСП 9 мм': 23000
};

function calcRoof(width, ridgeHeight, wallHeight) {
  const halfWidth = width / 2;
  const rise = ridgeHeight - wallHeight;
  const rafterLength = Math.sqrt(halfWidth * halfWidth + rise * rise);
  const roofArea = rafterLength * width * 2; // два ската
  return { rafterLength, roofArea, rise };
}

function calcStuds(length, height, spacing, waste) {
  const count = Math.ceil(length / spacing) + 1;
  const volPerStud = height * 0.15 * 0.05; // 50×150 мм
  const totalVol = count * volPerStud * (1 + waste);
  return { count, volPerStud, totalVol };
}

function calcHouse(params) {
  const { length, width, wallHeight, ridgeHeight } = params;

  const studsLong = calcStuds(length, wallHeight, NORMS.studSpacing, NORMS.studWaste);
  const studsShort = calcStuds(width, wallHeight, NORMS.studSpacing, NORMS.studWaste);

  const totalStudsCount = (2 * studsLong.count) + (2 * studsShort.count) - 4;
  const totalStudsVol = (2 * studsLong.totalVol) + (2 * studsShort.totalVol);

  const roof = calcRoof(width, ridgeHeight, wallHeight);

  const floorArea = length * width;
  const wallArea = 2 * (length + width) * wallHeight;

  const loadPerimeter = (wallArea * 0.18) + (floorArea * (NORMS.liveLoad + NORMS.snowLoad));
  const totalLoadTons = loadPerimeter;
  const pilesCount = Math.ceil(totalLoadTons * NORMS.pilePerTon);

  const strCount = 2 * Math.ceil(length / NORMS.studSpacing);
  const strVol = strCount * roof.rafterLength * 0.05 * 0.2;   // 50x200 мм

  const battensVol = roof.roofArea * 0.025 * 0.1 * (1 + NORMS.roofWaste); // обрешётка 25x100
  const osbVol = wallArea * (1 + NORMS.studWaste) * 0.009;                // ОСП 9 мм

  const billOfMaterials = [
    { item: 'Доска 50×150 (стойки)', count: totalStudsCount, vol: totalStudsVol.toFixed(3), unit: 'м³' },
    { item: 'Доска 50×200 (стропила)', count: strCount, vol: strVol.toFixed(3), unit: 'м³' },
    { item: 'Обрешётка 25×100', vol: battensVol.toFixed(3), unit: 'м³' },
    { item: 'ОСП 9 мм', vol: osbVol.toFixed(3), unit: 'м³' }
  ];

  return {
    dimensions: params,
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

// Чтение аргументов
const args = process.argv.slice(2);
let length, width, wallHeight, ridgeHeight;
let projectName = `Project_${Date.now()}`; // имя по умолчанию

if (args.length >= 4) {
  length = parseFloat(args[0]);
  width = parseFloat(args[1]);
  wallHeight = parseFloat(args[2]);
  ridgeHeight = parseFloat(args[3]);

  if ([length, width, wallHeight, ridgeHeight].some(isNaN)) {
    console.error('❌ Ошибка: первые 4 аргумента должны быть числами (в метрах).');
    process.exit(1);
  }

  if (args.length >= 5) {
    projectName = args[4];
  }
} else {
  console.log('⚠️ Аргументы не переданы. Используем значения по умолчанию: 8×6×2.7×5.0');
  length = 8;
  width = 6;
  wallHeight = 2.7;
  ridgeHeight = 5.0;
}

const houseParams = { length, width, wallHeight, ridgeHeight };
const result = calcHouse(houseParams);

// Считаем стоимость каждой позиции и общую сумму
let grandTotal = 0;
const materialsWithCost = result.materials.map(mat => {
  const price = PRICES[mat.item] || 0;
  const vol = parseFloat(mat.vol);
  const total = Math.round(price * vol);
  grandTotal += total;
  return { ...mat, price, total };
});
result.materialsCost = materialsWithCost;
result.grandTotal = grandTotal;

// Генерация Excel
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Смета материалов');

worksheet.columns = [
  { header: 'Материал', key: 'item', width: 30 },
  { header: 'Количество', key: 'count', width: 15 },
  { header: 'Объём, м³', key: 'vol', width: 12 },
  { header: 'Цена за м³, ₽', key: 'price', width: 16 },
  { header: 'Итого, ₽', key: 'total', width: 16 }
];

materialsWithCost.forEach(mat => {
  worksheet.addRow({
    item: mat.item,
    count: mat.count !== undefined ? mat.count : '',
    vol: mat.vol,
    price: mat.price,
    total: mat.total
  });
});

// Итоговая строка
const totalRow = worksheet.addRow({
  item: 'ИТОГО ПО СМЕТЕ',
  count: '',
  vol: '',
  price: '',
  total: grandTotal
});
totalRow.font = { bold: true };

worksheet.insertRow(1, ['Дом:', `${result.dimensions.length}×${result.dimensions.width} м`]);
worksheet.insertRow(2, ['Стена / Конёк:', `${result.dimensions.wallHeight} / ${result.dimensions.ridgeHeight} м`]);
worksheet.insertRow(3, ['Нагрузка:', `${result.load.totalTons} тонн`]);
worksheet.insertRow(4, ['Фундамент:', `${result.foundation.type}, ${result.foundation.count} шт.`]);

const safeName = projectName.replace(/[\\/:*?"<>|]/g, '_'); // защита от недопустимых символов
const fileNameExcel = `bill_${safeName}.xlsx`;
const fileNameJson = `project_${safeName}.json`;

workbook.xlsx.writeFile(fileNameExcel)
  .then(() => {
    console.log(`✅ Excel создан: ${fileNameExcel}`);

    const projectsDir = path.join(__dirname, 'projects');
    if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir);

    fs.writeFileSync(path.join(projectsDir, fileNameJson), JSON.stringify(result, null, 2));
    console.log(`✅ Проект сохранён: ${fileNameJson} (в папке projects)`);
    console.log(`💰 Итого по смете: ${grandTotal.toLocaleString('ru-RU')} ₽`);
  })
  .catch(err => {
    console.error('❌ Ошибка при создании файлов:', err);
    process.exit(1);
  });