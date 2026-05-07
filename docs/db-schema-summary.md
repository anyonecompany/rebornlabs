# 리본랩스 DB 감사 — CTO/CEO 1페이지 요약

> 2026-05-07 · Supabase `agent-skills` 적용 후 전수 감사
> 상세: `db-schema-audit.md` / 수정안: `db-schema-fixes.md`

---

## 한 줄 결론

**스키마 설계 8.2/10 — 큰 구멍 없음. 작은 정합성 결함 3건만 잡으면 회귀 빈도가 즉시 줄어든다.**

---

## 도메인 요약

리본랩스는 17개 테이블을 5개 도메인으로 운영한다.

| 도메인 | 테이블 수 | 핵심 |
|--------|----------|------|
| 사용자 / 조직 | 2 | profiles, team_assignments |
| 상담 / 배정 | 3 | consultations + logs + assignments |
| 차량 / 견적 | 3 | vehicles, vehicle_models, quotes |
| 판매 / 계약 / 정산 | 4 | sales, contracts, commissions, delivery_checklists |
| 비용 / 문서 / 감사 / 인프라 | 5 | expenses, documents, audit_logs, marketing_companies, gas_failures |

---

## 지금 손봐야 할 5건 (P1 + P2)

| # | 항목 | 영향 | 작업량 |
|---|------|------|--------|
| 1 | **`document_category` ENUM에 `'contract'` 추가** (TS는 있는데 SQL에 없음) | INSERT 시 즉시 에러 가능 | 5분 (1줄 SQL) |
| 2 | **`expenses.status` TS 타입 추가** (SQL엔 있는데 TS에 없음) | 타입 안전성 누락 | 10분 (TS 수정) |
| 3 | **`consultations.vehicle_id` FK 컬럼 추가** (현재 자유 입력 텍스트) | 데이터 품질 ↑, 데드 트리거 2개 부활 가능 | 30분 + 후속 |
| 4 | **`team_assignments` 순환 참조 차단 CHECK** (A→B→A 방어) | 잠재 RLS 우회 | 10분 |
| 5 | **Supabase `gen types typescript` CI 도입** (★ 가장 큰 ROI) | 향후 SQL/TS 정합 회귀 영구 차단 | 1시간 |

**5건 모두 회귀 위험 낮음. 5번이 가장 중요 — 이거 없으면 1·2·3번이 또 발생.**

---

## 지금 안 건드려도 되는 5건

| 항목 | 이유 |
|------|------|
| `sales.dealer_fee` vs `commissions` 이중 SoT | 의도된 역정규화 (스냅샷 + 정산 정규화). 주석으로 명시됨 |
| 소프트 삭제 컨벤션(`deleted_at` vs `cancelled_at` vs `status`) | 통일 비용 > 유지 비용. 문서화만 |
| FK 인덱싱 누락 | 이미 `20260429_missing_fk_indexes`에서 5개 일괄 적용됨 |
| SECURITY DEFINER `search_path` | 이미 `20260429_security_definer_search_path`에서 6개 함수 일괄 적용됨 |
| `gas_failures` cron 라우트 | 알려진 결함이었으나 `app/api/cron/gas-retry/route.ts`로 이미 구현됨 |

---

## 의사결정 필요한 항목

1. **`document_category` 'contract' 처리**
   - 선택지 A: SQL에 값 추가 (향후 사용 가능, **권장**)
   - 선택지 B: TS에서 제거 (현재 사용처 0건)

2. **`consultations.vehicle_id` 백필 시점**
   - 컬럼 추가는 즉시 가능 (회귀 0)
   - 기존 데이터 유사도 매칭 + 데드 트리거 부활은 Q4 작업으로 분리 권장

3. **Supabase typegen CI 적용 시점**
   - P1과 함께 도입 권장 — 그래야 P1-A, P1-B 같은 결함 재발 차단

---

## Supabase Agent Skills 적용 결과

`https://github.com/supabase/agent-skills` 두 스킬 설치 완료:

| 스킬 | 용도 |
|------|------|
| `supabase` | Supabase 제품 종합 (DB/Auth/Storage/Edge/Realtime) |
| `supabase-postgres-best-practices` | 8 카테고리 Postgres 베스트 프랙티스 |

**향후 모든 Supabase 관련 작업에서 자동 트리거.** 본 감사가 첫 번째 적용 사례.

---

## 다음 단계

승인 시 별도 plan으로 진행:

1. 즉시 (이번 주): P1-B(TS) + P1-A(ENUM 추가) + P4-C(typegen CI)
2. 이번 스프린트: P1-C(vehicle_id 컬럼) + P2 3건
3. Q3-Q4: 트리거 성능 측정, 백필, 정산 기준 문서

---

## 참고 산출물

- `projects/rebornlabs/docs/db-schema-audit.md` — 17 테이블 카탈로그 + Mermaid ERD + 8 카테고리 감사
- `projects/rebornlabs/docs/db-schema-fixes.md` — P1~P4 마이그레이션 SQL/TS 초안 + 회귀 위험 매트릭스
- 본 문서 (`db-schema-summary.md`) — CTO/CEO 1페이지
