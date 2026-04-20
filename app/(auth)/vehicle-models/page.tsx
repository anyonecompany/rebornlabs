"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Pencil,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
import { useRouter } from "next/navigation";
import {
  ModelFormDialog,
  type VehicleModelItem,
} from "@/src/components/vehicle-models/model-form-dialog";
import { ExcelImportDialog } from "@/src/components/vehicle-models/excel-import-dialog";
import { formatKRW } from "@/src/lib/vehicle-price";

type StatusTab = "all" | "active" | "inactive";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "활성" },
  { value: "inactive", label: "비활성" },
];

const PAGE_SIZE = 20;

export default function VehicleModelsPage() {
  const router = useRouter();
  const { role } = useUserRole();

  const [items, setItems] = useState<VehicleModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleModelItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  const isAllowed = useMemo(
    () => role === "admin" || role === "staff",
    [role],
  );

  useEffect(() => {
    if (role && !isAllowed) {
      toast.error("접근 권한이 없습니다.");
      router.replace("/dashboard");
    }
  }, [role, isAllowed, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const res = await apiFetch(`/api/vehicle-models?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "목록을 불러오지 못했습니다.");
        return;
      }
      const data = await res.json();
      setItems((data.items ?? []) as VehicleModelItem[]);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => {
    if (isAllowed) fetchData();
  }, [fetchData, isAllowed]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const toggleActive = async (item: VehicleModelItem) => {
    setToggleBusyId(item.id);
    try {
      const res = await apiFetch(`/api/vehicle-models/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "상태 변경에 실패했습니다.");
        return;
      }
      toast.success(item.isActive ? "비활성화되었습니다." : "활성화되었습니다.");
      fetchData();
    } catch {
      toast.error("상태 변경 중 오류가 발생했습니다.");
    } finally {
      setToggleBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!isAllowed) {
    return (
      <div>
        <PageHeader title="차량 모델 관리" />
        <p className="text-sm text-muted-foreground">접근 권한이 없습니다.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="차량 모델 관리">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4 mr-1.5" />
            엑셀 가져오기
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            신규 등록
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="inline-flex rounded-md border border-border p-1 bg-card">
          {STATUS_TABS.map((tab) => {
            const active = status === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setPage(1);
                  setStatus(tab.value);
                }}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  active
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="브랜드, 모델, 등급 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>

        <div className="sm:ml-auto text-xs text-muted-foreground">
          총 {total.toLocaleString("ko-KR")}건
        </div>
      </div>

      {loading ? (
        <LoadingState variant="table" />
      ) : items.length === 0 ? (
        <EmptyState title="등록된 차량 모델이 없습니다." />
      ) : (
        <>
          <div className="hidden md:block rounded-lg border border-border overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-muted-foreground">순서</TableHead>
                  <TableHead className="text-muted-foreground">브랜드</TableHead>
                  <TableHead className="text-muted-foreground">모델</TableHead>
                  <TableHead className="text-muted-foreground">등급</TableHead>
                  <TableHead className="text-muted-foreground text-right">
                    차량가격
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right">
                    최대보증금
                  </TableHead>
                  <TableHead className="text-muted-foreground">상태</TableHead>
                  <TableHead className="text-muted-foreground text-right">
                    액션
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className={item.isActive ? "" : "opacity-60"}
                  >
                    <TableCell className="py-3 px-4 text-xs text-muted-foreground font-mono">
                      {item.displayOrder}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm">
                      {item.brand}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm">
                      {item.model}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm font-medium">
                      {item.trim}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm text-right">
                      {formatKRW(item.carPrice)}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm text-right">
                      {formatKRW(item.maxDeposit)}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      {item.isActive ? (
                        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          활성
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          비활성
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(item);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActive(item)}
                          disabled={toggleBusyId === item.id}
                        >
                          {item.isActive ? "비활성" : "활성"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg border border-border bg-card p-3 ${
                  item.isActive ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.brand} {item.model}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.trim} · 순서 {item.displayOrder}
                    </p>
                  </div>
                  {item.isActive ? (
                    <span className="shrink-0 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                      활성
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      비활성
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">차량가격</p>
                    <p>{formatKRW(item.carPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">최대보증금</p>
                    <p>{formatKRW(item.maxDeposit)}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setEditing(item);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    수정
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => toggleActive(item)}
                    disabled={toggleBusyId === item.id}
                  >
                    {item.isActive ? "비활성화" : "활성화"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}{" "}
                / {total}개
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ModelFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={fetchData}
      />

      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchData}
      />
    </div>
  );
}
