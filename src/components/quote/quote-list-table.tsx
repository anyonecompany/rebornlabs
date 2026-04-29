"use client";

import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { QuoteStatusBadge } from "./quote-status-badge";
import { formatAbsoluteDateISO, formatRelativeTime } from "@/src/lib/format-relative-time";

export interface QuoteRow {
  id: string;
  token: string;
  quoteNumber: string;
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  status: "active" | "expired";
  vehicle: {
    id: string;
    vehicleCode: string;
    make: string;
    model: string;
    primaryImageUrl: string | null;
  } | null;
  dealer: { id: string; name: string } | null;
  url: string;
  canExtend: boolean;
}

interface Props {
  quotes: QuoteRow[];
  loading: boolean;
  showDealer: boolean;
  onRowClick: (quote: QuoteRow) => void;
  emptyMessage?: string;
}

function ViewCountCell({
  count,
  last,
}: {
  count: number;
  last: string | null;
}) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <EyeOff className="h-3.5 w-3.5" />
        아직 안 봄
      </span>
    );
  }
  const highlight = count >= 2;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        highlight ? "text-primary font-semibold" : "text-foreground"
      }`}
    >
      <Eye className="h-3.5 w-3.5" />
      {count}회 조회
      {last && (
        <span className="text-[11px] text-muted-foreground font-normal">
          · {formatRelativeTime(last)}
        </span>
      )}
    </span>
  );
}

function ExpiresCell({
  expiresAt,
  status,
}: {
  expiresAt: string | null;
  status: "active" | "expired";
}) {
  if (status === "expired") {
    return (
      <span className="text-xs text-muted-foreground">
        {formatAbsoluteDateISO(expiresAt)}
      </span>
    );
  }
  if (!expiresAt) {
    return <span className="text-xs text-foreground">무제한</span>;
  }
  const diffDays = Math.floor(
    (new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  const soon = diffDays <= 3;
  return (
    <span
      className={`text-xs ${
        soon ? "text-amber-400 font-medium" : "text-foreground"
      }`}
    >
      {formatAbsoluteDateISO(expiresAt)}
      <span className="ml-1 text-[11px] text-muted-foreground">
        (D-{Math.max(0, diffDays)})
      </span>
    </span>
  );
}

export function QuoteListTable({ quotes, loading, showDealer, onRowClick, emptyMessage = "표시할 견적서가 없습니다." }: Props) {
  if (loading) return <LoadingState variant="table" />;
  if (quotes.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <>
      {/* 데스크톱: 테이블 */}
      <div className="hidden md:block rounded-lg border border-border overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground">견적번호</TableHead>
              <TableHead className="text-muted-foreground">차량</TableHead>
              {showDealer && (
                <TableHead className="text-muted-foreground">발급 딜러</TableHead>
              )}
              <TableHead className="text-muted-foreground">생성일</TableHead>
              <TableHead className="text-muted-foreground">유효기간</TableHead>
              <TableHead className="text-muted-foreground">조회</TableHead>
              <TableHead className="text-muted-foreground">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((q) => {
              const label = q.vehicle
                ? `${q.vehicle.make} ${q.vehicle.model}`
                : "-";
              return (
                <TableRow
                  key={q.id}
                  onClick={() => onRowClick(q)}
                  className={`cursor-pointer transition-colors ${
                    q.status === "expired" ? "opacity-60" : ""
                  }`}
                >
                  <TableCell className="py-3 px-4 font-mono text-xs tracking-wider">
                    {q.quoteNumber}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {q.vehicle?.primaryImageUrl ? (
                        <div className="relative w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0">
                          <Image
                            src={q.vehicle.primaryImageUrl}
                            alt={label}
                            fill
                            className="object-cover"
                            sizes="40px"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-muted shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm truncate">{label}</p>
                        <p className="text-[11px] font-mono text-muted-foreground truncate">
                          {q.vehicle?.vehicleCode ?? "-"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  {showDealer && (
                    <TableCell className="py-3 px-4 text-sm">
                      {q.dealer?.name ?? "-"}
                    </TableCell>
                  )}
                  <TableCell className="py-3 px-4 text-xs text-muted-foreground">
                    {formatAbsoluteDateISO(q.createdAt)}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <ExpiresCell expiresAt={q.expiresAt} status={q.status} />
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <ViewCountCell count={q.viewCount} last={q.lastViewedAt} />
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <QuoteStatusBadge status={q.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 모바일: 카드 리스트 */}
      <div className="md:hidden space-y-2">
        {quotes.map((q) => {
          const label = q.vehicle
            ? `${q.vehicle.make} ${q.vehicle.model}`
            : "-";
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onRowClick(q)}
              className={`w-full text-left rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent ${
                q.status === "expired" ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                {q.vehicle?.primaryImageUrl ? (
                  <div className="relative w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
                    <Image
                      src={q.vehicle.primaryImageUrl}
                      alt={label}
                      fill
                      className="object-cover"
                      sizes="56px"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-md bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{label}</p>
                    <QuoteStatusBadge status={q.status} />
                  </div>
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
                    {q.quoteNumber}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <ViewCountCell count={q.viewCount} last={q.lastViewedAt} />
                    <ExpiresCell expiresAt={q.expiresAt} status={q.status} />
                  </div>
                  {showDealer && q.dealer && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      딜러 · {q.dealer.name}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
