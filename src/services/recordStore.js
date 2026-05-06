const memoryState = { dateKey: formatDateKey(new Date()), items: [] };
const listeners = new Set();

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function emit(state) {
  for (const listener of listeners) listener(state);
}

function isElectron() {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

export async function getRecordsState() {
  if (isElectron()) return window.electronAPI.getState();
  return memoryState;
}

export async function setDateKey(dateKey) {
  if (isElectron()) return window.electronAPI.setDateKey(dateKey);
  memoryState.dateKey = dateKey;
  memoryState.items = [];
  emit(memoryState);
  return memoryState;
}

export async function addRecord(record) {
  if (isElectron()) return window.electronAPI.addRecord(record);
  memoryState.items = [...memoryState.items, record];
  emit(memoryState);
  return memoryState;
}

export async function updateRecord(id, updates) {
  if (isElectron()) return window.electronAPI.updateRecord(id, updates);
  memoryState.items = memoryState.items.map((item) => (item.id === id ? { ...item, ...updates } : item));
  emit(memoryState);
  return memoryState;
}

export async function deleteRecord(id) {
  if (isElectron()) return window.electronAPI.deleteRecord(id);
  memoryState.items = memoryState.items.filter((item) => item.id !== id);
  emit(memoryState);
  return memoryState;
}

export function subscribeRecords(callback) {
  if (isElectron()) return window.electronAPI.subscribeRecords(callback);
  listeners.add(callback);
  return () => listeners.delete(callback);
}
