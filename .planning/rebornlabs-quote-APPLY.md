# 견적서 공개 링크 — 적용 가이드 (CTO용)

> 작성: 2026-04-20
> 대상 파일: `supabase/migrations/20260420_quotes.sql`
> 적용자: CTO (Supabase Dashboard → SQL Editor) + Vercel 환경변수

## 사전 확인

- [ ] Supabase Dashboard 접속 가능 (프로덕션)
- [ ] **최근 DB 백업 확보** (Database → Backups)
- [ ] Phase 1 마이그레이션(`20260420_org_structure.sql`) 이미 적용됨 — `get_subordinate_ids` 함수 필요

---

## Step 1 — 마이그레이션 SQL 실행

Supabase SQL Editor에서 `supabase/migrations/20260420_quotes.sql` 전체 복사 후 실행.

적용 내용:
- `quotes` 테이블 + 인덱스 3개
- `generate_quote_number()` 함수 (Asia/Seoul 일자 기준 순번)
- RLS 정책:
  - `quotes_dealer_own` (dealer 본인 CRUD)
  - `quotes_admin_staff_select/insert/update/delete`
  - `quotes_director_team_leader_select` (Phase 1 함수 존재 시 자동 생성)

### 검증 쿼리

```sql
-- 1) 컬럼
SELECT column_name FROM information_schema.columns
 WHERE table_name='quotes' ORDER BY ordinal_position;

-- 2) 함수 (첫 호출 시 RL-YYYYMMDD-001 반환)
SELECT public.generate_quote_number();

-- 3) 정책 (4개 또는 5개. Phase 1 적용됐으면 5개)
SELECT policyname FROM pg_policies WHERE tablename='quotes' ORDER BY policyname;

-- 4) 인덱스
SELECT indexname FROM pg_indexes WHERE tablename='quotes';
```

---

## Step 2 — 환경변수 설정

### Vercel (Production & Preview)

Vercel 프로젝트 → Settings → Environment Variables:

| 키 | 값 | 비고 |
|----|----|------|
| `NEXT_PUBLIC_APP_URL` | `https://rebornlabs-admin.vercel.app` | 운영 도메인. 없으면 request header로 fallback |
| `REBORNLABS_BUSINESS_NUMBER` | `000-00-00000` | 실제 사업자등록번호 |
| `REBORNLABS_ADDRESS` | `경기도 시흥시 …` | 실제 회사 주소 |
| `REBORNLABS_PHONE` | `0000-0000` | 대표 연락처 |

### 로컬 개발

`.env.local` 에 동일하게 추가:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
REBORNLABS_BUSINESS_NUMBER=000-00-00000
REBORNLABS_ADDRESS=경기도 시흥시 OO로 OO
REBORNLABS_PHONE=0000-0000
```

---

## Step 3 — 동작 검증 (배포 후)

### 딜러 플로우
1. 딜러 계정으로 어드민 로그인
2. 차량 목록 → 임의 차량 상세 진입
3. 우상단 "견적서 만들기" 버튼 클릭
4. 유효기간 7일 선택 → "생성" 클릭
5. 견적번호 `RL-YYYYMMDD-NNN` 표시 + URL 복사 버튼 확인
6. 다시 한 번 "생성" → **기존 링크 재사용** 안내 확인 → "새로 발급" 눌러 새 번호 확인

### 고객(비로그인) 플로우
1. 생성된 URL을 시크릿 브라우저로 접속 → 로그인 없이 정상 노출
2. 헤더에 "REBORN LABS" 로고 + 견적번호
3. 가격 카드(판매가/보증금/월 납입료) 강조 표시
4. **차량번호(plate_number) 안 보이는지 확인** (개발자 도구 Network 탭으로 `/api/quotes/[token]` 응답에 `plate_number`/`purchase_price`/`margin` 없는지 확인)
5. 담당자 정보 + "상담 문의하기" tel: 링크
6. 푸터에 사업자번호/주소/연락처

### 만료 시뮬레이션 (QA용)
```sql
-- 임의 견적서 만료로 설정
UPDATE quotes
   SET expires_at = now() - interval '1 day'
 WHERE token = 'YOUR_TEST_TOKEN';
```
→ 해당 URL 접속 시 "견적서 유효기간이 만료되었습니다" 페이지 렌더링 확인

---

## 롤백

```sql
BEGIN;

-- 정책 제거
DROP POLICY IF EXISTS quotes_dealer_own                          ON quotes;
DROP POLICY IF EXISTS quotes_admin_staff_select                  ON quotes;
DROP POLICY IF EXISTS quotes_admin_staff_insert                  ON quotes;
DROP POLICY IF EXISTS quotes_admin_staff_update                  ON quotes;
DROP POLICY IF EXISTS quotes_admin_staff_delete                  ON quotes;
DROP POLICY IF EXISTS quotes_director_team_leader_select         ON quotes;

-- 함수
DROP FUNCTION IF EXISTS public.generate_quote_number();

-- 테이블 (주의: 견적서 데이터 모두 삭제됨)
DROP TABLE IF EXISTS quotes;

COMMIT;
```

---

## 완료 후 수동 체크

- [ ] Supabase 마이그레이션 실행 성공
- [ ] 검증 쿼리 4개 기대값 반환
- [ ] Vercel 환경변수 3개 + `NEXT_PUBLIC_APP_URL` 설정
- [ ] 배포 후 카톡에서 실제 URL 열어 모바일 렌더링 확인
- [ ] Notion 섹션 1 "마이그레이션 SQL 생성 및 Supabase 적용" 체크박스 수동 체크
  ```bash
  ./scripts/product-sync/notion-checkbox.sh check_by_text \
    "73037b6f-6bf8-8394-a91e-01a167f9351e" \
    "마이그레이션 SQL" \
    "1. DB 스키마 추가"
  ```

## 주의사항

- **차량번호(`plate_number`) 절대 노출 금지**: 공개 API 응답 스키마에서 이미 제외했으나, 향후 API 수정 시에도 반드시 제외 유지. 고객의 외부 가격 비교 방지 정책.
- **`deleted_at IS NOT NULL` 차량**: 공개 조회 시 404 반환. 딜러가 실수로 차량 삭제해도 견적 링크가 민감정보를 노출하지 않음.
- **ON DELETE CASCADE**: 차량 삭제 시 관련 quotes도 자동 삭제. 견적 관리자에게 알림 없으므로 차량 삭제 전 관련 견적 확인 필요 (Phase 다음에서 관리 UI 제공 시).
- **조회수 업데이트 실패 허용**: view_count 증가는 fire-and-forget. 조회 응답 자체는 성공 처리.
