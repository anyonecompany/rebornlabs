-- =============================================================
-- 20260429_missing_fk_indexes.sql
-- 목적: FK 컬럼에 누락된 인덱스 5종 추가 (P1 — 어드민 DB 무결성)
-- 적용 주체: 대표 수동 (Supabase Dashboard 또는 supabase db push)
-- =============================================================
--
-- 배경:
--   FK 컬럼에 인덱스가 없으면 부모 행 삭제/갱신 시 자식 테이블 풀스캔이 발생한다.
--   대규모 운영 환경에서 cascade/restrict 동작이 느려지고, 조회 필터(예:
--   "특정 딜러의 상담 로그") 또한 시퀀셜 스캔으로 떨어진다.
--
-- 대상 컬럼 (모두 FK이지만 인덱스 부재 확인됨):
--   - consultation_logs.dealer_id        → profiles(id)
--   - delivery_checklists.dealer_id      → profiles(id)
--   - documents.uploaded_by              → profiles(id)
--   - sales.actor_id                     → profiles(id)
--   - audit_logs.target_id               → (대상 엔티티 UUID, 외래키는 아니지만 자주 조회됨)
--
-- 안전성:
--   IF NOT EXISTS 사용으로 멱등성 보장. 기존 인덱스가 있으면 NO-OP.
--   대용량 테이블에서 ACCESS EXCLUSIVE 잠금이 부담스러우면 운영 적용 시
--   CONCURRENTLY 추가를 검토한다 (트랜잭션 외부에서만 가능).
--
-- 운영 적용 가이드:
--   1) Staging에서 EXPLAIN ANALYZE로 효과 측정
--   2) 사용량이 적은 시간대 적용 (일반적으로 수 초~수십 초)
--   3) 대용량(100만 행+) 테이블은 별도 세션에서 다음과 같이 수동 실행 권장:
--        CREATE INDEX CONCURRENTLY idx_<table>_<col> ON <table>(<col>);
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_consultation_logs_dealer_id
    ON consultation_logs(dealer_id);

CREATE INDEX IF NOT EXISTS idx_delivery_checklists_dealer_id
    ON delivery_checklists(dealer_id);

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
    ON documents(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_sales_actor_id
    ON sales(actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id
    ON audit_logs(target_id);

-- 사후 검증 쿼리 (대표 운영 적용 직후 실행):
--   SELECT indexname FROM pg_indexes
--    WHERE indexname IN (
--      'idx_consultation_logs_dealer_id',
--      'idx_delivery_checklists_dealer_id',
--      'idx_documents_uploaded_by',
--      'idx_sales_actor_id',
--      'idx_audit_logs_target_id'
--    );
--   → 5개 행이 반환되어야 한다.
