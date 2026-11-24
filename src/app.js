'use strict';

// ============================================================
// app.js — собирает демо-проект и показывает его во вьюере.
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
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
  const stats = viewer.buildFromModel(project, 600);

  document.getElementById('info').textContent =
    'Демо-дом v5 | стен: 2, проёмов: 2, стоек: ' + stats.studsTotal +
    ' | ЛКМ — вращение, ПКМ — панорама, колесо — зум';
});