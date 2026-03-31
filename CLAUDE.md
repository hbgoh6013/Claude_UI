# CLAUDE.md

## Project Overview

Samsung SDI PLC 모니터링 시스템. C++ Qt 백엔드가 WebSocket 서버로 PLC 데이터를 전송하고, 바닐라 JS 웹 UI가 실시간 대시보드로 표시.

```
C++ Qt (WebSocket 서버, port 18080)  →  JSON  →  Vanilla JS (브라우저)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| C++ Backend | Qt 6.10.0 (MSVC 2022), QtNetwork only |
| Web Frontend | Vanilla HTML/CSS/JS (빌드 도구 없음) |
| Communication | WebSocket (RFC 6455, 직접 구현) |
| Charts | HTML5 Canvas API (직접 구현) |
| Styling | CSS Variables (dark theme) |
| Persistence | localStorage (Settings) |

**Qt 5.12.12 호환**: WebSocketServer는 QtNetwork만 사용하므로 Qt 5.12+에서도 빌드 가능.
C++코드 작성시 C++17 표준까지만 사용하며, Qt6 전용 API 사용을 지양하고 Qt5/6 공용 API를 우선 사용함.

## File Structure

```
Claude_UI/
├── CC_Link_Test/                   # C++ Qt 백엔드
│   └── IntelliCC/
│       ├── main.cpp                # 진입점
│       ├── IntelliCC.h/.cpp        # QMainWindow + WebSocket 서버 통합
│       ├── WebSocketServer.h/.cpp  # RFC 6455 WebSocket 서버
│       ├── SystemInfo.h/.cpp       # 시스템 정보 수집 (CPU, Memory, Disk)
│       ├── PlcManager.h/.cpp       # PLC 통신 매니저
│       ├── CCLink.h/.cpp           # CC-Link IE 프로토콜
│       ├── Settings.h/.cpp         # plc_config.json 읽기/쓰기
│       ├── CsvLog.h/.cpp           # CSV 로깅 + 데이터 파싱
│       └── Global.h/.cpp           # 전역 타입/변수
│
├── vanilla-ui/                     # 바닐라 JS 웹 프론트엔드
│   ├── index.html                  # 메인 SPA
│   ├── start-ui.bat                # Python HTTP 서버 실행 스크립트
│   ├── css/
│   │   └── main.css                # 다크 테마 스타일시트
│   └── js/
│       ├── app.js                  # 앱 초기화, 탭 관리, 데모 모드
│       ├── websocket.js            # WebSocket 연결 (자동 재연결)
│       ├── chart.js                # Canvas 실시간 트렌드 차트 엔진
│       ├── settings.js             # Settings 탭 (멀티 PLC, 멀티 프로토콜)
│       ├── monitor.js              # Monitor 탭 (차트 + 값 테이블 + 로그)
│       ├── sysmon.js               # 시스템 모니터 3D 게이지
│       └── logger.js               # 로그 모듈
│
├── Claude_UI.sln                   # VS2022 솔루션
└── CLAUDE.md                       # 이 파일
```

## Build & Run

### C++ 백엔드
```
Visual Studio 2022 → Claude_UI.sln → F5 (Debug x64)
→ WebSocket 서버가 port 18080에서 시작
```

### Vanilla UI
```bash
cd vanilla-ui
start-ui.bat    # Python HTTP 서버 시작 (port 8080)
```
브라우저: **http://localhost:8080**

## WebSocket JSON Protocol

**Backend → Frontend** (register data):
```json
{ "registers": [{ "addr": "D100", "value": -673.0 }, ...] }
```

**Backend → Frontend** (config sync, on connect + after update):
```json
{ "type": "config_sync", "addresses": [{ "label": "...", "device": "D", "address": 100, "count": 1, "dataType": "Word" }] }
```

**Backend → Frontend** (system info, 2초 주기):
```json
{ "type": "system_info", "cpu": {...}, "memory": {...}, "disks": [...], "gpu": {...} }
```

**Frontend → Backend** (settings change):
```json
{ "type": "settings_update", "protocol": "cclink", "addresses": [...] }
```

## Key Design Decisions

- **Qt WebSockets 모듈 미사용**: QtNetwork(QTcpServer)로 RFC 6455 직접 구현
- **바닐라 JS**: React/Vite 대신 빌드 도구 없는 순수 JS (브라우저 보안 정책 우회)
- **Canvas 차트**: Recharts 대신 HTML5 Canvas API로 직접 구현
- **Overlay 토글**: ON → Combined 차트에 겹쳐서 표시, OFF → 개별 차트로 분리
- **멀티 프로토콜**: CC-Link IE, OPCUA, MC Protocol, S7, FINS 지원 (UI 준비)
- **멀티 PLC**: 여러 PLC 독립 관리 (plc_config.json의 PlcCount, PLC1, PLC2...)
- **시스템 모니터**: Canvas 3D 게이지로 CPU/Memory/Disk/GPU 표시

## Development Rules

1. C++ 표준: C++17, Qt5/6 공용 API 우선
2. JS: 순수 바닐라 JS (ES6+), 외부 라이브러리 없음
3. CSS: CSS Variables 기반 다크 테마
4. plc_config.json 경로: 실행 파일과 같은 디렉토리 (g_baseDir)
