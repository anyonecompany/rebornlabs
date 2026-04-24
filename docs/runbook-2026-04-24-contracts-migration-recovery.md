# Runbook — `contracts` 테이블 마이그레이션 파일 복원

> 작성: 2026-04-24  
> 대상: 대표 (Supabase Dashboard 접근 가능자)  
> 관련 QA 플랜: P0-4

## 배경

오늘 2026-04-24 전수 QA 중 `supabase/migrations/` 디렉토리에 `contracts` 테이블의 `CREATE TABLE` 정의가 **한 건도 없다는 것**을 확인.

```bash
grep -rn "CREATE TABLE.*contracts" supabase/migrations/   # → 0건
```

그럼에도 `types/database.ts:279` 에는 contracts 타입이 있고, 
`20260420_org_structure.sql:212-235`, `20260422_contract_type.sql:18` 에서 
`ALTER TABLE contracts` 가 사용되고 있다. 즉 **운영 DB 에는 contracts 가 존재하지만 
마이그레이션 파일로 버전 관리되지 않는 상태**.

## 왜 Critical 인가

지금 당장 고객 대면 장애는 없다. 하지만:

- 스테이징·재배포 환경을 새로 구성할 때 `supabase db push` 로 contracts 테이블을 
  재현할 수 없어 어드민이 기동하지 못함
- 재해 복구 시 마이그레이션만으로 스키마 복원 불가
- 신규 합류 개발자가 로컬 Supabase 에서 스키마 재현 불가
- IaC 원칙 위반 — 운영 DB 가 유일한 진실 원천이 되어버림

## 복구 절차 (대표 수행)

### 1. 운영 DB 에서 contracts DDL 추출

Supabase Dashboard → SQL Editor 에서 실행:

```sql
-- (a) 컬럼 정의
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'contracts'
ORDER BY ordinal_position;

-- (b) 제약 조건
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.contracts'::regclass;

-- (c) 인덱스
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'contracts';

-- (d) RLS 정책
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'contracts';
```

또는 Supabase CLI 사용 (더 빠름):

```bash
supabase db dump --schema public --data-only=false --table public.contracts \
  > /tmp/contracts_schema.sql
```

### 2. 마이그레이션 파일 작성

파일명: `supabase/migrations/20260419_contracts.sql`  
(타임스탬프가 `20260420_org_structure.sql` 보다 **이전**이어야 순차 적용 시 의존성이 맞음)

템플릿:

```sql
-- =============================================================
-- 20260419_contracts.sql — contracts 테이블 (재현성 복구)
-- 작성일: 2026-04-19 (소급 반영 — 2026-04-24 runbook 에 따라 추출)
-- 사유: 운영 DB 에서 수동 생성된 contracts 테이블을 IaC 로 편입.
--       기존 환경엔 이미 존재하므로 CREATE TABLE IF NOT EXISTS 로 idempotent.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS contracts (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id            UUID         NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  token              TEXT         NOT NULL UNIQUE,
  status             TEXT         NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'sent', 'signed')),
  customer_name      TEXT         NOT NULL,
  customer_phone     TEXT         NOT NULL,
  customer_email     TEXT         NOT NULL,
  customer_address   TEXT,
  customer_id_number TEXT,
  vehicle_info       JSONB        NOT NULL DEFAULT '{}',
  selling_price      INTEGER      NOT NULL,
  deposit            INTEGER      NOT NULL,
  signature_url      TEXT,
  signed_at          TIMESTAMPTZ,
  pdf_url            TEXT,
  contract_type      TEXT         DEFAULT 'accident'
                       CHECK (contract_type IN ('accident', 'safe')),
  created_by         UUID         NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 인덱스 (실제 추출 결과로 교체 필수)
CREATE INDEX IF NOT EXISTS idx_contracts_sale_id ON contracts (sale_id);
CREATE INDEX IF NOT EXISTS idx_contracts_token   ON contracts (token);
CREATE INDEX IF NOT EXISTS idx_contracts_status  ON contracts (status);

-- RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- 정책들 (실제 추출 결과로 교체)
DROP POLICY IF EXISTS contracts_select_admin_staff ON contracts;
CREATE POLICY contracts_select_admin_staff ON contracts
  FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS contracts_select_dealer ON contracts;
CREATE POLICY contracts_select_dealer ON contracts
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'dealer'
    AND sale_id IN (SELECT id FROM sales WHERE dealer_id = auth.uid())
  );

-- contracts_select_director_team_leader 는 20260420_org_structure.sql 에 이미 존재

COMMIT;
```

> **중요**: 위 템플릿은 **추정**이다. Step 1 의 실제 추출 결과로 컬럼·제약·인덱스·정책을 교체해야 한다. 
> 특히 `sale_id FK ON DELETE` 정책, `created_by FK`, 인덱스 유무는 DB 가 정답.

### 3. 기존 운영 DB 에는 적용하지 말 것

`IF NOT EXISTS` 와 `DROP POLICY IF EXISTS` 덕분에 재실행해도 무해하지만, 
**이미 contracts 테이블이 있는 운영 DB 에 굳이 다시 실행할 필요는 없다**. 
파일만 커밋해 두고 신규 환경에서만 적용되도록 한다.

### 4. 검증

빈 Supabase 프로젝트를 하나 만들어 `supabase db push` 로 전체 마이그레이션을 순차 적용 → 에러 없이 완료 + contracts 존재 확인.

```bash
supabase link --project-ref <temp-project>
supabase db push
psql "$DATABASE_URL" -c "\d+ contracts"
```

### 5. 커밋

```bash
git add supabase/migrations/20260419_contracts.sql
git commit -m "fix(db): contracts 테이블 마이그레이션 파일 복원 (P0-4 QA)"
git push
```

## 관련 QA 문맥

- 전수 QA 플랜: `.claude/plans/gentle-shimmying-quasar.md`
- 같은 QA 스프린트 해결: 
  - `469860e` — GAS 웹훅 인증 + 타임아웃 (P0-2)
  - `416f504` — settlements fail-closed + public-pdf audit 로그 + cancel 에러 마스킹 (P0-3, P1-3, P1-4)
  - `1d22c3d` — PII console.log 정리 (P1-1)

## 남은 대표 수동 작업 체크리스트

- [ ] 이 Runbook Step 1 실행 → DDL 추출
- [ ] `20260419_contracts.sql` 작성 + 커밋
- [ ] Vercel + GAS 에 `GAS_WEBHOOK_SECRET` 환경변수 추가 (P0-2 후속)
- [ ] GAS 핸들러 진입부에 `Authorization: Bearer` 검증 로직 추가
- [ ] GAS 이메일 본문 "24시간 유효" 문구 제거 (78501d3 후속)
- [ ] `20260423_commissions.sql` 운영 DB 에 수동 적용 (아직 미적용이면)
