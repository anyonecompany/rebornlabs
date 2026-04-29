-- ============================================================
-- 20260429_drop_dead_triggers.sql
-- dead trigger 정리: auto_vehicle_status_on_consult, restore_vehicle_status
--
-- 배경:
--   consultations 테이블에 vehicle_id FK가 없어 두 트리거가
--   실질적으로 no-op (RAISE NOTICE만 발생)인 상태.
--   불필요한 트리거는 UPDATE 시 실행 오버헤드와 혼란을 유발하므로 제거.
--   차량 상태 변경은 complete_sale() / cancel_sale() 함수에서 처리함.
--
--   만약 향후 consultations.vehicle_id FK 추가 시:
--   002_triggers.sql 주석 해제 후 새 마이그레이션으로 재등록.
--
-- 운영 적용: Supabase 대시보드 → SQL Editor에서 수동 실행
-- 롤백: 002_triggers.sql의 트리거 5, 6번 항목을 재실행
-- ============================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_consultations_auto_vehicle_status ON consultations;
DROP TRIGGER IF EXISTS trg_consultations_restore_vehicle_status ON consultations;

DROP FUNCTION IF EXISTS auto_vehicle_status_on_consult();
DROP FUNCTION IF EXISTS restore_vehicle_status();

COMMIT;
