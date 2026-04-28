"use client";

import { useEffect } from "react";

interface Props {
  /** true이면 페이지 이탈/새로고침/탭 닫기 시 브라우저 표준 확인 다이얼로그 표시 */
  isDirty: boolean;
}

/**
 * 폼이 미저장 변경사항을 가진 동안 beforeunload 가드 활성화.
 *
 * 사용 예:
 *   const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
 *   ...
 *   <UnsavedChangesGuard isDirty={isDirty} />
 */
export function UnsavedChangesGuard({ isDirty }: Props) {
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
  return null;
}
