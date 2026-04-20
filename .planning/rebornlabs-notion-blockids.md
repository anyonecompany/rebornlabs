# 리본랩스 Notion Block IDs

Page: `32837b6f6bf8805f88e5d5f3d2dd424d` (KMONG 대시보드)
Actual action plan page: `34637b6f-6bf8-802a-9e37-ee9e27135da1` ("리본랩스 어드민 조직구조 변경 및 모바일 랜딩페이지" — 수주 관리 DB row)
Action plan callout: `73037b6f-6bf8-8394-a91e-01a167f9351e` (Dev Team Actionplan 컨테이너)
Last updated: 2026-04-20

> **사용 주의**: 체크박스(to_do) 블록들은 각 `heading_3` 바로 아래 **형제**로 위치한다. `notion-checkbox.sh list_todos`를 호출할 때는 `callout_block_id`(`73037b6f-6bf8-8394-a91e-01a167f9351e`)를 첫 인자로, 섹션 제목을 두 번째 인자(필터)로 넘긴다. `heading_3` block_id 자체는 `has_children=false`이므로 단독으로는 체크박스를 조회할 수 없다. 아래 표의 block_id는 **체크박스 조회용이 아니라 섹션 레퍼런스/링크용**이다.

## 조직 구조 변경 (20만원)

| 섹션 | block_id |
|------|----------|
| 1. 데이터베이스 스키마 변경 | 34837b6f-6bf8-8033-9401-e376c2eceb86 |
| 2. RLS 정책 재설계 | 34837b6f-6bf8-80ee-a324-db67e317fe1d |
| 3. 인증 및 역할 시스템 수정 | 34837b6f-6bf8-8008-8a3f-c270723f39ca |
| 4. 조직 관리 UI | 34837b6f-6bf8-8060-a2d7-dfc4d9848c38 |
| 5. 수당 자동 배분 | 34837b6f-6bf8-808a-ab41-c4a622f4484b |
| 6. 정산 페이지 확장 | 34837b6f-6bf8-8050-b803-f8a36c4a69ac |
| 7. 상담 폼 필드 추가 | 34837b6f-6bf8-8064-88e8-d2b0b0e609f0 |

## 견적서 공개 링크 기능

| 섹션 | block_id |
|------|----------|
| 1. DB 스키마 추가 | 34837b6f-6bf8-80a5-b66f-fe238686204f |
| 2. 견적서 생성 API | 34837b6f-6bf8-8090-9125-e85607aad1d4 |
| 3. 견적서 공개 페이지 | 34837b6f-6bf8-806d-a496-ffa617b4cf37 |
| 4. 딜러용 UI | 34837b6f-6bf8-8073-8c3b-d91c09a8360d |

## 사용 예시

```bash
# 체크박스 목록 조회 (callout block_id + 섹션 필터)
./scripts/product-sync/notion-checkbox.sh list_todos \
  "73037b6f-6bf8-8394-a91e-01a167f9351e" \
  "1. 데이터베이스 스키마 변경"

# 텍스트로 체크박스 찾아 체크
./scripts/product-sync/notion-checkbox.sh check_by_text \
  "73037b6f-6bf8-8394-a91e-01a167f9351e" \
  "profiles.role에 'director'" \
  "1. 데이터베이스 스키마 변경"

# Phase 진행 현황 확인
./scripts/product-sync/notion-checkbox.sh check_all_phase \
  "73037b6f-6bf8-8394-a91e-01a167f9351e" \
  "1. 데이터베이스 스키마 변경"
```

## 섹션별 체크박스 개수 (조회 완료 시점 기준)

| 섹션 | 체크박스 수 |
|------|------------|
| 1. 데이터베이스 스키마 변경 | 5 |
| 2. RLS 정책 재설계 | 6 |
| 3. 인증 및 역할 시스템 수정 | 3 |
| 4. 조직 관리 UI | 3 |
| 5. 수당 자동 배분 | 4 |
| 6. 정산 페이지 확장 | 4 |
| 7. 상담 폼 필드 추가 | 3 |
| 견적서 1. DB 스키마 추가 | 3 |
| 견적서 2. 견적서 생성 API | 3 |
| 견적서 3. 견적서 공개 페이지 | 9 |
| 견적서 4. 딜러용 UI | 4 |

## 갱신 방법

페이지 구조가 변경되면 아래 명령으로 heading_3 블록을 재추출:

```bash
set -a; source .env; set +a
curl -s -X GET \
  "https://api.notion.com/v1/blocks/73037b6f-6bf8-8394-a91e-01a167f9351e/children?page_size=100" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" \
  | jq -r '.results[] | select(.type=="heading_3") | "\(.id)\t\(.heading_3.rich_text | map(.plain_text) | join(""))"'
```
