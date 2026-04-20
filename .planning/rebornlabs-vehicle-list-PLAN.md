# 차량 리스트 기능 — 실행 계획

## 3 Phase 분할

### Phase 1 — DB + API + Import (BE)
**산출물**
- `supabase/migrations/20260421_vehicle_models.sql`
  - `vehicle_models` 테이블 + 인덱스 2개
  - RLS 정책 2개 (`vm_admin_staff_all`, `vm_public_select`)
  - `update_updated_at()` 트리거 연결
- `types/database.ts` 에 `vehicle_models` Row/Insert/Update 추가
- `src/lib/vehicle-price.ts` 가격 공식 유틸 3개 export
- `app/api/vehicle-models/route.ts` — GET 목록 + POST 단일 등록
- `app/api/vehicle-models/[id]/route.ts` — PATCH 수정 + DELETE (soft)
- `app/api/vehicle-models/import/route.ts` — POST multipart, xlsx 파싱 + forward-fill + upsert
- `app/api/vehicle-models/public/route.ts` — GET 공개 계층 응답 + 5분 캐시

**커밋**: `feat(vehicle-models): 데이터베이스 스키마 + API + 엑셀 import`

### Phase 2 — 어드민 UI (FE)
**산출물**
- `app/(auth)/vehicle-models/page.tsx` — 테이블/카드 + 검색/필터 + 페이지네이션
- `src/components/vehicle-models/model-form-dialog.tsx` — 등록/수정 통합 폼
- `src/components/vehicle-models/excel-import-dialog.tsx` — 파일 선택 + 미리보기 + 확정
- `components/sidebar.tsx` ADMIN/STAFF 메뉴에 "차량 모델 관리" 추가 (GalleryVerticalEnd 아이콘)

**커밋**: `feat(vehicle-models): 어드민 관리 UI`

### Phase 3 — 공개 /cars 페이지 (FE)
**산출물**
- `app/cars/page.tsx` Server Component — 공개 API fetch
- `app/cars/cars-selector.tsx` Client Component — 3단계 선택 UI + URL 쿼리 상태
- `app/cars/price-card.tsx` — 가격 카드 (강조 월 납입료)
- `proxy.ts` PUBLIC_PATHS에 `/cars` 추가

**커밋**: `feat(vehicle-models): 공개 /cars 카탈로그 페이지`

## Notion 매핑 (이번 작업은 기존 섹션에 체크박스 없음)

해당 KMONG 페이지 Phase 3 섹션이 "수당 자동 배분 및 정산 확장"으로 지정되어 있음.
차량 리스트는 별도 항목 — Notion 체크박스 동기화 없음.
완료 보고는 Slack #dev-report + Notion 태스크 DB 등록으로 대체.

## 타임박스

- 사전 탐색: 완료
- 설계 문서: 완료
- Phase 1: 60분 (SQL + 타입 + 유틸 + API 4개)
- Phase 2: 45분 (페이지 + 모달 2개 + 사이드바)
- Phase 3: 45분 (서버/클라이언트 + 미들웨어)
- 검증/커밋/보고: 30분

총 약 3시간 목표.

## 가정 (진행 중 수정 불가 시 명시)

- 엑셀 파일: `projects/rebornlabs/고객용+페이지.xlsx` (헤더 row 9, 데이터 row 10~)
- 공개 페이지 캐시: 5분
- 어드민 페이지당: 20건
- 브랜드/모델 로고: 텍스트 라벨만
- 상담 신청 페이지(/consultation/new)는 기존 링크 사용 (이번 Phase에서 폼 수정 안 함)

## 회귀 검증

- 기존 `/vehicles` (재고 관리) 페이지 동작
- `/quotes`, `/team-structure`, `/users`, `/quote/[token]` 페이지 동작
- `proxy.ts` 수정 후에도 로그인/로그아웃 플로우 정상
