"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** 현재 페이지 (1-indexed) */
  page: number;
  /** 전체 페이지 수 */
  totalPages: number;
  /** 페이지 변경 콜백 */
  onChange: (next: number) => void;
  /** 한 블록당 페이지 수. 기본 10 (1-10, 11-20 ...) */
  windowSize?: number;
  /** 비활성화(로딩 중) */
  disabled?: boolean;
}

/**
 * 한국 표준 블록 페이지네이션.
 *
 * 표시:  ‹ 1 2 3 4 5 6 7 8 9 10 ›
 * 11페이지 영역 진입 시:  ‹ 11 12 13 ... 20 ›
 *
 * 화살표는 "이전 블록 / 다음 블록"으로 이동 (블록의 첫/마지막 페이지로 점프).
 * 첫 블록에서 ‹ 비활성, 마지막 블록에서 › 비활성.
 */
export function PageNav({
  page,
  totalPages,
  onChange,
  windowSize = 10,
  disabled = false,
}: Props) {
  if (totalPages <= 1) return null;

  const blockIndex = Math.floor((page - 1) / windowSize);
  const blockStart = blockIndex * windowSize + 1;
  const blockEnd = Math.min(blockStart + windowSize - 1, totalPages);

  const hasPrevBlock = blockStart > 1;
  const hasNextBlock = blockEnd < totalPages;

  const prevBlockTarget = blockStart - 1; // 이전 블록의 마지막 페이지
  const nextBlockTarget = blockEnd + 1; // 다음 블록의 첫 페이지

  const pages: number[] = [];
  for (let i = blockStart; i <= blockEnd; i++) pages.push(i);

  return (
    <nav
      aria-label="페이지 이동"
      className="flex items-center justify-center gap-1 flex-wrap"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(prevBlockTarget)}
        disabled={!hasPrevBlock || disabled}
        aria-label="이전 페이지 묶음"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {pages.map((p) => {
        const isCurrent = p === page;
        return (
          <Button
            key={p}
            type="button"
            variant={isCurrent ? "default" : "outline"}
            size="sm"
            className="h-8 min-w-8 px-2"
            onClick={() => !isCurrent && onChange(p)}
            disabled={disabled}
            aria-current={isCurrent ? "page" : undefined}
            aria-label={`${p}페이지`}
          >
            {p}
          </Button>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(nextBlockTarget)}
        disabled={!hasNextBlock || disabled}
        aria-label="다음 페이지 묶음"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
