# 견적서 Phase 2 — 실행 계획

## 산출물

### BE
- `app/api/quotes/route.ts` — GET 내 견적 목록 (status/search/page)
- `app/api/quotes/[id]/extend/route.ts` — POST 만료 연장

### FE
- `app/(auth)/quotes/page.tsx` — 목록 페이지
- `src/components/quote/quote-list-table.tsx` — 데스크톱 테이블 + 모바일 카드 리스트
- `src/components/quote/quote-detail-dialog.tsx` — 상세 모달
- `src/components/quote/quote-status-badge.tsx` — 상태 뱃지
- `src/lib/format-relative-time.ts` — 상대 시간 포맷터 유틸

### 사이드바
- `components/sidebar.tsx` — admin/staff 메뉴에 "견적서 관리", dealer 메뉴에 "내 견적서" 추가

### 타입
- `types/database.ts` — `get_subordinate_ids` RPC 함수 Args/Returns 추가

### 문서
- `.planning/rebornlabs-quote-phase2-CONTEXT.md`
- `.planning/rebornlabs-quote-phase2-PLAN.md`

## 구현 순서

1. 상대 시간 유틸 (`format-relative-time.ts`)
2. GET `/api/quotes`
3. POST `/api/quotes/[id]/extend`
4. 사이드바 메뉴 추가
5. `QuoteStatusBadge` 컴포넌트
6. `QuoteListTable` 컴포넌트 (반응형)
7. `QuoteDetailDialog` 컴포넌트 (URL 복사 + 연장)
8. `/quotes` 페이지 (상태 필터 탭 + 검색 + 테이블 + 페이지네이션)
9. 검증 (`tsc --noEmit`, `next build`)
10. Notion 체크박스 + 커밋/푸시 + Slack

## API 시그니처

### GET /api/quotes
```
?status=active|expired|all  (default: all)
?search=string              (optional)
?page=1                     (default: 1)
?pageSize=20                (default: 20, max: 100)
```
Response:
```json
{
  "quotes": [ ... ],
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "totalPages": 3
}
```

각 quote:
```json
{
  "id": "...",
  "quoteNumber": "RL-20260420-001",
  "vehicle": { "id": "...", "make": "...", "model": "...", "vehicleCode": "...", "primaryImageUrl": "..." },
  "dealer": { "id": "...", "name": "..." },
  "expiresAt": "...", "createdAt": "...",
  "viewCount": 3, "firstViewedAt": "...", "lastViewedAt": "...",
  "status": "active",
  "url": "https://.../quote/{token}",
  "canExtend": true,
  "canCopyUrl": true,
  "token": "..."
}
```
※ `token`은 URL 복사/공개 페이지 열기용. **민감도 낮음**(토큰 자체가 공개 URL의 일부).

### POST /api/quotes/[id]/extend
Body:
```json
{ "addDays": 7 | 14 | 30 | null }
```
- `addDays > 0`: `expires_at = MAX(expires_at, now()) + addDays`
- `addDays === null`: `expires_at = NULL` (무제한)

Response:
```json
{ "quote": { "id": "...", "expiresAt": "..." } }
```

## 완료 조건 매핑

| 스펙 | 완료 시점 |
|------|-----------|
| 딜러 사이드바에 "내 견적서" 메뉴 추가 | sidebar.tsx 수정 완료 |
| /quotes 페이지 구현 | page.tsx + 컴포넌트 완료 |
| 목록 컬럼 (조회수, 마지막조회 포함) | QuoteListTable 완료 |
| 상태별 필터 (전체/활성/만료) | 페이지 상단 탭 완료 |
| 검색 (견적번호 or 차량명) | API query param + UI input 완료 |
| 견적 행 클릭 → 상세 다이얼로그 | QuoteDetailDialog 완료 |
| 만료 연장 기능 | `/extend` API + 모달 드롭다운 완료 |
| 권한별 조회 범위 자동 적용 | API 분기 완료 |
| 모바일 반응형 | 카드 리스트 변환 완료 |
| tsc + build | 검증 완료 |

## Notion 체크박스

- 섹션 4 "4. 딜러용 UI"
  - "내 견적서 목록 페이지 (선택): 생성한 견적서 + 고객 열람 여부 확인" → **체크**
