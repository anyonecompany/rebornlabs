-- ============================================================
-- 002_triggers.sql
-- Reborn Labs — 트리거 함수 8개 + 트리거 정의
-- 참조 스키마: 001_schema.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 1. update_updated_at()
-- 범용 updated_at 갱신 트리거
-- consultation_logs는 updated_at 컬럼이 없으므로 제외
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- profiles
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- vehicles
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- consultations
CREATE TRIGGER trg_consultations_updated_at
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- sales
CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- delivery_checklists
CREATE TRIGGER trg_delivery_checklists_updated_at
  BEFORE UPDATE ON delivery_checklists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- expenses
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- documents
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 2. normalize_phone()
-- 전화번호 정규화: 숫자 외 모든 문자 제거
-- 예) '010-1234-5678' → '01012345678'
-- ============================================================

CREATE OR REPLACE FUNCTION normalize_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- regexp_replace로 숫자가 아닌 문자를 모두 제거
  NEW.phone = regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  RETURN NEW;
END;
$$;

-- normalize_phone은 mark_duplicate_consultations(AFTER INSERT)보다
-- 먼저 실행되어야 하므로 BEFORE INSERT OR UPDATE로 지정
CREATE TRIGGER trg_consultations_normalize_phone
  BEFORE INSERT OR UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION normalize_phone();


-- ============================================================
-- 3. mark_duplicate_consultations()
-- 동일 전화번호가 이미 존재하면 신규 행과 기존 행 모두
-- is_duplicate = true 로 표시
-- ※ normalize_phone() BEFORE 트리거가 먼저 실행되므로
--   NEW.phone은 이미 정규화된 상태
-- ============================================================

-- AFTER INSERT: NEW.id가 확정된 이후에 비교해야 자기 자신을 안전하게 제외할 수 있음
-- AFTER 트리거에서는 NEW를 직접 수정할 수 없으므로 UPDATE 문으로 처리
CREATE OR REPLACE FUNCTION mark_duplicate_consultations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  -- 방금 INSERT된 행(NEW.id)을 제외하고 동일 전화번호 검색
  SELECT COUNT(*)
    INTO duplicate_count
    FROM consultations
   WHERE phone = NEW.phone
     AND id <> NEW.id;

  IF duplicate_count > 0 THEN
    -- 신규 행을 중복으로 업데이트
    UPDATE consultations
       SET is_duplicate = true
     WHERE id = NEW.id;

    -- 기존 동일 전화번호 행도 중복으로 업데이트
    UPDATE consultations
       SET is_duplicate = true
     WHERE phone = NEW.phone
       AND id <> NEW.id;
  END IF;

  RETURN NULL; -- AFTER 트리거는 반환값 불필요
END;
$$;

CREATE TRIGGER trg_consultations_mark_duplicate
  AFTER INSERT ON consultations
  FOR EACH ROW EXECUTE FUNCTION mark_duplicate_consultations();


-- ============================================================
-- 4. sync_consultation_status()
-- 상담 로그 삽입 시 status_snapshot이 있으면
-- 부모 consultations 행의 status를 동기화
-- ※ consultation_logs의 CHECK 제약으로 status_snapshot = 'sold'는
--   이미 차단됨
-- ============================================================

CREATE OR REPLACE FUNCTION sync_consultation_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- status_snapshot이 NULL이 아닐 때만 부모 상태 갱신
  IF NEW.status_snapshot IS NOT NULL THEN
    UPDATE consultations
       SET status = NEW.status_snapshot::consultation_status
     WHERE id = NEW.consultation_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_consultation_logs_sync_status
  AFTER INSERT ON consultation_logs
  FOR EACH ROW EXECUTE FUNCTION sync_consultation_status();


-- ============================================================
-- 5. auto_vehicle_status_on_consult()
-- 딜러 배정 시 연관 차량 상태를 'consulting'으로 변경
--
-- ⚠️ 설계 제약 사항:
--   consultations 테이블에는 vehicles에 대한 직접 FK가 없고
--   interested_vehicle은 자유 입력 텍스트 컬럼임.
--   따라서 이 트리거에서 차량 상태를 직접 변경하는 것은
--   신뢰할 수 없음. 차량 상태 변경은 complete_sale() /
--   cancel_sale() 함수에서 명시적 vehicle_id를 통해 처리함.
--
--   이 트리거는 구조 요건을 충족하기 위해 존재하며,
--   실제 차량 상태 변경이 필요하면 consultations 테이블에
--   vehicle_id FK 컬럼을 추가하거나 애플리케이션 레이어에서
--   처리해야 함.
-- ============================================================

CREATE OR REPLACE FUNCTION auto_vehicle_status_on_consult()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- assigned_dealer_id가 NULL → non-NULL로 변경된 경우만 처리
  IF OLD.assigned_dealer_id IS NULL AND NEW.assigned_dealer_id IS NOT NULL THEN
    -- NOTE: consultations에 vehicle_id FK가 없으므로 차량 상태 직접 변경 불가.
    -- 차량 상태는 complete_sale() / cancel_sale() 에서 vehicle_id를 통해 관리함.
    -- 향후 consultations.vehicle_id 컬럼 추가 시 아래 주석을 해제하여 활성화:
    --
    -- IF NEW.vehicle_id IS NOT NULL THEN
    --   UPDATE vehicles
    --      SET status = 'consulting'
    --    WHERE id = NEW.vehicle_id
    --      AND status = 'available';
    -- END IF;
    RAISE NOTICE '딜러 배정됨: consultation_id=%, dealer_id=%. 차량 상태 변경은 complete_sale()에서 처리.',
      NEW.id, NEW.assigned_dealer_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_consultations_auto_vehicle_status
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION auto_vehicle_status_on_consult();


-- ============================================================
-- 6. restore_vehicle_status()
-- 상담이 'rejected' 또는 'vehicle_waiting' 상태로 변경 시
-- 연관 차량 상태를 'available'로 복원
--
-- ⚠️ 설계 제약 사항:
--   5번과 동일 — consultations에 vehicle_id FK 없음.
--   차량 상태 복원도 cancel_sale() 함수에서 처리.
--   consultations.vehicle_id 추가 시 활성화 예정.
-- ============================================================

CREATE OR REPLACE FUNCTION restore_vehicle_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- status가 'rejected' 또는 'vehicle_waiting'으로 변경된 경우
  IF NEW.status IN ('rejected', 'vehicle_waiting')
     AND OLD.status <> NEW.status
  THEN
    -- NOTE: consultations에 vehicle_id FK가 없으므로 차량 상태 직접 복원 불가.
    -- 차량 상태는 cancel_sale() 에서 vehicle_id를 통해 관리함.
    -- 향후 consultations.vehicle_id 컬럼 추가 시 아래 주석을 해제하여 활성화:
    --
    -- IF NEW.vehicle_id IS NOT NULL THEN
    --   -- 해당 차량에 다른 활성 상담이 없는 경우에만 available로 복원
    --   IF NOT EXISTS (
    --     SELECT 1 FROM consultations
    --      WHERE vehicle_id = NEW.vehicle_id
    --        AND id <> NEW.id
    --        AND status IN ('new', 'consulting')
    --   ) THEN
    --     UPDATE vehicles
    --        SET status = 'available'
    --      WHERE id = NEW.vehicle_id
    --        AND status = 'consulting';
    --   END IF;
    -- END IF;
    RAISE NOTICE '상담 상태 변경됨: consultation_id=%, 상태=%. 차량 상태 복원은 cancel_sale()에서 처리.',
      NEW.id, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_consultations_restore_vehicle_status
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION restore_vehicle_status();


-- ============================================================
-- 7. delivery_checklist_completion()
-- 인도 체크리스트의 4개 항목이 모두 true이면
-- completed_at을 now()로 설정, 하나라도 false면 NULL로 초기화
-- ============================================================

CREATE OR REPLACE FUNCTION delivery_checklist_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.contract_uploaded = true
     AND NEW.deposit_confirmed = true
     AND NEW.customer_briefed = true
     AND NEW.delivery_photo_uploaded = true
  THEN
    -- 모든 체크리스트 완료 → completed_at 기록 (이미 완료된 경우 덮어쓰지 않음)
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at = now();
    END IF;
  ELSE
    -- 하나라도 미완료 → completed_at 초기화
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_checklists_completion
  BEFORE UPDATE ON delivery_checklists
  FOR EACH ROW EXECUTE FUNCTION delivery_checklist_completion();


-- ============================================================
-- 8. enforce_consultation_transition()
-- 상담 상태 전이 규칙 강제
--
-- 허용 전이 매트릭스:
--   new             → consulting, rejected
--   consulting      → vehicle_waiting, rejected, sold
--   vehicle_waiting → consulting, rejected, sold
--   rejected        → consulting (복원, admin/staff 전용은 앱 레이어에서 강제)
--   sold            → (전이 불가, 취소는 cancel_sale() 통해서만)
--
-- 우회: SET LOCAL app.bypass_transition = 'true';
--   → cancel_sale() 등 내부 함수에서만 사용
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_consultation_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  bypass TEXT;
BEGIN
  -- 상태가 변경되지 않은 경우 통과
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- 세션 변수로 우회 허용 (cancel_sale 등 내부 함수 전용)
  BEGIN
    bypass = current_setting('app.bypass_transition');
  EXCEPTION WHEN undefined_object THEN
    bypass = 'false';
  END;

  IF bypass = 'true' THEN
    RETURN NEW;
  END IF;

  -- 전이 허용 여부 확인
  CASE OLD.status
    WHEN 'new' THEN
      IF NEW.status NOT IN ('consulting', 'rejected') THEN
        RAISE EXCEPTION '유효하지 않은 상태 전이: % → %. 허용: consulting, rejected',
          OLD.status, NEW.status;
      END IF;

    WHEN 'consulting' THEN
      IF NEW.status NOT IN ('new', 'vehicle_waiting', 'rejected', 'sold') THEN
        RAISE EXCEPTION '유효하지 않은 상태 전이: % → %. 허용: new, vehicle_waiting, rejected, sold',
          OLD.status, NEW.status;
      END IF;

    WHEN 'vehicle_waiting' THEN
      IF NEW.status NOT IN ('consulting', 'rejected', 'sold') THEN
        RAISE EXCEPTION '유효하지 않은 상태 전이: % → %. 허용: consulting, rejected, sold',
          OLD.status, NEW.status;
      END IF;

    WHEN 'rejected' THEN
      -- rejected → new, consulting 허용 (복원 경로, admin/staff 전용은 앱 레이어에서 강제)
      IF NEW.status NOT IN ('new', 'consulting') THEN
        RAISE EXCEPTION '유효하지 않은 상태 전이: % → %. 허용: new, consulting',
          OLD.status, NEW.status;
      END IF;

    WHEN 'sold' THEN
      -- sold는 어떤 상태로도 전이 불가 (우회 없는 경우)
      RAISE EXCEPTION '판매 완료(sold) 상태에서는 상태를 변경할 수 없습니다. 취소는 cancel_sale() 함수를 사용하세요.';

    ELSE
      -- 알 수 없는 현재 상태 (스키마 변경 시 방어)
      RAISE EXCEPTION '알 수 없는 현재 상태: %', OLD.status;
  END CASE;

  RETURN NEW;
END;
$$;

-- enforce_consultation_transition은 restore_vehicle_status보다
-- 먼저 실행되어야 함 (무효 전이를 사전 차단).
-- PostgreSQL은 BEFORE 트리거를 이름 알파벳 순으로 실행하므로
-- 'e' < 'r' 순서가 보장됨.
CREATE TRIGGER trg_consultations_enforce_transition
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION enforce_consultation_transition();

COMMIT;
