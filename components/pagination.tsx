"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationProps {
  /** 현재 페이지 (1-indexed) */
  currentPage: number;
  /** 전체 페이지 수 */
  totalPages: number;
  /** 페이지 변경 콜백 */
  onPageChange: (page: number) => void;
  /** 전체 아이템 수 (정보 라인 표시용) */
  totalItems?: number;
  /** 페이지당 아이템 수 (정보 라인 표시용) */
  pageSize?: number;
  /** 추가 클래스명 */
  className?: string;
}

/**
 * 현재 페이지 기준으로 표시할 페이지 번호 목록을 계산한다.
 * 7페이지 이하면 모두 표시, 초과 시 "..." ellipsis 삽입.
 */
function buildPageItems(
  currentPage: number,
  totalPages: number,
): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: (number | "...")[] = [];

  // 항상 첫 페이지 포함
  items.push(1);

  // 현재 페이지 좌우 1개 범위
  const rangeStart = Math.max(2, currentPage - 1);
  const rangeEnd = Math.min(totalPages - 1, currentPage + 1);

  // 첫 페이지와 범위 사이 ellipsis
  if (rangeStart > 2) {
    items.push("...");
  }

  for (let i = rangeStart; i <= rangeEnd; i++) {
    items.push(i);
  }

  // 범위와 마지막 페이지 사이 ellipsis
  if (rangeEnd < totalPages - 1) {
    items.push("...");
  }

  // 항상 마지막 페이지 포함
  items.push(totalPages);

  return items;
}

/**
 * shadcn-style 페이지네이션 컴포넌트.
 * 1-indexed, ellipsis 자동 삽입, 정보 라인 표시 지원.
 * totalPages가 1 이하이면 null을 반환한다.
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  className,
}: PaginationProps) {
  // 1페이지뿐이면 렌더링하지 않는다
  if (totalPages <= 1) return null;

  const pageItems = buildPageItems(currentPage, totalPages);

  const showInfo =
    totalItems !== undefined &&
    pageSize !== undefined &&
    totalItems > 0 &&
    pageSize > 0;

  const infoStart = showInfo ? (currentPage - 1) * pageSize! + 1 : 0;
  const infoEnd = showInfo ? Math.min(currentPage * pageSize!, totalItems!) : 0;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* 정보 라인: totalItems와 pageSize 둘 다 있을 때만 표시 */}
      {showInfo && (
        <p className="text-xs text-muted-foreground">
          {infoStart}–{infoEnd} / {totalItems}건
        </p>
      )}

      {/* 컨트롤 라인 */}
      <div
        className="flex items-center gap-1"
        role="navigation"
        aria-label="페이지네이션"
      >
        {/* 이전 페이지 버튼 */}
        <Button
          variant="ghost"
          className="h-9 min-w-9 px-2"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="이전 페이지"
        >
          <ChevronLeft className="size-4" />
        </Button>

        {/* 페이지 번호 버튼 및 ellipsis */}
        {pageItems.map((item, index) => {
          if (item === "...") {
            return (
              <span
                key={`ellipsis-${index}`}
                className="flex h-9 min-w-9 items-center justify-center text-sm text-muted-foreground select-none"
                aria-hidden="true"
              >
                …
              </span>
            );
          }

          const isCurrentPage = item === currentPage;

          return (
            <Button
              key={item}
              variant={isCurrentPage ? "default" : "ghost"}
              className="h-9 min-w-9 px-2"
              onClick={() => onPageChange(item)}
              aria-label={`${item}페이지로 이동`}
              aria-current={isCurrentPage ? "page" : undefined}
            >
              {item}
            </Button>
          );
        })}

        {/* 다음 페이지 버튼 */}
        <Button
          variant="ghost"
          className="h-9 min-w-9 px-2"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="다음 페이지"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
