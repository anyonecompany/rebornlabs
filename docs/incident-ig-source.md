# 인시던트 리포트 — "ig" 유입경로 출처 조사

> 작성일: 2026-04-20
> 담당: BE-Developer (Sonnet)
> 관련 이슈: 상담 유입경로에 "ig" 값이 보이는데 마케팅업체 목록에 없음

## 요약

**결론 (2026-04-20 고객 확정): 리본랩스 공식 인스타그램 프로필 바이오 링크.** 고객 선택에 따라 A안(마케팅업체 "인스타그램" 등록 + 정산 포함 + UI 한글 라벨)을 적용했다. 자세한 확정 내용은 하단 [결론 (2026-04-20 최종 확정)](#결론-2026-04-20-최종-확정) 섹션 참고.

코드 조사 요점: 코드베이스 어디에도 "ig"를 하드코딩하지 않는다. 랜딩페이지가 URL 쿼리 파라미터(`?ref=` 또는 `?utm_source=`)를 그대로 DB에 저장하는 구조이며, "ig" 값은 고객이 인스타 바이오에 실제로 설정한 `utm_source=ig` 파라미터에서 유입된 것이다.

## 조사 범위

다음 패턴을 `app/`, `src/`, `scripts/`, `lib/`, `supabase/` 전체에서 검색:

- `'ig'`, `"ig"` — 문자열 리터럴
- `source_ref` — 유입경로 컬럼 참조
- `ref.*=.*ig`, `ref=ig`, `utm_source` — 파라미터 매칭

## 조사 결과

### 1. 랜딩페이지 (`app/landing.tsx`)

```ts
const params = new URLSearchParams(window.location.search);
const paramRef = params.get("ref") || params.get("utm_source");

if (paramRef) {
  sessionStorage.setItem("reborn_ref", paramRef);
  setUtmSource(paramRef);
} else {
  const stored = sessionStorage.getItem("reborn_ref");
  setUtmSource(stored || "direct");
}
```

**동작**: URL 쿼리 `ref` 또는 `utm_source` 값을 그대로 sessionStorage에 저장 후 폼 제출 시 `ref` 필드에 담아 전송. URL 파라미터가 없고 sessionStorage도 비어있을 때만 `"direct"`.

### 2. 상담 접수 API (`app/api/consultations/submit/route.ts:110`)

```ts
p_source_ref: ref ?? "direct",
```

**동작**: body의 `ref` 값을 가공 없이 DB에 전달. 없을 때만 `"direct"`.

### 3. GAS 마이그레이션 스크립트 (`scripts/migrate-spreadsheet.gs:85`)

```js
const source = String(row[COL.SOURCE] || "").trim() || "spreadsheet_import";
```

**동작**: 스프레드시트 F열 값 사용. 비어있으면 `"spreadsheet_import"` (역사적 마이그레이션 데이터). **"ig" 하드코딩 없음.**

### 4. DB 기본값 (`supabase/migrations/001_schema.sql:157`, `003_functions.sql:24`)

```sql
source_ref TEXT NOT NULL DEFAULT 'direct'
p_source_ref TEXT DEFAULT 'direct'
```

**동작**: 기본값은 `"direct"`. "ig" 하드코딩 없음.

### 5. 마케팅업체 자동 매칭 (`submit/route.ts:118-`)

```ts
if (ref && consultationId) {
  const decoded = decodeURIComponent(ref);
  const { data: mc } = await serviceClient
    .from("marketing_companies")
    .select("name")
    .eq("name", decoded)
    .eq("is_active", true)
    .single();
  // ...
}
```

**동작**: `ref` 값과 일치하는 마케팅업체가 있으면 자동 매칭, 없으면 그냥 `source_ref`에만 저장되고 마케팅업체는 null. → **"ig" 값이 들어왔을 때 매칭되는 업체가 없으므로 상담은 정상 저장되지만 마케팅업체 미배정 상태.**

## 결론 (2026-04-20 최종 확정)

**출처: 리본랩스 공식 인스타그램 프로필 바이오 링크**

실제 유입 URL:
`https://l.instagram.com/?u=https://rebornlabs.vercel.app/?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=...`

구조 분해:
- `l.instagram.com`: 인스타 외부링크 클릭 추적 중계
- `utm_source=ig`: "ig" 값의 직접적인 출처
- `utm_medium=social`: 소셜 유입
- `utm_content=link_in_bio`: 프로필 바이오 링크
- `fbclid`: Meta 광고 클릭 추적 ID (광고 병행 집행 중)

## 접수 패턴 (2026-04-18 첫 유입)

- 2026-04-18: 4건
- 2026-04-19: 3건
- 이전 기간: 0건
- 관심차종: 포르쉐 타이칸, BMW 8시리즈, 테슬라 모델Y/3, 벤츠 GLE, 제네시스 GV70, 마세라티 콰트로포르테 (전부 프리미엄)

## 고객 결정 (A안)

- 마케팅업체로 "인스타그램" 등록 → 정산에 포함
- UI 라벨도 "인스타그램"으로 한글화 병행

## 적용된 조치

1. [DB] `marketing_companies` INSERT "인스타그램" (고객 SQL 직접 실행)
2. [DB] 기존 7건 `consultations.marketing_company = '인스타그램'` 소급 UPDATE (고객 SQL 직접 실행)
3. [코드] `src/lib/source-ref.ts`에 `SOURCE_REF_LABELS` 확장 (ig/instagram/insta → 인스타그램)
4. [코드] `SOURCE_REF_TO_COMPANY` 별칭 매핑 + `resolveCompanyName` 헬퍼 신규 export
5. [코드] `/api/consultations/submit` 매칭 로직에 `resolveCompanyName` 적용 → 신규 'ig' 유입 자동 매칭

## 향후 신규 ig 유입 처리 흐름

1. 고객이 인스타 바이오 링크 클릭
2. 랜딩페이지 접속 → `utm_source=ig` 감지
3. 상담 제출 시 `source_ref='ig'`로 저장
4. submit API가 `resolveCompanyName('ig')` → `'인스타그램'` 변환
5. `marketing_companies`에서 '인스타그램' 레코드 조회 → 자동 매칭
6. 어드민 유입경로 컬럼에 "인스타그램" 한글 표시 (`formatSourceRef`)

## 교훈

- 출처 분석 시 **코드 조사와 비즈니스 컨텍스트를 분리**해 보고할 것. 코드에서 하드코딩 여부는 판별 가능하지만, URL 파라미터가 실제로 어디서 발사되는지는 고객만 안다.
- "확인해달라"는 요청은 **확인 결과 리포트까지만** 작성하고, 매핑/자동화 액션은 고객 확정 후에 적용한다.
- 고객이 "내가 셋팅하지 않았다"고 해도 팀원/외주/과거 흔적일 수 있으므로, 운영 경로를 함께 짚어보는 것이 안전하다.
