# 역할별 접근 권한 매트릭스

> Reborn Labs Admin — Phase 2: 인증 및 권한 시스템
> 최종 갱신: 2026-03-27

## 범례

| 기호 | 의미 |
|------|------|
| C | Create (INSERT) |
| R | Read (SELECT) |
| U | Update |
| D | Delete |
| — | 차단 (정책 없음) |
| ★ | RLS bypass (자동) |
| self | 본인 레코드만 |
| own | 본인 폴더/건만 |

---

## 테이블 (10개)

| 테이블 | admin | staff | dealer | pending | anon | service_role |
|--------|-------|-------|--------|---------|------|-------------|
| **profiles** | CRUD | R / U(self) | R(self) U(self) | R(self) | — | ★ |
| **vehicles** | CRUD | CRUD | — (뷰만) | — | — | ★ |
| **consultations** | CRUD | CRUD | R(own) | — | — | ★ |
| **consultation_logs** | R / C | R / C | R(own) C(own) | — | — | ★ |
| **sales** | CRUD | CRUD | R(own) | — | — | ★ |
| **delivery_checklists** | R | R | CRUD(own) | — | — | ★ |
| **expenses** | CRUD | CRUD | — | — | — | ★ |
| **documents** | CRUD | R / C | R | — | — | ★ |
| **audit_logs** | R | — | — | — | — | ★ |
| **rate_limits** | — | — | — | — | — | ★ |

### 테이블 정책 상세

- **profiles**: staff는 전체 목록 조회 가능하나 UPDATE는 본인만. dealer/pending은 본인 프로필만.
- **vehicles**: dealer는 직접 SELECT 불가. `vehicles_dealer_view`를 통해서만 조회 (매입가/마진 제외).
- **consultations**: dealer는 `assigned_dealer_id = auth.uid()` 건만 조회. UPDATE 불가 (상태 변경은 admin/staff만).
- **consultation_logs**: dealer는 본인이 작성한 로그만 조회 + 본인 건에만 INSERT.
- **sales**: dealer는 본인 딜러 건만 조회. INSERT는 `complete_sale()` RPC(SECURITY DEFINER)를 통해서만.
- **delivery_checklists**: dealer는 본인 건에 대해 CRUD 전체 가능.
- **expenses**: dealer 접근 완전 차단.
- **documents**: dealer는 조회만. 업로드는 admin/staff. 삭제는 admin만.
- **audit_logs**: 경영진(admin)만 열람. INSERT는 SECURITY DEFINER 함수 또는 service_role만.
- **rate_limits**: 모든 역할 차단. service_role만 접근.

---

## 보안 뷰 (2개)

| 뷰 | admin | staff | dealer | pending | anon | service_role |
|----|-------|-------|--------|---------|------|-------------|
| **vehicles_dealer_view** | R | R | R | — | — | ★ |
| **dealers_name_view** | R | R | R | — | — | ★ |

### 뷰 상세

- **vehicles_dealer_view**: `purchase_price`, `margin` 컬럼 제외. `deleted_at IS NULL AND status != 'deleted'` 필터. SECURITY DEFINER로 vehicles RLS bypass. 뷰 내부에서 `auth.user_role() IN ('admin','staff','dealer')` 필터로 pending/anon 차단.
- **dealers_name_view**: `profiles WHERE role = 'dealer'`에서 `id`, `name`만 노출. `email`, `phone`, `is_active` 숨김. 뷰 내부에서 `auth.user_role() IN ('admin','staff','dealer')` 필터로 pending/anon 차단.

---

## 스토리지 버킷 (6개)

| 버킷 | admin | staff | dealer | pending | anon | service_role |
|------|-------|-------|--------|---------|------|-------------|
| **vehicles** | R/C/U/D | R/C/U/D | R | — | — | ★ |
| **checklists** | R/C/U/D | R/C/U | C/U(own) R | — | — | ★ |
| **contracts** | R/C/U/D | R/C/U/D | R/C | — | — | ★ |
| **signatures** | R/C/U/D | R/C/U/D | R/C (1회) | — | — | ★ |
| **receipts** | R/C/U/D | R/C/U/D | R | — | — | ★ |
| **documents** | R/C/U/D | R/C/U | R | — | — | ★ |

### 스토리지 상세

- **vehicles**: 차량 사진. admin/staff가 업로드/삭제. 인증 사용자 조회 가능.
- **checklists**: 인도 체크리스트 첨부. dealer는 본인 폴더(`{dealer_id}/`)에만 업로드.
- **contracts**: 계약서. dealer 업로드 가능, 삭제는 admin/staff만.
- **signatures**: 서명 파일. dealer 1회 업로드, 덮어쓰기(UPDATE) 차단. admin/staff만 수정/삭제.
- **receipts**: 영수증. admin/staff만 업로드/삭제.
- **documents**: 공용 문서. admin/staff 업로드. 삭제는 admin만.

---

## service_role 경로

| 경로 | 용도 |
|------|------|
| GAS → `insert_consultation_from_gas()` | 랜딩페이지 폼 → 상담 생성 (RLS bypass) |
| audit_logs INSERT | 감사 로그 기록 (SECURITY DEFINER 함수 내부) |
| `complete_sale()` / `cancel_sale()` | 판매 완료/취소 처리 (SECURITY DEFINER) |
| `get_dashboard_stats()` | 대시보드 통계 조회 (SECURITY DEFINER) |
| `custom_access_token_hook()` | JWT 발급 시 프로필 역할 조회 |
| rate_limits CRUD | 레이트 리미팅 관리 |

---

## JWT Custom Claims

| Claim | 값 | 출처 |
|-------|------|------|
| `user_role` | admin / staff / dealer / pending / none | `custom_access_token_hook()` → `profiles.role` |

- `none`: profiles에 레코드가 없는 사용자 → 모든 정책에서 차단
- RLS 정책은 `auth.user_role()` 헬퍼 함수로 JWT claim을 참조
