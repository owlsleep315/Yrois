const { app, BrowserWindow, screen, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { createRecordStore } = require('./recordFileStore.cjs');

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const APP_ICON_PATH = path.join(__dirname, '../public/yrois_logo.ico');
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');
const RENDERER_INDEX_PATH = path.join(__dirname, '../dist/index.html');

let adminWindow;
let displayWindow;
let recordStore;
let isQuitting = false;

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getAppBasePath() {
  if (isDev) return path.join(__dirname, '..');
  return path.dirname(app.getPath('exe'));
}


function safeReadJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read JSON at ${filePath}:`, error);
    return fallback;
  }
}

function loadStations(basePath) {
  const stationsPath = path.join(basePath, 'data', 'stations.json');
  const parsed = safeReadJsonFile(stationsPath, []);
  return Array.isArray(parsed) ? parsed : [];
}

function safeQuit() {
  if (isQuitting) return;
  isQuitting = true;
  app.quit();
}

function normalizeRecord(record) {
  return {
    ...record,
    completed: record?.completed === true,
  };
}

const state = {
  dateKey: formatDateKey(new Date()),
  trainTimes: {},
  allRecords: [],
  stations: [],
  undoStack: [],
};
const MAX_UNDO_STACK_SIZE = 10;

function cloneRecords(records) {
  return JSON.parse(JSON.stringify(records || []));
}

function pushUndoSnapshot() {
  state.undoStack.push(cloneRecords(state.allRecords));
  if (state.undoStack.length > MAX_UNDO_STACK_SIZE) {
    state.undoStack.shift();
  }
}

function getStatePayload() {
  return {
    dateKey: state.dateKey,
    trainTimes: state.trainTimes,
    allRecords: state.allRecords,
    records: state.allRecords.filter((item) => item.dateKey === state.dateKey),
    stations: state.stations,
    canUndo: state.undoStack.length > 0,
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
    recordStore.persistRecords(state.allRecords);
    recordStore.regenerateMonthlyXlsx(state.allRecords, changedDates);
  } catch (error) {
    console.error('Failed to persist records:', error);
    throw error;
  }
  broadcastState();
  return getStatePayload();
}

function setupIpcHandlers() {
  ipcMain.handle('records:getState', () => getStatePayload());
  ipcMain.handle('records:add', (_event, record) => {
    pushUndoSnapshot();
    state.allRecords = [...state.allRecords, normalizeRecord(record)];
    return persistAndBroadcast([record.dateKey]);
  });
  ipcMain.handle('records:update', (_event, { id, updates }) => {
    pushUndoSnapshot();
    const previous = state.allRecords.find((item) => item.id === id);
    state.allRecords = state.allRecords.map((item) => (item.id === id ? normalizeRecord({ ...item, ...updates }) : item));
    const current = state.allRecords.find((item) => item.id === id);
    return persistAndBroadcast([previous?.dateKey, current?.dateKey]);
  });
  ipcMain.handle('records:delete', (_event, id) => {
    pushUndoSnapshot();
    const target = state.allRecords.find((item) => item.id === id);
    state.allRecords = state.allRecords.filter((item) => item.id !== id);
    return persistAndBroadcast([target?.dateKey]);
  });
  ipcMain.handle('records:undo', () => {
    if (state.undoStack.length === 0) return getStatePayload();
    const snapshot = state.undoStack.pop();
    state.allRecords = cloneRecords(snapshot);
    const changedDateKeys = [...new Set(state.allRecords.map((item) => item.dateKey).filter(Boolean))];
    return persistAndBroadcast(changedDateKeys);
  });
  ipcMain.handle('trainTimes:get', () => state.trainTimes);
  ipcMain.handle('stations:get', () => state.stations);
}

function loadRoute(window, route) {
  if (isDev) {
    window.loadURL(`${DEV_SERVER_URL}/#${route}`);
    return;
  }
  window.loadFile(RENDERER_INDEX_PATH, { hash: route });
}

function bindWindowCloseToQuit(win) {
  win.on('close', () => {
    safeQuit();
  });
  win.on('closed', () => {
    safeQuit();
  });
}

function createWindows() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const secondaryDisplay = displays.find((display) => display.id !== primaryDisplay.id) || primaryDisplay;

  if (process.platform === 'win32') app.setAppUserModelId('com.yrois.app');

  adminWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width: 1200,
    height: 800,
    icon: APP_ICON_PATH,
    title: 'Yrois Main',
    webPreferences: { preload: PRELOAD_PATH, contextIsolation: true, nodeIntegration: false },
  });

  displayWindow = new BrowserWindow({
    x: secondaryDisplay.bounds.x,
    y: secondaryDisplay.bounds.y,
    width: secondaryDisplay.bounds.width,
    height: secondaryDisplay.bounds.height,
    icon: APP_ICON_PATH,
    title: 'Yrois Display',
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD_PATH, contextIsolation: true, nodeIntegration: false },
  });

  bindWindowCloseToQuit(adminWindow);
  bindWindowCloseToQuit(displayWindow);

  loadRoute(adminWindow, '/admin');
  loadRoute(displayWindow, '/display');

  if (isDev) {
    adminWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.on('second-instance', () => {
  if (adminWindow && !adminWindow.isDestroyed()) {
    if (adminWindow.isMinimized()) adminWindow.restore();
    adminWindow.show();
    adminWindow.focus();
  }

  if (displayWindow && !displayWindow.isDestroyed()) {
    if (displayWindow.isMinimized()) displayWindow.restore();
    displayWindow.show();
    displayWindow.focus();
  }
});

app.whenReady().then(() => {
  recordStore = createRecordStore(getAppBasePath());
  const loaded = recordStore.initStore();
  state.trainTimes = loaded.trainTimes;
  state.allRecords = (loaded.allRecords || []).map(normalizeRecord);
  state.stations = loadStations(getAppBasePath());
  setupIpcHandlers();
  createWindows();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') safeQuit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && !isQuitting) createWindows(); });
