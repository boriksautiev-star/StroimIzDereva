// ============================================================
// src/main.js — Electron-обёртка для v5.
// Пока минимальная: окно + загрузка index.html.
// Диалоги файлов (сохранение/открытие проекта) — следующий шаг.
// ============================================================
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Строим из дерева — v5.0',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.removeMenu(); // своё меню добавим позже
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});