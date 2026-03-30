-- =============================================================
-- 006_views.sql — Reborn Labs Admin: 보안 뷰
-- 민감 정보를 제외하고 역할별 안전한 데이터 접근을 제공한다.
-- =============================================================

BEGIN;

-- =============================================================
-- 1. vehicles_dealer_view
-- 딜러용 차량 뷰: purchase_price, margin 제외
-- SECURITY DEFINER: 뷰 소유자 권한으로 실행 (vehicles RLS bypass)
-- 딜러는 vehicles 테이블 직접 접근 불가 → 이 뷰로만 조회
-- =============================================================

CREATE OR REPLACE VIEW vehicles_dealer_view
WITH (security_invoker = false)
AS
SELECT
    id,
    vehicle_code,
    make,
    model,
    year,
    mileage,
    selling_price,
    deposit,
    monthly_payment,
    status,
    photos,
    created_at,
    updated_at
FROM vehicles
WHERE deleted_at IS NULL
  AND status != 'deleted'
  AND public.user_role() IN ('admin', 'staff', 'dealer');

COMMENT ON VIEW vehicles_dealer_view IS
  '딜러용 차량 뷰. purchase_price/margin 제외. 삭제 차량 필터링.';

-- 뷰에 대한 접근 권한: admin/staff/dealer만 (pending 차단)
-- NOTE: PostgreSQL GRANT는 역할 단위이므로 authenticated에 부여 후
--       뷰 내부에서 역할 필터링을 추가한다.
GRANT SELECT ON vehicles_dealer_view TO authenticated;

-- =============================================================
-- 2. dealers_name_view
-- 딜러 이름 조회용 제한 뷰: id, name만 노출
-- email, phone, is_active 등 민감 정보 숨김
-- =============================================================

CREATE OR REPLACE VIEW dealers_name_view
WITH (security_invoker = false)
AS
SELECT
    id,
    name
FROM profiles
WHERE role = 'dealer'
  AND public.user_role() IN ('admin', 'staff', 'dealer');

COMMENT ON VIEW dealers_name_view IS
  '딜러 이름만 조회 가능한 제한 뷰. email/phone/is_active 숨김.';

-- 뷰에 대한 접근 권한: authenticated 사용자만
GRANT SELECT ON dealers_name_view TO authenticated;

COMMIT;
