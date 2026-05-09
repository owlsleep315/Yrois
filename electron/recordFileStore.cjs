const fs = require('fs');
const path = require('path');

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
  const headers = ['날짜', '방향', '열차번호', '도착시간', '호차', '좌석', '구분', '하차역', '담당자', '비고'];
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

function resolveDefaultTrainTimes() {
  const packagedTrainTimesPath = path.join(__dirname, '../data/train-times.json');
  if (fs.existsSync(packagedTrainTimesPath)) {
    return safeReadJson(packagedTrainTimesPath, TRAIN_TIMES_SAMPLE);
  }
  return TRAIN_TIMES_SAMPLE;
}

function createRecordStore(userDataPath) {
  const DATA_DIR = path.join(userDataPath, 'data');
  const EXPORTS_DIR = path.join(userDataPath, 'exports');
  const TRAIN_TIMES_PATH = path.join(DATA_DIR, 'train-times.json');
  const RECORDS_PATH = path.join(DATA_DIR, 'boarding-records.json');

  function initStore() {
    ensureDir(DATA_DIR);
    ensureDir(EXPORTS_DIR);
    const trainTimes = safeReadJson(TRAIN_TIMES_PATH, resolveDefaultTrainTimes());
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
      // CSV 타입별 필터를 분리해 추후 분류 정책 변경 시 영향 범위를 최소화합니다.
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
