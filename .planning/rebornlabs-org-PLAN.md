# 리본랩스 조직 구조 변경 — Phase 1 실행 계획

## 범위 요약

Phase 1: DB 스키마 + RLS 마이그레이션 SQL 파일 생성 (Supabase 적용은 CTO 수동).

## 산출물

| 파일 | 역할 |
|------|------|
| `supabase/migrations/20260420_org_structure.sql` | 마이그레이션 SQL 본체 |
| `.planning/rebornlabs-org-CONTEXT.md` | 결정 사항 + 리스크 |
| `.planning/rebornlabs-org-PLAN.md` | 이 문서 |
| `.planning/rebornlabs-org-PHASE1-APPLY.md` | CTO용 적용 가이드 + 롤백 |

## 마이그레이션 SQL 구조

```
┌─────────────────────────────────────────────┐
│ BLOCK 1 — ENUM 확장 (트랜잭션 밖)            │
│   ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'director';   │
│   ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_leader';│
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ BLOCK 2 — BEGIN 트랜잭션                     │
│                                             │
│ 2-1. team_assignments 테이블 + 인덱스        │
│ 2-2. sales 컬럼 4개 추가                     │
│ 2-3. consultations 컬럼 2개 추가             │
│ 2-4. get_subordinate_ids() 함수              │
│ 2-5. 신규 RLS 정책                           │
│   - profiles_select_director_team_leader    │
│   - consultations_select_director_team_leader│
│   - sales_select_director_team_leader       │
│   - contracts_select_director_team_leader   │
│     (contracts 테이블 존재 시에만)           │
│                                             │
│ COMMIT;                                     │
└─────────────────────────────────────────────┘
```

## Idempotency 전략

| 대상 | 방식 |
|------|------|
| ENUM 값 추가 | `ALTER TYPE ... ADD VALUE IF NOT EXISTS` |
| 테이블 생성 | `CREATE TABLE IF NOT EXISTS` |
| 컬럼 추가 | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| 인덱스 | `CREATE INDEX IF NOT EXISTS` |
| 함수 | `CREATE OR REPLACE FUNCTION` |
| RLS 정책 | `DROP POLICY IF EXISTS ... CREATE POLICY ...` |
| contracts RLS | `DO $$ ... IF EXISTS(...) THEN ... END IF; END $$;` |

## 체크박스 진행 매핑 (Notion)

### 섹션 1: "1. 데이터베이스 스키마 변경" (5개)

| 체크박스 | 완료 시점 |
|----------|-----------|
| profiles.role에 'director', 'team_leader' enum 추가 | SQL 작성 완료 |
| team_assignments 테이블 생성 | SQL 작성 완료 |
| sales 테이블에 team_leader_id, team_leader_fee, director_id, director_fee 추가 | SQL 작성 완료 |
| consultations 테이블에 available_deposit, desired_monthly_payment 추가 | SQL 작성 완료 |
| 마이그레이션 SQL 생성 및 Supabase 적용 | **CTO 적용 후 수동 체크** |

### 섹션 2: "2. RLS 정책 재설계" (6개, 모두 체크)

| 체크박스 | 완료 시점 |
|----------|-----------|
| get_subordinate_ids() 함수 생성 | SQL 작성 완료 |
| consultations RLS — 본부장/팀장 산하 딜러 조회 허용 | SQL 작성 완료 |
| sales RLS — 본부장/팀장 산하 딜러 조회 허용 | SQL 작성 완료 |
| contracts RLS — 본부장/팀장 산하 딜러 조회 허용 | SQL 작성 완료 |
| expenses RLS — 역할별 접근 범위 재설정 | 주석 명시로 완료 (director/team_leader는 기본 차단) |
| 기존 딜러/staff/admin RLS 역호환 검증 | 기존 정책 미수정 확인으로 완료 |

## 검증 전략

1. SQL 문법: `psql --parse-only` 또는 Python sqlparse로 파싱 검증
2. `npx tsc --noEmit` — 프론트 타입에 변경 없음 확인
3. 기존 admin/staff/dealer 정책 diff — 005_rls.sql과 비교해 변경 없음 확인

## 타임박스

- 조사: 30분 (완료)
- CONTEXT/PLAN 작성: 20분 (진행 중)
- SQL 파일 작성: 40분
- APPLY 가이드 작성: 20분
- 검증 + Notion 체크박스 + 커밋: 20분
- 총 약 2시간 목표
