# 차량 리스트 — 적용 가이드 (CTO용)

> 작성: 2026-04-21
> 대상 마이그레이션: `supabase/migrations/20260421_vehicle_models.sql`
> 적용자: CTO (Supabase Dashboard → SQL Editor) + 엑셀 업로드

## 사전 확인

- [ ] Supabase Dashboard 접속 가능
- [ ] Phase 1 조직 구조 마이그레이션 이미 적용됨 (user_role enum 확장 + 기존 `update_updated_at()` 함수 존재)
- [ ] Vercel `NEXT_PUBLIC_APP_URL` 설정됨 (공개 페이지에서 API 호출 베이스)

---

## Step 1 — 마이그레이션 SQL 실행

SQL Editor에서 `supabase/migrations/20260421_vehicle_models.sql` 전체 복사 → 실행.

적용 내용:
- `vehicle_models` 테이블
- 인덱스 2개 (`brand-active`, `display_order`)
- `trg_vehicle_models_updated_at` 트리거 (기존 `update_updated_at()` 재사용)
- RLS 정책 2개 (`vm_admin_staff_all`, `vm_public_select`)

### 검증 쿼리

```sql
-- 1) 테이블 컬럼
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name='vehicle_models' ORDER BY ordinal_position;

-- 2) 인덱스
SELECT indexname FROM pg_indexes WHERE tablename='vehicle_models';

-- 3) 정책 (2개)
SELECT policyname FROM pg_policies WHERE tablename='vehicle_models';

-- 4) 트리거
SELECT trigger_name FROM information_schema.triggers
 WHERE event_object_table='vehicle_models';
```

---

## Step 2 — 엑셀 데이터 import

1. 어드민 사이트 로그인 → 사이드바 "차량 모델 관리" 클릭
2. 우상단 "엑셀 가져오기" 버튼 → `고객용+페이지.xlsx` 업로드
3. 결과 카드에서 브랜드별 카운트 확인 (예상: 벤츠 16, BMW 12, 제네시스 12 등)
4. 파싱 경고 0건 확인

### DB 직접 검증

```sql
-- 총 건수
SELECT COUNT(*) FROM vehicle_models;           -- 기대: 80

-- 브랜드별
SELECT brand, COUNT(*) FROM vehicle_models
 GROUP BY brand ORDER BY COUNT(*) DESC;

-- 벤츠 C200 샘플 (공식 검증)
SELECT brand, model, trim, car_price, max_deposit
  FROM vehicle_models
 WHERE brand='벤츠' AND model='C 클래스' AND trim='C200';
-- 기대: car_price=22000000, max_deposit=5000000
-- 추가가격: 22000000*1.35 = 29700000
-- 월납입: 29700000/60 = 495000
```

---

## Step 3 — 공개 페이지 확인

### 비로그인 브라우저(시크릿)

1. `https://{domain}/cars` 접근 → 브랜드 그리드 표시
2. 벤츠 선택 → 모델 리스트 표시
3. C 클래스 선택 → 등급 1개라 자동 선택 + 가격 카드 표시
4. 가격 카드 값 검증:
   - 차량 가격 22,000,000원
   - 추가된 가격 29,700,000원
   - 월 납입료 495,000원 (강조)
   - 최대 보증금 5,000,000원
5. "상담 신청하기" 버튼 클릭 → `/consultation/new?vehicle_model_id=&brand=&model=&trim=` 쿼리 파라미터 확인

### URL 직접 접근

`https://{domain}/cars?brand=벤츠&model=C 클래스&trim=C200` → 가격 카드 바로 표시

### 캐싱

- 공개 API는 5분 `revalidate`
- 어드민에서 신규 등록/비활성화 후 즉시 반영 원하면 CDN 갱신 or 5분 대기

---

## Step 4 — 어드민 기능 검증

1. admin/staff 계정 → `/vehicle-models` 접근 가능
2. dealer 계정 → `/vehicle-models` 접근 시 `/dashboard` 리다이렉트 확인
3. 신규 등록 모달 → 중복 `(brand, model, trim)` 입력 시 "이미 등록된 조합" 에러
4. 행 수정 → 반영 확인
5. 비활성화 토글 → `/cars` 공개 페이지에서 미노출 확인 (5분 캐시 이내면 시간 대기)

---

## 롤백

```sql
BEGIN;

-- 감사 로그 남아도 무해 (vehicle_models 자체만 제거)
DROP POLICY IF EXISTS vm_public_select    ON vehicle_models;
DROP POLICY IF EXISTS vm_admin_staff_all  ON vehicle_models;
DROP TRIGGER IF EXISTS trg_vehicle_models_updated_at ON vehicle_models;
DROP INDEX IF EXISTS idx_vehicle_models_display_order;
DROP INDEX IF EXISTS idx_vehicle_models_brand_active;
DROP TABLE IF EXISTS vehicle_models;

COMMIT;
```

---

## 주의사항

- **기존 `vehicles` 테이블과 완전 독립**: 본 기능은 카탈로그 전용. 재고 관리는 건드리지 않음
- **공식 재계산**: 추가가격·월납입료는 DB에 저장하지 않고 `src/lib/vehicle-price.ts`의 공식으로 재계산. 공식 변경 시 해당 파일만 수정하면 모든 페이지 반영
- **forward-fill**: 엑셀 병합 셀은 파싱 시 직전 값 상속. 별도 정리 불필요
- **upsert 동작**: 동일 브랜드+모델+등급 다시 업로드 시 car_price/max_deposit만 갱신. display_order는 엑셀 순서대로 재할당
- **비활성화는 is_active=false 로 soft-delete**. 영구 삭제는 admin `/api/vehicle-models/[id]` DELETE만 가능
- **공개 API 캐싱**: 5분. 즉시 반영이 필요하면 운영 배포 시 `revalidate` 조정
