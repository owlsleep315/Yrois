import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'korail-assist-json-v1'
const CSV_STORAGE_KEY = 'korail-assist-csv-v1'

const TRAIN_SCHEDULE = {
  102: '09:15',
  214: '10:42',
  505: '12:21',
  1004: '11:10',
  1531: '10:58',
  707: '13:35',
  1302: '14:20',
  2111: '15:40',
  600: '16:05',
  1443: '17:08',
}

const CATEGORIES = ['리프트', '휠프트', '휠필', '시각(남)', '시각(여)', '유실물', '역물품']
const BOARDING_TYPES = ['승차', '하차']
const EXCLUDED_CSV_CATEGORIES = new Set(['유실물', '역물품'])

const pad2 = (v) => String(v).padStart(2, '0')
const formatDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
const formatTime = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
const getDirection = (trainNo) => (Number(trainNo) % 2 === 0 ? '상선' : '하선')

const formatDisplayDate = (date) => {
  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  return `${formatDateKey(date)} ${dayNames[date.getDay()]}`
}

const parseArrivalDateTime = (dateKey, arrivalTime) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hour, minute] = arrivalTime.split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

const buildSeatDisplay = (item) => {
  const coach = Number(item.coach)
  const coachCircle = Number.isInteger(coach) && coach >= 1 && coach <= 18 ? String.fromCodePoint(9311 + coach) : ''
  return `${coachCircle}${item.seat ? ` ${item.seat}` : ''}`.trim()
}

const emptyForm = {
  id: null,
  trainNo: '',
  arrivalTime: '',
  boardingType: '승차',
  coach: '',
  seat: '',
  category: '리프트',
  destination: '',
  manager: '',
  note: '',
  transferInfo: '',
  contacted: false,
}

function App() {
  const [todayNow, setTodayNow] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [allData, setAllData] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return {}
    try {
      return JSON.parse(saved)
    } catch {
      return {}
    }
  })
  const [form, setForm] = useState(emptyForm)
  const [selectedRowId, setSelectedRowId] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData))
    saveCsvSnapshot(allData)
  }, [allData])

  useEffect(() => {
    const timer = setInterval(() => setTodayNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const removeItem = useCallback((id) => {
    setAllData((prev) => ({
      ...prev,
      [selectedDateKey]: (prev[selectedDateKey] ?? []).filter((item) => item.id !== id),
    }))
    if (selectedRowId === id) {
      setSelectedRowId(null)
      setForm(emptyForm)
    }
    setContextMenu(null)
  }, [selectedDateKey, selectedRowId])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {})
        }
      }
      if (event.key === 'Delete' && selectedRowId) {
        removeItem(selectedRowId)
      }
      if (event.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }

    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [removeItem, selectedRowId])

  const listForDate = useMemo(() => allData[selectedDateKey] ?? [], [allData, selectedDateKey])

  const visibleRows = useMemo(() => {
    const now = todayNow
    return listForDate.filter((item) => {
      const diffMinutes = (now.getTime() - parseArrivalDateTime(selectedDateKey, item.arrivalTime).getTime()) / 60_000
      return diffMinutes < 30
    })
  }, [listForDate, selectedDateKey, todayNow])

  const withMeta = useMemo(() => {
    const now = todayNow
    return visibleRows
      .map((item) => {
        const arrivalDate = parseArrivalDateTime(selectedDateKey, item.arrivalTime)
        const diffMinutes = (now.getTime() - arrivalDate.getTime()) / 60_000
        return { ...item, diffMinutes }
      })
      .sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime))
  }, [visibleRows, selectedDateKey, todayNow])

  const upRows = withMeta.filter((item) => item.direction === '상선')
  const downRows = withMeta.filter((item) => item.direction === '하선')

  const moveDate = (delta) => {
    setSelectedDate((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta)
      return next
    })
    setSelectedRowId(null)
    setForm(emptyForm)
  }

  const onTrainNoChange = (value) => {
    const onlyNum = value.replace(/[^0-9]/g, '')
    const scheduleTime = TRAIN_SCHEDULE[onlyNum] ?? ''
    const direction = onlyNum ? getDirection(onlyNum) : null
    setForm((prev) => ({
      ...prev,
      trainNo: onlyNum,
      arrivalTime: scheduleTime,
      destination: prev.boardingType === '하차' ? '익산' : prev.destination,
      transferInfo: prev.transferInfo,
      direction,
    }))
  }

  const updateBoardingType = (boardingType) => {
    setForm((prev) => ({
      ...prev,
      boardingType,
      destination: boardingType === '하차' ? '익산' : prev.destination === '익산' ? '' : prev.destination,
      contacted: boardingType === '하차' ? false : prev.contacted,
      seat: boardingType === '하차' ? '' : prev.seat,
    }))
  }

  const validateForm = () => {
    if (!TRAIN_SCHEDULE[form.trainNo]) return '열차번호는 기존 시간표에 있는 번호만 입력 가능합니다.'
    const coachNo = Number(form.coach)
    if (!Number.isInteger(coachNo) || coachNo < 1 || coachNo > 18) return '호차는 1~18 범위의 숫자만 입력 가능합니다.'
    if (!form.category) return '분류를 선택해 주세요.'
    if (form.boardingType === '승차' && !form.destination.trim()) return '승차는 도착역을 직접 입력해야 합니다.'
    if (form.boardingType === '승차' && !['유실물', '역물품'].includes(form.category) && !form.seat.trim()) return '승차(유실물/역물품 제외)는 좌석 번호가 필요합니다.'
    return null
  }

  const saveItem = (event) => {
    event.preventDefault()
    const error = validateForm()
    if (error) {
      window.alert(error)
      return
    }

    const payload = {
      id: form.id ?? crypto.randomUUID(),
      trainNo: form.trainNo,
      arrivalTime: form.arrivalTime,
      boardingType: form.boardingType,
      coach: form.coach,
      seat: form.boardingType === '하차' || ['유실물', '역물품'].includes(form.category) ? '' : form.seat,
      category: form.category,
      destination: form.boardingType === '하차' ? '익산' : form.destination,
      manager: form.manager,
      note: form.note,
      transferInfo: form.transferInfo,
      contacted: form.boardingType === '승차' ? form.contacted : false,
      direction: getDirection(form.trainNo),
      createdAt: new Date().toISOString(),
    }

    setAllData((prev) => {
      const existing = prev[selectedDateKey] ?? []
      const index = existing.findIndex((item) => item.id === payload.id)
      const updated = [...existing]

      if (index >= 0) {
        updated[index] = payload
      } else {
        updated.push(payload)
      }

      return {
        ...prev,
        [selectedDateKey]: updated,
      }
    })

    setSelectedRowId(payload.id)
    setForm(emptyForm)
  }

  const loadItemToForm = (item) => {
    setSelectedRowId(item.id)
    setForm({
      id: item.id,
      trainNo: item.trainNo,
      arrivalTime: item.arrivalTime,
      boardingType: item.boardingType,
      coach: item.coach,
      seat: item.seat,
      category: item.category,
      destination: item.destination,
      manager: item.manager,
      note: item.note,
      transferInfo: item.transferInfo,
      contacted: item.contacted,
    })
  }

  const setContacted = (id, value) => {
    setAllData((prev) => ({
      ...prev,
      [selectedDateKey]: (prev[selectedDateKey] ?? []).map((item) => (item.id === id ? { ...item, contacted: value } : item)),
    }))
  }

  return (
    <div className={`page ${isFullscreen ? 'fullscreen' : ''}`} onClick={() => setContextMenu(null)}>
      {!isFullscreen && (
        <header className="toolbar">
          <div className="date-nav">
            <button type="button" className="btn light" onClick={() => moveDate(-1)}>
              ←
            </button>
            <div className="date-pill">{formatDisplayDate(selectedDate)}</div>
            <button type="button" className="btn light" onClick={() => moveDate(1)}>
              →
            </button>
          </div>
          <div className="toolbar-right">
            <span className="hint">F: 전체화면 / ESC: 종료</span>
            <span className="clock">현재 {formatTime(todayNow)}</span>
          </div>
        </header>
      )}

      <main className="board-wrap">
        <BoardTable
          title="상선"
          rows={upRows}
          selectedRowId={selectedRowId}
          onSelect={loadItemToForm}
          onContextMenu={setContextMenu}
          onContactToggle={setContacted}
        />
        <BoardTable
          title="하선"
          rows={downRows}
          selectedRowId={selectedRowId}
          onSelect={loadItemToForm}
          onContextMenu={setContextMenu}
          onContactToggle={setContacted}
        />
      </main>

      {!isFullscreen && (
        <form className="formbar" onSubmit={saveItem}>
          <div className="field">
            <label htmlFor="trainNo">열차번호</label>
            <input id="trainNo" value={form.trainNo} onChange={(e) => onTrainNoChange(e.target.value)} placeholder="예: 214" />
          </div>
          <div className="field">
            <label htmlFor="arrivalTime">도착시간(자동)</label>
            <input id="arrivalTime" value={form.arrivalTime} readOnly />
          </div>
          <div className="field">
            <label htmlFor="boardingType">승하차</label>
            <select id="boardingType" value={form.boardingType} onChange={(e) => updateBoardingType(e.target.value)}>
              {BOARDING_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="coach">호차(1~18)</label>
            <input id="coach" inputMode="numeric" value={form.coach} onChange={(e) => setForm((prev) => ({ ...prev, coach: e.target.value.replace(/[^0-9]/g, '') }))} />
          </div>
          <div className="field">
            <label htmlFor="seat">좌석(승차만)</label>
            <input id="seat" value={form.seat} disabled={form.boardingType === '하차' || ['유실물', '역물품'].includes(form.category)} onChange={(e) => setForm((prev) => ({ ...prev, seat: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="category">분류</label>
            <select id="category" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="destination">도착역</label>
            <input id="destination" value={form.destination} readOnly={form.boardingType === '하차'} onChange={(e) => setForm((prev) => ({ ...prev, destination: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="manager">담당자</label>
            <input id="manager" value={form.manager} onChange={(e) => setForm((prev) => ({ ...prev, manager: e.target.value }))} />
          </div>
          <div className="field wide">
            <label htmlFor="transferInfo">환승정보</label>
            <input id="transferInfo" value={form.transferInfo} onChange={(e) => setForm((prev) => ({ ...prev, transferInfo: e.target.value }))} />
          </div>
          <div className="field wide">
            <label htmlFor="note">비고</label>
            <input id="note" value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} />
          </div>
          <div className="actions">
            <button type="submit" className="btn">{form.id ? '수정 저장' : '신규 등록'}</button>
            <button type="button" className="btn light" onClick={() => { setForm(emptyForm); setSelectedRowId(null) }}>
              초기화
            </button>
          </div>
        </form>
      )}

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => removeItem(contextMenu.id)}>
            삭제
          </button>
        </div>
      )}
    </div>
  )
}

function BoardTable({ title, rows, selectedRowId, onSelect, onContextMenu, onContactToggle }) {
  return (
    <section className="board" aria-label={title}>
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>열차번호</th>
              <th>도착시간</th>
              <th>승하차</th>
              <th>좌석</th>
              <th>분류</th>
              <th>도착역</th>
              <th>담당자</th>
              <th>비고</th>
              <th>상태</th>
              <th>환승정보</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const isPast = item.diffMinutes >= 10
              const isSelected = selectedRowId === item.id
              return (
                <tr
                  key={item.id}
                  className={`${isPast ? 'past' : ''} ${isSelected ? 'selected' : ''}`.trim()}
                  onClick={() => onSelect(item)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onContextMenu({ id: item.id, x: event.clientX, y: event.clientY })
                  }}
                >
                  <td>{item.trainNo}</td>
                  <td>{item.arrivalTime}</td>
                  <td>{item.boardingType === '승차' ? '↑ 승차' : '↓ 하차'}</td>
                  <td>{buildSeatDisplay(item)}</td>
                  <td>{item.category}</td>
                  <td>{item.destination}</td>
                  <td>{item.manager || '-'}</td>
                  <td>{item.note || '-'}</td>
                  <td>
                    {item.boardingType === '승차' ? (
                      <label className="contact">
                        <input type="checkbox" checked={Boolean(item.contacted)} onChange={(e) => onContactToggle(item.id, e.target.checked)} />
                        {item.contacted ? '완료' : '대기'}
                      </label>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{item.transferInfo || '-'}</td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="empty-cell">
                  등록된 항목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function saveCsvSnapshot(allData) {
  const csvByDate = {}

  Object.entries(allData).forEach(([dateKey, items]) => {
    const rows = items
      .filter((item) => !EXCLUDED_CSV_CATEGORIES.has(item.category))
      .map((item) => [
        dateKey,
        item.trainNo,
        item.arrivalTime,
        item.boardingType,
        buildSeatDisplay(item),
        item.category,
        item.destination,
        item.note,
      ])

    const header = ['날짜', '열차번호', '도착시간', '승하차', '좌석', '분류', '도착역', '비고']
    const lines = [header, ...rows].map((line) => line.map(csvEscape).join(',')).join('\n')
    csvByDate[dateKey] = lines
  })

  localStorage.setItem(CSV_STORAGE_KEY, JSON.stringify(csvByDate))
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export default App
