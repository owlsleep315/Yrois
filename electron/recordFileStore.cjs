const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function ensureDir(dirPath) { if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true }); }
function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) { writeJson(filePath, fallback); return fallback; }
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) { writeJson(filePath, fallback); return fallback; }
    return JSON.parse(raw);
  } catch {
    writeJson(filePath, fallback);
    return fallback;
  }
}

function excelTimeToHHmm(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const dayPortion = ((value % 1) + 1) % 1;
    const totalMinutes = Math.round(dayPortion * 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }
  const normalized = String(value).trim().replace('.', ':');
  const match = normalized.match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/);
  if (!match) return null;
  const h = Number(match[1]); const m = Number(match[2] ?? '0');
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function loadTrainTimesFromExcel(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheet = workbook.Sheets['열차시각표'];
    if (!sheet) return {};
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const result = {};
    for (const row of rows) {
      const trainNo = String(row['열차번호'] ?? '').trim();
      const arrivalTime = excelTimeToHHmm(row['도착시각']);
      if (trainNo && arrivalTime) result[trainNo] = arrivalTime;
    }
    return result;
  } catch { return {}; }
}

const TYPE_FILTERS = {
  boarding: new Set(['리프트', '휠필', '시각(남)', '시각(여)', '휠프트', '승하차도움']),
  lost: new Set(['유실물', '역물품']),
};

function getMonthKey(dateKey = '') { return dateKey.slice(0, 7); }
function makeMonthlyFileName(monthKey, kind) {
  const [y, m] = monthKey.split('-').map(Number);
  const yy = String(y % 100);
  const suffix = kind === 'boarding' ? '승하차보조' : '유실물';
  return `${yy}년${m}월_${suffix}.xlsx`;
}
function getMonthlyRecords(records, monthKey) { return records.filter((r) => getMonthKey(r.dateKey) === monthKey); }
function getRecordsByType(records, kind) { const allowed = TYPE_FILTERS[kind]; return records.filter((r) => allowed?.has(r.type)); }

function toRows(records) {
  return records
    .sort((a, b) => `${a.dateKey || ''}${a.arrivalTime || ''}`.localeCompare(`${b.dateKey || ''}${b.arrivalTime || ''}`))
    .map((r) => ({
      날짜: r.dateKey,
      열차번호: r.trainNo,
      도착시간: r.arrivalTime,
      승하차: r.boarding,
      호차: r.carNo || '',
      좌석: r.seatNo || '',
      분류: r.type || '',
      도착역: r.boarding === '하차' ? (r.destination || '익산') : (r.destination || ''),
      담당자: r.manager || '',
      비고: r.memo || '',
    }));
}

function createRecordStore(basePath) {
  const DATA_DIR = path.join(basePath, 'data');
  const EXPORTS_DIR = path.join(basePath, 'exports');
  const TRAIN_TIMES_PATH = path.join(DATA_DIR, 'train-data.xlsm');
  const RECORDS_PATH = path.join(DATA_DIR, 'boarding-records.json');

  function initStore() {
    ensureDir(DATA_DIR); ensureDir(EXPORTS_DIR);
    return { trainTimes: loadTrainTimesFromExcel(TRAIN_TIMES_PATH), allRecords: safeReadJson(RECORDS_PATH, []) };
  }
  function persistRecords(records) { writeJson(RECORDS_PATH, records); }

  function regenerateMonthlyXlsx(records, changedDateKeys = []) {
    ensureDir(EXPORTS_DIR);
    const changedMonths = [...new Set(changedDateKeys.filter(Boolean).map(getMonthKey))];
    for (const monthKey of changedMonths) {
      const monthlyRecords = getMonthlyRecords(records, monthKey);
      for (const kind of ['boarding', 'lost']) {
        const fileName = makeMonthlyFileName(monthKey, kind);
        const filePath = path.join(EXPORTS_DIR, fileName);
        const filtered = getRecordsByType(monthlyRecords, kind);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(toRows(filtered), { header: ['날짜','열차번호','도착시간','승하차','호차','좌석','분류','도착역','담당자','비고'] });
        XLSX.utils.book_append_sheet(wb, ws, '기록');
        XLSX.writeFile(wb, filePath);
      }
    }
  }

  return { initStore, persistRecords, regenerateMonthlyXlsx, paths: { DATA_DIR, EXPORTS_DIR, TRAIN_TIMES_PATH, RECORDS_PATH } };
}

module.exports = { createRecordStore };
