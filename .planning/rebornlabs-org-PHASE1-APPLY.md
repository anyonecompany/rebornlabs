# Phase 1 — DB 스키마 + RLS 적용 가이드 (CTO용)

> 작성: 2026-04-20
> 대상 파일: `supabase/migrations/20260420_org_structure.sql`
> 적용자: CTO (Supabase Dashboard → SQL Editor)

## 사전 확인

- [ ] Supabase Dashboard 접속 가능 (프로덕션 프로젝트)
- [ ] **현재 DB 백업 확보** — Dashboard → Database → Backups 에서 최근 백업 시점 확인
- [ ] 기존 테스트 계정 로그인 가능 확인
  - `contact@anyonecompany.kr` (admin)
  - `staff@anyonecompany.kr` (staff)
  - `dealer@anyonecompany.kr` (dealer)

## 적용은 반드시 2단계로 나눠 실행

PostgreSQL 제약: ENUM에 추가된 값은 같은 트랜잭션에서 사용할 수 없다.
따라서 아래 BLOCK 1을 먼저 단독 실행한 뒤, BLOCK 2를 실행한다.

---

## Step 1 — ENUM 확장 (안전, 단독 실행)

Supabase SQL Editor에서 아래 SQL **만** 복사해서 실행:

```sql
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'director';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_leader';
```

**검증 쿼리**:
```sql
SELECT unnest(enum_range(NULL::user_role));
```

기대 결과: `admin`, `staff`, `dealer`, `pending`, `director`, `team_leader` (6개)

---

## Step 2 — 테이블/함수/RLS 정책 (단일 트랜잭션)

마이그레이션 파일의 BLOCK 2 전체를 SQL Editor에 복사해서 실행.
`BEGIN;` 으로 시작하고 `COMMIT;` 으로 끝나는 부분.

위치: `supabase/migrations/20260420_org_structure.sql` 의
```
-- BLOCK 2 — 테이블/함수/RLS (트랜잭션)
```
부터
```
COMMIT;
```
까지.

적용되는 내용:

| # | 변경 | 영향 |
|---|------|------|
| 2-1 | `team_assignments` 테이블 + 인덱스 + RLS 정책 5개 | 신규, 기존 데이터 없음 |
| 2-2 | `sales` 컬럼 4개 추가 (`team_leader_id`, `team_leader_fee`, `director_id`, `director_fee`) | 기존 행은 NULL/0 |
| 2-3 | `consultations` 컬럼 2개 추가 (`available_deposit`, `desired_monthly_payment`) | 기존 행은 NULL |
| 2-4 | `get_subordinate_ids(UUID)` 함수 | 신규 |
| 2-5 | `profiles` → `profiles_select_director_team_leader` 정책 | 기존 정책 유지, 신규 추가만 |
| 2-6 | `consultations` → `consultations_select_director_team_leader` 정책 | 기존 정책 유지, 신규 추가만 |
| 2-7 | `sales` → `sales_select_director_team_leader` 정책 | 기존 정책 유지, 신규 추가만 |
| 2-8 | `contracts` → `contracts_select_director_team_leader` 정책 (테이블 존재 시에만) | 기존 정책 유지, 신규 추가만 |
| 2-9 | `expenses` → 주석만 추가 (정책 변경 없음) | 없음 |

**검증 쿼리**:
```sql
-- 테이블 생성 확인
SELECT tablename FROM pg_tables WHERE tablename = 'team_assignments';

-- sales 신규 컬럼
SELECT column_name FROM information_schema.columns
WHERE table_name = 'sales'
  AND column_name IN ('team_leader_id','team_leader_fee','director_id','director_fee')
ORDER BY column_name;

-- consultations 신규 컬럼
SELECT column_name FROM information_schema.columns
WHERE table_name = 'consultations'
  AND column_name IN ('available_deposit','desired_monthly_payment')
ORDER BY column_name;

-- 함수 생성 확인
SELECT proname, prosecdef FROM pg_proc
WHERE proname = 'get_subordinate_ids';
-- prosecdef = true 여야 함 (SECURITY DEFINER)

-- 신규 RLS 정책 (4개 또는 contracts 포함 시 5개)
SELECT tablename, policyname FROM pg_policies
WHERE policyname LIKE '%director_team_leader%'
   OR (tablename = 'team_assignments')
ORDER BY tablename, policyname;

-- 함수 동작 확인 (본인만 있는 경우 1행 반환)
-- 본인 user_id 넣고 테스트
SELECT * FROM get_subordinate_ids('YOUR-ADMIN-UUID');
```

---

## Step 3 — 기존 역할 역호환 검증 (반드시)

Supabase 적용 후 어드민 사이트에서:

1. **admin 계정(contact@…) 로그인 → 확인**
   - 상담 목록 전체 표시
   - 판매 내역 전체 표시
   - 차량 목록 표시
   - 사용자 관리 접근 가능

2. **staff 계정(staff@…) 로그인 → 확인**
   - 상담/판매/차량 목록 정상
   - 사용자 관리는 admin 전용 (접근 차단)

3. **dealer 계정(dealer@…) 로그인 → 확인**
   - 본인 배정 상담만 표시 (기존과 동일)
   - 본인 판매만 표시
   - 다른 딜러 데이터 안 보임

✅ 3개 역할 모두 이전과 동일하게 동작하면 역호환 성공.

---

## 롤백 방법 (문제 발생 시)

SQL Editor에서 아래를 순서대로 실행:

```sql
-- ============================================================
-- 롤백 BLOCK A — RLS 정책 제거 (트랜잭션 가능)
-- ============================================================
BEGIN;

DROP POLICY IF EXISTS team_assignments_select_admin_staff   ON team_assignments;
DROP POLICY IF EXISTS team_assignments_select_self_related  ON team_assignments;
DROP POLICY IF EXISTS team_assignments_insert_admin         ON team_assignments;
DROP POLICY IF EXISTS team_assignments_update_admin         ON team_assignments;
DROP POLICY IF EXISTS team_assignments_delete_admin         ON team_assignments;

DROP POLICY IF EXISTS profiles_select_director_team_leader        ON profiles;
DROP POLICY IF EXISTS consultations_select_director_team_leader   ON consultations;
DROP POLICY IF EXISTS sales_select_director_team_leader           ON sales;

-- contracts 테이블 존재 시에만
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='contracts') THEN
    EXECUTE 'DROP POLICY IF EXISTS contracts_select_director_team_leader ON contracts';
  END IF;
END $$;

-- 함수 제거
DROP FUNCTION IF EXISTS public.get_subordinate_ids(UUID);

-- 컬럼 제거 (주의: 이미 값이 들어갔으면 데이터 손실)
ALTER TABLE sales
  DROP COLUMN IF EXISTS team_leader_id,
  DROP COLUMN IF EXISTS team_leader_fee,
  DROP COLUMN IF EXISTS director_id,
  DROP COLUMN IF EXISTS director_fee;

ALTER TABLE consultations
  DROP COLUMN IF EXISTS available_deposit,
  DROP COLUMN IF EXISTS desired_monthly_payment;

-- team_assignments 테이블 제거
DROP TABLE IF EXISTS team_assignments;

COMMIT;
```

**ENUM 값 롤백은 어려움**: PostgreSQL은 `ALTER TYPE ... DROP VALUE`를 지원하지 않는다. 롤백이 정말 필요하면:

```sql
-- 옵션 A: ENUM에 'director'/'team_leader' 값을 갖는 row 없는지 확인
SELECT role, count(*) FROM profiles GROUP BY role;

-- 옵션 B: 타입 재생성 (경고: 모든 사용처 재참조 필요. 권장하지 않음)
-- 실제로는 ENUM에 추가된 값을 사용하지 않으면 그대로 둬도 무해.
-- 사용되지 않는 enum 값은 ALTER TYPE ... RENAME VALUE 로 비활성화 네이밍 가능.
```

→ **권장**: ENUM 값은 그대로 두고 사용만 안 한다.

---

## 적용 완료 후 체크리스트

- [ ] Step 1 ENUM 확장 실행 → `unnest(enum_range(NULL::user_role))` 6개 확인
- [ ] Step 2 트랜잭션 실행 → COMMIT 성공 메시지
- [ ] 검증 쿼리 5개 모두 기대값 반환
- [ ] 기존 admin 계정 로그인 → 상담/판매 정상 표시
- [ ] 기존 staff 계정 로그인 → 상담/판매 정상 표시
- [ ] 기존 dealer 계정 로그인 → 본인 데이터만 표시
- [ ] Notion 섹션 1 마지막 체크박스 "마이그레이션 SQL 생성 및 Supabase 적용" **수동 체크**
  - 명령: `./scripts/product-sync/notion-checkbox.sh check_by_text "73037b6f-6bf8-8394-a91e-01a167f9351e" "마이그레이션 SQL 생성 및 Supabase 적용" "1. 데이터베이스 스키마 변경"`

---

## 주의사항 (과거 교훈)

- **Rate-limiting 때처럼 기존 동작 차단 회피**: 이번 마이그레이션은 기존 RLS 정책을 **수정하지 않는다**. 신규 정책 추가만. 기존 admin/staff/dealer 동작은 변함 없어야 한다.
- **신규 정책 우선순위 주의**: PostgreSQL RLS는 여러 SELECT 정책이 있으면 **OR**로 작동한다. 기존 `dealer = auth.uid()` 정책과 신규 `director/team_leader` 정책은 충돌하지 않는다.
- **contracts 테이블 가드**: `DO $$ IF EXISTS ... END $$` 블록이 테이블 존재 여부 자동 확인. 운영 DB에 contracts가 실제로 있어야 정책이 생성된다.
- **JWT 훅은 수정 불필요**: `008_jwt_hook.sql`의 `role::TEXT` 캐스트가 신규 enum 값을 그대로 JWT claim에 반영한다. 재배포 불필요.
- **재실행 안전**: 모든 DDL이 `IF NOT EXISTS` / `OR REPLACE` / `DROP POLICY IF EXISTS` 패턴. 동일 파일 여러 번 실행해도 오류 없음.
