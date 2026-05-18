const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getState: () => ipcRenderer.invoke('records:getState'),
  addRecord: (record) => ipcRenderer.invoke('records:add', record),
  updateRecord: (id, updates) => ipcRenderer.invoke('records:update', { id, updates }),
  deleteRecord: (id) => ipcRenderer.invoke('records:delete', id),
  getTrainTimes: () => ipcRenderer.invoke('trainTimes:get'),
  getStations: () => ipcRenderer.invoke('stations:get'),
  subscribeRecords: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('records:changed', handler);
    return () => ipcRenderer.removeListener('records:changed', handler);
  },
});
