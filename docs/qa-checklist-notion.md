# RBAC SSOT 배포 QA 체크리스트

> Notion 페이지에 그대로 복붙 → 자동으로 체크박스(to_do 블록)로 변환됩니다.
> 각 항목 완료 시 ☑ 클릭. 실패 시 비고에 사유 + 스크린샷.

---

## Phase A — PR #41 hotfix 검증 (30분)

활성 보안 결함(`/api/sales` GET 무필터) 차단 확인.

- [ ] **A-1** PR #41 코드 diff 확인 — `app/api/sales/route.ts`가 `consultations/route.ts:74-95` 패턴과 동일 (https://github.com/anyonecompany/rebornlabs/pull/41/files)
- [ ] **A-2** PR #41 GitHub Actions CI 모두 녹색
- [ ] **A-3** PR 댓글의 Vercel preview URL 클릭 → 로그인 화면 정상 로드
- [ ] **A-4 ★** preview에서 director 계정 로그인 → 사이드바 "판매 관리" → 다른 본부 sales 0건 확인
- [ ] **A-5** A-4 통과 시 PR #41 머지 → production 자동 배포 → 영업팀 알림

## Phase B — PR #42 매트릭스 코드 검토 (15분)

- [ ] **B-1 ★** `lib/auth/capabilities.ts`의 STAFF/MANAGER/DEALER 매트릭스가 운영 정책과 일치 (가장 중요)
- [ ] **B-2** `supabase/migrations/20260507_capabilities_function.sql`과 `lib/auth/capabilities.ts` 매트릭스 시각 비교 — 1:1 일치
- [ ] **B-3** `proxy.ts` PATH_CAPABILITY에 13개 페이지 모두 매핑

## Phase C — 5 역할 사이드바 시나리오 (30분)

PR #42 Vercel preview URL에서 역할별 로그인.

- [ ] **C-1 admin** 사이드바 13개 메뉴 모두 보임 + 모든 메뉴 클릭 시 페이지 정상
- [ ] **C-2 staff** 사이드바 10개 (사용자/조직/감사 빠짐) + URL `/users` 직접 입력 → /dashboard 리다이렉트
- [ ] **C-3 director** 사이드바 9개 (사용자/조직/감사/차량모델 빠짐) + settlements/expenses/documents 메뉴 보임
- [ ] **C-4 team_leader** director와 동일한 9개 메뉴 + 동일한 차단 동작
- [ ] **C-5 dealer** 사이드바 6개 + 라벨이 "차량 목록"·"내 상담" (dealerLabel 변형)
- [ ] **C-6 pending** 로그인 즉시 /unauthorized 리다이렉트

## Phase D — 도메인별 깊이 시나리오 (60분)

각 도메인에서 dataScope 패턴 동작 확인.

- [ ] **D-1 consultations** dealer=본인만 / director=산하+미배정 / admin=전체
- [ ] **D-2 sales** dealer=본인만 / director=산하만(다른 본부 차단) / admin=전체
- [ ] **D-3 contracts** ★ dealer A가 dealer B의 계약서 URL 직접 입력 → 403
- [ ] **D-4 quotes** dealer 본인 견적서 발급/연장 가능 / director 산하 견적서만
- [ ] **D-5 vehicles** dealer는 dealer-view (purchase_price/margin 미노출) / admin은 전체 컬럼
- [ ] **D-6 expenses + documents** dealer 차단 / director 작성 가능 / admin 삭제 가능
- [ ] **D-7 users + audit-logs + team-structure** admin만 가능 / 그 외 모두 차단

## Phase E — 사고 25건 회귀 시나리오 Top 5 (45분)

- [ ] **E-1** `268d6c5` 회귀 — director 계정 GET `/api/consultations` → 산하+미배정만 / 다른 본부 0건
- [ ] **E-2** `5928926` 회귀 — dealer A 토큰으로 dealer B 계약서 ID 직접 호출 → 403
- [ ] **E-3** `854a369` 회귀 — director 사이드바 "정산"·"지출결의"·"문서함" 메뉴 보임 + 정상 진입
- [ ] **E-4** `c2c9ee3` 회귀 — CI `npm run typecheck` 통과 (자동, 이미 통과 확인)
- [ ] **E-5** `7fbff1f` 회귀 — admin이 사용자를 pending 강등 → 30초 내 /unauthorized 차단

## Phase F — pending 캐시 TTL (10분)

- [ ] **F-1** admin이 user X를 admin → dealer 강등 → user X 즉시 강제 로그아웃 → 새 로그인 후 dealer 권한
- [ ] **F-2** 30초 캐시 TTL 폴백 동작 확인 (signOut 실패 시 안전망)

## Phase G — RLS 스테이징 적용 + 검증 (90분 + 24h, ★ 가장 위험)

- [ ] **G-1** 스테이징 Supabase 인스턴스 확보 (없으면 임시 프로젝트 또는 `supabase start`)
- [ ] **G-2** `20260507_capabilities_function.sql` 적용 — `SELECT has_capability('admin','users:write')` → true 확인
- [ ] **G-3 ★** `SUPABASE_TEST_URL`/`KEY` 환경변수 설정 후 `npm run test` → `tests/integration/rls-capability-sync.test.ts` 7건 skip → 6건 통과
- [ ] **G-4 ★** 롤백 SQL 미리 준비 + `20260507_rls_capability_consultations_sales.sql` 적용
- [ ] **G-5** 5 역할 JWT로 `SELECT count(*) FROM consultations / sales / contracts` — admin=전체, director=산하, dealer=본인
- [ ] **G-6** 스테이징 Vercel preview에 RLS 적용된 Supabase 연결 → Phase D 시나리오 재실행
- [ ] **G-7** 24시간 스테이징 관찰 (RLS 거부 이벤트 패턴 확인)

## Phase H — 운영 적용 + 모니터링 (24h+)

- [ ] **H-1** 운영 적용 시점 결정 (영업 한가한 시간, 5분 다운타임 공지)
- [ ] **H-2** 운영 Supabase에 두 마이그레이션 적용 (롤백 SQL 즉시 실행 가능 상태로 대기)
- [ ] **H-3** 즉시 스모크 테스트 — admin/dealer 로그인 + 핵심 기능 동작 (5분 내)
- [ ] **H-4** 24시간 모니터링 — audit_logs / Supabase RLS 거부 / Vercel 403 / 영업팀 슬랙
- [ ] **H-5** 48-72시간 안정화 확인 → 비정상 0건 시 완료 / 발생 시 즉시 롤백

---

## 비상 롤백 (문제 발생 시)

### 코드 롤백
- [ ] `git revert <merge-commit-sha> -m 1 && git push origin main` → Vercel 자동 재배포

### RLS 롤백
- [ ] 사전 준비된 롤백 SQL 실행 (기존 정책 재생성)
- [ ] `has_capability()` 함수는 그대로 둬도 무해
- [ ] 안정화 확인 후 원인 분석

---

## ★ 가장 중요한 3개 (시간 부족 시)

- [ ] **A-4** director 계정으로 sales → 다른 본부 안 보임 (결함 A 차단 증명)
- [ ] **B-1** `capabilities.ts` 매트릭스 운영 정책과 일치 확인
- [ ] **G-3** TS↔SQL 정합 통합 테스트 통과 (앱과 DB 매트릭스 어긋남 차단)

---

## 진행 기록 (Notion에서 채워나갈 곳)

| Phase | 담당 | 시작 | 종료 | 결과 | 비고 |
|-------|------|------|------|------|------|
| A | | | | | |
| B | | | | | |
| C | | | | | |
| D | | | | | |
| E | | | | | |
| F | | | | | |
| G | | | | | |
| H | | | | | |
