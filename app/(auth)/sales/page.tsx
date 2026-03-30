"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
import { createBrowserClient } from "@/src/lib/supabase/browser";
import { apiFetch } from "@/src/lib/api-client";
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

/** 숫자를 한국 원화 형식으로 포맷합니다. */
function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

/** ISO 날짜를 한국 날짜 형식으로 포맷합니다. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function SalesPage() {
  const router = useRouter();

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole>("dealer");
  const [cancelFilter, setCancelFilter] = useState<CancelFilter>("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // 프로필 로드 (role 확인)
  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          if (data?.role) setUserRole(data.role as UserRole);
        });
    });
  }, []);

  // 판매 목록 로드
  const fetchSales = useCallback(
    async (cursor?: string) => {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const params = new URLSearchParams();
        if (cursor) params.set("cursor", cursor);
        if (cancelFilter === "active") params.set("is_cancelled", "false");
        if (cancelFilter === "cancelled") params.set("is_cancelled", "true");

        const res = await apiFetch(`/api/sales?${params.toString()}`);
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error ?? "판매 목록을 불러오지 못했습니다.");
          return;
        }
        const data = await res.json();
        if (cursor) {
          setSales((prev) => [...prev, ...(data.data ?? [])]);
        } else {
          setSales(data.data ?? []);
        }
        setNextCursor(data.nextCursor ?? null);
      } catch {
        toast.error("판매 목록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cancelFilter],
  );

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const isPrivileged = userRole === "admin" || userRole === "staff";

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
      <PageHeader title="판매 관리">
        {isPrivileged && (
          <Button onClick={() => router.push("/sales/new")}>
            <Plus className="h-4 w-4 mr-2" />
            직접 판매 등록
          </Button>
        )}
      </PageHeader>

      {/* 필터 */}
      <div className="flex items-center gap-3 mb-4">
        <Select
          value={cancelFilter}
          onValueChange={(v) => setCancelFilter(v as CancelFilter)}
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
          router.push(`/sales/${sale.id}`);
        }}
      />

      {/* 더 보기 */}
      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchSales(nextCursor)}
            disabled={loadingMore}
          >
            {loadingMore ? "로딩 중..." : "더 보기"}
          </Button>
        </div>
      )}
    </div>
  );
}
