-- =============================================================
-- 20260422_apply_utm.sql — /apply (SNS 광고 랜딩) UTM 파라미터 확장
-- 작성일: 2026-04-22
-- 범위: consultations 테이블에 utm_medium/campaign/content 컬럼 추가
--
-- 배경:
--   인스타·틱톡·당근 등 SNS 광고 유입 시 utm_source 외에도
--   utm_medium (social/paid/referral 등), utm_campaign (캠페인명),
--   utm_content (크리에이티브/포지션) 를 함께 기록해
--   광고 효율 측정과 채널 분석을 가능하게 한다.
--
-- 기존 컬럼 유지:
--   source_ref — 기존대로 utm_source 역할. 값 예: 'ig', 'instagram',
--                'direct', 'tk', 'dg' 등. 라벨 매핑은 src/lib/source-ref.ts.
--
-- 적용 방식:
--   Supabase Dashboard → SQL Editor 에서 아래 블록 실행.
--   단일 트랜잭션. 롤백 안전 (IF NOT EXISTS).
-- =============================================================

BEGIN;

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS utm_medium   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content  TEXT;

COMMENT ON COLUMN consultations.utm_medium   IS
  'UTM medium. 광고 유형 구분 (예: social, paid, referral, cpc). NULL=미지정.';
COMMENT ON COLUMN consultations.utm_campaign IS
  'UTM campaign. 캠페인 식별자 (예: benz_nodeposit, spring_launch). NULL=미지정.';
COMMENT ON COLUMN consultations.utm_content  IS
  'UTM content. 동일 캠페인 내 크리에이티브/포지션 구분. NULL=미지정.';

-- 필터링 성능을 위한 부분 인덱스 — NULL이 아닌 행만 인덱싱
CREATE INDEX IF NOT EXISTS idx_consultations_utm_campaign
  ON consultations (utm_campaign)
  WHERE utm_campaign IS NOT NULL;

COMMIT;
