// ============================================================
// Файл: D:/Projects/StroimIzDereva/norms/roof-norms.js
// Нормативы сборки крыш: выбор варианта стропильной системы
// по пролёту, уклону и снеговой нагрузке.
// Упрощённо по СП 20.13330.2016 и СП 64.13330.2017.
// Таблицы можно править блокнотом — код программы не трогается.
// ============================================================
'use strict';

// Снеговые нагрузки по районам, кПа (СП 20.13330, табл. 10.1)
const SNOW_LOADS = { 1: 0.8, 2: 1.2, 3: 1.8, 4: 2.4, 5: 3.2, 6: 4.0, 7: 4.8, 8: 5.6 };

const RAFTER_SPACING = 0.6; // шаг стропил, м
const POST_SPACING = 1.2;   // шаг стоек под коньковым брусом, м

const SECTIONS = [
  { name: '50×150', h: 0.15 },
  { name: '50×200', h: 0.20 },
  { name: '50×250', h: 0.25 }
];

function pickSection(span, snowKpa) {
  if (span <= 4.5 && snowKpa <= 1.8) return SECTIONS[0];
  if (span <= 6.5) return SECTIONS[1];
  return SECTIONS[2];
}

function selectAssembly(params) {
  const span = params.span;   // пролёт = ширина дома
  const rise = params.rise;   // подъём конька над стеной
  const snowKpa = params.snowLoad || 1.2;

  const angleDeg = Math.atan2(rise, span / 2) * 180 / Math.PI;
  const section = pickSection(span, snowKpa);

  let assembly;
  if (span <= 6) {
    assembly = {
      type: 'hanging',
      name: 'Висячие стропила с ригелем',
      tie: true, posts: false,
      tieHeightFrac: 0.4
    };
  } else if (span <= 9) {
    assembly = {
      type: 'layered',
      name: 'Наслонные стропила со стойками и ригелем',
      tie: true, posts: true,
      tieHeightFrac: 0.4
    };
  } else {
    assembly = {
      type: 'layered',
      name: 'Наслонные со стойками и усиленными стропилами',
      tie: true, posts: true,
      tieHeightFrac: 0.4
    };
  }

  assembly.section = section;
  assembly.spacing = RAFTER_SPACING;
  assembly.postSpacing = POST_SPACING;
  assembly.slopeAngle = Math.round(angleDeg);
  assembly.snowLoad = snowKpa;

  assembly.description =
    'стропила ' + section.name + ' с шагом ' + RAFTER_SPACING + ' м' +
    (assembly.posts ? ', стойки под коньком с шагом ' + POST_SPACING + ' м' : '') +
    ', ригель на 40% высоты, уклон ' + Math.round(angleDeg) + '°, снег ' + snowKpa.toFixed(1) + ' кПа';

  const recommendations = [];
  if (angleDeg < 25) recommendations.push('Уклон меньше 25° — снег не сходит сам: желательна сплошная обрешётка и снегозадержатели.');
  if (span > 9) recommendations.push('Пролёт больше 9 м: сечение и шаг стропил требует проверки расчётом по СП 64.13330.');
  if (snowKpa >= 3.2) recommendations.push('Высокая снеговая нагрузка района: рекомендуется проверка несущей способности.');
  assembly.recommendations = recommendations;

  return assembly;
}

module.exports = { selectAssembly, SNOW_LOADS, RAFTER_SPACING, POST_SPACING, SECTIONS };