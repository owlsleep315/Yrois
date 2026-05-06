const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const HANDOVER_DIR = path.join(DATA_DIR, 'handover');
const TRAIN_TIMES_PATH = path.join(DATA_DIR, 'train-times.json');
const RECORDS_PATH = path.join(DATA_DIR, 'boarding-records.json');

const TRAIN_TIMES_SAMPLE = { '102': '09:15', '214': '10:42', '1004': '11:10' };

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      writeJson(filePath, fallback);
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) {
      writeJson(filePath, fallback);
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error(`JSON parse/read failed for ${filePath}:`, error);
    try {
      fs.copyFileSync(filePath, `${filePath}.bak-${Date.now()}`);
    } catch (copyError) {
      console.error('Backup failed:', copyError);
    }
    writeJson(filePath, fallback);
    return fallback;
  }
}

function escapeCsv(value) {
  const escaped = String(value ?? '').replaceAll('"', '""');
  return `"${escaped}"`;
}

function makeCsv(records, dateKey) {
  const headers = ['날짜', '방향', '열차번호', '도착시간', '호차', '좌석', '구분', '승차역', '하차역', '담당자', '비고'];
  const rows = records
    .filter((r) => r.dateKey === dateKey)
    .sort((a, b) => String(a.arrivalTime || '').localeCompare(String(b.arrivalTime || '')))
    .map((r) => [
      r.dateKey,
      r.direction === 'up' ? '상선' : '하선',
      r.trainNo,
      r.arrivalTime,
      r.carNo || '',
      r.seatNo || '',
      r.type || '',
      r.boarding === '승차' ? (r.origin || '') : '-',
      r.boarding === '하차' ? (r.destination || '익산') : (r.destination || ''),
      r.manager || '',
      r.memo || '',
    ]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}

function regenerateCsv(records, dateKey) {
  ensureDir(HANDOVER_DIR);
  const csvPath = path.join(HANDOVER_DIR, `${dateKey}.csv`);
  const csv = makeCsv(records, dateKey);
  fs.writeFileSync(csvPath, `\uFEFF${csv}`, 'utf8');
}

function initStore() {
  ensureDir(DATA_DIR);
  ensureDir(HANDOVER_DIR);
  const trainTimes = safeReadJson(TRAIN_TIMES_PATH, TRAIN_TIMES_SAMPLE);
  const allRecords = safeReadJson(RECORDS_PATH, []);
  return { trainTimes, allRecords };
}

function persistRecords(records) {
  writeJson(RECORDS_PATH, records);
}

module.exports = {
  initStore,
  persistRecords,
  regenerateCsv,
  paths: {
    DATA_DIR,
    HANDOVER_DIR,
    TRAIN_TIMES_PATH,
    RECORDS_PATH,
  },
};
