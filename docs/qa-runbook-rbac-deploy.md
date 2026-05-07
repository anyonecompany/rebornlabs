# RBAC SSOT 배포 QA 런북

> PR #41 (hotfix) + PR #42 (SSOT 마이그레이션) 미리보기 배포 검증 + 운영 적용 절차.
> 모든 태스크는 ✅/❌ 체크 후 결과 + 스크린샷/로그 기록.

---

## 진행 상태

| Phase | 태스크 수 | 소요 | 위험도 |
|-------|---------|------|-------|
| A. PR #41 hotfix Vercel preview | 5 | 30분 | 🟢 |
| B. PR #42 매트릭스 코드 검토 | 3 | 15분 | 🟢 |
| C. PR #42 Vercel preview — 5 역할 사이드바 | 6 | 30분 | 🟢 |
| D. PR #42 도메인별 깊이 시나리오 | 7 | 60분 | 🟡 |
| E. 사고 25건 회귀 시나리오 (Top 5) | 5 | 45분 | 🟡 |
| F. pending TTL 검증 | 2 | 10분 | 🟢 |
| G. RLS 스테이징 적용 + 검증 | 7 | 90분 | 🔴 |
| H. 운영 적용 + 모니터링 | 5 | 24h+ | 🔴 |
| **합계** | **40** | **5h + 24h 관찰** | |

---

## Phase A — PR #41 hotfix 검증 (즉시)

활성 보안 결함(`/api/sales` GET 무필터) 차단 확인.

### A-1. PR #41 코드 diff 확인
- **링크**: https://github.com/anyonecompany/rebornlabs/pull/41/files
- **할 일**: `app/api/sales/route.ts` 변경분이 `consultations/route.ts:74-95` 패턴과 동일한지 시각 비교
- **성공 기준**: director/team_leader 분기에 `get_subordinate_ids` RPC + `ZERO_UUID` 폴백 포함

### A-2. PR #41 CI 통과 확인
- **할 일**: PR 페이지에서 GitHub Actions 체크가 모두 녹색
- **실패 시**: 로그 확인 → 다시 push 또는 fix

### A-3. PR #41 Vercel preview 배포 확인
- **할 일**: PR 페이지 하단 Vercel bot 댓글에서 preview URL 클릭
- **성공 기준**: preview URL 로드 + 로그인 화면 정상

### A-4. director 계정으로 결함 A 차단 검증 (★ 핵심)
- **계정**: director 역할 (운영 본부장 계정 또는 테스트 계정)
- **할 일**:
  1. preview URL에서 director로 로그인
  2. 사이드바 "판매 관리" 클릭
  3. 목록에 **본인 산하 dealer의 sales만** 보이는지 확인
  4. (선택) 다른 본부 dealer가 만든 sale의 직접 URL `/sales/{id}` 입력 → 404 또는 403
- **성공 기준**: 다른 본부 매출/딜러/수당 정보 노출 0건
- **실패 시**: 즉시 머지 보류 + 상세 로그 캡처

### A-5. PR #41 머지
- A-4 통과 후 main 머지 → production 자동 배포
- 영업팀에 "/api/sales 보안 패치 배포 완료" 알림

---

## Phase B — PR #42 코드 검토 (머지 전 정책 확인)

내가 임의로 정한 권한 매트릭스가 운영 의도와 일치하는지.

### B-1. `lib/auth/capabilities.ts` 매트릭스 검토 (★ 가장 중요)
- **링크**: PR #42 → `lib/auth/capabilities.ts` 파일
- **확인 항목**:
  - `STAFF_CAPABILITIES`: vehicle-models 관리 가능. **운영 정책과 일치?**
  - `MANAGER_CAPABILITIES` (director + team_leader 공용): 산하 데이터 + expenses/documents R/W. **두 역할 권한이 동일한 게 의도?**
  - `DEALER_CAPABILITIES`: settlements/expenses/documents 차단. quotes:write 가능. **5/6에 풀어준 정책 그대로?**
- **성공 기준**: 모든 capability가 운영팀이 원하는 권한과 일치
- **불일치 시**: 댓글에 항목별 변경 요청 → 5분 내 수정 가능

### B-2. SQL `has_capability()` ↔ TS `CAPABILITIES` 시각 비교
- **링크**: PR #42 → `supabase/migrations/20260507_capabilities_function.sql`
- **할 일**: 두 파일을 좌우로 열고 6 역할 × capability 매핑이 같은지 확인
- **성공 기준**: 두 매트릭스가 1:1 일치

### B-3. `proxy.ts` PATH_CAPABILITY 누락 페이지 점검
- **링크**: PR #42 → `proxy.ts` PATH_CAPABILITY 배열
- **할 일**: 사이드바 메뉴 13개가 모두 PATH_CAPABILITY에 매핑됐는지 확인
- **성공 기준**: 13개 path 모두 존재

---

## Phase C — PR #42 Vercel preview, 5 역할 사이드바

각 역할로 로그인했을 때 메뉴와 진입 가드가 정상.

### C-1. admin 계정 로그인
- **확인**: 사이드바 13개 메뉴 모두 보임
- **확인**: 모든 메뉴 클릭 시 페이지 정상 로드

### C-2. staff 계정 로그인
- **확인**: 사이드바 10개 (사용자/조직/감사 빠짐)
- **확인**: URL `/users` 직접 입력 → /dashboard로 리다이렉트
- **확인**: vehicle-models 메뉴 보이고 관리 가능

### C-3. director 계정 로그인
- **확인**: 사이드바 9개 (사용자/조직/감사/차량모델 빠짐)
- **확인**: settlements/expenses/documents 메뉴 보임
- **확인**: URL `/team-structure` 직접 입력 → /dashboard로 리다이렉트

### C-4. team_leader 계정 로그인
- **확인**: director와 동일한 9개 메뉴
- **확인**: 동일한 차단 동작

### C-5. dealer 계정 로그인
- **확인**: 사이드바 6개 (대시보드/차량 목록/고객 가격/내 상담/내 판매/내 견적서)
- **확인**: 라벨이 "차량 관리"가 아닌 **"차량 목록"**, "상담 관리"가 아닌 **"내 상담"** (dealerLabel 변형)
- **확인**: URL `/expenses` 직접 입력 → /dashboard로 리다이렉트

### C-6. pending 계정 로그인 (또는 admin이 임시 강등)
- **확인**: 로그인 즉시 /unauthorized 페이지로 리다이렉트
- **확인**: 사이드바 도달 못 함

---

## Phase D — 도메인별 깊이 검증

핵심 도메인에서 dataScope 패턴이 정상 동작하는지.

### D-1. consultations 도메인 (3 역할)
- **dealer**: 사이드바 "내 상담" → 본인 배정 상담만 / 미배정 안 보임
- **director**: 사이드바 "상담 관리" → 산하 dealer 배정 + 미배정 보임 / 다른 본부 배정 차단
- **admin**: 전체 상담 보임

### D-2. sales 도메인 (3 역할)
- **dealer**: 본인 sale만
- **director**: 산하 dealer sale만 / 다른 본부 차단 (★ 결함 A 회귀 차단)
- **admin**: 전체

### D-3. contracts 도메인 (★ 결함 5928926 회귀)
- **dealer A**: 본인 sale의 계약서 보임
- **dealer A**: 다른 dealer B의 계약서 ID 직접 URL → 403
- **director**: 산하 dealer 계약서만

### D-4. quotes 도메인
- **dealer**: 본인 견적서만 / 발급(POST) 가능 / 본인 만료 연장 가능
- **director**: 산하 dealer 견적서만 / 만료 연장 가능

### D-5. vehicles 도메인
- **dealer**: vehicles_dealer_view (purchase_price/margin 미노출)
- **admin/staff**: 전체 컬럼 노출 + 등록/수정 가능
- **director**: 전체 차량 조회 가능 / 등록 가능

### D-6. expenses + documents (재무 도메인)
- **dealer**: 메뉴 안 보임 / URL 직접 → 차단
- **director**: 메뉴 보임 / 작성 가능
- **admin**: 삭제 가능 (DELETE)

### D-7. users + audit-logs + team-structure (관리 도메인)
- **admin**: 전체 가능
- **staff/director/team_leader/dealer**: 메뉴 안 보임 / URL 직접 → 차단

---

## Phase E — 사고 25건 회귀 시나리오 (Top 5)

git 히스토리의 ★긴급 P0 hotfix 5건이 다시 발생하지 않는지.

### E-1. `268d6c5` RLS 우회 회귀 차단
- **시나리오**: director 계정으로 GET `/api/consultations` → 산하 dealer + 미배정만 반환 / 다른 본부 0건
- **API 호출**: 브라우저 개발자도구 또는 curl로 응답 확인

### E-2. `5928926` 계약서 인가 누락 차단
- **시나리오**: dealer A 토큰으로 `GET /api/contracts/{B의 계약서 ID}` → 403
- **추가**: `POST /api/contracts/[id]/send` (서명 요청 발송)도 dealer A는 본인 것만

### E-3. `854a369` 매니저 잔여 권한
- **시나리오**: director로 사이드바 "정산" 클릭 → 정상 진입 / 데이터 보임
- **추가**: "지출결의" / "문서함" 메뉴 노출

### E-4. `c2c9ee3` UserRole 'none' 빌드 깨짐
- **자동 검증**: CI에서 `npm run typecheck` 통과 (이미 통과 확인됨)
- **수동**: 기여자가 새로 코드 추가 시 컴파일러가 막아주는지 (장기 모니터링)

### E-5. `7fbff1f` pending 권한
- **시나리오**: admin이 다른 사용자를 pending으로 강등 → 그 사용자가 새 요청 시 /unauthorized
- **30초 캐시 만료 후 확실히 차단**되는지

---

## Phase F — pending 캐시 TTL 검증

### F-1. role 변경 즉시 반영 (signOut 1차 안전망)
- admin이 user X를 admin → dealer로 강등
- user X는 즉시 강제 로그아웃 → 새 로그인 후 dealer 권한
- **성공 기준**: 강등 후 60초 내 옛 권한으로 어떤 것도 못 함

### F-2. 캐시 TTL 30초 폴백
- (시나리오 만들기 어려움) admin이 강등 + signOut 실패한 케이스 시뮬레이션
- 30초 후 자동으로 옛 권한 사라짐
- **성공 기준**: TTL 만료 동작 자체가 일어남

---

## Phase G — RLS 스테이징 적용 + 검증

이번 단계가 가장 위험. 운영 적용 전 스테이징에서 반드시.

### G-1. 스테이징 Supabase 인스턴스 확인
- **할 일**: 스테이징 환경이 있는지 확인. 없으면 Supabase 대시보드에서 임시 프로젝트 생성 또는 로컬 `supabase start`

### G-2. `20260507_capabilities_function.sql` 적용 (스테이징)
- **할 일**: SQL 실행 (Supabase Dashboard → SQL Editor 또는 `supabase migration up`)
- **확인**: `has_capability('admin', 'users:write')` SELECT 결과가 `true`
- **확인**: `has_capability('dealer', 'sales:read:all')` SELECT 결과가 `false`

### G-3. TS↔SQL 정합 통합 테스트 실행
- **명령**:
  ```bash
  SUPABASE_TEST_URL=https://staging.supabase.co \
  SUPABASE_TEST_SERVICE_ROLE_KEY=<key> \
  npm run test
  ```
- **확인**: `tests/integration/rls-capability-sync.test.ts`가 7건 skip → 6건 통과로 바뀜
- **실패 시**: TS와 SQL 매트릭스 어긋남. 어느 capability에서 어긋났는지 출력 확인

### G-4. `20260507_rls_capability_consultations_sales.sql` 적용 (★ 가장 위험)
- **롤백 SQL 미리 준비**:
  ```sql
  -- 기존 정책 재생성 SQL을 백업 (스크립트로 자동 생성하거나 수동)
  ```
- **적용**: SQL 실행
- **즉시 검증**: 다음 쿼리로 RLS 정책 변경 확인
  ```sql
  SELECT polname FROM pg_policies WHERE tablename IN ('consultations','sales','contracts');
  ```

### G-5. 5 역할 JWT로 SELECT 시뮬레이션
- 각 역할의 JWT를 만들어 다음 쿼리 실행:
  ```sql
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
  SELECT count(*) FROM consultations;
  SELECT count(*) FROM sales;
  SELECT count(*) FROM contracts;
  ```
- **확인**: admin은 전체, director는 산하만, dealer는 본인만 카운트

### G-6. 스테이징 앱 실행 + 시나리오 재현
- 스테이징 Vercel preview에 RLS 적용된 Supabase 연결 → Phase D 시나리오 재실행
- 앱과 RLS 정책이 같은 결과 반환하는지 확인

### G-7. 24시간 스테이징 부하 테스트
- 가능하면 자동화된 시나리오 봇으로 24시간 RLS 거부/허용 이벤트 모니터링

---

## Phase H — 운영 적용 + 모니터링

### H-1. 운영 적용 시점 결정
- 영업 한가한 시간(예: 새벽 2-4시) 또는 영업 시간 종료 후
- 5분 다운타임 가능성 공지

### H-2. 운영 Supabase에 마이그레이션 적용
- G-2와 G-4 동일 절차
- **롤백 SQL 즉시 실행 가능 상태로 대기**

### H-3. 즉시 스모크 테스트 (5분 내)
- admin 로그인 + 대시보드 진입 + 상담 1건 조회 + 판매 1건 조회
- dealer 로그인 + 본인 상담 조회

### H-4. 24시간 모니터링
- **audit_logs**: 비정상 increase
- **Supabase logs**: RLS 거부 이벤트 패턴 (정상 사용자가 막히는지)
- **Vercel logs**: 403 응답 비율
- **영업팀 슬랙**: "왜 안 보여요" 보고 채널 모니터링

### H-5. 안정화 확인 (48-72시간)
- 비정상 이벤트 0건 → 안정화 완료
- 비정상 이벤트 발생 → 즉시 롤백 SQL 실행

---

## 롤백 절차 (비상)

문제 발견 시:

### 코드 롤백
```bash
git revert <merge-commit-sha> -m 1
git push origin main
# Vercel 자동 재배포
```

### RLS 롤백
1. 사전 준비된 롤백 SQL 실행 (기존 정책 재생성)
2. `has_capability()` / `current_user_role()` 함수는 그대로 둬도 무해 (다른 곳에서 안 씀)
3. 안정화 확인 후 원인 분석

---

## 진행 추적 표

| 단계 | 담당 | 시작 | 종료 | 결과 | 비고 |
|------|------|------|------|------|------|
| A-1 ~ A-5 | | | | | |
| B-1 ~ B-3 | | | | | |
| C-1 ~ C-6 | | | | | |
| D-1 ~ D-7 | | | | | |
| E-1 ~ E-5 | | | | | |
| F-1 ~ F-2 | | | | | |
| G-1 ~ G-7 | | | | | |
| H-1 ~ H-5 | | | | | |
