"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Car, List, LayoutGrid, ChevronLeft, ChevronRight } from "lucide-react";
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

  // 검색/필터/뷰 상태
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "all">("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("vehicles-view") as "list" | "grid") ?? "list";
    }
    return "list";
  });

  const [gridPage, setGridPage] = useState(0);
  const GRID_PAGE_SIZE = 18; // 3열 × 6행

  const toggleView = (mode: "list" | "grid") => {
    setViewMode(mode);
    setGridPage(0);
    localStorage.setItem("vehicles-view", mode);
  };

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
    {
      key: "photos",
      header: "",
      className: "w-28",
      render: (value: unknown) => {
        const photos = value as string[] | null;
        const src = photos?.[0];
        return src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="rounded-md object-cover w-24 h-[72px] shrink-0" />
        ) : (
          <div className="w-24 h-[72px] rounded-md bg-muted flex items-center justify-center shrink-0"><Car className="w-6 h-6 text-muted-foreground" /></div>
        );
      },
    },
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

      {/* 검색 + 필터 + 뷰 전환 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="차종, 모델, 코드 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as VehicleStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-36">
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
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => toggleView("list")}
            className={`p-2 rounded-md transition-colors ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => toggleView("grid")}
            className={`p-2 rounded-md transition-colors ${viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {viewMode === "list" ? (
        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          loading={loading}
          emptyMessage="등록된 차량이 없습니다."
          onRowClick={(row) =>
            router.push(`/vehicles/${(row as unknown as VehicleRow).id}`)
          }
        />
      ) : (
        /* 썸네일 그리드 뷰 */
        loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="aspect-video bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">등록된 차량이 없습니다.</p>
        ) : (() => {
          const gridTotalPages = Math.ceil(filtered.length / GRID_PAGE_SIZE);
          const gridItems = filtered.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE);
          return (
          <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {gridItems.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => router.push(`/vehicles/${v.id}`)}
                className="text-left rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors"
              >
                {/* 사진 */}
                <div className="relative aspect-video bg-muted">
                  {v.photos?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.photos[0]}
                      alt={`${v.make} ${v.model}`}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Car className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <StatusBadge type="vehicle" value={v.status} />
                  </div>
                </div>
                {/* 정보 */}
                <div className="p-3 space-y-1">
                  <p className="text-xs text-muted-foreground font-mono">{v.vehicle_code}</p>
                  <p className="text-sm font-medium truncate">{v.make} {v.model}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{v.year}년 · {formatMileage(v.mileage)}</span>
                    {v.monthly_payment ? <span className="font-medium text-foreground">월 {formatKRW(v.monthly_payment)}</span> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {gridTotalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{gridPage * GRID_PAGE_SIZE + 1}–{Math.min((gridPage + 1) * GRID_PAGE_SIZE, filtered.length)} / {filtered.length}대</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setGridPage(p => Math.max(0, p - 1))} disabled={gridPage === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2">{gridPage + 1} / {gridTotalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setGridPage(p => Math.min(gridTotalPages - 1, p + 1))} disabled={gridPage === gridTotalPages - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          </div>
          );
        })()
      )}
    </div>
  );
}
