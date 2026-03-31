"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { ChevronLeft, ChevronRight } from "lucide-react";

type RenderFn = (value: unknown, row: Record<string, unknown>) => React.ReactNode;

interface Column {
  key: string;
  header: string;
  render?: RenderFn;
}

interface DataTableProps {
  /** 컬럼 정의 */
  columns: Column[];
  /** 데이터 */
  data: Record<string, unknown>[];
  /** 로딩 여부 */
  loading?: boolean;
  /** 데이터 없을 때 메시지 */
  emptyMessage?: string;
  /** 페이지당 표시 수 (기본: 20) */
  pageSize?: number;
  /** 행 클릭 핸들러 */
  onRowClick?: (row: Record<string, unknown>) => void;
}

/**
 * 페이지네이션이 포함된 데이터 테이블 컴포넌트.
 * shadcn Table 기반, 이전/다음 버튼 방식의 offset 페이지네이션을 사용합니다.
 */
export function DataTable({
  columns,
  data,
  loading = false,
  emptyMessage = "데이터가 없습니다.",
  pageSize = 20,
  onRowClick,
}: DataTableProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(data.length / pageSize);
  const pageData = data.slice(page * pageSize, (page + 1) * pageSize);

  if (loading) return <LoadingState variant="table" />;

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className="text-muted-foreground">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  "data-table-row transition-colors",
                  onRowClick ? "cursor-pointer" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className="py-3 px-4">
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, data.length)} / {data.length}개
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
