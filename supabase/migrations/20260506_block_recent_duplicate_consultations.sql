-- =============================================================
-- 20260506_block_recent_duplicate_consultations.sql
-- 동일 전화번호의 단기 재신청 차단
--
-- 배경:
--   기존 mark_duplicate_consultations 트리거(002_triggers.sql)는 동일 phone
--   행을 is_duplicate=true 로 마킹만 하고 INSERT 자체는 통과시켰다.
--   고객 폼 더블클릭, 진입점 중복(/apply, /cars, 랜딩) 등으로 같은 사람이
--   여러 행으로 들어와 어드민 고객DB가 중복으로 채워지는 문제 발생.
--
-- 정책:
--   (phone, normalized_vehicle) 쌍이 같고 최근 10분 내 진행 중(rejected/sold
--   가 아닌) 상담이 존재하면 신규 INSERT 를 차단한다. 차단 시 ERRCODE='23505'
--   (unique_violation)로 RAISE 하여 API 가 409 Conflict 로 안내한다.
--
--   "같은 차량" 정의: lower(trim(coalesce(interested_vehicle, ''))) 일치.
--     - 둘 다 NULL/빈 문자열 → 같은 차로 간주 (차단). 미지정 더블클릭 방어.
--     - 한쪽만 NULL → 다른 차로 간주 (통과).
--     - 둘 다 값이 있고 트림+소문자 일치 → 같은 차 (차단).
--     - 트림+소문자 불일치 → 다른 차 (통과).
--   "진행 중" 정의: status NOT IN ('rejected', 'sold')
--   "최근" 정의: 10분 (window_minutes).
--
-- 비즈니스 정합성:
--   - 같은 사람이 **다른 차량**으로 신청하면 새 행으로 받음. (CTO 정책)
--   - 정상 재신청(예: 한 달 뒤 다시 문의)도 새 행 생성.
--   - 거절/판매 완료된 상담의 동일 고객 재유입도 새 행 허용.
--   - 짧은 시간창의 시스템성·실수성 중복(더블클릭, 진입점 중복)만 차단.
--
-- 기존 mark_duplicate_consultations 트리거는 유지 — 차단 윈도우 밖에서
-- 들어온 같은 phone 행도 is_duplicate=true 로 표시하기 위함.
-- =============================================================

CREATE OR REPLACE FUNCTION block_recent_duplicate_consultations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_id UUID;
  window_minutes CONSTANT INTEGER := 10;
BEGIN
  -- normalize_phone (BEFORE INSERT) 가 먼저 실행되어 NEW.phone 정규화 완료 상태.
  -- 자기 자신을 제외하기 위해 id <> NEW.id 조건. (BEFORE INSERT 단계라 NEW.id는
  -- DEFAULT gen_random_uuid() 또는 INSERT 에 명시된 값으로 이미 결정되어 있음)
  SELECT id
    INTO recent_id
    FROM consultations
   WHERE phone = NEW.phone
     AND id <> NEW.id
     AND status NOT IN ('rejected', 'sold')
     AND created_at > now() - make_interval(mins => window_minutes)
     AND lower(trim(coalesce(interested_vehicle, '')))
         = lower(trim(coalesce(NEW.interested_vehicle, '')))
   ORDER BY created_at DESC
   LIMIT 1;

  IF recent_id IS NOT NULL THEN
    RAISE EXCEPTION
      '중복 상담 차단: 동일 전화번호 + 동일 차량으로 최근 % 분 내 진행 중 상담이 이미 존재합니다 (existing_id=%)',
      window_minutes, recent_id
      USING ERRCODE = '23505',
            HINT    = 'duplicate_recent_consultation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION block_recent_duplicate_consultations() IS
  '동일 phone + 동일 정규화 차량(lower/trim) × 최근 10분 × 진행 중(non-rejected/sold) 상담 존재 시 INSERT 차단. ERRCODE 23505. 다른 차량은 통과.';

-- BEFORE INSERT — normalize_phone 다음에 실행되도록 트리거 이름을 알파벳 순서로
-- normalize_phone 의 트리거명(trg_consultations_normalize_phone) 보다 뒤에 둔다.
-- (PostgreSQL 은 동일 단계 트리거를 이름순으로 발동)
DROP TRIGGER IF EXISTS trg_consultations_zz_block_dup_recent ON consultations;
CREATE TRIGGER trg_consultations_zz_block_dup_recent
  BEFORE INSERT ON consultations
  FOR EACH ROW EXECUTE FUNCTION block_recent_duplicate_consultations();
