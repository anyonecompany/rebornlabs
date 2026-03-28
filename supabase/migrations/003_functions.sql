-- =============================================================
-- 003_functions.sql — Reborn Labs Admin: PostgreSQL Functions
-- 001_schema.sql 의 테이블/컬럼/ENUM 타입을 정확히 참조한다.
-- =============================================================
-- ENUM 타입 참조:
--   consultation_status: new, consulting, vehicle_waiting, rejected, sold
--   vehicle_status: available, consulting, sold, deleted
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- Function 1: insert_consultation_from_gas
-- Google Apps Script(GAS)에서 폼 제출 이벤트를 받아
-- consultations 행을 삽입하고 감사 로그를 기록한다.
-- SECURITY DEFINER: GAS는 service_role 키를 사용하므로 RLS 우회
-- 반환값: 생성된 consultation 의 UUID
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION insert_consultation_from_gas(
  p_customer_name    TEXT,
  p_phone            TEXT,
  p_interested_vehicle TEXT DEFAULT NULL,   -- 관심 차량명 (선택)
  p_message          TEXT DEFAULT NULL,     -- 추가 메시지 (선택)
  p_source_ref       TEXT DEFAULT 'direct' -- 유입 채널 (기본: 직접)
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER  -- 소유자 권한으로 실행 → GAS 서비스롤에서 RLS 우회
AS $$
DECLARE
  v_consultation_id UUID;
BEGIN
  -- 상담 레코드 삽입
  INSERT INTO consultations (customer_name, phone, interested_vehicle, message, source_ref)
  VALUES (p_customer_name, p_phone, p_interested_vehicle, p_message, p_source_ref)
  RETURNING id INTO v_consultation_id;

  -- 감사 로그 기록 (GAS 호출이므로 actor_id = NULL — 시스템 행위)
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    NULL,
    'gas_consultation_created',
    'consultation',
    v_consultation_id,
    jsonb_build_object('source_ref', p_source_ref)
  );

  RETURN v_consultation_id;
END;
$$;

COMMENT ON FUNCTION insert_consultation_from_gas IS
  'GAS 폼 제출 이벤트 → consultations 삽입 + 감사 로그. actor_id=NULL(시스템).';

-- -------------------------------------------------------------
-- Function 2: complete_sale
-- 판매 완료 처리:
--   1) 차량 행 잠금으로 동시 판매 방지
--   2) DB 제공 여부에 따른 수당/수수료 자동 계산
--   3) sales 레코드 생성
--   4) vehicles.status → sold
--   5) consultations.status → sold (상담 있는 경우)
--   6) 감사 로그 기록
-- 반환값: 생성된 sale 의 UUID
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_sale(
  p_consultation_id UUID,      -- 연결된 상담 ID (셀프 소싱 시 NULL 가능)
  p_vehicle_id      UUID,      -- 판매 차량 ID
  p_dealer_id       UUID,      -- 담당 딜러 ID
  p_actor_id        UUID,      -- 작업 수행자 ID (어드민/딜러)
  p_is_db_provided  BOOLEAN    -- DB 제공 여부 (true: 마케팅DB, false: 딜러 자체)
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id          UUID;
  v_dealer_fee       INTEGER;    -- 딜러 수당 (원)
  v_marketing_fee    INTEGER;    -- 마케팅 수수료 (원)
  v_vehicle_status   vehicle_status;
BEGIN
  -- 행 잠금: 동시에 같은 차량 판매 시도 방지 (SELECT FOR UPDATE)
  SELECT status INTO v_vehicle_status
  FROM vehicles
  WHERE id = p_vehicle_id
  FOR UPDATE;

  -- 차량 존재 여부 확인
  IF v_vehicle_status IS NULL THEN
    RAISE EXCEPTION '차량을 찾을 수 없습니다: %', p_vehicle_id;
  END IF;

  -- 이미 판매된 차량 방지
  IF v_vehicle_status = 'sold' THEN
    RAISE EXCEPTION '이미 판매된 차량입니다: %', p_vehicle_id;
  END IF;

  -- 삭제된 차량 방지
  IF v_vehicle_status = 'deleted' THEN
    RAISE EXCEPTION '삭제된 차량입니다: %', p_vehicle_id;
  END IF;

  -- 수당/수수료 계산
  -- DB 제공(마케팅 DB): 딜러 수당 50만 / 마케팅 수수료 70만
  -- 딜러 자체 소싱:      딜러 수당 100만 / 마케팅 수수료 0
  IF p_is_db_provided THEN
    v_dealer_fee    := 500000;
    v_marketing_fee := 700000;
  ELSE
    v_dealer_fee    := 1000000;
    v_marketing_fee := 0;
  END IF;

  -- 판매 레코드 생성
  INSERT INTO sales (
    consultation_id, vehicle_id, dealer_id, actor_id,
    is_db_provided, dealer_fee, marketing_fee
  )
  VALUES (
    p_consultation_id, p_vehicle_id, p_dealer_id, p_actor_id,
    p_is_db_provided, v_dealer_fee, v_marketing_fee
  )
  RETURNING id INTO v_sale_id;

  -- 차량 상태 → sold
  UPDATE vehicles
  SET status = 'sold'
  WHERE id = p_vehicle_id;

  -- 상담 상태 → sold (상담이 연결된 경우에만)
  IF p_consultation_id IS NOT NULL THEN
    -- 세션 변수로 상태 전이 트리거 우회 (sold→sold 중복 방지)
    PERFORM set_config('app.bypass_transition', 'true', true);
    UPDATE consultations
    SET status = 'sold'
    WHERE id = p_consultation_id;
    PERFORM set_config('app.bypass_transition', '', true);
  END IF;

  -- 감사 로그 기록
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_id,
    'sale_completed',
    'sale',
    v_sale_id,
    jsonb_build_object(
      'vehicle_id',       p_vehicle_id,
      'dealer_id',        p_dealer_id,
      'consultation_id',  p_consultation_id,
      'is_db_provided',   p_is_db_provided,
      'dealer_fee',       v_dealer_fee,
      'marketing_fee',    v_marketing_fee
    )
  );

  RETURN v_sale_id;
END;
$$;

COMMENT ON FUNCTION complete_sale IS
  '판매 완료 처리: 행 잠금 → 수당 계산 → sales 삽입 → 차량/상담 상태 갱신 → 감사 로그.';

-- -------------------------------------------------------------
-- Function 3: cancel_sale
-- 판매 취소 처리:
--   1) 취소 대상 판매 레코드 확인 (이미 취소된 경우 에러)
--   2) sales.cancelled_at + cancel_reason 기록
--   3) 상담 상태 복원 → consulting
--   4) 차량 상태 복원:
--      다른 활성 상담(consulting/vehicle_waiting) 존재 시 → consulting
--      없으면 → available
--   5) 감사 로그 기록
-- 반환값: VOID
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_sale(
  p_sale_id  UUID,   -- 취소할 판매 ID
  p_actor_id UUID,   -- 취소 수행자 ID
  p_reason   TEXT    -- 취소 사유
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale                RECORD;
  v_active_consult_count INTEGER;
BEGIN
  -- 취소 대상 판매 레코드 조회 (cancelled_at IS NULL = 미취소 건)
  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
    AND cancelled_at IS NULL;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION '취소할 판매를 찾을 수 없거나 이미 취소되었습니다: %', p_sale_id;
  END IF;

  -- 판매 취소 처리: 취소 시각 + 취소 사유 기록
  UPDATE sales
  SET cancelled_at = now(),
      cancel_reason = p_reason
  WHERE id = p_sale_id;

  -- 상담 상태 복원 → consulting (상담이 연결된 경우에만)
  IF v_sale.consultation_id IS NOT NULL THEN
    PERFORM set_config('app.bypass_transition', 'true', true);
    UPDATE consultations
    SET status = 'consulting'
    WHERE id = v_sale.consultation_id;
    PERFORM set_config('app.bypass_transition', '', true);
  END IF;

  -- 차량 상태 복원 결정:
  -- 해당 차량에 대해 다른 활성 판매(미취소)가 있으면 → consulting
  -- 활성 상담 기준: consultations.status IN ('consulting', 'vehicle_waiting')
  -- 현재 취소 중인 sale(p_sale_id)은 제외
  SELECT COUNT(*) INTO v_active_consult_count
  FROM consultations c
  JOIN sales s ON s.consultation_id = c.id
  WHERE s.vehicle_id  = v_sale.vehicle_id
    AND s.cancelled_at IS NULL
    AND s.id          != p_sale_id
    AND c.status      IN ('consulting', 'vehicle_waiting');

  IF v_active_consult_count > 0 THEN
    -- 다른 활성 상담이 존재 → consulting 유지
    UPDATE vehicles
    SET status = 'consulting'
    WHERE id = v_sale.vehicle_id;
  ELSE
    -- 활성 상담 없음 → 재고로 복원
    UPDATE vehicles
    SET status = 'available'
    WHERE id = v_sale.vehicle_id;
  END IF;

  -- 감사 로그 기록
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_id,
    'sale_cancelled',
    'sale',
    p_sale_id,
    jsonb_build_object(
      'reason',          p_reason,
      'vehicle_id',      v_sale.vehicle_id,
      'consultation_id', v_sale.consultation_id
    )
  );
END;
$$;

COMMENT ON FUNCTION cancel_sale IS
  '판매 취소: 상담/차량 상태 복원 + 취소 사유 기록 + 감사 로그.';

-- -------------------------------------------------------------
-- Function 4: get_dashboard_stats
-- 역할별 대시보드 통계 반환 (STABLE — 트랜잭션 내 동일 결과 보장)
--   admin/staff: 전체 재고, 신규 상담, 이번 달 판매수/딜러수당/마케팅수수료
--   dealer:      담당 활성 상담 수, 가용 재고 수, 이번 달 개인 판매수
--   그 외 역할: 빈 JSONB 반환
-- 반환값: JSONB
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_user_id UUID,  -- 요청 사용자 ID
  p_role    TEXT   -- 역할: 'admin' | 'staff' | 'dealer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- 같은 트랜잭션 내에서는 동일한 결과를 반환 (읽기 최적화)
AS $$
DECLARE
  v_result     JSONB;
  v_month_start DATE;
BEGIN
  -- 이번 달 1일 (비교 기준)
  v_month_start := date_trunc('month', now())::DATE;

  IF p_role IN ('admin', 'staff') THEN
    -- 어드민/스태프: 전체 현황 통계
    SELECT jsonb_build_object(
      -- 가용 재고 수 (소프트 삭제 제외)
      'available_vehicles',  (
        SELECT COUNT(*)
        FROM vehicles
        WHERE status = 'available'
          AND deleted_at IS NULL
      ),
      -- 신규 상담 수 (status = 'new')
      'new_consultations',   (
        SELECT COUNT(*)
        FROM consultations
        WHERE status = 'new'
      ),
      -- 이번 달 완료 판매 수 (취소 제외)
      'month_sales',         (
        SELECT COUNT(*)
        FROM sales
        WHERE created_at  >= v_month_start
          AND cancelled_at IS NULL
      ),
      -- 이번 달 딜러 수당 합계 (NULL → 0)
      'month_dealer_fees',   COALESCE((
        SELECT SUM(dealer_fee)
        FROM sales
        WHERE created_at  >= v_month_start
          AND cancelled_at IS NULL
      ), 0),
      -- 이번 달 마케팅 수수료 합계 (NULL → 0)
      'month_marketing_fees', COALESCE((
        SELECT SUM(marketing_fee)
        FROM sales
        WHERE created_at  >= v_month_start
          AND cancelled_at IS NULL
      ), 0)
    ) INTO v_result;

  ELSIF p_role = 'dealer' THEN
    -- 딜러: 개인 현황 통계
    SELECT jsonb_build_object(
      -- 담당 활성 상담 수 (진행 중인 상담)
      'my_active_consultations', (
        SELECT COUNT(*)
        FROM consultations
        WHERE assigned_dealer_id = p_user_id
          AND status IN ('new', 'consulting', 'vehicle_waiting')
      ),
      -- 가용 재고 수 (소프트 삭제 제외)
      'available_vehicles',      (
        SELECT COUNT(*)
        FROM vehicles
        WHERE status = 'available'
          AND deleted_at IS NULL
      ),
      -- 이번 달 개인 판매 수 (취소 제외)
      'my_month_sales',          (
        SELECT COUNT(*)
        FROM sales
        WHERE dealer_id  = p_user_id
          AND created_at  >= v_month_start
          AND cancelled_at IS NULL
      )
    ) INTO v_result;

  ELSE
    -- 알 수 없는 역할 → 빈 객체 반환
    v_result := '{}'::JSONB;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_dashboard_stats IS
  '역할별 대시보드 통계 반환: admin/staff(전체 현황), dealer(개인 현황), 기타(빈 객체).';

COMMIT;
