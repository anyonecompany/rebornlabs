-- =============================================================
-- 004_indexes.sql — Reborn Labs Admin: 보충 인덱스
-- 001_schema.sql에서 정의한 기본 인덱스 외 추가 최적화 인덱스.
-- IF NOT EXISTS로 중복 안전하게 처리.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- vehicles: 상태 + 삭제 복합 인덱스 (001에서는 개별 인덱스)
-- WHERE status = 'available' AND deleted_at IS NULL 패턴 최적화
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vehicles_status_deleted
  ON vehicles (status, deleted_at);

-- -------------------------------------------------------------
-- consultations: 전화번호 검색 (중복 확인, 이력 조회)
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_consultations_phone
  ON consultations (phone);

-- -------------------------------------------------------------
-- consultations: 유입 채널별 조회 (마케팅 효과 분석)
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_consultations_source
  ON consultations (source_ref);

-- -------------------------------------------------------------
-- sales: 딜러별 + 기간별 복합 인덱스 (001에서는 개별 인덱스)
-- WHERE dealer_id = ? AND created_at >= ? 패턴 최적화
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sales_dealer_date
  ON sales (dealer_id, created_at);

-- -------------------------------------------------------------
-- rate_limits: IP + 엔드포인트 + 시간 복합 인덱스
-- 001의 rate_limits 전용 인덱스와 별도 (이름 다름이면 보충)
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint
  ON rate_limits (ip_address, endpoint, requested_at);

-- -------------------------------------------------------------
-- audit_logs: 액션 필터링
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs (action);

-- =============================================================
-- 쿼리 최적화 검토 결과 (2026-03-30)
-- =============================================================

-- [현황 분석]
-- vehicles   GET: dealer는 vehicles_dealer_view(SELECT *),
--                 admin/staff는 vehicles(SELECT *) — role별 뷰/테이블 분리로 최적
-- consultations GET: SELECT * — customer_name/phone/status/assigned_dealer_id 등
--                    목록 렌더링에 전 컬럼 필요, 최적화 효과 미미
-- sales      GET: vehicles/profiles/consultations 3개 병렬 Promise.all로
--                 이미 N+1 해소됨. 각 서브쿼리도 필요 컬럼만 select
-- settlements: sales SELECT에서 필요 6개 컬럼만 명시 — 이미 최적화됨
-- dashboard:  RPC get_dashboard_stats — DB 레이어 집계, 앱 최적화 불필요

-- [잠재적 인덱스 추가 후보]
-- consultations.assigned_dealer_id: dealer 역할 목록 조회 빈번
--   → CREATE INDEX idx_consultations_assigned_dealer ON consultations (assigned_dealer_id);
-- consultation_logs.consultation_id: 상세 페이지 기록 조회 빈번
--   → 001_schema.sql에 이미 정의 여부 확인 필요
-- sales.vehicle_id: 판매 목록의 vehicle 정보 배치 조회 (.in())
--   → CREATE INDEX idx_sales_vehicle_id ON sales (vehicle_id);
-- (위 인덱스들은 001_schema.sql 검토 후 중복 없을 때 추가할 것)

COMMIT;
