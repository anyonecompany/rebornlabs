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

COMMIT;
