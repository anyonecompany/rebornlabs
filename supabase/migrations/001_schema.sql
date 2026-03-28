-- =============================================================
-- 001_schema.sql — Reborn Labs Admin: Tables + Sequence + Types
-- 작성일: 2026-03-27
-- 설명: Reborn Labs 중고차 딜러 어드민 시스템 초기 스키마
--       ENUM 타입, 시퀀스, 10개 테이블, RLS 활성화 포함
-- 정책(Policies)은 002_rls_policies.sql 에서 별도 정의
-- =============================================================

BEGIN;

-- =============================================================
-- ENUM 타입 정의
-- =============================================================

-- 사용자 역할 (시스템 관리자 / 직원 / 딜러 / 승인 대기)
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'dealer', 'pending');

-- 차량 상태 (판매 가능 / 상담중 / 판매 완료 / 삭제)
CREATE TYPE vehicle_status AS ENUM ('available', 'consulting', 'sold', 'deleted');

-- 상담 상태 (신규 → 상담중 → 차량 대기 → 거절됨 / 판매 완료)
CREATE TYPE consultation_status AS ENUM (
    'new',
    'consulting',
    'vehicle_waiting',
    'rejected',
    'sold'
);

-- 문서 카테고리 (사업자등록증 / 계약서 템플릿 / 기타)
CREATE TYPE document_category AS ENUM (
    'business_registration',
    'contract_template',
    'other'
);

-- =============================================================
-- 시퀀스 제거: 차량 코드는 연도별 MAX 조회 방식으로 변경
-- (generate_vehicle_code 트리거 함수 참조)
-- =============================================================

-- =============================================================
-- 1. profiles — 사용자 프로필
-- auth.users 와 1:1 연결. 역할(role)로 권한을 관리한다.
-- 딜러는 최초 로그인 시 비밀번호 변경(must_change_password)이 강제된다.
-- =============================================================

CREATE TABLE profiles (
    id                   UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email                TEXT        NOT NULL,
    name                 TEXT        NOT NULL,
    phone                TEXT,
    role                 user_role   NOT NULL DEFAULT 'pending',
    is_active            BOOLEAN     NOT NULL DEFAULT true,
    must_change_password BOOLEAN     NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  profiles                    IS '사용자 프로필 — auth.users 확장. 역할 기반 접근 제어(RBAC)의 기준 테이블.';
COMMENT ON COLUMN profiles.role               IS '시스템 권한 역할: admin(전체) / staff(운영) / dealer(딜러) / pending(승인 대기)';
COMMENT ON COLUMN profiles.must_change_password IS '최초 로그인 시 비밀번호 변경 강제 여부. 관리자가 계정 생성 후 true로 설정.';

-- =============================================================
-- 2. vehicles — 차량 재고
-- 차량 매입가, 판매가, 마진을 관리한다.
-- vehicle_code 는 트리거(trg_generate_vehicle_code)가 자동 생성한다.
-- =============================================================

CREATE TABLE vehicles (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),

    -- vehicle_code 는 INSERT 시 트리거가 자동으로 채운다 (직접 지정 불가)
    vehicle_code    TEXT           UNIQUE NOT NULL DEFAULT '',

    make            TEXT           NOT NULL,                             -- 차종/제조사 (예: 현대, 기아)
    model           TEXT           NOT NULL,                             -- 모델명 (예: 소나타, K5)
    year            INTEGER        NOT NULL CHECK (year >= 1900 AND year <= 2100),

    mileage         INTEGER        CHECK (mileage >= 0),                 -- 주행거리 (km)
    purchase_price  INTEGER        NOT NULL CHECK (purchase_price >= 0), -- 매입가 (원)
    selling_price   INTEGER        NOT NULL CHECK (selling_price >= 0),  -- 판매가 (원)
    deposit         INTEGER        CHECK (deposit >= 0),                 -- 보증금 (원)
    monthly_payment INTEGER        CHECK (monthly_payment >= 0),         -- 월납입료 (원)

    -- 마진: 판매가 - 매입가 (자동 계산, 직접 수정 불가)
    margin          INTEGER        GENERATED ALWAYS AS (selling_price - purchase_price) STORED,

    status          vehicle_status NOT NULL DEFAULT 'available',
    photos          TEXT[]         DEFAULT '{}',                          -- Supabase Storage URL 배열

    deleted_at      TIMESTAMPTZ,                                          -- 소프트 삭제 시각 (NULL = 유효)
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

COMMENT ON TABLE  vehicles              IS '차량 재고 관리. vehicle_code 는 트리거로 자동 채번(RB-YYYY-NNN).';
COMMENT ON COLUMN vehicles.vehicle_code IS '시스템 식별 코드. INSERT 트리거가 연도별 MAX 조회 방식으로 자동 생성 (연도별 001 리셋).';
COMMENT ON COLUMN vehicles.margin       IS '마진 = selling_price - purchase_price. GENERATED ALWAYS (수정 불가).';
COMMENT ON COLUMN vehicles.deleted_at  IS 'NULL이면 정상 차량. 값이 있으면 소프트 삭제 처리.';

-- =============================================================
-- 차량 코드 자동 생성 트리거
-- 형식: RB-{연도}-{3자리 번호} (예: RB-2026-001)
-- 연도별 리셋: 매년 001부터 시작 (연간 최대 999대)
-- 동시 등록 방지: ADVISORY LOCK으로 직렬화
-- =============================================================

CREATE OR REPLACE FUNCTION generate_vehicle_code()
RETURNS TRIGGER AS $$
DECLARE
    v_year     TEXT;
    v_max_seq  INTEGER;
    v_new_seq  INTEGER;
BEGIN
    v_year := EXTRACT(YEAR FROM now())::TEXT;

    -- 같은 연도 차량 등록을 직렬화 (해시 기반 advisory lock)
    PERFORM pg_advisory_xact_lock(hashtext('vehicle_code_' || v_year));

    -- 해당 연도의 최대 번호 조회
    SELECT COALESCE(
        MAX(NULLIF(split_part(vehicle_code, '-', 3), '')::INTEGER),
        0
    ) INTO v_max_seq
    FROM vehicles
    WHERE vehicle_code LIKE 'RB-' || v_year || '-%';

    v_new_seq := v_max_seq + 1;

    IF v_new_seq > 999 THEN
        RAISE EXCEPTION '연간 차량 코드 한도 초과: RB-%-999 (최대 999대/연)', v_year;
    END IF;

    NEW.vehicle_code := 'RB-' || v_year || '-' || LPAD(v_new_seq::TEXT, 3, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_vehicle_code
    BEFORE INSERT ON vehicles
    FOR EACH ROW
    EXECUTE FUNCTION generate_vehicle_code();

-- =============================================================
-- 3. consultations — 고객 상담 요청
-- 외부 랜딩 페이지 / UTM 유입 고객의 문의를 수신·관리한다.
-- assigned_dealer_id 로 담당 딜러를 지정하고 상태를 추적한다.
-- =============================================================

CREATE TABLE consultations (
    id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name       TEXT                  NOT NULL,
    phone               TEXT                  NOT NULL,
    interested_vehicle  TEXT,                                              -- 관심 차량명 (폼 자유 입력)
    message             TEXT,                                              -- 고객 메모
    source_ref          TEXT                  NOT NULL DEFAULT 'direct',   -- UTM 소스 트래킹 (예: naver_ad, kakao_talk)
    assigned_dealer_id  UUID                  REFERENCES profiles(id) ON DELETE SET NULL,
    marketing_company   TEXT,                                              -- 연계 마케팅 업체명
    status              consultation_status   NOT NULL DEFAULT 'new',
    is_duplicate        BOOLEAN               NOT NULL DEFAULT false,       -- 중복 문의 여부
    created_at          TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ           NOT NULL DEFAULT now()
);

COMMENT ON TABLE  consultations               IS '고객 상담 수신 관리. 랜딩 페이지 및 UTM 유입 고객 문의를 저장하고 딜러에게 배분한다.';
COMMENT ON COLUMN consultations.source_ref    IS 'UTM 파라미터 또는 유입 경로 식별자. 기본값 direct.';
COMMENT ON COLUMN consultations.is_duplicate  IS '동일 고객의 중복 문의로 판단된 경우 true. 통계 제외 처리에 활용.';

-- =============================================================
-- 4. consultation_logs — 상담 활동 이력
-- 딜러가 상담 진행 중 작성하는 메모 및 상태 스냅샷을 기록한다.
-- =============================================================

CREATE TABLE consultation_logs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id   UUID        NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    dealer_id         UUID        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
    content           TEXT        NOT NULL,
    -- 로그 작성 시점의 상담 상태 (sold 상태는 sales 테이블로 이관 후 기록)
    status_snapshot   TEXT        CHECK (status_snapshot != 'sold'),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  consultation_logs                 IS '상담 활동 로그. 딜러가 상담 과정에서 남기는 타임라인 메모.';
COMMENT ON COLUMN consultation_logs.status_snapshot IS '로그 작성 시점 상담 상태 스냅샷. sold 는 sales 테이블에서 별도 관리하므로 허용 안 함.';

-- =============================================================
-- 5. sales — 판매 완료 기록
-- 실제 차량 판매가 확정된 시점에 생성된다.
-- consultation_id 가 NULL 이면 딜러 자체 발굴 영업(직접 영업)이다.
-- dealer_fee / marketing_fee 는 정산의 기준이 된다.
-- =============================================================

CREATE TABLE sales (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id   UUID        REFERENCES consultations(id) ON DELETE SET NULL, -- NULL = 직접 영업
    vehicle_id        UUID        NOT NULL REFERENCES vehicles(id)  ON DELETE RESTRICT,
    dealer_id         UUID        NOT NULL REFERENCES profiles(id)  ON DELETE RESTRICT, -- 판매 담당 딜러
    actor_id          UUID        NOT NULL REFERENCES profiles(id)  ON DELETE RESTRICT, -- 실제 등록한 스태프/어드민
    is_db_provided    BOOLEAN     NOT NULL,                                             -- true = DB(마케팅) 제공 상담 / false = 직접 영업
    dealer_fee        INTEGER     NOT NULL,   -- 딜러 수수료: 500,000 또는 1,000,000 원
    marketing_fee     INTEGER     NOT NULL DEFAULT 0, -- 마케팅 수수료: 700,000 또는 0 원
    cancelled_at      TIMESTAMPTZ,           -- 취소 일시 (NULL = 유효 거래)
    cancel_reason     TEXT,                  -- 취소 사유
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  sales                IS '판매 완료 기록. 정산, 수수료, 취소 이력의 원천 테이블.';
COMMENT ON COLUMN sales.is_db_provided IS 'true: 마케팅 DB 제공 상담 건. false: 딜러 직접 영업 건.';
COMMENT ON COLUMN sales.dealer_fee     IS '딜러 수수료 (원). 500000 또는 1000000.';
COMMENT ON COLUMN sales.marketing_fee  IS '마케팅 수수료 (원). 700000 또는 0 (직접 영업).';
COMMENT ON COLUMN sales.actor_id       IS '판매 등록을 수행한 사용자 (스태프 또는 어드민). dealer_id 와 다를 수 있음.';

-- =============================================================
-- 6. delivery_checklists — 차량 인도 체크리스트
-- 차량별·딜러별 인도 완료 조건을 추적한다.
-- (vehicle_id, dealer_id) UNIQUE 로 중복 체크리스트 방지.
-- =============================================================

CREATE TABLE delivery_checklists (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id               UUID        NOT NULL REFERENCES vehicles(id)  ON DELETE CASCADE,
    dealer_id                UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
    contract_uploaded        BOOLEAN     NOT NULL DEFAULT false, -- 계약서 업로드 완료
    deposit_confirmed        BOOLEAN     NOT NULL DEFAULT false, -- 보증금 수령 확인
    customer_briefed         BOOLEAN     NOT NULL DEFAULT false, -- 고객 설명 완료
    delivery_photo_uploaded  BOOLEAN     NOT NULL DEFAULT false, -- 인도 사진 업로드 완료
    completed_at             TIMESTAMPTZ,                        -- 모든 항목 완료 시각 (NULL = 미완료)
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (vehicle_id, dealer_id)
);

COMMENT ON TABLE  delivery_checklists             IS '차량 인도 체크리스트. 딜러가 인도 전 4개 항목을 모두 완료해야 completed_at 이 기록된다.';
COMMENT ON COLUMN delivery_checklists.completed_at IS '4개 항목 모두 true 가 된 시각. 어플리케이션 레이어에서 업데이트.';

-- =============================================================
-- 7. expenses — 비용 지출 내역
-- 직원/딜러의 업무 비용을 영수증 URL 과 함께 관리한다.
-- =============================================================

CREATE TABLE expenses (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expense_date  DATE        NOT NULL,
    amount        INTEGER     NOT NULL CHECK (amount > 0), -- 지출 금액 (원), 0 이하 불가
    purpose       TEXT        NOT NULL,                    -- 지출 목적
    receipt_urls  TEXT[]      DEFAULT '{}',                -- 영수증 이미지 URL 배열
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  expenses             IS '업무 비용 지출 내역. 딜러 및 스태프의 영수증 증빙과 함께 기록.';
COMMENT ON COLUMN expenses.receipt_urls IS 'Supabase Storage 영수증 이미지 URL 배열. 복수 첨부 가능.';

-- =============================================================
-- 8. documents — 공용 문서 보관
-- 사업자등록증, 계약서 템플릿 등 공용 문서를 카테고리별로 관리한다.
-- =============================================================

CREATE TABLE documents (
    id           UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by  UUID               NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category     document_category  NOT NULL,
    file_name    TEXT               NOT NULL, -- 원본 파일명
    file_url     TEXT               NOT NULL, -- Supabase Storage URL
    created_at   TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ        NOT NULL DEFAULT now()
);

COMMENT ON TABLE  documents          IS '공용 문서 저장소. 사업자등록증, 계약서 템플릿 등 조직 문서를 카테고리별로 관리.';
COMMENT ON COLUMN documents.file_url IS 'Supabase Storage 공개 또는 서명된 URL.';

-- =============================================================
-- 9. audit_logs — 감사 로그 (불변 이력)
-- 주요 액션의 행위자, 대상, 메타데이터를 타임스탬프와 함께 기록한다.
-- 삭제/수정 금지 (RLS 정책에서 INSERT만 허용).
-- actor_id NULL 허용: GAS 봇, 시스템 자동화 등 비사용자 액션 기록.
-- =============================================================

CREATE TABLE audit_logs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = 시스템/GAS
    action       TEXT        NOT NULL,        -- 행위 (예: vehicle.create, sale.cancel)
    target_type  TEXT        NOT NULL,        -- 대상 엔티티 타입 (예: vehicle, consultation)
    target_id    UUID        NOT NULL,        -- 대상 엔티티 UUID
    metadata     JSONB       DEFAULT '{}',    -- 추가 컨텍스트 (변경 전/후 값 등)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  audit_logs          IS '감사 로그. 모든 주요 액션의 불변 이력. INSERT만 허용, 수정/삭제 금지.';
COMMENT ON COLUMN audit_logs.actor_id IS 'NULL 허용: GAS 스크립트, 스케줄러 등 시스템 자동화 액션 기록을 위함.';
COMMENT ON COLUMN audit_logs.metadata IS '자유형 JSON. 변경 전/후 필드값, 요청 IP 등 부가 정보 저장.';

-- =============================================================
-- 10. rate_limits — API 레이트 리미팅 추적
-- IP + 엔드포인트 조합으로 요청 횟수를 추적한다.
-- 오래된 행은 pg_cron 또는 외부 스케줄러로 주기적으로 정리한다.
-- =============================================================

CREATE TABLE rate_limits (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address   TEXT        NOT NULL,        -- 요청 클라이언트 IP
    endpoint     TEXT        NOT NULL,        -- 대상 엔드포인트 (예: /api/consultations)
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  rate_limits            IS 'API 레이트 리미팅용 요청 로그. IP + 엔드포인트 단위로 시간 창(window) 내 요청 수를 집계한다.';
COMMENT ON COLUMN rate_limits.ip_address IS 'IPv4 또는 IPv6 문자열. Supabase Edge Function 에서 추출.';

-- 레이트 리미팅 조회 성능을 위한 인덱스
CREATE INDEX idx_rate_limits_ip_endpoint_time
    ON rate_limits (ip_address, endpoint, requested_at DESC);

-- =============================================================
-- 공통 인덱스 (조회 패턴 기반)
-- =============================================================

-- profiles: 역할별 조회 (어드민 목록, 딜러 목록)
CREATE INDEX idx_profiles_role        ON profiles (role);
CREATE INDEX idx_profiles_is_active   ON profiles (is_active);

-- vehicles: 상태별 조회, 소프트 삭제 필터
CREATE INDEX idx_vehicles_status      ON vehicles (status);
CREATE INDEX idx_vehicles_deleted_at  ON vehicles (deleted_at) WHERE deleted_at IS NULL;

-- consultations: 상태별, 담당 딜러별 조회
CREATE INDEX idx_consultations_status            ON consultations (status);
CREATE INDEX idx_consultations_assigned_dealer   ON consultations (assigned_dealer_id);
CREATE INDEX idx_consultations_created_at        ON consultations (created_at DESC);

-- consultation_logs: 상담 건별 이력 조회
CREATE INDEX idx_consultation_logs_consultation  ON consultation_logs (consultation_id);

-- sales: 딜러별, 차량별, 취소 여부
CREATE INDEX idx_sales_dealer_id       ON sales (dealer_id);
CREATE INDEX idx_sales_vehicle_id      ON sales (vehicle_id);
CREATE INDEX idx_sales_cancelled_at    ON sales (cancelled_at) WHERE cancelled_at IS NULL;
CREATE INDEX idx_sales_created_at      ON sales (created_at DESC);

-- expenses: 사용자별, 날짜별
CREATE INDEX idx_expenses_user_id      ON expenses (user_id);
CREATE INDEX idx_expenses_expense_date ON expenses (expense_date DESC);

-- audit_logs: 대상 엔티티별 이력 조회
CREATE INDEX idx_audit_logs_target     ON audit_logs (target_type, target_id);
CREATE INDEX idx_audit_logs_actor      ON audit_logs (actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- =============================================================
-- Row Level Security (RLS) 활성화
-- 정책(Policies)은 002_rls_policies.sql 에서 정의
-- =============================================================

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_checklists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits           ENABLE ROW LEVEL SECURITY;

COMMIT;
