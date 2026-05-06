const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { initStore, persistRecords, regenerateCsv } = require('./recordFileStore.cjs');

const isDev = !app.isPackaged;
const DEV_SERVER_URL = 'http://localhost:5173';

let adminWindow;
let displayWindow;

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const loaded = initStore();
const state = {
  dateKey: formatDateKey(new Date()),
  trainTimes: loaded.trainTimes,
  allRecords: loaded.allRecords,
};

function getStatePayload() {
  return {
    dateKey: state.dateKey,
    trainTimes: state.trainTimes,
    allRecords: state.allRecords,
    records: state.allRecords.filter((item) => item.dateKey === state.dateKey),
  };
}

function broadcastState() {
  const payload = getStatePayload();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('records:changed', payload);
  }
}

function persistAndBroadcast(changedDates = []) {
  try {
    persistRecords(state.allRecords);
    for (const dateKey of new Set(changedDates.filter(Boolean))) regenerateCsv(state.allRecords, dateKey);
  } catch (error) {
    console.error('Failed to persist records:', error);
    throw error;
  }
  broadcastState();
  return getStatePayload();
}

function setupIpcHandlers() {
  ipcMain.handle('records:getState', () => getStatePayload());
  ipcMain.handle('records:setDateKey', (_event, dateKey) => {
    state.dateKey = dateKey;
    broadcastState();
    return getStatePayload();
  });
  ipcMain.handle('records:add', (_event, record) => {
    state.allRecords = [...state.allRecords, record];
    return persistAndBroadcast([record.dateKey]);
  });
  ipcMain.handle('records:update', (_event, { id, updates }) => {
    const previous = state.allRecords.find((item) => item.id === id);
    state.allRecords = state.allRecords.map((item) => (item.id === id ? { ...item, ...updates } : item));
    const current = state.allRecords.find((item) => item.id === id);
    return persistAndBroadcast([previous?.dateKey, current?.dateKey]);
  });
  ipcMain.handle('records:delete', (_event, id) => {
    const target = state.allRecords.find((item) => item.id === id);
    state.allRecords = state.allRecords.filter((item) => item.id !== id);
    return persistAndBroadcast([target?.dateKey]);
  });
  ipcMain.handle('trainTimes:get', () => state.trainTimes);
}

function createWindows() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const secondaryDisplay = displays.find((display) => display.id !== primaryDisplay.id) || primaryDisplay;

  adminWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width: 1200,
    height: 800,
    title: '승하차 보조 등록 화면',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });

  displayWindow = new BrowserWindow({
    x: secondaryDisplay.bounds.x,
    y: secondaryDisplay.bounds.y,
    width: secondaryDisplay.bounds.width,
    height: secondaryDisplay.bounds.height,
    title: '승하차 보조 표시 화면',
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });

  adminWindow.loadURL(`${DEV_SERVER_URL}/admin`);
  displayWindow.loadURL(`${DEV_SERVER_URL}/display`);
  if (isDev) adminWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => { setupIpcHandlers(); createWindows(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindows(); });
