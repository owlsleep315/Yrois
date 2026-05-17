import { useEffect, useMemo, useRef, useState } from "react";
import { addRecord, deleteRecord, getRecordsState, getStations, setDateKey as updateDateKey, subscribeRecords, updateRecord } from "./services/recordStore";
import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import StationAutocompleteInput from "./components/StationAutocompleteInput";
import NoticeModal from "./components/NoticeModal";

const TYPES = ["리프트", "휠프트", "휠필", "시각(남)", "시각(여)", "유실물", "역물품", "승하차도움"];
const BOARDING_TYPES = ["승차", "하차"];
const MAX_DESTINATION_LENGTH = 6;
const MAX_MANAGER_LENGTH = 6;
const MAX_MEMO_LENGTH = 50;
const DEFAULT_STATIONS = ["광주송정", "천안아산", "인천공항", "온양온천", "여수EXPO"];

const KOREAN_TO_QWERTY = {
  ㅂ: "Q", ㅈ: "W", ㄷ: "E", ㄱ: "R", ㅅ: "T", ㅛ: "Y", ㅕ: "U", ㅑ: "I", ㅐ: "O", ㅔ: "P",
  ㅁ: "A", ㄴ: "S", ㅇ: "D", ㄹ: "F", ㅎ: "G", ㅗ: "H", ㅓ: "J", ㅏ: "K", ㅣ: "L",
  ㅋ: "Z", ㅌ: "X", ㅊ: "C", ㅍ: "V", ㅠ: "B", ㅜ: "N", ㅡ: "M",
};


function formatDateKey(date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0"); return `${y}-${m}-${d}`; }
function parseDateKey(dateKey) { const [y, m, d] = dateKey.split("-").map(Number); return new Date(y, m - 1, d); }
function getTodayKey() { return formatDateKey(new Date()); }
function parseRecordDateTime(dateKey, arrivalTime) {
  if (!dateKey || !arrivalTime) return null;
  const [hours, minutes] = arrivalTime.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const date = parseDateKey(dateKey);
  date.setHours(hours, minutes, 0, 0);
  return date;
}
function formatDateLabel(dateKey) { const date = parseDateKey(dateKey); const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]; return `${dateKey} ${weekdays[date.getDay()]}`; }
function addDate(dateKey, amount) { const date = parseDateKey(dateKey); date.setDate(date.getDate() + amount); return formatDateKey(date); }
function getDirection(trainNo) { return Number(trainNo) % 2 === 0 ? "up" : "down"; }
function getSeatDisplay(carNo, seatNo) { if (!carNo) return "-"; return <><span className="circle">{carNo}</span>{seatNo && <span className="seat-no">{seatNo}</span>}</>; }
function normalizeSeatInput(value = "") {
  // 좌석 입력 필드에서 한글 자판 입력을 영문 대문자로 보정
  return Array.from(value).map((char) => KOREAN_TO_QWERTY[char] || char.toUpperCase()).join("");
}
const emptyForm = { id: null, trainNo: "", arrivalTime: "", boarding: "승차", carNo: "", seatNo: "", type: "리프트", destination: "", manager: "", memo: "" };

export default function App() {
  const [recordsState, setRecordsState] = useState({
    dateKey: getTodayKey(),
    records: [],
    allRecords: [],
    trainTimes: {},
  });
  const [stations, setStations] = useState(DEFAULT_STATIONS);

  useEffect(() => {
    let mounted = true;
    const applyState = (nextState) => {
      setRecordsState({
        dateKey: nextState?.dateKey || getTodayKey(),
        records: nextState?.records || [],
        allRecords: nextState?.allRecords || [],
        trainTimes: nextState?.trainTimes || {},
      });
    };

    getRecordsState().then((state) => {
      if (!mounted) return;
      applyState(state);
    });

    getStations().then((loadedStations) => {
      if (!mounted) return;
      if (Array.isArray(loadedStations) && loadedStations.length > 0) setStations(loadedStations);
    }).catch(() => {});

    const unsubscribe = subscribeRecords((state) => {
      applyState(state);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const changeDateKey = async (nextDateKey) => {
    setRecordsState((prev) => ({ ...prev, dateKey: nextDateKey }));
    const latestState = await updateDateKey(nextDateKey);
    if (latestState) {
      setRecordsState({
        dateKey: latestState?.dateKey || nextDateKey,
        records: latestState?.records || [],
        allRecords: latestState?.allRecords || [],
        trainTimes: latestState?.trainTimes || {},
      });
    }
  };

  const dataProps = {
    recordsState,
    dateKey: recordsState.dateKey,
    changeDateKey,
    items: recordsState.records,
    trainTimes: recordsState.trainTimes,
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin" element={<AdminPage {...dataProps} stations={stations} />} />
      <Route path="/display" element={<DisplayPage {...dataProps} />} />
    </Routes>
  );
}

function AdminPage({ recordsState, dateKey, changeDateKey, trainTimes, stations }) {
  useEffect(() => { document.title = "Yrois Main"; }, []);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [notice, setNotice] = useState({ open: false, message: "" });
  const trainNoInputRef = useRef(null);
  const now = useNowTick();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedId(null); setForm(emptyForm); }, [dateKey]);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Delete" && selectedId) {
        deleteRecord(selectedId);
        setSelectedId(null);
        setForm(emptyForm);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const visibleItems = useVisibleItems(recordsState, now);
  const upItems = visibleItems.filter((item) => item.direction === "up");
  const downItems = visibleItems.filter((item) => item.direction === "down");

  const updateForm = (name, value) => { setForm((prev) => { const next = { ...prev, [name]: value }; if (name === "trainNo") { const clean = value.replace(/\D/g, ""); next.trainNo = clean; next.arrivalTime = trainTimes[clean] || ""; } if (name === "boarding" && value === "하차") { next.destination = "익산"; next.seatNo = ""; } if (name === "boarding" && value === "승차" && prev.destination === "익산") next.destination = ""; if (name === "type" && (value === "유실물" || value === "역물품")) next.seatNo = ""; if (name === "carNo") { const n = Number(value); next.carNo = value === "" ? "" : Math.min(18, Math.max(1, n)); } return next; }); };
  const openNotice = (message, afterClose) => setNotice({ open: true, message, afterClose });
  const closeNotice = () => {
    const callback = notice.afterClose;
    setNotice({ open: false, message: "" });
    if (typeof callback === "function") requestAnimationFrame(() => callback());
  };

  const validateLength = (value, max, label) => {
    if ((value || "").length > max) {
      openNotice(`${label}은(는) 최대 ${max}자까지 입력할 수 있습니다.`);
      return false;
    }
    return true;
  };
  const submit = (e) => { 
    e.preventDefault(); 
    if (!trainTimes[form.trainNo]) {
      openNotice("유효한 열차 번호를 입력해주세요.", () => trainNoInputRef.current?.focus());
      return;
    } 
    if (!validateLength(form.destination, MAX_DESTINATION_LENGTH, "도착역")) return; 
    if (!validateLength(form.manager, MAX_MANAGER_LENGTH, "담당자")) return; 
    if (!validateLength(form.memo, MAX_MEMO_LENGTH, "비고")) return; 
    const latestRecord = form.id
      ? (recordsState.allRecords || []).find((item) => item.id === form.id)
      : null;
    const payload = { 
      ...form, 
      id: form.id || crypto.randomUUID(), 
      dateKey, 
      direction: getDirection(form.trainNo), 
      contactDone: form.id
        ? latestRecord?.contactDone || false
        : false,
      completed: form.id
        ? latestRecord?.completed || false
        : false,
      destination: form.boarding === "하차" ? "익산" : form.destination 
    }; 
    if (form.id) { updateRecord(form.id, payload); } else { addRecord(payload); } setSelectedId(null); setForm(emptyForm); };
  const selectItem = (item) => { setSelectedId(item.id); setForm(item); };
  const deleteItem = (id) => { deleteRecord(id); setContextMenu(null); if (selectedId === id) { setSelectedId(null); setForm(emptyForm); } };
  const toggleContact = (id) => {
    const target = (recordsState.allRecords || []).find((item) => item.id === id);
    if (target) updateRecord(id, { contactDone: !target.contactDone });
  };
  return <BoardLayout adminMode {...{ dateKey, changeDateKey, selectedId, setSelectedId, setForm, contextMenu, setContextMenu, upItems, downItems, submit, form, updateForm, selectItem, toggleContact, deleteItem, stations, trainNoInputRef, notice, closeNotice }} />;
}

function DisplayPage({ recordsState }) {
  useEffect(() => { document.title = "Yrois Display"; }, []);
  const now = useNowTick();
  const visibleItems = useVisibleItems(recordsState, now);
  const upItems = visibleItems.filter((item) => item.direction === "up");
  const downItems = visibleItems.filter((item) => item.direction === "down");
  const isDisplayDataEmpty = upItems.length === 0 && downItems.length === 0;

  if (isDisplayDataEmpty) return <div className="display-empty-blackout" aria-hidden="true" />;

  return <BoardLayout upItems={upItems} downItems={downItems} />;
}

function useNowTick(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function getItemTimeState(item, selectedDateKey, now) {
  const targetDateKey = item.dateKey || selectedDateKey;
  const trainDateTime = parseRecordDateTime(targetDateKey, item.arrivalTime);
  if (!trainDateTime) return { hidden: false };

  const todayKey = formatDateKey(now);
  if (targetDateKey !== todayKey) return { hidden: false };

  const diffMinutes = (trainDateTime.getTime() - now.getTime()) / 60000;
  return { hidden: false, remainingMinutes: diffMinutes };
}

function useVisibleItems(recordsState, now) {
  return useMemo(() => {
    const dateKey = recordsState?.dateKey || getTodayKey();
    const allRecords = recordsState?.allRecords || [];
    const fallbackRecords = recordsState?.records || [];

    const sourceRecords = allRecords.length > 0 ? allRecords : fallbackRecords;

    return sourceRecords
      .filter((item) => (item.dateKey || dateKey) === dateKey)
      .filter((item) => !item.completed)
      .map((item) => ({
        ...item,
        ...getItemTimeState(item, item.dateKey || dateKey, now),
      }))
      .filter((item) => !item.hidden)
      .sort((a, b) => (a.arrivalTime || "").localeCompare(b.arrivalTime || ""));
  }, [recordsState, now]);
}

function BoardLayout({ adminMode = false, dateKey, changeDateKey, selectedId, setSelectedId, setForm, contextMenu, setContextMenu, upItems, downItems, submit, form, updateForm, selectItem, toggleContact, deleteItem, stations = [], trainNoInputRef, notice, closeNotice }) {
  const pageClassName = adminMode ? "app" : "app display-page";
  const mockClassName = adminMode ? "mock" : "mock display-mock";
  const layoutClassName = adminMode ? "layout split" : "layout split display-split";

  const contextMenuRef = useRef(null);


  useEffect(() => {
    if (!adminMode || !selectedId) return undefined;
    const onPointerDown = (event) => {
      if (event.target.closest(".table tbody tr") || event.target.closest(".formbar") || event.target.closest(".context-delete")) return;
      setSelectedId(null);
      setForm(emptyForm);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [adminMode, selectedId, setSelectedId, setForm]);

  useEffect(() => {
    if (!adminMode || !contextMenu) return undefined;
    const onPointerDown = (event) => {
      if (contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [adminMode, contextMenu, setContextMenu]);

  return <div className={pageClassName}><div className={mockClassName}>{adminMode && <header className="toolbar"><div className="date-nav"><button className="btn light" onClick={() => changeDateKey(addDate(dateKey, -1))}>&lt;</button><div className="date-pill">{formatDateLabel(dateKey)}</div><button className="btn light" onClick={() => changeDateKey(addDate(dateKey, 1))}>&gt;</button></div></header>}<main className={layoutClassName}><div className={adminMode ? "" : "display-board-pane"}><Board title="상선" items={upItems} selectedId={selectedId} onSelect={selectItem} onContext={(e, item) => { if (!adminMode) return; e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: item.id }); }} onToggleContact={toggleContact} readonly={!adminMode} /></div><div className={adminMode ? "" : "display-board-pane"}><Board title="하선" items={downItems} selectedId={selectedId} onSelect={selectItem} onContext={(e, item) => { if (!adminMode) return; e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: item.id }); }} onToggleContact={toggleContact} readonly={!adminMode} /></div></main>{adminMode && <form className="formbar" onSubmit={submit}><Field label="열차번호"><input ref={trainNoInputRef} value={form.trainNo} onChange={(e) => updateForm("trainNo", e.target.value)} /></Field><Field label="도착시간"><input value={form.arrivalTime} readOnly placeholder="자동입력" /></Field><Field label="승하차"><select value={form.boarding} onChange={(e) => updateForm("boarding", e.target.value)}>{BOARDING_TYPES.map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="호차"><input type="number" min="1" max="18" value={form.carNo} onChange={(e) => updateForm("carNo", e.target.value)} /></Field><Field label="좌석"><input value={form.seatNo} onChange={(e) => updateForm("seatNo", normalizeSeatInput(e.target.value))} disabled={form.boarding === "하차" || form.type === "유실물" || form.type === "역물품"} /></Field><Field label="분류"><select value={form.type} onChange={(e) => updateForm("type", e.target.value)}>{TYPES.map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="도착역"><StationAutocompleteInput value={form.destination} onChange={(e) => updateForm("destination", e.target.value)} maxLength={MAX_DESTINATION_LENGTH} readOnly={form.boarding === "하차"} stations={stations} /></Field><Field label="담당자"><input value={form.manager} onChange={(e) => updateForm("manager", e.target.value)} maxLength={MAX_MANAGER_LENGTH} /></Field><Field label="비고" className="field-wide"><input value={form.memo} onChange={(e) => updateForm("memo", e.target.value)} maxLength={MAX_MEMO_LENGTH} /></Field><div className="form-actions"><button className="btn" type="submit">{form.id ? "수정" : "등록"}</button>{form.id ? <button className="btn success" type="button" onClick={() => { updateRecord(form.id, { completed: true }); setForm(emptyForm); setSelectedId(null); }}>완료</button> : <button className="btn sub" type="button" onClick={() => { setForm(emptyForm); setSelectedId(null); }}>초기화</button>}</div></form>}</div>{adminMode && contextMenu && <button ref={contextMenuRef} className="context-delete" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={() => deleteItem(contextMenu.id)}>삭제</button>}
{adminMode && <NoticeModal open={notice?.open} message={notice?.message} onClose={closeNotice} />}
</div>;
}


function Field({ label, children, className = "" }) { return <label className={`field ${className}`.trim()}><span>{label}</span>{children}</label>; }
function getTrainAdjustment(trainNo, record) {
  void trainNo;
  void record;
  // TODO: 열차번호, 상하선을 기준으로
  //       승하차 조정 필요 여부를 계산하는 알고리즘 추가 예정.
  return null;
}
function displayOrDash(value) {
  if (value == null || value === "") return "-";
  return value;
}
function Board({ title, items, selectedId, onSelect, onContext, onToggleContact, readonly = false }) { return <section className="board"><div className="board-title"><strong>{title}</strong><span>{items.length}건</span></div><div className="table-wrap"><table className="table"><colgroup><col style={{ width: "8%" }} /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} /><col style={{ width: "8%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "9%" }} /><col style={{ width: "6%" }} /><col style={{ width: "7%" }} /><col style={{ width: "25%" }} /></colgroup><thead><tr><th>열차번호</th><th>도착시간</th><th>승하차</th><th>좌석</th><th>분류</th><th>도착역</th><th>담당자</th><th>연락 상태</th><th>열차조정</th><th>비고</th></tr></thead><tbody>{items.length === 0 && <tr><td className="empty-row" colSpan="10">등록된 승하차보조 건이 없습니다.</td></tr>}{items.map((item) => <tr key={item.id} className={`${item.remainingMinutes <= 10 ? "imminent" : ""} ${selectedId === item.id ? "selected" : ""}`} onClick={() => !readonly && onSelect?.(item)} onContextMenu={(e) => onContext?.(e, item)}><td className="train-no">#{item.trainNo}</td><td><span className="arrival-pill">{item.arrivalTime}</span></td><td className={item.boarding === "승차" ? "boarding up" : "boarding down"}>{item.boarding === "승차" ? "↑ 승차" : "↓ 하차"}</td><td>{getSeatDisplay(item.carNo, item.seatNo)}</td><td>{item.type}</td><td>{item.destination || "-"}</td><td>{item.manager || "-"}</td><td onClick={(e) => e.stopPropagation()}>{item.boarding === "승차" ? <label className="contact"><input type="checkbox" checked={item.contactDone} readOnly={readonly} aria-readonly={readonly} tabIndex={readonly ? -1 : 0} onClick={(e) => readonly && e.preventDefault()} onChange={() => !readonly && onToggleContact?.(item.id)} /></label> : <span className="contact empty">-</span>}</td><td>{displayOrDash(getTrainAdjustment(item.trainNo, item))}</td><td><span className="memo-text">{item.memo || "-"}</span></td></tr>)}</tbody></table></div></section>; }
