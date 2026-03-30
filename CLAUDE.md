# CLAUDE.md

## Project Overview

PLC 모니터링 시스템. C++ Qt 백엔드가 WebSocket 서버로 PLC 데이터를 전송하고, React 웹 UI가 실시간 대시보드로 표시.

```
C++ Qt (WebSocket 서버, port 8080)  →  JSON  →  React (브라우저, port 5173)
```

## Tech Stack

본 프로젝트는 하기 환역에서 개발되었으나, 현장 도입을 위해 하위 버전(VS2017/Qt5)과의 호환성 유지가 필수적.
| Layer | Technology |
|-------|-----------|
| C++ Backend | Qt 6.10.0 (MSVC 2022), QtNetwork only |
| Web Frontend | React 19, Vite 8, Recharts |
| Communication | WebSocket (RFC 6455, 직접 구현) |
| Styling | CSS Variables (dark theme) |
| Persistence | localStorage (Settings) |

**Qt 5.12.12 호환**: WebSocketServer는 QtNetwork만 사용하므로 Qt 5.12+에서도 빌드 가능.
C++코드 작성시 C++17 표준까지만 사용하며, Qt6 전용 API 사용을 지양하고 Qt5/6 공용 API를 우선 사용함.

## File Structure

```
Claude_UI/
├── Claude_UI/                    # C++ Qt 백엔드
│   ├── main.cpp                  # 진입점
│   ├── Claude_UI.h/.cpp          # QMainWindow + WebSocket 서버 통합 + 데이터 전송 타이머
│   ├── WebSocketServer.h/.cpp    # RFC 6455 WebSocket 서버 (재사용 가능, QtNetwork only)
│   ├── Claude_UI.ui/.qrc         # Qt Designer UI / 리소스
│   └── Claude_UI.vcxproj         # VS2022 프로젝트 (Qt modules: core;gui;network;widgets;uitools)
│
├── web-ui/                       # React 웹 프론트엔드
│   ├── src/
│   │   ├── App.jsx               # 메인 컴포넌트 (탭 라우팅, 상태 조합)
│   │   ├── App.css               # 전체 스타일 (다크 테마)
│   │   ├── index.css             # CSS 변수 정의 (색상 팔레트)
│   │   ├── useWebSocket.js       # WebSocket 연결 훅 (자동 재접속)
│   │   ├── useSettings.js        # 주소 설정 훅 (프로토콜별, localStorage)
│   │   ├── useChartHistory.js    # 시계열 데이터 버퍼 (최근 60초)
│   │   └── components/
│   │       ├── TabBar.jsx        # Monitor / Settings 탭 + Demo 토글
│   │       ├── MonitorTab.jsx    # 대시보드 (차트, 스테이션, 레지스터, 시스템, 로그)
│   │       ├── SettingsTab.jsx   # 프로토콜 선택 + 주소 입력 폼
│   │       ├── RealtimeChart.jsx # recharts 차트 + 색상 피커
│   │       └── SystemMonitor.jsx # CPU/메모리 게이지 + 3D 디스크
│   ├── start-ui.bat              # 바탕화면 바로가기용 실행 스크립트
│   └── package.json              # 의존성: react, recharts, vite
│
├── Claude_UI.sln                 # VS2022 솔루션
├── .gitignore                    # 빌드/node_modules 제외
└── CLAUDE.md                     # 이 파일
```

## Build & Run

### C++ 백엔드
```
Visual Studio 2022 → Claude_UI.sln → F5 (Debug x64)
→ WebSocket 서버가 port 8080에서 시작
```

### React 웹 UI
```bash
cd web-ui
npm install    # 최초 1회
npm run dev    # Vite 개발 서버 시작
```
또는 바탕화면 **"PLC Monitor"** 바로가기 더블클릭.

브라우저: **http://localhost:5173**

## Architecture & Data Flow

### Component Tree
```
App.jsx
├── TabBar (Monitor/Settings + Demo toggle)
├── MonitorTab
│   ├── RealtimeChart × N (겹침 차트 + 개별 차트)
│   ├── CC-Link IE Stations 테이블
│   ├── Device Registers 그리드
│   ├── SystemMonitor (CPU, Memory, Disk 3D)
│   └── Communication Log (스크롤)
└── SettingsTab
    ├── Protocol 선택 (CC-Link IE, OPC UA, MC, S7, Modbus)
    ├── 주소 추가 폼 (device + address + count + label)
    └── 주소 목록 (Graph 토글, 삭제)
```

### Hook 데이터 흐름
```
useWebSocket()  → { data, connected, logs, send }
useSettings()   → { protocols, addresses, addAddress, toggleGraph, ... }
useChartHistory() → chartData[] (60-point rolling buffer)
```

### WebSocket JSON Protocol

**C++ → React** (1초 주기):
```json
{
  "registers": [{ "addr": "D0", "value": 12345 }, ...],
  "devices": [{ "station": 1, "name": "...", "status": "RUN", "value": 85 }],
  "system": { "cpu": 35, "memory": 62, "disks": [{ "label": "C:", "used": 186, "total": 256 }] }
}
```

**React → C++** (설정 변경 시):
```json
{
  "type": "settings_update",
  "protocol": "cclink",
  "addresses": [{ "protocol": "cclink", "device": "D", "address": 0, "count": 10 }]
}
```

## Development & Verification Rules
  1. Strict Compatibility Check:
    - 새 코드를 작성할 때 Qt 6 전용 클래스나 메서드 사용을 지양한다. (예: QRegularExpression은 가능하나 Qt6 전용 속성은 주의)
    - C++ 표준은 C++17를 준수하여 VS2017 환경에서 문제가 없도록 한다.
  2. Detailed Verification:
    - 코드 작성 후 반드시 재검증: 새로 작성된 로직이 추후 부가적인 오류로 이어질 수 있는지, 메모리 관리에 문제가 없는지 다시 한번 자세히 검토한다.
  3. UI 호환성:
    - .ui 파일 수정 시 Qt 5.12 Designer에서도 열릴 수 있도록 최신 레이아웃 속성 사용 시 주의한다.
  
## Key Design Decisions

- **Qt WebSockets 모듈 미사용**: QtNetwork(QTcpServer)로 RFC 6455 직접 구현. 추가 모듈 설치 불필요, Qt 5/6 양쪽 호환.
- **Demo 모드**: 백엔드 없이도 UI 테스트 가능. 사용자가 등록한 주소 기반으로 시뮬레이션 데이터 생성.
- **Graph 토글**: ON → Combined 차트에 겹쳐서 표시, OFF → 개별 소형 차트로 분리.
- **프로토콜 멀티 지원**: UI에서 CC-Link IE / OPC UA / MC Protocol / S7 / Modbus TCP 선택 가능. 백엔드 구현은 프로토콜별로 추가 필요.
- **localStorage**: Settings 주소 목록이 브라우저에 자동 저장. 새로고침해도 유지.

## Conventions

- **CSS**: CSS Variables 기반 다크 테마. 색상은 `index.css`에 정의.
- **React**: 함수형 컴포넌트 + 커스텀 훅. Context/Redux 미사용, props로 전달.
- **C++**: Qt signals/slots. QJsonObject로 데이터 직렬화.
- **파일 명명**: React 컴포넌트 PascalCase, 훅 camelCase (use* prefix).

## TODO / Known Limitations

1. **백엔드 설정 수신**: WebSocket으로 받은 settings_update 메시지 처리 로직 C++에 추가 필요
2. **시스템 정보**: SystemMonitor가 현재 Demo 데이터만 표시. 백엔드에서 CPU/메모리/디스크 정보 전송 필요 (가이드: `시스템정보_백엔드_구현_가이드.txt`)
3. **WebSocket Ping/Pong**: 미구현. 클라이언트 측 3초 재접속으로 대체.
