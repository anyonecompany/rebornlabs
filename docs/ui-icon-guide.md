# UI 아이콘·이모지 가이드 (어드민)

> 작성: 2026-04-24 / Phase A-5  
> 대상: 모든 어드민 페이지(`app/(auth)/**`) + 공유 컴포넌트

## 원칙

- **lucide-react** 라이브러리 단일 사용. 다른 아이콘 라이브러리 도입 금지.
- 다크 테마 + 전문 톤 → **이모지는 절제**. 시각 잡음·가시성 저하 방지.
- 같은 의미 = 같은 아이콘. 페이지 간 일관성 유지.

## 카테고리별 아이콘

| 도메인·의미 | lucide 아이콘 | 사용처 예시 |
|---|---|---|
| **금액·정산** | `DollarSign` | 수당, 가격, 정산 카드 헤더 |
| **계산·합계** | `Calculator` | 정산 요약 |
| **영수증** | `Receipt` | 지출결의 |
| **시간·일정** | `Clock` | 만료 시각, 진행 중 |
| **달력·날짜** | `Calendar` | 날짜 필터 |
| **사용자(단수)** | `User` | 프로필, 단일 사용자 |
| **사용자(복수)** | `Users` | 사용자 관리, 팀 |
| **사용자 초대** | `UserPlus` | 초대 액션 |
| **차량** | `Car` | 차량 관련 메뉴·카드 |
| **태그·라벨·카탈로그** | `Tag` | 가격 페이지, 분류 |
| **차량 갤러리** | `GalleryVerticalEnd` | 차량 모델 관리 |
| **문서·계약서** | `FileText` | 계약서, 견적서 |
| **폴더·문서함** | `FolderOpen` | 공통 문서함 |
| **메시지·상담** | `MessageSquare` | 상담 |
| **알림·배지** | `Bell` | 알림 토스트 |
| **외부 링크** | `ExternalLink` | 새 탭 열기 (사이드바 외부 메뉴 등) |
| **복사** | `Copy` → `Check` | 복사 버튼 (클릭 후 Check 로 피드백) |
| **추가** | `Plus` | "추가", "등록" 액션 |
| **공유** | `Share2` | 공유 링크 |
| **신용카드·결제** | `CreditCard` | 판매 관리 |
| **상승 추세** | `TrendingUp` | 판매·통계 카드 |
| **조직도** | `Network` | 조직 관리 |
| **감사·보안** | `Shield` | 감사 로그 |
| **그리드/리스트** | `LayoutGrid` / `List` | 뷰 모드 토글 |
| **검색** | `Search` | 검색 입력 |

## 이모지 정책

| 위치 | 이모지 사용 | 근거 |
|---|---|---|
| 빈 상태(`EmptyState`) | ❌ — lucide 큰 아이콘 | 가시성 |
| toast(`sonner`) | ❌ — sonner 자체 ✓/✗ | 중복 |
| 사이드바·페이지 헤더·제목 | ❌ — lucide 통일 | 시각 잡음 |
| 카드·테이블 셀 | ❌ — Badge variant 색으로 구분 | 일관성 |
| Slack 외부 알림 | ✅ 부분 (🚨 Critical 등) | 외부 채널 빠른 인지 |

**예외 허용**: 대표가 명시적으로 특정 위치에 이모지를 요청한 경우만 추가.

## 색 코드 (의미별)

shadcn/ui · Tailwind 사용. 다크 테마 기준.

| 의미 | 색상 키 | 예시 |
|---|---|---|
| 활성·성공·확인 | `emerald-400` (텍스트), `emerald-500/10` (배경) | 활성 Badge, 출고 확인 완료 |
| 경고·주의 | `yellow-400` / `yellow-500/10` | 서명 대기 |
| 오류·취소·삭제 | `red-400` / `red-500/10` | 취소된 판매, 삭제 위험 |
| 정보·강조 | `blue-400` / `blue-500/10` | DB제공, 정보 Badge |
| 비활성·중립 | `zinc-400` / `zinc-500/10` | 비활성 Badge |
| 본문 | `foreground` / `muted-foreground` | 일반 텍스트, 보조 텍스트 |

## 적용 체크리스트

새 페이지·컴포넌트 작성 시:
- [ ] 의미별 lucide 아이콘 사전 매칭
- [ ] EmptyState 사용 (인라인 텍스트 금지)
- [ ] LoadingState 사용 (인라인 스켈레톤 회피)
- [ ] PageHeader title + description 모두 채움
- [ ] toast 메시지 톤: 동작 + "되었습니다"
- [ ] 색상은 의미별 키 따름 (hex 하드코딩 금지)

## 참고

- `src/lib/format.ts` — 통합 포맷 유틸
- `src/constants/messages.ts` — toast 표준 사전
- `components/empty-state.tsx` — 빈 상태 (compact 변형 포함)
- `components/loading-state.tsx` — 로딩 스켈레톤 (variant: card/table/form)
- `components/page-header.tsx` — 페이지 헤더
