# 리본랩스 DB 스키마 수정 초안 (마이그레이션 + TS)

> 본 문서는 `db-schema-audit.md`의 P1~P4 항목에 대한 실행 가능한 SQL/TS 초안입니다.
> **이 plan에서는 적용하지 않습니다.** CTO/CEO 승인 후 별도 plan에서 단계 적용.

---

## 적용 순서 (의존성 그래프)

```
P1-A (document_category)  ─┐
P1-B (expenses.status TS)  ─┼─ 독립 적용 가능 (병렬)
P1-C (consultations.vehicle_id) ─┘
        │
        ▼
P2-A (team_assignments CHECK) ─┐
P2-B (delivery_checklists idx) ─┼─ 독립
P2-C (소프트삭제 문서)         ─┘
        │
        ▼
P3-A (TS 주석) ─┐
P3-B (JSONB idx) ─┼─ 독립
P3-C (트리거 검토) ─┘
        │
        ▼
P4-A (vehicle_id 매칭) ──┐
P4-B (정산 기준 문서)    ──┼─ 의존: P1-C 적용 후
P4-C (Supabase typegen CI) ─┘  ── 단독 (다른 항목 무관)
```

---

## P1 — 즉시 적용 (3건)

### P1-A. `document_category` ENUM 정합화

**문제**: SQL `001_schema.sql:31-34`는 `('business_registration', 'contract_template', 'other')` 3개. TS `types/database.ts` `DocumentCategory`는 `'contract'` 추가 4개. 코드 사용처 grep 결과 `'contract'` INSERT 없음, 잠재 위험만 존재.

**선택지**:

#### 선택지 A — SQL에 `'contract'` 추가 (TS 유지)
```sql
-- supabase/migrations/20260507_add_contract_to_document_category.sql
ALTER TYPE document_category ADD VALUE IF NOT EXISTS 'contract';
```
- 장점: TS 변경 없음, 향후 `'contract'` 카테고리 사용 가능
- 단점: ENUM 값 추가 후 트랜잭션 안에서 즉시 사용 불가 (PostgreSQL 제약)
- 회귀 위험: **없음** (값 추가만)
- 롤백: `ALTER TYPE document_category RENAME VALUE 'contract' TO ...` 불가 → ENUM은 값 삭제 어려움. 사용처 발생 전에는 무해.

#### 선택지 B — TS에서 `'contract'` 제거 (SQL 유지)
```diff
 export type DocumentCategory =
   | "business_registration"
-  | "contract"
   | "contract_template"
   | "other";
```
- 장점: 즉시 정합
- 단점: 향후 `'contract'` 필요 시 재추가
- 회귀 위험: **없음** (코드 사용처 0건 확인)
- 롤백: TS revert만

**권장**: **선택지 A** — `'contract'`(완성된 계약서) vs `'contract_template'`(템플릿) 의미가 명확히 다르고, 향후 사용 가능성 있음.

---

### P1-B. `expenses.status` 컬럼 TS 정합화

**문제**: `20260429_expenses_status.sql`로 SQL에는 status 컬럼 추가됐으나 `types/database.ts`의 `expenses.Row`에 누락. 앱 API에서 status 필터링 시 타입 안전성 없음.

**적용**:

```diff
 expenses: {
   Row: {
     id: string;
     user_id: string;
     expense_date: string;
     amount: number;
     purpose: string;
     receipt_urls: string[];
     created_at: string;
+    status: ExpenseStatus;
   };
   ...
 };

+export type ExpenseStatus = "pending" | "approved" | "paid" | "rejected";
```

- 회귀 위험: **낮음** — 기존 API에서 status를 사용하지 않으면 영향 없음. 사용 중이면 타입 강제로 누락 케이스 컴파일 에러로 발견.
- 롤백: TS revert
- 검증: `pnpm tsc --noEmit` 통과

---

### P1-C. `consultations.vehicle_id` 컬럼 추가 (Phase 1 — 컬럼만)

**문제**: 결함 #1 — `interested_vehicle` 자유 입력 텍스트만 존재. 데드 트리거 2개의 원인.

**적용 (Phase 1, 컬럼 추가만)**:

```sql
-- supabase/migrations/20260507_consultations_add_vehicle_id.sql

-- consultations에 vehicle_id 컬럼 추가 (NULL 허용 — 기존 데이터 유지)
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

-- FK 인덱스
CREATE INDEX IF NOT EXISTS idx_consultations_vehicle_id
  ON consultations(vehicle_id)
  WHERE vehicle_id IS NOT NULL;

COMMENT ON COLUMN consultations.vehicle_id IS
  '관심 차량 정규화 FK. 기존 interested_vehicle 텍스트는 유지(레거시). Phase 2에서 유사도 매칭으로 채움.';
```

- 회귀 위험: **낮음** — NULL 허용이라 기존 INSERT/UPDATE 영향 없음. 트리거 2개는 여전히 DROP 상태.
- 롤백: `ALTER TABLE consultations DROP COLUMN vehicle_id;`
- 검증: 신규 상담 INSERT 시 vehicle_id를 명시적으로 전달하는 코드 경로 추가 필요(별도 작업).

**Phase 2 (별도, 향후)**: 기존 데이터 유사도 매칭 + 데드 트리거 2개 재활성화.

---

## P2 — 단기 적용 (3건)

### P2-A. `team_assignments` 순환 참조 방어

**문제**: A→B→A 환형 구조 가능. `get_subordinate_ids()`가 본인을 산하로 포함하면 RLS 우회 위험.

**적용**:

```sql
-- supabase/migrations/20260507_team_assignments_no_self.sql

ALTER TABLE team_assignments
  ADD CONSTRAINT team_assignments_no_self_assignment
  CHECK (user_id <> leader_id);
```

- 회귀 위험: **낮음** — 기존에 user_id=leader_id인 행이 있으면 적용 실패. 사전 확인 필요:
  ```sql
  SELECT count(*) FROM team_assignments WHERE user_id = leader_id;
  -- 0이어야 적용 가능
  ```
- 롤백: `ALTER TABLE team_assignments DROP CONSTRAINT team_assignments_no_self_assignment;`

**확장(선택)**: 2단계 순환(A→B→A)도 트리거로 차단:

```sql
CREATE OR REPLACE FUNCTION prevent_circular_team_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM team_assignments
    WHERE user_id = NEW.leader_id AND leader_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION '순환 참조: %는 이미 %의 하위입니다', NEW.leader_id, NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_team_assignments_no_circular
  BEFORE INSERT OR UPDATE ON team_assignments
  FOR EACH ROW EXECUTE FUNCTION prevent_circular_team_assignment();
```

---

### P2-B. `delivery_checklists.completed_at` 인덱스 (선택)

**문제**: 출고 완료 조회 시 풀스캔 가능. 현재 데이터 양 적어 영향 없으나 사전 대비.

**적용**:

```sql
-- supabase/migrations/20260507_delivery_checklists_completed_idx.sql

CREATE INDEX IF NOT EXISTS idx_delivery_checklists_completed
  ON delivery_checklists (completed_at DESC)
  WHERE completed_at IS NOT NULL;
```

- 회귀 위험: **없음**
- 롤백: `DROP INDEX IF EXISTS idx_delivery_checklists_completed;`

---

### P2-C. 소프트 삭제 컨벤션 문서화

**문제**: vehicles=deleted_at, sales=cancelled_at, expenses=status 패턴 분열. 통일 비용 > 유지 비용.

**적용**: 신규 문서 `projects/rebornlabs/docs/db-conventions.md`:

```markdown
# DB 컨벤션

## 소프트 삭제 패턴

| 테이블 | 패턴 | 의미 |
|--------|------|------|
| vehicles | deleted_at TIMESTAMPTZ | 차량 삭제 (관리자 명시 삭제) |
| sales | cancelled_at TIMESTAMPTZ | 판매 취소 (영업 프로세스 종료) |
| expenses | status='cancelled' | 비용 항목 취소 (status 워크플로우 일부) |
| consultation_assignments | status='cancelled' | 배정 취소 (상태머신 일부) |

## 신규 테이블 정책

- 단순 삭제 → `deleted_at TIMESTAMPTZ`
- 비즈니스 워크플로우의 일부 → `status` ENUM
- 기존 테이블의 패턴 변경 금지(마이그레이션 비용 거대)
```

- 회귀 위험: **없음** (문서만)

---

## P3 — 중기 적용 (3건)

### P3-A. TS UserRole enum 마이그레이션 단계 주석

```diff
+/**
+ * UserRole enum.
+ *
+ * SQL 정의 순서:
+ *   - 001_schema.sql: admin, staff, dealer, pending
+ *   - 20260420_org_structure.sql: director, team_leader 추가
+ *
+ * TS는 의미별 정렬(권한 강 → 약).
+ */
 export type UserRole =
   | "admin"
   | "director"
   | "team_leader"
   | "staff"
   | "dealer"
   | "pending";
```

---

### P3-B. `audit_logs.metadata` JSONB GIN 인덱스 (필요 시)

```sql
-- 조회 빈도가 늘어나면 적용
-- supabase/migrations/20260???_audit_logs_metadata_gin.sql

CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin
  ON audit_logs USING GIN (metadata);
```

- 권장: 어드민 감사 로그 검색 기능 출시 시점에 추가

---

### P3-C. consultations 트리거 3개 성능 검토

`mark_duplicate_consultations()`가 INSERT마다 전체 consultations를 phone+vehicle 매칭으로 조회 → 데이터 증가 시 느려짐.

**조사 항목**:
- 현재 consultations 행 수 / mark_duplicate 평균 실행 시간 (pg_stat_statements)
- block_recent_duplicate가 이미 10분 필터링 → mark_duplicate는 24시간 윈도우로 좁힐 수 있음

**권장**: 측정 후 결정. 1만 건 미만이면 미적용.

---

## P4 — 장기 (아키텍처)

### P4-A. consultations.vehicle_id 매칭 + 데드 트리거 재활성화

**전제**: P1-C 적용 후

```sql
-- Phase 2: 기존 데이터 유사도 매칭 (백필 스크립트)
-- supabase/migrations/20260???_consultations_vehicle_id_backfill.sql

UPDATE consultations c
SET vehicle_id = matched.id
FROM (
  SELECT DISTINCT ON (c2.id)
    c2.id AS consultation_id,
    v.id
  FROM consultations c2
  JOIN vehicles v ON similarity(v.make || ' ' || v.model, c2.interested_vehicle) > 0.6
  WHERE c2.vehicle_id IS NULL AND c2.interested_vehicle IS NOT NULL
  ORDER BY c2.id, similarity(v.make || ' ' || v.model, c2.interested_vehicle) DESC
) matched
WHERE c.id = matched.consultation_id;

-- Phase 3: 데드 트리거 2개 재활성화 (auto_vehicle_status_on_consult, restore_vehicle_status)
-- 002_triggers.sql:165-205 참고하여 vehicle_id 기반으로 재작성
```

- 회귀 위험: **중간** — 매칭 임계치(0.6)가 잘못되면 오매칭 발생
- 검증 필요: 샘플 100건으로 임계치 조정

---

### P4-B. commissions 정산 기준 문서화

`docs/operations/commission-policy.md` 신규 작성:

- delivery_confirmed_at 전: commissions 미생성 → 정산 페이지 미노출
- delivery_confirmed_at 후: commissions 자동 생성 → 정산 가능
- 환불/취소 시: cancel_sale() RPC가 commissions를 어떻게 처리하는지 명세

---

### P4-C. Supabase `gen types typescript` CI 도입

**가장 큰 ROI** — 본 감사에서 발견된 ENUM/컬럼 정합 결함 4건(P1-A, P1-B, 향후)을 영구 차단.

**`.github/workflows/typegen-check.yml` (신규)**:

```yaml
name: Supabase Type Generation Check
on:
  pull_request:
    paths:
      - 'supabase/migrations/**'
      - 'types/database.ts'

jobs:
  typegen:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Start local Supabase
        run: supabase start

      - name: Generate types
        run: |
          supabase gen types typescript --local > types/database.generated.ts

      - name: Diff check
        run: |
          # 손으로 작성된 types/database.ts와 비교
          # 차이가 있으면 PR 코멘트 + 실패
          diff types/database.ts types/database.generated.ts || {
            echo "::error::types/database.ts 와 SQL 스키마가 불일치합니다."
            echo "supabase gen types typescript --local > types/database.ts 로 갱신하세요."
            exit 1
          }
```

**대안(점진적)**: `types/database.generated.ts`를 별도 파일로 두고, 손 작성 `types/database.ts`는 import + 확장만 하는 구조로 변경. 이러면 SQL 변경이 자동 반영되고, 도메인 타입은 손으로 유지.

- 회귀 위험: **낮음 — 추가만**
- 롤백: 워크플로우 파일 삭제

---

## 검증 방법 (전체)

각 P1~P4 항목 적용 후:

```bash
# 1. Supabase 로컬에서 마이그레이션 적용
supabase db reset

# 2. 타입 정합 확인
pnpm tsc --noEmit

# 3. 단위 테스트 (있다면)
pnpm test

# 4. 빌드 확인
pnpm build

# 5. RLS 정책 시뮬레이션 (특히 P2-A)
# psql 또는 Supabase Studio에서 각 역할로 직접 SELECT 시도
```

---

## 회귀 위험 매트릭스

| 항목 | 위험도 | 영향 범위 | 롤백 난이도 |
|------|--------|----------|-----------|
| P1-A | 낮음 | ENUM 값 추가만 | 중 (값 삭제 어려움) |
| P1-B | 낮음 | TS만 | 즉시 |
| P1-C | 낮음 | NULL 컬럼 추가 | 즉시 (DROP COLUMN) |
| P2-A | 중간 | 기존 데이터 검증 필요 | 즉시 (DROP CONSTRAINT) |
| P2-B | 없음 | 인덱스만 | 즉시 |
| P2-C | 없음 | 문서 | — |
| P3-A | 없음 | TS 주석 | — |
| P3-B | 낮음 | 인덱스만 | 즉시 |
| P3-C | 측정 후 결정 | 트리거 변경 | 중 |
| P4-A | **중간** | 데이터 백필 | 어려움 (UPDATE 되돌리기) |
| P4-B | 없음 | 문서 | — |
| P4-C | 낮음 | CI만 | 즉시 |

---

## 권장 적용 순서

1. **즉시 (이번 주)**: P1-B (TS만, 5분 소요) → P1-A (ENUM 추가, 회귀 0)
2. **이번 스프린트**: P1-C → P2-A → P2-B → P2-C → P4-C(CI)
3. **다음 스프린트**: P3-A, P3-B
4. **Q3**: P3-C 측정 → 필요 시 적용
5. **Q4**: P4-A, P4-B (consultations.vehicle_id 백필 + 정산 기준)

**P4-C(typegen CI)는 P1과 함께 도입 권장** — 추후 회귀 영구 차단.
