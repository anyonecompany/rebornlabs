-- expenses 승인 워크플로우 컬럼 추가
-- status: pending(기본) → approved → paid / rejected
-- UI는 후속 PR에서 구현 예정

DO $$ BEGIN
  CREATE TYPE expense_status AS ENUM ('pending', 'approved', 'paid', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS status        expense_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- 조회 성능 (status별 필터링 대비)
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
