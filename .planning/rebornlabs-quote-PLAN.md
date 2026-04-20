# 견적서 공개 링크 — 실행 계획

## 산출물

### DB
- `supabase/migrations/20260420_quotes.sql`
  - `quotes` 테이블 + 인덱스 3개
  - `generate_quote_number()` SQL 함수
  - RLS 정책 3개 (`quotes_dealer_own`, `quotes_admin_staff_select`, `quotes_director_team_leader_select`)

### BE
- `app/api/quotes/generate/route.ts` — POST (인증 필수)
- `app/api/quotes/[token]/route.ts` — GET (공개)

### FE 공개 페이지
- `app/quote/[token]/page.tsx` — Server Component (초기 렌더 SSR)
- `app/quote/[token]/quote-view.tsx` — Client Component (갤러리 스와이프, CTA 등)
- `app/quote/[token]/expired.tsx` — 만료 페이지

### FE 딜러 UI
- `src/components/quote/generate-quote-dialog.tsx` — 생성 모달
- `app/(auth)/vehicles/[id]/page.tsx` — 버튼 추가 (PageHeader 안)

### 미들웨어
- `proxy.ts` — `PUBLIC_PATHS`에 `/quote` 추가

### 환경변수
- `.env.local.example` — `NEXT_PUBLIC_APP_URL`, `REBORNLABS_BUSINESS_NUMBER`, `REBORNLABS_ADDRESS`, `REBORNLABS_PHONE`

### 문서
- `.planning/rebornlabs-quote-CONTEXT.md`
- `.planning/rebornlabs-quote-PLAN.md`
- `.planning/rebornlabs-quote-APPLY.md`

## 구현 순서

1. 마이그레이션 SQL (DB 섹션 체크박스 3개 대상)
2. 미들웨어 수정 (공개 페이지 선행 조건)
3. generate API
4. public token API
5. 공개 페이지 (+ 만료)
6. 딜러 모달 + 버튼 통합
7. env + APPLY 가이드
8. tsc + build + 민감필드 응답 검증
9. Notion 체크박스 19개
10. commit + push + Slack

## Notion 체크박스 매핑

### 섹션 1: "1. DB 스키마 추가" (3개)
| 체크박스 | 완료 시점 |
|---|---|
| quotes 테이블 생성 (id, vehicle_id, dealer_id, token, expires_at, view_count, first_v…) | SQL 작성 |
| 마이그레이션 SQL 생성 및 Supabase 적용 | **CTO 적용 후 수동** (ai-dev-team은 **미체크** 유지) |
| RLS 정책: 딜러는 본인이 생성한 견적서만 조회/생성, 공개 GET은 API에서 anon 처리 | SQL 작성 |

→ ai-dev-team 체크: 2/3 (1, 3). "마이그레이션 SQL 생성 및 Supabase 적용"은 CTO 몫.

### 섹션 2: "2. 견적서 생성 API" (3개, 전부 체크)
- POST /api/quotes/generate
- 차량 정보 조회 시 딜러 권한 범위 내에서만 허용
- 토큰 생성 로직 (전자계약서와 동일한 방식 재사용) — crypto.randomBytes

### 섹션 3: "3. 견적서 공개 페이지" (9개, 전부 체크)
- /quote/[token] 공개 페이지 생성
- 미들웨어에서 /quote 경로 인증 skip
- 모바일 최적화 레이아웃
- 차량 정보 전체 표시 (plate/purchase_price/margin 제외)
- 차량 사진 갤러리
- 판매가/보증금/월납입료 강조 표시
- 리본랩스 로고 + 연락처 헤더
- 유효기간 체크 (만료 시 안내 페이지)
- 조회 시 view_count, first_viewed_at, last_viewed_at 자동 기록

### 섹션 4: "4. 딜러용 UI" (4개, 전부 체크)
- 차량 상세 페이지에 "견적서 만들기" 버튼 추가
- 버튼 클릭 시 모달: 링크 생성 + 복사 + 유효기간 선택
- 이미 생성된 견적서 있으면 재사용 또는 새로 생성 선택
- 내 견적서 목록 페이지 (선택): 생성한 견적서 + 고객 열람 여부 확인 → **이번 Phase 미구현**, 체크 시점: 명세에서 "(선택)"이므로 명세의 완료 기준에 부합하는 최소 구현만 체크. 내 견적서 목록 페이지는 이번에 만들지 않음.

→ ai-dev-team 체크: 3/4 (내 견적서 목록 제외)

**총 체크 대상: 2+3+9+3 = 17개 / 19개**

## 타임박스

- 탐색: 완료 (30분)
- CONTEXT/PLAN: 진행 중 (20분)
- SQL: 30분
- BE 2개 API: 40분
- 미들웨어: 5분
- FE 공개 페이지: 60분
- FE 딜러 모달: 30분
- env/APPLY: 15분
- 검증: 20분
- Notion/commit/Slack: 15분

총 약 4.5시간 목표.
