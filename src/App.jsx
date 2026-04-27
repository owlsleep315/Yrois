import { useEffect, useMemo, useState } from "react";
import "./App.css";

const TRAIN_TIMES = {
  "102": "09:15",
  "214": "10:42",
  "1004": "11:10",
  "1531": "10:58",
  "505": "12:21",
  "1401": "13:05",
  "302": "14:20",
  "703": "15:40",
};

const TYPES = ["리프트", "휠프트", "휠필", "시각(남)", "시각(여)", "유실물", "역물품"];
const BOARDING_TYPES = ["승차", "하차"];

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getTodayKey() {
  return formatDateKey(new Date());
}

function formatDateLabel(dateKey) {
  const date = parseDateKey(dateKey);
  const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return `${dateKey} ${weekdays[date.getDay()]}`;
}

function addDate(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return formatDateKey(date);
}

function getDirection(trainNo) {
  return Number(trainNo) % 2 === 0 ? "up" : "down";
}

function getSeatDisplay(carNo, seatNo) {
  if (!carNo) return "-";
  return (
    <>
      <span className="circle">{carNo}</span>
      {seatNo && <span className="seat-no">{seatNo}</span>}
    </>
  );
}

function isCsvTarget(item) {
  return item.type !== "유실물" && item.type !== "역물품";
}

function makeCsv(items, dateKey) {
  const headers = ["날짜", "열차번호", "도착시간", "승하차", "좌석", "분류", "도착역", "비고"];
  const rows = items.filter(isCsvTarget).map((item) => [
    dateKey,
    item.trainNo,
    item.arrivalTime,
    item.boarding,
    `${item.carNo || ""}${item.seatNo ? `-${item.seatNo}` : ""}`,
    item.type,
    item.destination,
    item.memo,
  ]);

  return [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function saveOffline(dateKey, items) {
  localStorage.setItem(`korail-json-${dateKey}`, JSON.stringify(items));
  localStorage.setItem(`korail-csv-${dateKey}`, makeCsv(items, dateKey));

  // Electron preload에서 window.korailAPI.saveData를 연결하면 실제 파일 저장 가능
  if (window.korailAPI?.saveData) {
    window.korailAPI.saveData({
      date: dateKey,
      json: items,
      csv: makeCsv(items, dateKey),
    });
  }
}

function loadOffline(dateKey) {
  const raw = localStorage.getItem(`korail-json-${dateKey}`);
  return raw ? JSON.parse(raw) : [];
}

const emptyForm = {
  id: null,
  trainNo: "",
  arrivalTime: "",
  boarding: "승차",
  carNo: "",
  seatNo: "",
  type: "리프트",
  destination: "",
  manager: "",
  memo: "",
};

export default function App() {
  const [dateKey, setDateKey] = useState(getTodayKey());
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState(null);
  const [fullscreenBoard, setFullscreenBoard] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    setItems(loadOffline(dateKey));
    setSelectedId(null);
    setForm(emptyForm);
  }, [dateKey]);

  useEffect(() => {
    saveOffline(dateKey, items);
  }, [items, dateKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      forceTick((v) => v + 1);

      const now = new Date();
      setItems((prev) =>
        prev.filter((item) => {
          const trainTime = new Date(`${dateKey}T${item.arrivalTime}:00`);
          const diffMin = (now - trainTime) / 60000;
          return diffMin < 30 || dateKey !== getTodayKey();
        })
      );
    }, 30000);

    return () => clearInterval(timer);
  }, [dateKey]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key.toLowerCase() === "f") {
        setFullscreenBoard(true);
        document.documentElement.requestFullscreen?.();
      }

      if (e.key === "Escape") {
        setFullscreenBoard(false);
        document.exitFullscreen?.();
      }

      if (e.key === "Delete" && selectedId) {
        setItems((prev) => prev.filter((item) => item.id !== selectedId));
        setSelectedId(null);
        setForm(emptyForm);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreenBoard(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const visibleItems = useMemo(() => {
    const now = new Date();

    return items
      .map((item) => {
        const trainTime = new Date(`${dateKey}T${item.arrivalTime}:00`);
        const diffMin = (now - trainTime) / 60000;
        return {
          ...item,
          isPast: dateKey === getTodayKey() && diffMin >= 10,
        };
      })
      .sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
  }, [items, dateKey]);

  const upItems = visibleItems.filter((item) => item.direction === "up");
  const downItems = visibleItems.filter((item) => item.direction === "down");

  const updateForm = (name, value) => {
    setForm((prev) => {
      const next = { ...prev, [name]: value };

      if (name === "trainNo") {
        const clean = value.replace(/\D/g, "");
        next.trainNo = clean;
        next.arrivalTime = TRAIN_TIMES[clean] || "";
      }

      if (name === "boarding" && value === "하차") {
        next.destination = "익산";
        next.seatNo = "";
      }

      if (name === "boarding" && value === "승차" && prev.destination === "익산") {
        next.destination = "";
      }

      if (name === "type" && (value === "유실물" || value === "역물품")) {
        next.seatNo = "";
      }

      if (name === "carNo") {
        const n = Number(value);
        next.carNo = value === "" ? "" : Math.min(18, Math.max(1, n));
      }

      return next;
    });
  };

  const submit = (e) => {
    e.preventDefault();

    if (!TRAIN_TIMES[form.trainNo]) {
      alert("기존 파일에 등록된 열차번호만 입력할 수 있습니다.");
      return;
    }


    const payload = {
      ...form,
      id: form.id || crypto.randomUUID(),
      direction: getDirection(form.trainNo),
      contactDone: form.contactDone || false,
      destination: form.boarding === "하차" ? "익산" : form.destination,
    };

    setItems((prev) => {
      if (form.id) return prev.map((item) => (item.id === form.id ? payload : item));
      return [...prev, payload];
    });

    setSelectedId(null);
    setForm(emptyForm);
  };

  const selectItem = (item) => {
    setSelectedId(item.id);
    setForm(item);
  };

  const deleteItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setContextMenu(null);
    if (selectedId === id) {
      setSelectedId(null);
      setForm(emptyForm);
    }
  };

  const toggleContact = (id) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, contactDone: !item.contactDone } : item))
    );
  };

  const downloadCsv = () => {
    const csv = makeCsv(items, dateKey);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `승하차보조_${dateKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={fullscreenBoard ? "app fullscreen-mode" : "app"}>
      <div className="mock">
        {!fullscreenBoard && (
          <header className="toolbar">
            <div className="date-nav">
              <button className="btn light" onClick={() => setDateKey(addDate(dateKey, -1))}>
                &lt;
              </button>
              <div className="date-pill">{formatDateLabel(dateKey)}</div>
              <button className="btn light" onClick={() => setDateKey(addDate(dateKey, 1))}>
                &gt;
              </button>
            </div>

            <div className="toolbar-actions">
              <button className="btn sub" onClick={downloadCsv}>CSV 저장</button>
              <button className="btn" onClick={() => setFullscreenBoard(true)}>전체화면</button>
            </div>
          </header>
        )}

        <main className="layout split">
          <Board
            title="상선"
            items={upItems}
            selectedId={selectedId}
            onSelect={selectItem}
            onContext={(e, item) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, id: item.id });
            }}
            onToggleContact={toggleContact}
          />

          <Board
            title="하선"
            items={downItems}
            selectedId={selectedId}
            onSelect={selectItem}
            onContext={(e, item) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, id: item.id });
            }}
            onToggleContact={toggleContact}
          />
        </main>

        {!fullscreenBoard && (
          <form className="formbar" onSubmit={submit}>
            <Field label="열차번호">
              <input
                value={form.trainNo}
                onChange={(e) => updateForm("trainNo", e.target.value)}
              />
            </Field>

            <Field label="도착시간">
              <input value={form.arrivalTime} readOnly placeholder="자동 입력" />
            </Field>

            <Field label="승하차">
              <select value={form.boarding} onChange={(e) => updateForm("boarding", e.target.value)}>
                {BOARDING_TYPES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>

            <Field label="호차">
              <input
                type="number"
                min="1"
                max="18"
                value={form.carNo}
                onChange={(e) => updateForm("carNo", e.target.value)}
              />
            </Field>

            <Field label="좌석">
              <input
                value={form.seatNo}
                onChange={(e) => updateForm("seatNo", e.target.value.toUpperCase())}
                disabled={form.boarding === "하차" || form.type === "유실물" || form.type === "역물품"}
              />
            </Field>

            <Field label="분류">
              <select value={form.type} onChange={(e) => updateForm("type", e.target.value)}>
                {TYPES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>

            <Field label="도착역">
              <input
                value={form.destination}
                onChange={(e) => updateForm("destination", e.target.value)}
                readOnly={form.boarding === "하차"}
              />
            </Field>

            <Field label="담당자">
              <input value={form.manager} onChange={(e) => updateForm("manager", e.target.value)} />
            </Field>


            <Field label="비고" className="field-wide">
              <input value={form.memo} onChange={(e) => updateForm("memo", e.target.value)} />
            </Field>

            <div className="form-actions">
              <button className="btn" type="submit">{form.id ? "수정" : "등록"}</button>
              <button
                className="btn sub"
                type="button"
                onClick={() => {
                  setForm(emptyForm);
                  setSelectedId(null);
                }}
              >
                초기화
              </button>
            </div>
          </form>
        )}
      </div>

      {contextMenu && (
        <button
          className="context-delete"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => deleteItem(contextMenu.id)}
        >
          삭제
        </button>
      )}
    </div>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Board({ title, items, selectedId, onSelect, onContext, onToggleContact }) {
  return (
    <section className="board">
      <div className="board-title">
        <strong>{title}</strong>
        <span>{items.length}건</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "13%" }} />
          </colgroup>

          <thead>
            <tr>
              <th>열차</th>
              <th>도착</th>
              <th>승하차</th>
              <th>좌석</th>
              <th>분류</th>
              <th>도착역</th>
              <th>담당자</th>
              <th>상태</th>
              <th>비고</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && (
              <tr>
                <td className="empty-row" colSpan="9">등록된 승하차보조 건이 없습니다.</td>
              </tr>
            )}

            {items.map((item) => (
              <tr
                key={item.id}
                className={`${item.isPast ? "past" : ""} ${selectedId === item.id ? "selected" : ""}`}
                onClick={() => onSelect(item)}
                onContextMenu={(e) => onContext(e, item)}
              >
                <td className="train-no">#{item.trainNo}</td>
                <td>{item.arrivalTime}</td>
                <td className={item.boarding === "승차" ? "boarding up" : "boarding down"}>
                  {item.boarding === "승차" ? "↑ 승차" : "↓ 하차"}
                </td>
                <td>{getSeatDisplay(item.carNo, item.seatNo)}</td>
                <td>{item.type}</td>
                <td>{item.destination || "-"}</td>
                <td><span className="small-text">{item.manager || "-"}</span></td>
                <td onClick={(e) => e.stopPropagation()}>
                  {item.boarding === "승차" ? (
                    <label className="contact">
                      <input
                        type="checkbox"
                        checked={item.contactDone}
                        onChange={() => onToggleContact(item.id)}
                      />
                    </label>
                  ) : (
                    <span className="contact empty">-</span>
                  )}
                </td>
                <td><span className="small-text">{item.memo || "-"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}