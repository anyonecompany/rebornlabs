"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { PageNav } from "@/components/page-nav";
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
import { formatDate } from "@/src/lib/format";
import { formatPhone } from "@/src/lib/format-phone";
import { formatSourceRef, isDirectSource } from "@/src/lib/source-ref";
import { useUrlState } from "@/src/lib/use-url-state";
import { useDebounce } from "@/src/lib/use-debounce";
import type { ConsultationStatus } from "@/types/database";

interface ConsultationRow {
  id: string;
  customer_name: string;
  phone: string;
  interested_vehicle: string | null;
  status: ConsultationStatus;
  assigned_dealer_name: string | null;
  is_duplicate: boolean;
  created_at: string;
}

type SourceCategory = "all" | "direct" | "instagram" | "other";
type DuplicateFilter = "all" | "true" | "false";
type StatusFilter = ConsultationStatus | "all";

function ConsultationsPageInner() {
  const router = useRouter();

  const PAGE_SIZE = 20;
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // 검색/필터 — URL searchParams에 동기화 (뒤로가기·새로고침·공유 가능)
  const [page, setPage] = useUrlState<number>("page", 1);
  const [search, setSearch] = useUrlState<string>("search", "");
  const [statusFilter, setStatusFilter] = useUrlState<StatusFilter>(
    "status",
    "all",
  );
  const [duplicateFilter, setDuplicateFilter] = useUrlState<DuplicateFilter>(
    "duplicate",
    "all",
  );
  const [sourceFilter, setSourceFilter] = useUrlState<SourceCategory>(
    "source",
    "all",
  );

  // 입력 → API는 debounce. URL은 즉시 갱신(router.replace는 cheap).
  const debouncedSearch = useDebounce(search, 300);

  // 필터 변경 시 1페이지로. 단순 setter wrapper.
  const updateFilter = <T extends string | number | boolean>(
    setter: (next: T) => void,
    next: T,
  ) => {
    setter(next);
    if (page !== 1) setPage(1);
  };

  const fetchConsultations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (duplicateFilter !== "all")
        params.set("is_duplicate", duplicateFilter);
      if (sourceFilter !== "all") params.set("source_category", sourceFilter);

      const res = await apiFetch(`/api/consultations?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "상담 목록을 불러오지 못했습니다.");
        return;
      }
      const data = await res.json();
      setConsultations(data.data ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      toast.error("상담 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, duplicateFilter, sourceFilter]);

  useEffect(() => {
    fetchConsultations();
  }, [fetchConsultations]);

  const columns = [
    { key: "customer_name", header: "고객명" },
    {
      key: "phone",
      header: "전화번호",
      render: (value: unknown) => formatPhone(value as string | null),
    },
    {
      key: "interested_vehicle",
      header: "관심차종",
      render: (value: unknown) => (value as string | null) ?? "—",
    },
    {
      key: "source_ref",
      header: "유입경로",
      render: (value: unknown) => {
        const v = value as string | null;
        if (isDirectSource(v))
          return <span className="text-muted-foreground">직접</span>;
        return <span>{formatSourceRef(v)}</span>;
      },
    },
    {
      key: "status",
      header: "상태",
      render: (value: unknown) => (
        <StatusBadge type="consultation" value={value as ConsultationStatus} />
      ),
    },
    {
      key: "assigned_dealer_name",
      header: "배정딜러",
      render: (value: unknown) => (value as string | null) ?? "—",
    },
    {
      key: "is_duplicate",
      header: "중복여부",
      render: (value: unknown) =>
        value ? (
          <span className="text-xs text-amber-400 font-medium">중복</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "created_at",
      header: "접수일",
      render: (value: unknown) => formatDate(value as string, "datetime"),
    },
  ];

  return (
    <div>
      <PageHeader
        title="상담 관리"
        description="접수된 상담을 조회·검색하고 딜러에게 배정합니다."
      />

      {/* 검색 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="고객명, 전화번호로 검색"
            value={search}
            onChange={(e) => updateFilter(setSearch, e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            updateFilter(setStatusFilter, v as StatusFilter)
          }
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="상태 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="new">신규</SelectItem>
            <SelectItem value="consulting">상담중</SelectItem>
            <SelectItem value="vehicle_waiting">차량대기</SelectItem>
            <SelectItem value="rejected">거부</SelectItem>
            <SelectItem value="sold">판매완료</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={duplicateFilter}
          onValueChange={(v) =>
            updateFilter(setDuplicateFilter, v as DuplicateFilter)
          }
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="중복 여부" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="true">중복만</SelectItem>
            <SelectItem value="false">비중복</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sourceFilter}
          onValueChange={(v) =>
            updateFilter(setSourceFilter, v as SourceCategory)
          }
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="유입 채널" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유입</SelectItem>
            <SelectItem value="direct">직접 유입</SelectItem>
            <SelectItem value="instagram">인스타그램</SelectItem>
            <SelectItem value="other">기타 유입</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={consultations as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="등록된 상담이 없습니다."
        onRowClick={(row) =>
          router.push(
            `/consultations/${(row as unknown as ConsultationRow).id}`,
          )
        }
      />

      {/* 페이지네이션 — 중앙: 1~10 블록 + 화살표, 우측: 정보 텍스트 */}
      {totalPages > 1 && (
        <div className="mt-4 flex flex-col sm:grid sm:grid-cols-3 sm:items-center gap-3 text-sm text-muted-foreground">
          <div className="hidden sm:block" />
          <div className="flex justify-center">
            <PageNav
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              disabled={loading}
            />
          </div>
          <span className="text-center sm:text-right">
            {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} / {total}건
          </span>
        </div>
      )}
    </div>
  );
}

export default function ConsultationsPage() {
  // useSearchParams는 Suspense boundary 내에서만 사용 가능
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">불러오는 중...</div>}>
      <ConsultationsPageInner />
    </Suspense>
  );
}
