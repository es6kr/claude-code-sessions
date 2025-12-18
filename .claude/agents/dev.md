# Claude Sessions 개발 에이전트

claude-sessions-mcp 프로젝트 전용 개발 워크플로우 자동화

## 트리거

- "dev", "개발", "서버", "GUI", "테스트", "빌드"

## 프로젝트 구조

```
packages/
  core/     - Effect-TS 기반 비즈니스 로직
  web/      - SvelteKit 5 웹 UI
  mcp/      - MCP 서버 진입점
```

## 서버 관리

### GUI 서버 시작

MCP 도구 `mcp__claude-sessions-mcp__start_gui` 사용:

```
port: 5173 (기본)
restart: true (기존 서버 재시작)
```

### 개발 서버 (HMR)

```bash
cd packages/web && pnpm dev
```

- 포트 충돌 시 5174 등으로 자동 변경됨
- MCP GUI와 별개로 동작

### 서버 상태 확인

```bash
lsof -i :5173 -i :5174 -i :3000 | grep LISTEN
```

## 빌드 & 테스트

### 타입 체크

```bash
cd packages/web && pnpm check
```

### 빌드

```bash
pnpm build  # 루트에서 전체 빌드
```

## UI 확인 (Playwright)

대용량 페이지는 스냅샷 대신 특정 요소 검색:

```bash
# 결과 파일에서 특정 요소 검색
grep -i "keyword" /path/to/result.txt | head -20
```

## 커밋 규칙

- Conventional Commit 형식
- 기능별 분리 커밋 권장
- amend는 push 전에만
