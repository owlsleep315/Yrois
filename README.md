# 코레일 승하차보조 관리 시스템 (YROIS)

익산역 승하차보조 업무를 디지털화하기 위해 개발한 **React + Electron 기반 Windows 데스크톱 애플리케이션**입니다.  
기존 수기/엑셀 중심의 기록 방식에서 발생하던 누락·중복·인수인계 비효율을 줄이고, 승객 보조 요청 정보를 날짜/열차 단위로 체계적으로 관리하는 것을 목표로 합니다.

관리자 입력 화면과 전광판(display) 화면을 분리해 운영할 수 있으며, Electron의 로컬 저장소(`userData`)를 활용해 **인터넷 연결 없이도 안정적으로 동작**합니다. 또한 다중 모니터 환경에서 display 화면을 별도 모니터에 전체화면으로 출력할 수 있습니다.

---

## 프로젝트 소개

- 익산역 현장의 승하차보조 기록 업무를 디지털화하여 운영 정확도를 높입니다.
- 승객 보조 요청(열차번호, 도착시간, 승/하차, 좌석, 담당자, 비고 등)을 한 화면에서 효율적으로 관리합니다.
- 네트워크가 불안정하거나 차단된 환경에서도 사용 가능한 오프라인 중심 구조입니다.
- Electron 기반 Windows 데스크톱 앱으로 배포/설치가 가능합니다.
- 관리자 화면 + display 화면을 분리하고, 다중 모니터를 활용한 전광판 운영을 지원합니다.

## 주요 기능

- 승하차보조 등록 / 수정 / 삭제
- 상행(상선) / 하행(하선) 자동 구분 관리 (열차번호 기준)
- 열차번호 입력 시 도착시간 자동 표시 (`train-times.json` 참조)
- 관리자 입력 화면(`/admin`)과 전광판 화면(`/display`) 분리 운영
- 날짜 전환(이전/다음 날짜) 및 날짜별 데이터 조회
- 승차 건 연락 상태(체크박스) 관리
- 우클릭 컨텍스트 메뉴 삭제 + Delete 키 삭제 지원
- 날짜별 CSV 인수인계 파일 자동 생성
- JSON 기반 로컬 데이터 저장 (`Electron userData`)
- 다중 모니터 지원(전광판 창 자동 배치 및 전체화면)
- 오프라인 동작 지원

## 기술 스택

- **Frontend**: React 19, React Router
- **Build Tool**: Vite
- **Desktop Runtime**: Electron
- **Packaging**: Electron Builder (NSIS)
- **Runtime**: Node.js
- **Data**: JSON 파일 기반 로컬 저장 + CSV 자동 출력
- **Communication**: IPC(`ipcMain.handle` / `ipcRenderer.invoke`) + `contextBridge`

## 프로젝트 구조

```text
project-root/
├── electron/
│   ├── main.cjs               # Electron 메인 프로세스 (창 생성, IPC, 상태 브로드캐스트)
│   ├── preload.cjs            # Renderer에 안전한 API 노출(contextBridge)
│   └── recordFileStore.cjs    # userData 데이터/CSV 파일 저장 로직
├── src/
│   ├── App.jsx                # 관리자/디스플레이 라우팅 및 화면 로직
│   ├── services/
│   │   └── recordStore.js     # Renderer 측 Electron API 래퍼
│   ├── App.css
│   ├── index.css
│   └── main.jsx
├── data/
│   └── train-times.json       # 기본 열차 도착시간 데이터
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── release/                   # 빌드 결과물(설치 파일)
├── package.json
└── README.md
```

## 실행 방법

### 1) 의존성 설치

```bash
npm install
```

### 2) 웹(React)만 실행

```bash
npm run dev
```

### 3) Electron + React 동시 실행 (개발)

```bash
npm run dev:electron
```

- Vite 개발 서버(`http://localhost:5173`)가 먼저 실행된 후 Electron 앱이 시작됩니다.
- 개발 모드에서는 관리자 창 DevTools가 자동으로 열립니다.

## 빌드 방법

### 웹 번들 생성

```bash
npm run build
```

### Windows 설치 파일 생성 (Electron Builder)

```bash
npm run dist
```

- 결과물은 기본적으로 `release/` 디렉터리에 생성됩니다.
- NSIS 기반 설치 마법사(원클릭 비활성화, 설치 경로 변경 허용)로 패키징됩니다.

## 데이터 저장 구조

앱은 Electron `app.getPath('userData')` 하위에 데이터를 저장합니다.

```text
{userData}/
├── data/
│   ├── train-times.json        # 열차번호:도착시간 매핑
│   └── boarding-records.json   # 승하차보조 전체 기록(JSON 배열)
└── exports/
    └── YYYY-MM-DD.csv          # 날짜별 CSV 인수인계 파일
```

### 저장 동작

- 앱 시작 시 `train-times.json`, `boarding-records.json`을 초기화/로드합니다.
- 등록/수정/삭제 시 `boarding-records.json`을 즉시 갱신합니다.
- 변경된 날짜 기준으로 해당 CSV 파일을 자동 재생성합니다.
- JSON 파싱 오류 시 백업(`.bak-타임스탬프`) 후 기본값으로 복구합니다.

## CSV 출력 구조

날짜별 CSV 파일은 UTF-8 BOM으로 저장되어 엑셀 호환성을 높였습니다.

### 파일명

- `YYYY-MM-DD.csv`

### 컬럼

- 날짜
- 방향
- 열차번호
- 도착시간
- 호차
- 좌석
- 구분
- 하차역
- 담당자
- 비고

### 정렬/가공 규칙

- 선택한 날짜(`dateKey`)의 레코드만 포함
- `도착시간` 오름차순 정렬
- 방향은 내부값을 `상선/하선`으로 변환
- 하차 건의 도착역은 기본 `익산` 처리

## Electron 구조 설명

### Main Process (`electron/main.cjs`)

- 앱 준비 완료 시 로컬 저장소 초기화 및 상태 로드
- IPC 핸들러 등록(`records:getState`, `records:add`, `records:update`, `records:delete` 등)
- 데이터 변경 시 저장 + CSV 생성 + 모든 창에 상태 브로드캐스트
- 관리자 창(기본 모니터) + display 창(보조 모니터 우선) 생성
- display 창은 전체화면 + 메뉴바 숨김 모드로 동작

### Preload (`electron/preload.cjs`)

- `contextIsolation: true` 환경에서 `window.electronAPI` 제공
- Renderer는 직접 Node API를 사용하지 않고, 노출된 안전 API로만 IPC 호출

### Renderer (`src/`)

- React Router로 `/admin`, `/display` 화면 분리
- 공통 상태를 수신/구독하여 입력 화면과 전광판 화면을 동기화

## 화면 설명

### 관리자 화면 (`/admin`)

- 날짜 이동(이전/다음) 및 해당 일자 데이터 편집
- 상선/하선 보드 동시 확인
- 신규 등록 및 기존 항목 수정
- 컨텍스트 메뉴/키보드 삭제
- 승차 건 연락 상태 체크

### display 화면 (`/display`)

- 운영자 입력 없이 보기 전용으로 표시
- 상선/하선 현황을 전광판 형태로 출력
- 시간 경과 상태에 따라 항목 강조/필터링

## 향후 개선 사항

- 사용자 권한(관리자/조회 전용) 및 로그인 체계 도입
- 열차시각표 편집 UI 및 외부 데이터 연동 자동화
- 기록 검색/필터(열차번호, 담당자, 분류) 고도화
- CSV 외 PDF/인쇄 양식 출력 지원
- 백업/복구 UI 및 데이터 이관 도구 제공
- 테스트 코드(단위/E2E)와 CI 파이프라인 강화

## 라이선스

현재 저장소에는 별도 LICENSE 파일이 포함되어 있지 않습니다.  
프로젝트 공개/배포 시 사용할 라이선스(MIT, Apache-2.0 등)를 확정해 `LICENSE` 파일을 추가하는 것을 권장합니다.
