const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

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

function excelTimeToHHmm(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const dayPortion = ((value % 1) + 1) % 1;
    const totalMinutes = Math.round(dayPortion * 24 * 60) % (24 * 60);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minutes = String(totalMinutes % 60).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  const asString = String(value).trim();
  if (!asString) return null;
  const normalized = asString.replace('.', ':');
  const match = normalized.match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function loadTrainTimesFromExcel(filePath) {
  if (!fs.existsSync(filePath)) return {};

  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheetName = '열차시각표';
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      console.error(`Sheet not found: ${sheetName}`);
      return {};
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const result = {};

    for (const row of rows) {
      const trainNoRaw = row['열차번호'];
      const arrivalRaw = row['도착시각'];
      if (trainNoRaw == null || trainNoRaw === '' || arrivalRaw == null || arrivalRaw === '') continue;

      const trainNo = String(trainNoRaw).trim();
      const arrivalTime = excelTimeToHHmm(arrivalRaw);
      if (!trainNo || !arrivalTime) continue;
      result[trainNo] = arrivalTime;
    }

    return result;
  } catch (error) {
    console.error(`Failed to read train-times.xlsx at ${filePath}:`, error);
    return {};
  }
}

function escapeCsv(value) {
  const escaped = String(value ?? '').replaceAll('"', '""');
  return `"${escaped}"`;
}

function makeCsv(records, dateKey) {
  const headers = ['날짜', '열차번호', '도착시간', '승하차', '호차', '좌석', '분류', '도착역', '담당자', '비고'];
  const rows = records
    .filter((r) => r.dateKey === dateKey)
    .sort((a, b) => String(a.arrivalTime || '').localeCompare(String(b.arrivalTime || '')))
    .map((r) => [
      r.dateKey,
      r.trainNo,
      r.arrivalTime,
      r.boarding,
      r.carNo || '',
      r.seatNo || '',
      r.type || '',
      r.boarding === '하차' ? (r.destination || '익산') : (r.destination || ''),
      r.manager || '',
      r.memo || '',
    ]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}

const CSV_TYPE_FILTERS = {
  boarding: new Set(['리프트', '휠필', '시각(남)', '시각(여)', '휠프트']),
  lost: new Set(['유실물', '역물품']),
};

function getRecordsByCsvType(records, dateKey, csvType) {
  const allowedTypes = CSV_TYPE_FILTERS[csvType];
  if (!allowedTypes) return [];
  return records.filter((record) => record.dateKey === dateKey && allowedTypes.has(record.type));
}

function createRecordStore(basePath) {
  const DATA_DIR = path.join(basePath, 'data');
  const EXPORTS_DIR = path.join(basePath, 'exports');
  const TRAIN_TIMES_PATH = path.join(DATA_DIR, 'train-data.xlsm');
  const RECORDS_PATH = path.join(DATA_DIR, 'boarding-records.json');

  function initStore() {
    ensureDir(DATA_DIR);
    ensureDir(EXPORTS_DIR);
    const trainTimes = loadTrainTimesFromExcel(TRAIN_TIMES_PATH);
    const allRecords = safeReadJson(RECORDS_PATH, []);
    return { trainTimes, allRecords };
  }

  function persistRecords(records) {
    writeJson(RECORDS_PATH, records);
  }

  function regenerateCsv(records, dateKey) {
    ensureDir(EXPORTS_DIR);
    const csvTargets = [
      { type: 'boarding', suffix: 'boarding' },
      { type: 'lost', suffix: 'lost' },
    ];
    for (const target of csvTargets) {
      const csvPath = path.join(EXPORTS_DIR, `${dateKey}-${target.suffix}.csv`);
      const filteredRecords = getRecordsByCsvType(records, dateKey, target.type);
      const csv = makeCsv(filteredRecords, dateKey);
      fs.writeFileSync(csvPath, `\uFEFF${csv}`, 'utf8');
    }
  }

  return {
    initStore,
    persistRecords,
    regenerateCsv,
    paths: {
      DATA_DIR,
      EXPORTS_DIR,
      TRAIN_TIMES_PATH,
      RECORDS_PATH,
    },
  };
}

module.exports = {
  createRecordStore,
};
