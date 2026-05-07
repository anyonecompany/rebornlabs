## 변경 요약

<!-- 무엇을 왜 바꿨는지 1-3줄 -->

## RBAC 변경 체크리스트 (해당 시)

- [ ] `lib/auth/capabilities.ts` CAPABILITIES 매트릭스 갱신
- [ ] `supabase/migrations/.../has_capability.sql` SQL 함수 갱신 (TS와 동기화)
- [ ] `tests/rbac/matrix.test.ts`에 신규 capability/역할 시나리오 추가
- [ ] 신규 API 라우트는 `verifyUser` + `requireCapability` 또는 `dataScope` 사용
- [ ] service_role 사용 시 앱 레이어 명시 필터 적용 (RLS 우회 시 누수 차단)
- [ ] 신규 RLS 정책은 `has_capability()` 호출 (`scripts/check-rls-policies.ts` 통과)

## 검증

- [ ] `npm run typecheck` 통과
- [ ] `npm run lint` 통과
- [ ] `npm run test` 통과
- [ ] `npm run build` 통과
- [ ] (RLS 변경 시) `npx tsx scripts/check-rls-policies.ts` 통과
- [ ] (수동) 영향 받는 역할로 실제 시나리오 재현

## 사고 회귀 매핑 (보안 변경 시)

<!-- 이 변경이 어떤 사고 패턴(B/C/D/E)을 차단하거나 회귀시킬 수 있는지 -->

## 스크린샷 / 결과

<!-- UI 변경 시 -->
