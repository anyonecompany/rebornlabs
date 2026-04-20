# 인시던트 리포트 — "ig" 유입경로 출처 조사

> 작성일: 2026-04-20
> 담당: BE-Developer (Sonnet)
> 관련 이슈: 상담 유입경로에 "ig" 값이 보이는데 마케팅업체 목록에 없음

## 요약

**결론: 정상 동작.** "ig"는 인스타그램 광고/링크의 URL 쿼리 파라미터 (`?ref=ig` 또는 `?utm_source=ig`)에서 유입된 값이다. 코드베이스 어디에서도 "ig"를 기본값으로 하드코딩하지 않는다.

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

### 옵션 A — 표시 라벨 매핑 (즉시 적용 가능, 권장)

어드민 상담 목록에서 `source_ref === 'ig'`를 "인스타그램"으로 표시:

```tsx
// app/(auth)/consultations/page.tsx
{
  key: "source_ref",
  header: "유입경로",
  render: (value: unknown) => {
    const v = value as string | null;
    if (!v || v === "direct") return <span className="text-muted-foreground">직접</span>;
    if (v === "ig" || v === "instagram") return <span>인스타그램</span>;
    return <span>{decodeURIComponent(v)}</span>;
  },
},
```

**사용자가 "ig 라벨 매핑 방향"을 결정하는 것이 우선이라 이번 핫픽스에서는 UI 수정하지 않음.** CTO 결재 후 별건으로 진행 권장.

### 옵션 B — 마케팅업체로 등록 (선택)

어드민의 마케팅업체 관리 화면에서 "인스타그램"(name="ig") 레코드를 추가하면 자동 매칭되어 수익배분 대상에 포함된다. **단, 인스타 광고를 특정 업체의 운영 실적으로 분리해 정산해야 하는 경우에만.**

### 옵션 C — 운영팀 확인 필요

- 현재 운영 중인 인스타그램 광고 URL에 `?ref=ig` 파라미터가 설정되어 있는지 CTO/마케팅팀 확인
- 만약 `?ref=instagram` 또는 다른 값으로 통일하고자 한다면 광고 URL만 수정하면 됨 (코드 변경 불필요)

## 확인 요청 항목

- [ ] CTO: ig 라벨 매핑(옵션 A) 적용할지 결정
- [ ] CTO: 인스타그램을 마케팅업체로 등록(옵션 B)할지 결정
- [ ] 마케팅팀: 현재 운영 광고 URL에 `?ref=ig` 설정되어 있는지 확인
