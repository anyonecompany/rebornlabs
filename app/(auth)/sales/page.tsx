"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/src/lib/api-client";
import { formatKRW, formatDate } from "@/src/lib/format";
import { useUserRole } from "@/src/lib/use-user-role";
import { useUrlState } from "@/src/lib/use-url-state";
import { rememberReturnUrl } from "@/src/lib/return-url";
import type { UserRole } from "@/types/database";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------
interface SaleRow {
  id: string;
  vehicle_id: string;
  dealer_id: string;
  actor_id: string;
  consultation_id: string | null;
  is_db_provided: boolean;
  dealer_fee: number;
  marketing_fee: number;
  cancelled_at: string | null;
  created_at: string;
  // 조인 필드
  vehicle_code: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  dealer_name: string | null;
  customer_name: string | null;
}

type CancelFilter = "all" | "active" | "cancelled";

function SalesPageInner() {
  const router = useRouter();

  const PAGE_SIZE = 20;
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { role: userRole } = useUserRole();
  const [cancelFilter, setCancelFilter] = useUrlState<CancelFilter>(
    "cancel",
    "all",
  );
  const [page, setPage] = useUrlState<number>("page", 1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (cancelFilter === "active") params.set("is_cancelled", "false");
      if (cancelFilter === "cancelled") params.set("is_cancelled", "true");

      const res = await apiFetch(`/api/sales?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "판매 목록을 불러오지 못했습니다.");
        return;
      }
      const data = await res.json();
      setSales(data.data ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      toast.error("판매 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, cancelFilter]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const isPrivileged =
    userRole === "admin" ||
    userRole === "staff" ||
    userRole === "director" ||
    userRole === "team_leader";

  const columns = [
    {
      key: "vehicle_code",
      header: "차량코드",
      render: (value: unknown, row: Record<string, unknown>) => {
        const sale = row as unknown as SaleRow;
        return (
          <span className={sale.cancelled_at ? "line-through opacity-60" : ""}>
            {(value as string) ?? "—"}
          </span>
        );
      },
    },
    {
      key: "vehicle_make",
      header: "차종/모델",
      render: (_: unknown, row: Record<string, unknown>) => {
        const sale = row as unknown as SaleRow;
        const label =
          sale.vehicle_make && sale.vehicle_model
            ? `${sale.vehicle_make} ${sale.vehicle_model}`
            : "—";
        return (
          <span className={sale.cancelled_at ? "line-through opacity-60" : ""}>
            {label}
          </span>
        );
      },
    },
    {
      key: "customer_name",
      header: "고객명",
      render: (value: unknown, row: Record<string, unknown>) => {
        const sale = row as unknown as SaleRow;
        return (
          <span className={sale.cancelled_at ? "line-through opacity-60" : ""}>
            {(value as string) ?? "자체 판매"}
          </span>
        );
      },
    },
    {
      key: "dealer_name",
      header: "딜러",
      render: (value: unknown, row: Record<string, unknown>) => {
        const sale = row as unknown as SaleRow;
        return (
          <span className={sale.cancelled_at ? "opacity-60" : ""}>
            {(value as string) ?? "—"}
          </span>
        );
      },
    },
    {
      key: "dealer_fee",
      header: "수당",
      render: (value: unknown, row: Record<string, unknown>) => {
        const sale = row as unknown as SaleRow;
        return (
          <span className={sale.cancelled_at ? "opacity-60" : ""}>
            {formatKRW(value as number)}
          </span>
        );
      },
    },
    {
      key: "marketing_fee",
      header: "수수료",
      render: (value: unknown, row: Record<string, unknown>) => {
        const sale = row as unknown as SaleRow;
        return (
          <span className={sale.cancelled_at ? "opacity-60" : ""}>
            {formatKRW(value as number)}
          </span>
        );
      },
    },
    {
      key: "created_at",
      header: "등록일",
      render: (value: unknown) => formatDate(value as string),
    },
    {
      key: "cancelled_at",
      header: "상태",
      render: (value: unknown) =>
        value ? (
          <StatusBadge type="vehicle" value="deleted" />
        ) : (
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            활성
          </span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="판매 관리"
        description="판매 등록·취소·계약서 발급 현황을 관리합니다."
      >
        <Button onClick={() => router.push("/sales/new")}>
          <Plus className="h-4 w-4 mr-2" />
          직접 판매 등록
        </Button>
      </PageHeader>

      {/* 필터 */}
      <div className="flex items-center gap-3 mb-4">
        <Select
          value={cancelFilter}
          onValueChange={(v) => {
            setCancelFilter(v as CancelFilter);
            if (page !== 1) setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="상태 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="cancelled">취소됨</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={sales as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="등록된 판매가 없습니다."
        onRowClick={(row) => {
          const sale = row as unknown as SaleRow;
          rememberReturnUrl("sales");
          router.push(`/sales/${sale.id}`);
        }}
      />

      {/* 페이지네이션 — page/pageSize */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} / {total}건
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1 || loading}
              aria-label="이전 페이지"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setPage(Math.min(totalPages, page + 1))
              }
              disabled={page >= totalPages || loading}
              aria-label="다음 페이지"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<LoadingState variant="table" />}>
      <SalesPageInner />
    </Suspense>
  );
}
