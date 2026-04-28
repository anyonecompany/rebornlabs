"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface Props {
  /** 직접 URL로 진입해서 history가 비어있을 때 fallback 경로 */
  href: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * 디테일 → 리스트 복귀용 링크.
 *
 * 정상 흐름(리스트에서 들어온 경우): router.back() → 리스트의 필터·페이지·스크롤 복원
 * 비정상 흐름(직접 URL 진입): href로 fallback 이동
 *
 * 기존 `<Link href="/list">` 또는 `router.push("/list")`를 대체하는 용도.
 */
export function BackLink({ href, children, className }: Props) {
  const router = useRouter();
  const onClick = (e: React.MouseEvent) => {
    if (typeof window === "undefined") return;
    // history.length가 1이면 직접 진입 — Link 기본 동작에 맡김
    if (window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  };
  return (
    <Link
      href={href}
      onClick={onClick}
      className={
        className ??
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      }
    >
      <ChevronLeft className="h-4 w-4" />
      {children}
    </Link>
  );
}
