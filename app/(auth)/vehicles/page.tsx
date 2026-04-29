"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Car, List, LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { Pagination } from "@/components/pagination";
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
import { rememberReturnUrl } from "@/src/lib/return-url";
import { formatKRW, formatMileage } from "@/src/lib/format";
import { useUserRole } from "@/src/lib/use-user-role";
import { useUrlState } from "@/src/lib/use-url-state";
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

function VehiclesPageInner() {
  const router = useRouter();

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { role: userRole } = useUserRole();

  // 검색/필터/뷰 — URL searchParams에 동기화
  const [search, setSearch] = useUrlState<string>("search", "");
  const [statusFilter, setStatusFilter] = useUrlState<VehicleStatus | "all" | "deleted">(
    "status",
    "all",
  );
  const [viewMode, setViewMode] = useUrlState<"list" | "grid">("view", "list");
  const [gridPage, setGridPage] = useUrlState<number>("page", 0);
  const GRID_PAGE_SIZE = 18; // 3열 × 6행

  // 입력 즉시 반영용 로컬 state (IME 조합 보호 + router.replace 부하 분리)
  const [searchInput, setSearchInput] = useState(search);

  // searchInput → URL/fetch 트리거 (300ms debounce)
  useEffect(() => {
    if (searchInput === search) return;
    const id = setTimeout(() => {
      setSearch(searchInput);
      if (gridPage !== 0) setGridPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput, search, setSearch, gridPage, setGridPage]);

  const toggleView = (mode: "list" | "grid") => {
    setViewMode(mode);
    if (gridPage !== 0) setGridPage(0);
  };

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (search) sp.set("search", search);
      // "deleted" 필터는 admin/staff만 허용 (서버에서도 검증하나, 클라이언트 isPrivileged 체크 후 전송)
      if (statusFilter !== "all") sp.set("status", statusFilter);
      const qs = sp.toString();
      const res = await apiFetch(`/api/vehicles${qs ? `?${qs}` : ""}`);
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
  }, [search, statusFilter]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  // 서버에서 이미 필터링된 결과 — 이중 안전판으로 클라이언트도 필터 (메모이즈)
  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      const searchLower = search.toLowerCase();
      const matchSearch =
        !search ||
        v.make.toLowerCase().includes(searchLower) ||
        v.model.toLowerCase().includes(searchLower) ||
        v.vehicle_code.toLowerCase().includes(searchLower);
      // "deleted" 필터: 서버가 deleted_at IS NOT NULL인 차량을 반환하므로 클라이언트 필터는 pass-through
      const matchStatus = statusFilter === "all" || statusFilter === "deleted" || v.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [vehicles, search, statusFilter]);

  const isPrivileged =
    userRole === "admin" ||
    userRole === "staff" ||
    userRole === "director" ||
    userRole === "team_leader";

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
          <img src={src} alt="" loading="lazy" decoding="async" className="rounded-md object-cover w-24 h-[72px] shrink-0" />
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
      <PageHeader
        title="차량 관리"
        description="재고 차량 등록·상태 관리. 그리드/리스트 뷰로 전환 가능합니다."
      >
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as VehicleStatus | "all" | "deleted");
            if (gridPage !== 0) setGridPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="상태 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="available">출고가능</SelectItem>
            <SelectItem value="consulting">상담중</SelectItem>
            <SelectItem value="sold">판매완료</SelectItem>
            {isPrivileged && (
              <SelectItem value="deleted">삭제됨</SelectItem>
            )}
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-auto" role="group" aria-label="뷰 전환">
          <button
            type="button"
            onClick={() => toggleView("list")}
            aria-label="리스트 보기"
            aria-pressed={viewMode === "list"}
            className={`p-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => toggleView("grid")}
            aria-label="그리드 보기"
            aria-pressed={viewMode === "grid"}
            className={`p-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 빈 상태 분기: 검색/필터 활성 여부 */}
      {(() => {
        const hasFilters = !!search || statusFilter !== "all";
        const emptyMessage = hasFilters
          ? "검색 결과가 없습니다. 검색어 또는 상태 필터를 변경해 보세요."
          : "등록된 차량이 없습니다.";

        if (viewMode === "list") {
          return (
            <DataTable
              columns={columns}
              data={filtered as unknown as Record<string, unknown>[]}
              loading={loading}
              emptyMessage={emptyMessage}
              onRowClick={(row) => {
                rememberReturnUrl("vehicles");
                router.push(`/vehicles/${(row as unknown as VehicleRow).id}`);
              }}
            />
          );
        }

        /* 썸네일 그리드 뷰 */
        if (loading && vehicles.length === 0) {
          return (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="aspect-video bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          );
        }

        if (filtered.length === 0) {
          return (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              {!hasFilters && isPrivileged && (
                <Button variant="outline" size="sm" onClick={() => router.push("/vehicles/new")}>
                  <Plus className="h-4 w-4 mr-2" />
                  차량 등록
                </Button>
              )}
            </div>
          );
        }

        const gridTotalPages = Math.ceil(filtered.length / GRID_PAGE_SIZE);
        const gridItems = filtered.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE);

        return (
          <div className="space-y-4">
            {/* stale 데이터 시각화 */}
            <div className={loading && vehicles.length > 0 ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {gridItems.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      rememberReturnUrl("vehicles");
                      router.push(`/vehicles/${v.id}`);
                    }}
                    className="text-left rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors"
                  >
                    {/* 사진 */}
                    <div className="relative aspect-video bg-muted">
                      {v.photos?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.photos[0]}
                          alt={`${v.make} ${v.model}`}
                          loading="lazy"
                          decoding="async"
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
            </div>
            <Pagination
              currentPage={gridPage + 1}
              totalPages={gridTotalPages}
              onPageChange={(next) => setGridPage(next - 1)}
              totalItems={filtered.length}
              pageSize={GRID_PAGE_SIZE}
            />
          </div>
        );
      })()}
    </div>
  );
}

export default function VehiclesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">불러오는 중...</div>}>
      <VehiclesPageInner />
    </Suspense>
  );
}
