# 견적서 Phase 2 — 내 견적서 목록 + 열람 추적 UI

> 작성일: 2026-04-20
> 단위: Medium feature
> 의존성: Phase 1 (quotes 테이블 + RLS + Supabase 적용 완료)

## 핵심 결정

### 1. 서버 페이지네이션 vs 클라이언트
- 결정: **offset-based 서버 페이지네이션** (`?page=1&pageSize=20`)
- 이유: 장기적으로 견적 수천 건까지 증가 가능. 초기엔 Supabase `.range(start, end)` 사용, 총 개수는 `count: 'exact'` 헤더로 취득
- DataTable 컴포넌트는 이미 클라이언트 페이지네이션 내장 → 이번엔 DataTable의 `pageSize`를 매우 크게 설정하거나 자체 테이블 사용. 선택: **자체 간이 테이블 + 페이지네이션 UI** (DataTable 내장 페이지네이션과 서버 페이지네이션이 중복되지 않게)

### 2. 권한별 조회 범위
- `dealer`: 본인 생성만 (`dealer_id = auth.uid()`)
- `admin/staff`: 전체
- `director/team_leader`: 산하 딜러들의 견적 (Phase 1 `get_subordinate_ids` 활용)
- **구현**: API에서 `user.role`에 따라 쿼리 조건 분기. 단, Supabase PostgREST에서 함수 기반 `.in()` 쓰려면 RPC 또는 raw SQL 필요. **간단화**: `director/team_leader`일 때 service_role + 수동 필터 (먼저 `get_subordinate_ids` RPC로 ID 배열 조회 → `.in('dealer_id', ids)`)
- 사실 기존 RLS만 의존해도 충분하지만 service_role 사용 중이므로 앱 레벨 필터 필수

### 3. `director/team_leader` 타입 처리
- `types/database.ts`의 `UserRole` 타입은 현재 `admin | staff | dealer | pending | none`
- Phase 1 마이그레이션에서 enum 값은 추가됐지만 TS 타입 미반영
- 이번 Phase에서 **verify.ts와 types의 UserRole 확장 안 함** (작업 범위 초과)
- 대신 견적 목록 API 내부에서 `profile.role`를 문자열로 비교 (`role === 'director' || role === 'team_leader'`)
- 사이드바도 `admin/staff` = "견적서 관리", `dealer` = "내 견적서" 두 라벨만. director/team_leader는 향후 별도 Phase에서 라벨/메뉴 확장

### 4. 만료 연장 권한
- 본인이 만든 견적(`dealer_id = auth.uid()`) 또는 `admin/staff`만
- `director/team_leader`는 **연장 불가** (조회만)
- 가정 명시(스펙 "확인 필요" 항목)

### 5. 상태 필터 로직
- `active`: `expires_at IS NULL OR expires_at > now()`
- `expired`: `expires_at IS NOT NULL AND expires_at <= now()`
- `all`: 모두

### 6. URL 조합
- Phase 1과 동일: `${NEXT_PUBLIC_APP_URL}/quote/${token}`
- 미설정 시 request origin fallback

### 7. 검색
- 견적번호: `quote_number ilike '%query%'`
- 차량명: JOIN된 `vehicles.make` + ` ` + `vehicles.model` 에 대해 Supabase `.or()` 로 처리 불가 (JOIN 필드에 `.or` 제약). 대안: **견적번호만 ilike**, 차량명 검색은 서버에서 vehicles를 별도 조회해 `vehicle_id` 목록 얻어 `.in('vehicle_id', ids)` 조건 추가
- 검색어가 비어있으면 필터 skip

### 8. 조회수 표현 (UI)
- 0회: "아직 안 봄" (회색)
- 1회: "1회 조회" (보통 색)
- 2회+: "N회 조회" (강조, 아이콘 포함)

### 9. 마지막 조회 포맷
- 1시간 이내: "N분 전"
- 24시간 이내: "N시간 전"
- 7일 이내: "N일 전"
- 그 이상: "YYYY-MM-DD"

### 10. 리스트/테이블 분리 (반응형)
- `md` 이상: 테이블 레이아웃
- `md` 미만: 카드 리스트 (세로 스택)
- 동일 데이터, 동일 상세 모달

## 가정 (스펙 "확인 필요")

| 항목 | 가정 |
|------|------|
| 사이드바 아이콘 | `FileText` (lucide-react) |
| 페이지당 개수 | 20개 |
| 삭제 버튼 | 이번 Phase 제외 (다음) |
| director/team_leader 연장 권한 | 불가 (admin/staff + 본인 dealer만) |
| director/team_leader 사이드바 라벨 | 이번 Phase에선 미구현 (타입 확장 범위) |

## 리스크

- **director/team_leader 빌드 실패**: `profile.role` 값이 `"director"` 문자열일 때 TypeScript `UserRole` 타입과 비교 시 타입 오류 → `role as string` 캐스트 또는 `role === "director"` 리터럴 비교(TS 2367 에러 가능)로 회피 필요.
- **get_subordinate_ids RPC**: `types/database.ts`의 `Functions`에 등록 안 돼 있음 → 이번 Phase에서 추가.
- **만료 연장 과거 시점 처리**: 이미 만료된 견적에 `+7일` 요청 시 `now() + 7일`로 계산 (기존 `expires_at`이 과거면 `now()` 기준으로 재설정). 스펙 명시.
