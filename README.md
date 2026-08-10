# OraWatch - Oracle DB 모니터링 대시보드

OraWatch는 Oracle 데이터베이스의 상태를 실시간으로 모니터링하고 관리할 수 있는 모던 웹 기반 대시보드입니다. 활성 세션, 데이터베이스 락(Lock), 테이블스페이스 사용량, 핵심 성능 지표(Metrics)를 직관적으로 파악할 수 있고, **AI Agent와의 채팅만으로 자연어로 DB를 조회하고 운영**할 수 있습니다.

## 🤖 AI Agent — 자연어로 DB 운영하기

OraWatch의 핵심 기능입니다. 화면 우하단 채팅 버튼을 누르면 열리는 대화창에 자연어로 입력만 하면 됩니다.

- "지금 제일 오래 걸리는 세션 알려줘" → 조회
- "SYSTEM 테이블스페이스 사용량 얼마나 돼?" → 조회
- "101번 세션 죽여줘" → 실행(Kill)

내부적으로 Agent Gateway가 요청을 분석해 **조회 전용 MCP 서버**와 **작업(쓰기) 전용 MCP 서버**로 나누어 라우팅하고, 응답은 실시간 스트리밍으로 대화창에 표시됩니다. SQL을 몰라도 대시보드를 뒤지지 않고 채팅 한 줄로 운영이 가능한 것이 OraWatch만의 차별점입니다.

## 🌟 주요 기능 (Main Features)

- **AI Agent 자연어 DB 운영**: 위 채팅 기능 — 조회부터 세션 Kill 등 실제 작업까지 자연어로 처리합니다.
- **실시간 성능 지표 (Metrics)**: CPU 로드, 메모리 사용량, I/O 상태, 현재 연결된 세션 수를 실시간으로 제공합니다.
- **활성 세션 모니터링 및 제어 (Session Management)**: 현재 활성화된 세션 목록을 조회하고, 문제가 되는 세션을 즉시 종료(Kill)할 수 있습니다.
- **데이터베이스 락 감지 (Lock Detection)**: `DBA_WAITERS` 뷰를 기반으로 락 대기 세션(Waiting)과 차단 세션(Blocking)을 정확하게 추적하고 시각화합니다.
- **테이블스페이스 모니터링 (Tablespace Usage)**: 상위 사용량 테이블스페이스 10개의 정보를 제공하여 용량 부족 문제를 사전에 인지할 수 있습니다.
- **시뮬레이션(Mock) 모드 지원**: 실제 DB가 연결되지 않은 환경에서도 UI를 테스트할 수 있는 Mock 모드를 지원합니다.

## 🛠️ 사용된 기술 (Tech Stack)

- **Frontend**: Next.js (App Router), React, Tailwind CSS (뮤트톤 모던 UI 반응형 디자인), Lucide React (아이콘)
- **Backend**: Next.js API Routes (Node.js 기반 REST API)
- **Database**: Oracle DB (`oracledb` Node.js 드라이버 사용)
- **AI Agent**: 자연어 DB 운영 Agent Gateway 연동 (SSE 스트리밍, 조회/작업 MCP 서버 분리 라우팅)
- **Process Manager**: PM2 (EC2 운영 서버 무중단 서비스 환경)

## 🚀 EC2 설치 및 운영 가이드

### 1. 사전 준비사항 (Prerequisites)
EC2 인스턴스에 Node.js 및 npm, Git이 설치되어 있어야 합니다. (권장 Node.js 버전: 18.x 이상)

### 2. 프로젝트 다운로드 및 의존성 설치
```bash
# 프로젝트 저장소 Clone
git clone https://github.com/bkyun-a11y/OraWatch.git
cd OraWatch

# 의존성 패키지 설치
npm install
```

### 3. DB 접속 정보 설정 (`db-config.json`)
프로젝트 루트 경로에 `db-config.json` 파일을 생성하여 Oracle DB 접속 정보를 입력합니다.
```bash
cat > db-config.json << 'EOF'
{
  "host": "host_url",
  "port": "port",
  "sid": "sid",
  "user": "user",
  "password": "password",
  "mockMode": false
}
EOF
```
*(참고: 이 파일은 `.gitignore`에 등록되어 있어 GitHub에 올라가지 않으므로 EC2에서 직접 생성해야 합니다. 대시보드의 'Settings' 탭에서도 정보를 갱신할 수 있습니다.)*

### 4. AI Agent 접속 정보 설정 (`.env.local`)
자연어 DB 운영 채팅 기능을 쓰려면 Agent Gateway 접속 정보가 필요합니다. 프로젝트 루트에 `.env.local` 파일을 생성합니다.
```bash
cat > .env.local << 'EOF'
AGENT_GATEWAY_URL=agent_gateway_url
AIR_STUDIO_API_KEY=api_key
AGENT_USER_ID=user_id
EOF
```
*(참고: 이 파일도 `.gitignore`에 등록되어 있어 GitHub에 올라가지 않습니다. API Key가 발급된 계정과 `AGENT_USER_ID`가 일치해야 합니다. 값을 바꾼 뒤에는 반드시 재빌드/재시작이 필요합니다.)*

### 5. 프로젝트 빌드 및 서버 기동 (Start)
코드가 수정되었거나 처음 설치할 때 반드시 `build`를 수행해야 합니다.
```bash
# Next.js 앱 빌드 (필수)
npm run build

# PM2를 이용하여 백그라운드 환경으로 무중단 서버 기동
pm2 start npm --name "OraWatch" -- run start

# 이미 PM2에 등록되어 있다면 재시작만 수행
pm2 restart OraWatch
```

### 6. 서버 중지 (Stop)
```bash
# 서버 일시 중지
pm2 stop OraWatch

# PM2 관리 목록에서 서버 제거
pm2 delete OraWatch
```

## 🔄 지속적 배포 (업데이트 방법)
로컬에서 기능 수정 후 GitHub에 코드를 Push 했다면, EC2 인스턴스에서 아래 한 줄 명령어를 통해 쉽게 업데이트할 수 있습니다.
```bash
cd ~/OraWatch && git pull origin main && npm run build && pm2 restart OraWatch
```
