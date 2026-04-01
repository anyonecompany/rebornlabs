"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
import type { VehicleStatus, UserRole } from "@/types/database";

interface VehicleRow {
  id: string;
  vehicle_code: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  selling_price: number;
  deposit: number;
  monthly_payment: number;
  purchase_price?: number;
  margin?: number;
  status: VehicleStatus;
  photos: string[];
  created_at: string;
}

/** 숫자를 한국 원화 형식으로 포맷합니다. */
function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

/** 주행거리를 km 단위로 포맷합니다. */
function formatMileage(value: number): string {
  return value.toLocaleString("ko-KR") + "km";
}

export default function VehiclesPage() {
  const router = useRouter();

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { role: userRole } = useUserRole();

  // 검색/필터 상태
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "all">("all");

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/vehicles");
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "차량 목록을 불러오지 못했습니다.");
        return;
      }
      const data = await res.json();
      // API 응답: { data: [...], nextCursor }
      setVehicles(data.data ?? []);
    } catch {
      toast.error("차량 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  // 클라이언트 사이드 필터링
  const filtered = vehicles.filter((v) => {
    const searchLower = search.toLowerCase();
    const matchSearch =
      !search ||
      v.make.toLowerCase().includes(searchLower) ||
      v.model.toLowerCase().includes(searchLower) ||
      v.vehicle_code.toLowerCase().includes(searchLower);
    const matchStatus = statusFilter === "all" || v.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const isPrivileged = userRole === "admin" || userRole === "staff";

  // 기본 컬럼
  const baseColumns = [
    { key: "vehicle_code", header: "차량코드" },
    { key: "make", header: "차종" },
    { key: "model", header: "모델" },
    { key: "year", header: "연식" },
    {
      key: "mileage",
      header: "주행거리",
      render: (value: unknown) => formatMileage(value as number),
    },
    {
      key: "selling_price",
      header: "판매가",
      render: (value: unknown) => formatKRW(value as number),
    },
    {
      key: "deposit",
      header: "보증금",
      render: (value: unknown) => formatKRW(value as number),
    },
    {
      key: "monthly_payment",
      header: "월납입료",
      render: (value: unknown) => formatKRW(value as number),
    },
    {
      key: "status",
      header: "상태",
      render: (value: unknown) => (
        <StatusBadge type="vehicle" value={value as VehicleStatus} />
      ),
    },
  ];

  // admin/staff 추가 컬럼
  const privilegedColumns = [
    {
      key: "purchase_price",
      header: "매입가",
      render: (value: unknown) =>
        value != null ? formatKRW(value as number) : "—",
    },
    {
      key: "margin",
      header: "마진",
      render: (value: unknown) =>
        value != null ? formatKRW(value as number) : "—",
    },
  ];

  const columns = isPrivileged
    ? [...baseColumns, ...privilegedColumns]
    : baseColumns;

  return (
    <div>
      <PageHeader title="차량 관리">
        {isPrivileged && (
          <Button onClick={() => router.push("/vehicles/new")}>
            <Plus className="h-4 w-4 mr-2" />
            차량 등록
          </Button>
        )}
      </PageHeader>

      {/* 검색 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="차종, 모델, 차량코드로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as VehicleStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="상태 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="available">출고가능</SelectItem>
            <SelectItem value="consulting">상담중</SelectItem>
            <SelectItem value="vehicle_waiting">차량대기</SelectItem>
            <SelectItem value="sold">판매완료</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="등록된 차량이 없습니다."
        onRowClick={(row) =>
          router.push(`/vehicles/${(row as unknown as VehicleRow).id}`)
        }
      />
    </div>
  );
}
