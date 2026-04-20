# 리본랩스 조직 구조 변경 — Phase 1 컨텍스트

> 작성일: 2026-04-20
> 작업 단위: Phase 1/4 (DB 스키마 + RLS 마이그레이션 SQL 생성)
> Notion: Actionplan callout `73037b6f-6bf8-8394-a91e-01a167f9351e`

## 결정 사항 (Phase 1 범위)

### 1. ENUM 확장 방식
- `user_role`은 real PostgreSQL ENUM. `ALTER TYPE user_role ADD VALUE` 사용.
- **제약**: PostgreSQL에서 ENUM에 추가된 값은 **같은 트랜잭션 내에서 사용 불가**. 트랜잭션 분리 필수.
- Supabase SQL Editor는 각 실행이 auto-commit이므로 단일 실행이면 문제 없음. 다만 마이그레이션 파일 하나에 `BEGIN;` ~ `COMMIT;`으로 감싸지 않고 **블록을 분리**하거나 `IF NOT EXISTS` 가드 사용.

결정: `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'director'`, `'team_leader'` 두 줄로 시작. 이후 본 트랜잭션은 별도. JWT hook이 `role::TEXT`로 캐스트하므로 enum 확장만으로 JWT 자동 반영.

### 2. team_assignments 테이블
- 명세 그대로. `UNIQUE(user_id, leader_type)`로 한 사람당 팀장/본부장 1명씩 제한.
- `CREATE TABLE IF NOT EXISTS`로 idempotent.
- 인덱스는 `CREATE INDEX IF NOT EXISTS`.

### 3. sales 테이블 컬럼 추가
- `team_leader_id`, `team_leader_fee`, `director_id`, `director_fee` 추가
- **DEFAULT 0 → NOT NULL 아님** 명세. NULL 허용으로 기존 레코드 무영향.
- 신규 판매부터 값 기록 (Phase 3에서 API 수정).

### 4. consultations 테이블 컬럼 추가
- `available_deposit`, `desired_monthly_payment` 추가 (INTEGER NULL)
- 만원 단위. 프론트에서 라벨 처리.

### 5. get_subordinate_ids 함수
- SECURITY DEFINER + STABLE
- 본인 + 직속 하위(1단계) + 2단계 하위 UNION
- 팀장이 호출 → 본인 + 산하 딜러들
- 본부장이 호출 → 본인 + 산하 팀장들 + 팀장 산하 딜러들
- admin/staff가 호출해도 같은 결과(본인 + 관계된 하위) — 그러나 admin/staff는 이 함수 사용 RLS 정책을 타지 않으므로 문제 없음.

### 6. RLS 정책 추가 대상
- `consultations_select_director_team_leader`
- `sales_select_director_team_leader`
- `contracts_select_director_team_leader` ← contracts는 001_schema.sql에 없지만 실재. `IF EXISTS` 가드 또는 조건부 CREATE POLICY 사용.
- `expenses`는 기존 admin/staff 정책 유지 → director/team_leader 차단 (묵시적 deny, 추가 정책 불필요). 하지만 Notion 명세에 "역할별 접근 범위 재설정"이 있어 **주석으로 의도만 기록**.
- `profiles`에는 director/team_leader가 **산하 사용자의 profile을 조회**할 수 있어야 함 (조직 관리 UI에서 필요). → `profiles_select_director_team_leader` 정책 추가.

### 7. contracts 테이블 RLS
- 001_schema.sql에 없어 별도 생성 마이그레이션이 있었던 것으로 추정.
- CREATE POLICY 시 `IF NOT EXISTS`는 PostgreSQL 17+ 이상 지원. Supabase는 최근 15/16 기본 → `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` 패턴 또는 `DROP POLICY IF EXISTS ... ; CREATE POLICY ...;` 패턴 사용.
- 선택: `DROP POLICY IF EXISTS → CREATE POLICY` (재적용 안전).

### 8. 역호환 (반드시 지킬 것)
- 기존 admin/staff/dealer RLS 정책을 **수정하지 않는다**. 신규 정책 **추가만**.
- profiles.role 기존 값(admin/staff/dealer/pending)은 그대로 유지.
- JWT hook은 수정 불필요 (role::TEXT 캐스트로 자동 반영).

### 9. 파일 구조
- `supabase/migrations/20260420_org_structure.sql` — enum 확장 + 테이블/컬럼 + 함수 + 새 RLS 정책
- 전체를 단일 파일에 작성. ENUM ADD VALUE는 파일 최상단에 배치. 본 트랜잭션 밖에서 실행.

## 제외 범위 (Phase 1 안 함)
- 프론트엔드 코드 (`app/`, `src/lib/`)
- `useUserRole` 훅 확장
- 미들웨어 라우팅 규칙
- 사이드바 메뉴 노출 규칙
- 조직 관리 UI
- 수당 자동 배분 로직
- 정산 페이지 확장
- 상담 폼 필드 UI

→ Phase 2~4에서 처리

## 리스크
1. **ALTER TYPE ADD VALUE 트랜잭션 제약**: 파일 최상단 enum 확장 후, 다른 DDL에서 해당 값을 WHERE 절에 사용하지 않으면 문제 없음. 현재 설계는 `leader_type` CHECK 제약에만 사용하고 직접 WHERE 'director' 비교는 없음 → OK.
2. **contracts 테이블 부재 리스크**: 마이그레이션 파일에 없음. 실 DB에 있으면 RLS 추가 성공, 없으면 실패. `DO $$ BEGIN ... IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='contracts') THEN ... END IF; END $$;` 가드 사용.
3. **기존 딜러 RLS 역호환**: 신규 정책은 OR로 작동(정책은 누적). 기존 `dealer = auth.uid()` 정책이 먼저 타면 정상. director/team_leader는 별도 정책으로 확장.

## Phase 1 성공 기준
- 마이그레이션 SQL 파일 생성
- 각 블록 idempotent (IF NOT EXISTS, DROP/CREATE 패턴)
- 롤백 SQL 함께 제공
- 기존 admin/staff/dealer 역호환 보장 (기존 정책 미수정)
