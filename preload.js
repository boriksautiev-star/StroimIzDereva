const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  calculate: (state) => ipcRenderer.invoke('calculate', state),
  saveExcel: (payload) => ipcRenderer.invoke('save-excel', payload),
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  saveTemplate: (tpl) => ipcRenderer.invoke('save-template', tpl)
});