const memoryState = { dateKey: formatDateKey(new Date()), records: [], allRecords: [], trainTimes: {}, stations: [], canUndo: false };
const listeners = new Set();
const undoStack = [];
const MAX_UNDO_STACK_SIZE = 10;

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function emit(state) { for (const listener of listeners) listener(state); }
function isElectron() { return typeof window !== 'undefined' && !!window.electronAPI; }

function normalizeRecord(record) {
  return {
    ...record,
    completed: record?.completed === true,
  };
}

function deriveRecords() {
  memoryState.records = memoryState.allRecords.filter((item) => item.dateKey === memoryState.dateKey);
  memoryState.canUndo = undoStack.length > 0;
}

function cloneRecords(records) {
  return JSON.parse(JSON.stringify(records || []));
}

function pushUndoSnapshot() {
  undoStack.push(cloneRecords(memoryState.allRecords));
  if (undoStack.length > MAX_UNDO_STACK_SIZE) undoStack.shift();
}

export async function getRecordsState() {
  if (isElectron()) return window.electronAPI.getState();
  deriveRecords();
  return memoryState;
}

export async function addRecord(record) {
  if (isElectron()) return window.electronAPI.addRecord(record);
  pushUndoSnapshot();
  memoryState.allRecords = [...memoryState.allRecords, normalizeRecord(record)];
  deriveRecords();
  emit(memoryState);
  return memoryState;
}

export async function updateRecord(id, updates) {
  if (isElectron()) return window.electronAPI.updateRecord(id, updates);
  pushUndoSnapshot();
  memoryState.allRecords = memoryState.allRecords.map((item) => (item.id === id ? normalizeRecord({ ...item, ...updates }) : item));
  deriveRecords();
  emit(memoryState);
  return memoryState;
}

export async function deleteRecord(id) {
  if (isElectron()) return window.electronAPI.deleteRecord(id);
  pushUndoSnapshot();
  memoryState.allRecords = memoryState.allRecords.filter((item) => item.id !== id);
  deriveRecords();
  emit(memoryState);
  return memoryState;
}

export async function undoRecords() {
  if (isElectron()) return window.electronAPI.undoRecords();
  if (undoStack.length === 0) return memoryState;
  memoryState.allRecords = cloneRecords(undoStack.pop());
  deriveRecords();
  emit(memoryState);
  return memoryState;
}

export function subscribeRecords(callback) {
  if (isElectron()) return window.electronAPI.subscribeRecords(callback);
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function getStations() {
  if (isElectron()) return window.electronAPI.getStations();
  return memoryState.stations;
}
