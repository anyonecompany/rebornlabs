# 인시던트 리포트 — "ig" 유입경로 출처 조사

> 작성일: 2026-04-20
> 담당: BE-Developer (Sonnet)
> 관련 이슈: 상담 유입경로에 "ig" 값이 보이는데 마케팅업체 목록에 없음

## 요약

**결론: 코드 하드코딩 없음. 실제 출처는 고객 확인 필요.**

"ig"는 코드베이스 어디에서도 기본값으로 하드코딩되어 있지 않다. 랜딩페이지의 URL 쿼리 파라미터(`?ref=` 또는 `?utm_source=`) 값이 그대로 저장되는 구조이므로, "ig" 값은 누군가 해당 파라미터가 포함된 URL을 통해 랜딩에 접속했다는 의미다.

**그러나 어느 광고/링크가 `ig`를 파라미터로 실어 보내는지는 코드만으로 확인할 수 없으며, 고객(마케팅팀/광고 운영자)이 직접 설정한 URL을 확인해야 한다.** 따라서 "ig = 인스타그램"이라고 단정하지 않는다.

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

## 결론

- 코드베이스 어디에도 `"ig"` 를 기본값/하드코딩하지 않음
- **유입 경로**: 인스타그램 광고 또는 프로필 링크의 URL에 `?ref=ig` 또는 `?utm_source=ig` 파라미터가 포함됨
- **유입 흐름**: 사용자가 인스타그램에서 링크 클릭 → 랜딩 도달 → 파라미터 읽혀서 sessionStorage에 저장 → 폼 제출 시 `ref: "ig"`로 전송 → DB에 `source_ref = 'ig'`로 기록
- **정상 동작**. 의도치 않은 값이 아님.

## 권장 조치

### 1단계 — 고객 확인 (선행 필수)

임의로 라벨 매핑을 적용하기 전에 다음을 먼저 확인한다:

- 현재 운영 중인 광고/프로모션/프로필 링크 중 `?ref=ig` 또는 `?utm_source=ig` 파라미터가 붙은 URL이 있는지
- 있다면 어느 채널(인스타그램/틱톡/당근 등)의 링크인지
- 없다면 "ig" 값이 어디서 들어왔는지는 로그/레퍼러 분석 필요

**확인 전까지 "ig = 인스타그램"이라 단정하지 않는다.** 코드만으로는 파라미터 출처를 역추적할 수 없다.

### 2단계 — 확인 완료 후 라벨 매핑

고객이 "ig = 인스타그램 광고에서 설정한 값"이라고 확인해 주면:

- `src/lib/source-ref.ts`의 `SOURCE_REF_LABELS`에 `ig: "인스타그램"` 추가 (확정 매핑)
- 표시 단계에서만 한글화. DB 저장값은 원본 유지

다른 값(`tk`, `dg` 등)도 동일하게 **확인된 값만** 추가한다.

### 3단계 — 필요 시 마케팅업체 등록

`ig` 값으로 들어온 상담을 특정 업체 운영 실적으로 정산해야 한다면 마케팅업체 관리 화면에서 해당 업체를 등록한다. `submit/route.ts:118-`의 자동 매칭 로직이 처리.

## 확인 요청 항목

- [ ] 마케팅팀/운영팀: 현재 운영 중인 URL에 `?ref=ig` 또는 `?utm_source=ig` 설정된 것이 있는지 확인
- [ ] 있다면 어느 채널/광고인지 알려주기 (인스타/틱톡/당근/기타)
- [ ] 확인 결과에 따라 `source-ref.ts` 매핑 추가 여부 결정
