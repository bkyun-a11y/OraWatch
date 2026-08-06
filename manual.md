# Oracle Watch 매뉴얼

## 1. 프로젝트 컨셉
**Oracle Watch**는 Oracle 데이터베이스의 상태를 실시간으로 모니터링하고 시각화하는 웹 애플리케이션입니다. Recharts를 활용하여 데이터베이스의 성능 지표를 직관적인 차트로 제공하며, 현대적이고 깔끔한 UI를 통해 관리자가 데이터베이스 상태를 한눈에 파악할 수 있도록 돕습니다.

## 2. 사용된 기술 (Tech Stack)
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **Visualization**: Recharts
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Database Connection**: Node-oracledb
- **HTTP Client**: Axios

## 3. 주요 기능
- **실시간 커넥션 모니터링**: 데이터베이스의 총 연결 수(Total Connections)를 실시간으로 확인 가능합니다.
- **세션 및 락 관리**: 활성 세션 리스트 조회 및 락 대기 상태(Lock Tree)를 시각화하여 제공합니다.
- **시뮬레이션 모드**: 실제 DB 연결 없이도 대시보드의 모든 기능을 테스트해볼 수 있는 시뮬레이션 환경을 제공합니다.

## 4. 서버 실행 및 중지 명령어

### 서버 기동 (Development)
```bash
cmd /c npm run dev
```

### 서버 기동 (Production Build)
```bash
cmd /c npm run build
cmd /c npm run start
```

### 서버 중지
- 터미널에서 `Ctrl + C`를 입력하여 프로세스를 종료합니다.
