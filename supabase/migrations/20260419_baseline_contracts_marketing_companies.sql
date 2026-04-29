-- =============================================================
-- 20260419_baseline_contracts_marketing_companies.sql
-- 작성일: 2026-04-29 (논리적 시점: 2026-04-19 — ALTER 이전, org_structure 직전)
-- 작성자: Architect (마이그레이션 부재 P0 — 베이스라인 복원)
--
-- 목적:
--   운영 DB에는 이미 존재하지만, 저장소(supabase/migrations/)에 CREATE
--   문이 없는 두 테이블을 신규 환경(QA / staging / 로컬) 부트스트랩
--   용도로 idempotent CREATE TABLE IF NOT EXISTS 형태로 정의한다.
--
-- 파일명 prefix(20260419) 는 timestamp 기반 ALTER 마이그레이션
--   - 20260420_org_structure.sql (contracts RLS — IF EXISTS 가드 있음)
--   - 20260422_contract_type.sql (contracts.contract_type ADD COLUMN)
--   - 20260424_marketing_companies_ref_code.sql (ref_code ADD COLUMN)
-- 보다 앞서 실행되도록 의도적으로 배치했다.
--
-- 대상 테이블:
--   1) contracts            — 계약서 (전자서명 기반)
--   2) marketing_companies  — 마케팅 업체 (UTM ref_code 발급)
--
-- ⚠️ 중요 운영 규칙 ⚠️
--   - 운영 DB(prod)에는 이미 두 테이블이 모두 존재한다.
--     이 마이그레이션을 운영에 적용하지 마라. 적용 시 IF NOT EXISTS 가드로
--     테이블 생성은 스킵되지만, contracts.contract_type 같은 컬럼은
--     별도 ALTER 마이그레이션(20260422_contract_type.sql)에서 추가되므로
--     이 파일에 포함된 컬럼 정의가 운영과 어긋날 수 있다.
--   - 신규 환경에서는 이 파일을 가장 먼저(파일명 prefix 000) 적용한 뒤,
--     이후 timestamp 기반 ALTER 마이그레이션이 순서대로 실행된다.
--     (20260422_contract_type.sql 가 contract_type 을 ADD COLUMN 하지만,
--      이 파일에서 이미 정의했으므로 IF NOT EXISTS 로 무해하게 스킵된다.)
--
-- ⚠️ Schema 정확도 ⚠️
--   이 schema 는 코드(types/database.ts, app/api/**)와 ALTER 마이그레이션
--   에서 추론(inferred)했다. 100% 정확하다는 보장은 없다.
--   정확한 운영 schema 추출은 다음 명령어 사용:
--
--     pg_dump --schema-only \
--             --table=public.contracts \
--             --table=public.marketing_companies \
--             "$DATABASE_URL" > prod_schema_dump.sql
--
--   추출 결과와 이 파일을 비교하여 불일치 발견 시 이 파일을 갱신하라.
--   특히 다음 항목은 운영 DB 검증 필수:
--     - DEFAULT 값 (gen_random_uuid, now() 등)
--     - NOT NULL 제약
--     - CHECK 제약
--     - 인덱스 (PK 외)
--     - FK 참조 (sale_id → sales.id, created_by → profiles.id 등)
--
-- 추론 근거:
--   - types/database.ts:265-307  (Row 타입 정의)
--   - app/api/contracts/route.ts (INSERT 컬럼)
--   - app/api/contracts/sign/[token]/route.ts (UPDATE 컬럼)
--   - app/api/marketing-companies/route.ts (INSERT/SELECT 컬럼)
--   - 20260422_contract_type.sql  (contract_type ALTER)
--   - 20260424_marketing_companies_ref_code.sql (ref_code ALTER)
--   - 20260420_org_structure.sql:212-235 (RLS — 별도 적용)
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. marketing_companies — 마케팅 업체
--    UTM ref / ref_code 발급 대상.
--    consultations.marketing_company (TEXT) 와 이름으로 매칭.
--    명시적 FK 는 코드 상 확인되지 않음 (문자열 매칭으로 운영).
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketing_companies (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,           -- 업체명 (한글)
    is_active   BOOLEAN     NOT NULL DEFAULT true,     -- 활성 여부
    -- ref_code: 20260424_marketing_companies_ref_code.sql 가 ALTER 로
    -- 추가하지만, 신규 환경 부트스트랩 시 IF NOT EXISTS 로 충돌 방지.
    -- ALTER 파일에서는 NULL 허용 → 백필 → NOT NULL 의 3단계 적용.
    -- 신규 환경은 백필 대상이 없으므로 NOT NULL DEFAULT 로 안전.
    ref_code    TEXT        NOT NULL DEFAULT LOWER(SUBSTRING(MD5(RANDOM()::TEXT || gen_random_uuid()::TEXT), 1, 6)),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ref_code UNIQUE — ALTER 파일과 동일 제약명 사용 (충돌 시 IF NOT EXISTS 로 스킵)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'marketing_companies_ref_code_unique'
    ) THEN
        ALTER TABLE marketing_companies
            ADD CONSTRAINT marketing_companies_ref_code_unique UNIQUE (ref_code);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_companies_ref_code
    ON marketing_companies (ref_code);

COMMENT ON TABLE  marketing_companies IS
    '마케팅 업체. UTM ref_code 발급 대상. consultations.marketing_company 와 name 으로 매칭.';
COMMENT ON COLUMN marketing_companies.ref_code IS
    '6자 영숫자 랜덤 코드. 공개 URL 의 ?ref= 파라미터로 사용. /^[a-z0-9]{6}$/.';


-- -------------------------------------------------------------
-- 2. contracts — 계약서 (전자서명 기반)
--    sale_id → sales.id (FK 추정. 운영 DB 검증 필요)
--    created_by → profiles.id (FK 추정)
--    token: 공개 서명 URL 의 권한 증명. crypto.randomUUID().
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contracts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id             UUID        NOT NULL,                        -- → sales(id) FK 추정
    token               TEXT        NOT NULL UNIQUE,                  -- 공개 서명용 토큰 (UUID)
    status              TEXT        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'sent', 'signed')),
    customer_name       TEXT        NOT NULL,
    customer_phone      TEXT        NOT NULL,
    customer_email      TEXT        NOT NULL,
    customer_address    TEXT,                                         -- nullable (route.ts: ?? null)
    customer_id_number  TEXT,                                         -- nullable (주민등록번호 — 평문 저장 여부 운영 검증 필요)
    vehicle_info        JSONB       NOT NULL DEFAULT '{}'::JSONB,     -- Record<string, unknown>
    selling_price       BIGINT      NOT NULL,                         -- 판매가 (원). number 타입 → BIGINT 추정 (INTEGER 가능성 운영 검증)
    deposit             BIGINT      NOT NULL DEFAULT 0,               -- 계약금 (원)
    signature_url       TEXT,                                         -- nullable. signatures 버킷 경로
    signed_at           TIMESTAMPTZ,                                  -- nullable
    pdf_url             TEXT,                                         -- nullable. contracts 버킷 경로
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID        NOT NULL,                         -- → profiles(id) FK 추정
    -- contract_type: 20260422_contract_type.sql 가 ALTER 로 추가.
    -- 신규 환경 부트스트랩 시 여기서 정의하면 ALTER 가 IF NOT EXISTS 로 스킵.
    contract_type       TEXT        NOT NULL DEFAULT 'accident'
                                    CHECK (contract_type IN ('accident', 'safe'))
);

-- 인덱스 — 운영 사용 패턴 기반 추정
--   - sale_id: GET /api/contracts?sale_id=... 조회용
--   - token:   GET /api/contracts/sign/[token] 공개 서명 페이지 조회용 (UNIQUE 자동 인덱스)
--   - created_by: 작성자별 조회 (선택적)
CREATE INDEX IF NOT EXISTS idx_contracts_sale_id    ON contracts (sale_id);
CREATE INDEX IF NOT EXISTS idx_contracts_created_by ON contracts (created_by);
CREATE INDEX IF NOT EXISTS idx_contracts_status     ON contracts (status);

COMMENT ON TABLE  contracts                  IS
    '계약서. 전자서명 기반. status 전이: draft → sent → signed. token 은 공개 서명 URL 의 권한 증명.';
COMMENT ON COLUMN contracts.token            IS
    '공개 서명 URL 의 권한 증명. crypto.randomUUID() 로 생성. UNIQUE.';
COMMENT ON COLUMN contracts.contract_type    IS
    '계약서 유형. accident=사고차량용(기본, 6·7조 기존 텍스트) / safe=무사고차량용(6·7조 별도 텍스트).';
COMMENT ON COLUMN contracts.customer_id_number IS
    '고객 주민등록번호. 평문 저장 여부는 운영 DB 검증 필요 — 암호화/마스킹 정책 확인 후 보안 가이드 수립.';

-- -------------------------------------------------------------
-- 3. RLS 정책
--    contracts RLS 는 20260420_org_structure.sql:212-235 에서 별도 적용.
--    (DO $$ ... IF EXISTS contracts ... $$ 블록 — 테이블 존재 시에만 정책 추가)
--    이 파일에서 RLS 활성화는 하지 않는다. 의도적 분리.
--
--    marketing_companies RLS 는 코드/마이그레이션 어디에도 없다.
--    운영 DB 에 RLS 가 켜져 있는지 별도 확인 필요. 끄면 누구나 읽기/쓰기 가능.
-- -------------------------------------------------------------

COMMIT;


-- =============================================================
-- 운영 DB 검증 가이드 (신규 환경 적용 후 또는 운영 schema 추출 시)
-- =============================================================
--
-- 1) 운영 schema 추출
--    pg_dump --schema-only \
--            --table=public.contracts \
--            --table=public.marketing_companies \
--            "$DATABASE_URL" > prod_schema_dump.sql
--
-- 2) 컬럼 비교
--    SELECT column_name, data_type, is_nullable, column_default
--      FROM information_schema.columns
--     WHERE table_schema='public' AND table_name IN ('contracts', 'marketing_companies')
--     ORDER BY table_name, ordinal_position;
--
-- 3) 제약 비교
--    SELECT tc.table_name, tc.constraint_name, tc.constraint_type, cc.check_clause
--      FROM information_schema.table_constraints tc
--      LEFT JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
--     WHERE tc.table_name IN ('contracts', 'marketing_companies');
--
-- 4) 인덱스 비교
--    SELECT tablename, indexname, indexdef FROM pg_indexes
--     WHERE tablename IN ('contracts', 'marketing_companies');
--
-- 5) FK 비교 (sale_id, created_by 가 실제 FK 인지 확인)
--    SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
--      FROM information_schema.table_constraints tc
--      JOIN information_schema.key_column_usage kcu  ON tc.constraint_name = kcu.constraint_name
--      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
--     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'contracts';
--
-- 6) RLS 활성화 여부
--    SELECT tablename, rowsecurity FROM pg_tables
--     WHERE tablename IN ('contracts', 'marketing_companies');
--
-- =============================================================
-- 운영 DB 와 sync 검증 결과 (이 파일 갱신 시 기록)
-- =============================================================
-- [yyyy-mm-dd] 검증자: ___, 결과: PASS / FAIL — 불일치 항목: ...
-- =============================================================
