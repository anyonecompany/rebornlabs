# 견적서 공개 링크 — 작업 컨텍스트

> 작성일: 2026-04-20
> 작업 범위: Medium feature (DB + API 2 + 공개 페이지 + 딜러 모달 + 미들웨어)

## 핵심 결정

### 토큰/번호 생성
- `token`: `crypto.randomBytes(32).toString('hex')` (64자). Node 내장 crypto 사용으로 의존성 0.
- `quote_number`: `RL-YYYYMMDD-NNN`. `NNN`은 해당 일자 순번, 0패딩 3자리. 트랜잭션 내 `SELECT COUNT(*) + 1 FROM quotes WHERE created_at::date = CURRENT_DATE` → 동시 생성 경합은 Supabase 단일 커넥션 기준 낮고, 유일성은 UNIQUE 제약으로 방어. 충돌 시 재시도 1회.
- 날짜는 `CURRENT_DATE` (UTC). 한국 시간과 하루 차이 발생 가능 → quote_number의 날짜는 타임존 Asia/Seoul로 계산: `to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYYYMMDD')`.

### 미들웨어
- 현재 `proxy.ts`의 `PUBLIC_PATHS`: `/login /unauthorized /api /_next /favicon.ico /sign`
- **추가**: `/quote`
- `/api`는 이미 공개라서 `/api/quotes/[token]` GET은 자동 skip. 단 `generate`는 API 내부에서 `verifyUser` 호출하여 자체 인증.

### 가정 고정 (명세의 "확인 필요" 항목)
| 항목 | 가정 |
|------|------|
| 리본랩스 로고 | 텍스트 로고 (골든 베이지 색상 "REBORN LABS") |
| 사업자/주소/연락처 | env placeholder (`REBORNLABS_BUSINESS_NUMBER`, `REBORNLABS_ADDRESS`, `REBORNLABS_PHONE`) |
| 기본 유효기간 | 7일 |
| 판매완료(status=sold) 차량 | 생성 허용 + 경고 없음 (DB 제약 없음) |
| VIN 노출 | OK (일반 구매 확인 정보) |
| 카카오톡 공유 | 이번 Phase 미포함 (다음) |

### 민감 필드 제외 (공개 API 응답)
- ❌ `vehicles.plate_number` (외부 비교 방지)
- ❌ `vehicles.purchase_price` (매입가)
- ❌ `vehicles.margin` (마진)
- ❌ `vehicles.deleted_at`
- ✅ `vehicles.vin`, `selling_price`, `deposit`, `monthly_payment`, `photos`, `make/model/year/mileage/color`, `vehicle_code`

### 권한 모델
- **생성 (POST /api/quotes/generate)**: `admin/staff/dealer` 모두 허용 (딜러 영업 툴이 주용도지만 관리자도 생성 가능)
  - `dealer`: 본인 권한 내 차량만 생성 (service_role로 차량 존재 확인만)
  - `dealer_id`는 항상 `auth.uid()`로 기록 (admin/staff도 본인 이름으로 발급)
- **공개 조회 (GET /api/quotes/[token])**: 인증 없음, service_role로 RLS 우회, token 검증만
- **관리 조회 (추가 UI에서 사용)**: RLS 정책으로 dealer 본인, admin/staff 전체, director/team_leader 산하

### 기존 견적 재사용 로직
- POST 시 `(vehicle_id, dealer_id)` 조합으로 **만료 안 됨(expires_at IS NULL OR expires_at > now())** 활성 견적 확인
- 있으면 `isExisting: true` + 기존 token/URL 반환 (새로 만들지 않음)
- 프론트에서 "기존 견적 사용 / 새로 발급" 선택 제공. 사용자가 "새로 발급" 선택하면 쿼리파라미터 `force=true`로 재요청하면 새로 INSERT.

### URL 생성
- `${NEXT_PUBLIC_APP_URL}/quote/${token}` 사용.
- `NEXT_PUBLIC_APP_URL`은 프로덕션 Vercel URL로 주입.

### 만료 처리
- GET API에서 `expires_at IS NOT NULL AND expires_at < now()` → 410 Gone + 만료 데이터 (quoteNumber + dealer 정보만)
- 공개 페이지는 410 응답 받으면 만료 전용 컴포넌트 렌더링

### 조회수 증가
- GET 성공 시 service_role로 `UPDATE quotes SET view_count = view_count+1, last_viewed_at=now(), first_viewed_at = COALESCE(first_viewed_at, now()) WHERE token=$1`
- race condition 무시 (정확성이 요구되지 않음)

## 스펙에 없는 설계 보충

### quote_number 생성 함수
SQL 함수 `generate_quote_number()`로 분리. 동시 생성 시 UNIQUE 충돌하면 INSERT 레이어에서 재시도 (1회, 다른 순번).

### 딜러 모달 — radio-group 부재
`components/ui/radio-group.tsx`가 없음. 커스텀 button group으로 구현 (Toggle 스타일, `aria-pressed`).

### 판매완료 차량
명세에 "허용 + 경고 표시" 가정 있으나 UI 경고는 미포함(가정 변경). 이유: 차량 상태와 견적 생성 사이 강한 의존 없음(상담중/대기/판매완료 모두 고객에게 보여주는 맥락 가능). 필요시 Phase 다음에서 추가.

## 리스크
1. `quote_number` 일자 계산 타임존 — `Asia/Seoul`로 명시 고정 (SQL `AT TIME ZONE`).
2. `expires_at IS NULL`(무제한)과 만료 체크 로직 호환 — `IS NULL OR > now()` 패턴 일관 적용.
3. `NEXT_PUBLIC_APP_URL` 미설정 시 URL 생성 실패 → API에서 `?? request headers의 origin` fallback 처리.
4. 딜러 RLS: `quotes_dealer_own` FOR ALL USING `dealer_id = auth.uid()` → admin이 INSERT 시에는 service_role 경유라 RLS bypass이므로 문제 없음.
