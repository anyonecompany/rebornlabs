# 차량 리스트 기능 — 작업 컨텍스트 (보류 중, 2026-04-20 야간)

> 상태: **착수 대기**. 대표님 세부 프롬프트 누락으로 실제 구현은 내일 오전 확정 후 진행.
> 밤사이 작업: 엑셀 구조 분석 + 설계 후보 정리만 수행.

## 1. 밤사이 지시사항 검토

야간 작업 지시 메시지에서 작업 A 세부 프롬프트가 `[위 A 프롬프트 전체를 여기에 포함]` placeholder로만 남아 있고 실제 기능 명세가 누락되어 있었다. 알 수 있는 단서:

- 엑셀 파일에서 80 SKU import
- 공개 URL 가정: `/vehicles`
- 어드민 메뉴명 가정: "차량 모델 관리"
- 상담 신청 연계: URL 파라미터 방식
- 브랜드 로고 없이 텍스트 카드

가정 조합만으로는 스키마/라벨/기능 범위/디자인 명세가 불완전해 착수 시 잘못된 방향으로 갈 위험이 크다.

## 2. 발견된 리스크

### 2-1. 공개 `/vehicles` URL과 어드민 경로 충돌
현재 `app/(auth)/vehicles/` 경로로 어드민 "차량 재고 관리" 페이지가 이미 존재한다. Next.js App Router에서 `(auth)`는 라우트 그룹이므로 URL은 `/vehicles`. 공개 `/vehicles`를 별도로 추가하면 동일 URL 충돌로 빌드 실패.

**옵션 비교**
- A) 기존 어드민을 `/admin/vehicles`로 이동 (기존 링크 다수 수정 필요)
- B) 공개 페이지를 `/cars` 또는 `/catalog`로 변경
- C) 공개 페이지를 `/vehicles/public` 같은 하위 경로로 배치

결정 필요 — 임의로 선택 불가.

### 2-2. 데이터 분리 전략
엑셀 80건은 "차량 모델 카탈로그"(브랜드/모델/등급의 가격표)이고, 기존 `vehicles` 테이블은 "재고 단위 차량"(VIN/plate_number/매입가/마진 포함). 두 개는 **별개 엔티티**로 보이며, 신규 `vehicle_models` 테이블이 필요해 보인다.

그러나 "SKU"라는 용어와 "상담 신청 연계" 정황을 보면 기존 재고 테이블과의 관계가 불명확:
- 카탈로그와 재고는 **완전 독립**인가? (카탈로그 노출 모델 중 재고가 없을 수도)
- 아니면 재고가 있을 때만 공개에 노출?

대표님 의사 필요.

### 2-3. 상담 신청 URL 파라미터 방식
"공개 → 상담 페이지로 URL 파라미터 연계"만 가정되어 있음. 전달할 파라미터(브랜드/모델/등급? 카탈로그 ID? 월 납입료?), 상담 폼 프리필 범위, 상담 레코드의 `interested_vehicle` 필드에 어떻게 기록할지 불명.

## 3. 엑셀 구조 분석 결과

**파일**: `/Users/danghyeonsong/ai-dev-team/projects/rebornlabs/고객용+페이지.xlsx`
**시트**: Sheet1, 89 rows × 9 cols (실데이터 ~80건)

### 안내 문구 (row 6~8)
- "보증금 체크란 클릭시 최대보증금액 클릭 (무보증가능: 보증금이 낮아질 시 연식&Km UP)"
- "이 표는 예상가격임을 인지되야함 / 신용점수에 따라 월납입료는 up & down 가능"
- "무보증도 진행가능 / 다만, 차량의 연식과 km 가 up!!"

### 헤더 (row 9)
```
C: 차종 (브랜드)
D: 모델
E: 등급
F: 차량가격 (기본)
G: (두 번째 가격, 아마 할부 총액 또는 무보증 가격) — **대표님 확인 필요**
H: 월 납입료
I: 최대보증금
```

### 샘플 행 (row 10)
```
벤츠 | C 클래스 | C200 | 22,000,000 | 29,700,000 | 495,000 | 5,000,000
```
- F열 22M을 기준으로 G열 29.7M은 1.35배 → 할부 수수료 포함 총액 추정. 확정 아님.
- 월납입료 495,000 × 36개월 = 17.82M → 29.7M에 못 미침. "월×30 + 보증금" 같은 방식일 수도. 수식 명시 필요.

### 브랜드 ~ 등급 계층 (merge cell 처리)
- C열(브랜드)은 브랜드가 바뀔 때만 입력, 이후 행은 blank (시각적 merge)
- D열(모델)도 같은 패턴. 파싱 시 "마지막으로 채워진 값 유지" 처리 필요.

## 4. 스키마 후보 (구현 시 참고용 초안)

```sql
CREATE TABLE vehicle_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,          -- 벤츠, BMW 등
  model TEXT NOT NULL,          -- C 클래스, 5 시리즈
  trim  TEXT NOT NULL,          -- C200, 520d M Sport
  base_price INTEGER NOT NULL,  -- 차량가격 (원)
  total_price INTEGER,          -- G열 "예상가격" (의미 확정 후)
  monthly_payment INTEGER,      -- 월 납입료
  max_deposit INTEGER,          -- 최대보증금
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand, model, trim)
);

CREATE INDEX idx_vehicle_models_brand ON vehicle_models (brand);
CREATE INDEX idx_vehicle_models_active ON vehicle_models (is_active);
```

## 5. 대표님 확인 요청 항목 (아침 체크리스트)

- [ ] A 세부 프롬프트 공유 (범위/기능/UX 상세)
- [ ] 공개 페이지 URL (`/cars` / `/catalog` / `/vehicles/public` 택일)
- [ ] 기존 `vehicles` 테이블(재고)과의 관계 (독립 카탈로그 vs 재고 연동)
- [ ] 엑셀 G열 "예상가격"의 의미/계산식
- [ ] 상담 연계 파라미터 규격 (모델 ID vs 문자열 요약)
- [ ] 판매완료 차량 제거 or 유지 정책
- [ ] 어드민 CRUD에서 가격 일괄 변경 기능 필요 여부

## 6. 밤사이 실제 수행한 작업

- 엑셀 파일 발견 및 구조 분석 (헤더/계층/값 샘플)
- 스키마 초안 정리 (`vehicle_models` 가설 테이블)
- URL 충돌/데이터 관계/엑셀 수식 의미 등 리스크 3건 식별
- 이 문서(`rebornlabs-vehicle-list-CONTEXT.md`) 작성

**실제 코드/마이그레이션/UI는 작성하지 않음** — 결정 불명 상태에서 구현하면 되돌리기 비용이 큼.

## 7. 내일 오전 재개 시 플로우

1. 위 확인 항목 대표님 답변 수집
2. 이 CONTEXT.md 업데이트 + `rebornlabs-vehicle-list-PLAN.md` 작성
3. 마이그레이션 SQL + Import 스크립트 + CRUD API + 공개 페이지 순서 구현
4. 80 SKU import는 적용 가이드(`APPLY.md`)에 Supabase SQL Editor 순서로 정리
