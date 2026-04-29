-- =============================================================
-- 20260429_dashboard_stats_managers.sql
-- get_dashboard_stats RPC에 director/team_leader 분기 추가
-- =============================================================
-- 배경:
-- - 기존 get_dashboard_stats는 admin/staff와 dealer만 처리. director/team_leader는
--   ELSE 블록에서 빈 객체 {} 반환 → 대시보드 KPI 텅 빈 상태 (회귀 보고).
--
-- 해결:
-- - 본부장/팀장: get_subordinate_ids RPC로 산하 dealer 범위 통계 반환.
-- - 응답 키: available_vehicles, team_active_consultations, team_month_sales,
--   team_month_dealer_fees.
-- =============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_user_id UUID,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result JSONB;
  v_month_start DATE;
  v_subordinate_ids UUID[];
BEGIN
  v_month_start := date_trunc('month', now())::DATE;

  IF p_role IN ('admin', 'staff') THEN
    -- 어드민/스태프: 전체 현황 통계
    SELECT jsonb_build_object(
      'available_vehicles', (
        SELECT COUNT(*) FROM vehicles
        WHERE status = 'available' AND deleted_at IS NULL
      ),
      'new_consultations', (
        SELECT COUNT(*) FROM consultations WHERE status = 'new'
      ),
      'month_sales', (
        SELECT COUNT(*) FROM sales
        WHERE created_at >= v_month_start AND cancelled_at IS NULL
      ),
      'month_dealer_fees', COALESCE((
        SELECT SUM(dealer_fee) FROM sales
        WHERE created_at >= v_month_start AND cancelled_at IS NULL
      ), 0),
      'month_marketing_fees', COALESCE((
        SELECT SUM(marketing_fee) FROM sales
        WHERE created_at >= v_month_start AND cancelled_at IS NULL
      ), 0)
    ) INTO v_result;

  ELSIF p_role IN ('director', 'team_leader') THEN
    -- 본부장/팀장: 산하 dealer 범위 통계
    SELECT array_agg(subordinate_id) INTO v_subordinate_ids
    FROM get_subordinate_ids(p_user_id);

    -- 산하가 0명이면 빈 배열로 대체 (NULL 회피)
    IF v_subordinate_ids IS NULL THEN
      v_subordinate_ids := ARRAY[]::UUID[];
    END IF;

    SELECT jsonb_build_object(
      'available_vehicles', (
        SELECT COUNT(*) FROM vehicles
        WHERE status = 'available' AND deleted_at IS NULL
      ),
      'team_active_consultations', (
        SELECT COUNT(*) FROM consultations
        WHERE assigned_dealer_id = ANY(v_subordinate_ids)
          AND status IN ('new', 'consulting', 'vehicle_waiting')
      ),
      'team_month_sales', (
        SELECT COUNT(*) FROM sales
        WHERE dealer_id = ANY(v_subordinate_ids)
          AND created_at >= v_month_start
          AND cancelled_at IS NULL
      ),
      'team_month_dealer_fees', COALESCE((
        SELECT SUM(dealer_fee) FROM sales
        WHERE dealer_id = ANY(v_subordinate_ids)
          AND created_at >= v_month_start
          AND cancelled_at IS NULL
      ), 0)
    ) INTO v_result;

  ELSIF p_role = 'dealer' THEN
    -- 딜러: 개인 현황 통계
    SELECT jsonb_build_object(
      'my_active_consultations', (
        SELECT COUNT(*) FROM consultations
        WHERE assigned_dealer_id = p_user_id
          AND status IN ('new', 'consulting', 'vehicle_waiting')
      ),
      'available_vehicles', (
        SELECT COUNT(*) FROM vehicles
        WHERE status = 'available' AND deleted_at IS NULL
      ),
      'my_month_sales', (
        SELECT COUNT(*) FROM sales
        WHERE dealer_id = p_user_id
          AND created_at >= v_month_start
          AND cancelled_at IS NULL
      )
    ) INTO v_result;

  ELSE
    -- 알 수 없는 역할 → 빈 객체
    v_result := '{}'::JSONB;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_dashboard_stats IS
  '역할별 대시보드 통계: admin/staff(전체), director/team_leader(산하 dealer 범위), dealer(개인), 기타(빈 객체).';

-- 운영 적용 (대표 수동, Supabase Dashboard SQL Editor):
--   이 파일 전체를 실행하면 함수가 즉시 갱신됨 (CREATE OR REPLACE).
--
-- 검증:
--   SELECT get_dashboard_stats('이경범-uuid'::uuid, 'team_leader');
--   → { "available_vehicles": ..., "team_active_consultations": ..., ... } 반환되어야 함.
