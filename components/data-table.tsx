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
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";

type RenderFn = (value: unknown, row: Record<string, unknown>) => React.ReactNode;

interface Column {
  key: string;
  header: string;
  render?: RenderFn;
  className?: string;
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
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className={`text-muted-foreground align-middle ${col.className ?? ""}`}>
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
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={[
                  "data-table-row transition-colors",
                  onRowClick
                    ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={`py-3 px-4 align-middle ${col.className ?? ""}`}>
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
      <Pagination
        currentPage={page + 1}
        totalPages={totalPages}
        onPageChange={(next) => setPage(next - 1)}
        totalItems={data.length}
        pageSize={pageSize}
      />
    </div>
  );
}
