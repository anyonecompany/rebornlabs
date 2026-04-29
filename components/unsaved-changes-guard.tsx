"use client";

import { useEffect } from "react";

interface Props {
  /** true이면 페이지 이탈/새로고침/탭 닫기 시 브라우저 표준 확인 다이얼로그 표시 */
  isDirty: boolean;
}

const CONFIRM_MSG = "저장하지 않은 변경사항이 있습니다. 페이지를 떠나시겠습니까?";

/**
 * 폼이 미저장 변경사항을 가진 동안 이탈 가드 활성화.
 *
 * 가로채는 이벤트:
 *   1. beforeunload — 새로고침 / 탭 닫기 / 외부 URL 이동
 *   2. popstate    — 브라우저 뒤로가기 / 앞으로가기
 *
 * 한계:
 *   - Next.js App Router의 <Link> 클릭과 router.push()는 가로채지 않음.
 *     (router.events API가 App Router에서 deprecated 됨)
 *   - 사이드바 메뉴 클릭은 후속 PR에서 GuardedLink 또는 전역 store로 처리 예정.
 *
 * 사용 예:
 *   const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
 *   ...
 *   <UnsavedChangesGuard isDirty={isDirty} />
 */
export function UnsavedChangesGuard({ isDirty }: Props) {
  // 1. beforeunload: 새로고침 / 탭 닫기 / 외부 URL 이동
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome/Safari는 returnValue 필요. 텍스트는 모던 브라우저에서 무시되고 표준 메시지가 뜸.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // 2. popstate: 브라우저 뒤로가기 / 앞으로가기
  useEffect(() => {
    if (!isDirty) return;
    const handler = (_e: PopStateEvent) => {
      if (!window.confirm(CONFIRM_MSG)) {
        // 이탈 취소 — history 스택을 다시 현재 URL로 밀어 넣어 이동을 되돌림
        history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [isDirty]);

  return null;
}
