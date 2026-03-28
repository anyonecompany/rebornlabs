# 리본랩스 어드민 구축 — 실행 프롬프트

> KMONG DB 페이지: https://www.notion.so/33037b6f6bf880e0a423d8f871ef9ca4
> KMONG 페이지 ID: 33037b6f-6bf8-80e0-a423-d8f871ef9ca4
> Actionplan callout ID: 33037b6f-6bf8-8016-aa75-f4464561f4e6
> 작업 페이지 DB: https://www.notion.so/Phase-1-DB-33037b6f6bf881a3af64c278f690d5dd
> 납품일: 2026-04-02

## Notion 체크박스 유틸리티

```bash
# 섹션별 체크박스 목록 조회
scripts/product-sync/notion-checkbox.sh list_todos "33037b6f-6bf8-8016-aa75-f4464561f4e6" "데이터베이스 설계"

# 텍스트로 찾아 체크
scripts/product-sync/notion-checkbox.sh check_by_text "33037b6f-6bf8-8016-aa75-f4464561f4e6" "사용자 프로필 테이블" "데이터베이스 설계"

# block_id로 직접 체크
scripts/product-sync/notion-checkbox.sh check "block_id"

# Phase 진행 현황 확인
scripts/product-sync/notion-checkbox.sh check_all_phase "33037b6f-6bf8-8016-aa75-f4464561f4e6" "데이터베이스 설계"
```

## Notion 섹션 ↔ Phase 매핑

| Phase | Notion 섹션 | to_do 수 |
|-------|-----------|---------|
| Phase 1 | 1. 데이터베이스 설계 및 생성 | 13 |
| Phase 2 | 2. 인증 및 권한 시스템 | 8 |
| Phase 3 | 3. 사용자 관리 기능 + 4. 미들웨어 및 라우팅 | ~10 |
| Phase 4+ | 5~14. 나머지 기능 구현 | ~53 |

---

## Phase 1: DB 설계 + 문서

### 세션 시작
```
tmux new-session -s rebornlabs-db && claude
```

### Notion 체크박스 (섹션: "1. 데이터베이스 설계 및 생성", 13개)

작업 완료 시 체크할 항목:
```
□ 사용자 프로필 테이블을 생성하고, 역할(경영진/직원/딜러/미승인) 구분과 활성 상태를 저장할 수 있도록 구성한다
□ 차량 테이블을 생성하고, 마진이 판매가-매입가로 자동 계산되도록 설정한다
□ 차량 ID가 RB-2026-001 형태로 등록 시 자동 발급되도록 시퀀스와 트리거를 설정한다
□ 상담 테이블을 생성하고, 유입채널(UTM), 배정 딜러, 마케팅업체, 중복 여부를 저장할 수 있도록 구성한다
□ 상담 기록 테이블을 생성하여 딜러가 남기는 통화 내용과 상태 변경을 저장한다
□ 판매 테이블을 생성하고, DB제공 여부에 따른 수당/수수료 금액과 취소 정보를 저장할 수 있도록 구성한다
□ 출고 체크리스트 테이블을 생성하고, 차량+딜러 조합당 하나만 생성 가능하도록 제약을 건다
□ 지출결의 테이블을 생성하고, 금액이 0보다 큰 값만 입력되도록 제약을 건다
□ 공통 문서함 테이블을 생성하고, 카테고리(사업자등록증/계약서/기타)를 선택할 수 있도록 한다
□ 감사 로그 테이블을 생성하여 누가 언제 무엇을 했는지 자동 기록되도록 한다
□ 랜딩페이지 스팸 방지용 요청 제한 테이블을 생성하고, 일반 사용자가 직접 접근하지 못하도록 차단한다
□ 모든 테이블에 수정일시가 데이터 변경 시 자동으로 갱신되는 트리거를 적용한다
□ 차량 상태, 상담 전화번호, 상담 상태, 판매 날짜 등 자주 조회되는 컬럼에 인덱스를 생성한다
```

### 실행 프롬프트 (복사용)

아래의 프롬프트를 Phase 1 세션에서 실행:

→ 이 프롬프트의 전체 내용은 사용자가 제공한 "Phase 1 가상 개발팀 최종 프롬프트" 참조

---

## Phase 2: 인증 + RLS + 스토리지 SQL

### 세션 시작
```
tmux new-session -s rebornlabs-rls && claude
```

### Notion 체크박스 (섹션: "2. 인증 및 권한 시스템", 8개)

### 실행 프롬프트

→ 사용자 제공 "Phase 2 가상 개발팀 최종 프롬프트" 참조

---

## Phase 3: Next.js 어드민 프로젝트 셸

### 세션 시작
```
tmux new-session -s rebornlabs-fe && claude
```

### Notion 체크박스 (섹션: "3. 사용자 관리 기능" + "4. 미들웨어 및 라우팅")

### 실행 프롬프트

→ 사용자 제공 "Phase 3 가상 개발팀 최종 프롬프트" 참조

---

## Phase 4: Supabase 연결 + DB 적용 (계정 확보 후)

Phase 3 승인 시 프롬프트 생성 예정.
