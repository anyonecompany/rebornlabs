"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/src/lib/api-client";
import { formatPhone } from "@/src/lib/format-phone";
import { formatSourceRef, isDirectSource } from "@/src/lib/source-ref";
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

/** ISO 날짜를 YYYY-MM-DD HH:mm 형식으로 변환합니다. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
}

export default function ConsultationsPage() {
  const router = useRouter();

  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 검색/필터 상태
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConsultationStatus | "all">(
    "all",
  );
  const [duplicateFilter, setDuplicateFilter] = useState<
    "all" | "true" | "false"
  >("all");
  type SourceCategory = "all" | "direct" | "instagram" | "other";
  const [sourceFilter, setSourceFilter] = useState<SourceCategory>("all");

  const fetchConsultations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
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
    } catch {
      toast.error("상담 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, duplicateFilter, sourceFilter]);

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
      render: (value: unknown) => formatDate(value as string),
    },
  ];

  return (
    <div>
      <PageHeader title="상담 관리" />

      {/* 검색 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="고객명, 전화번호로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter(v as ConsultationStatus | "all")
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
            setDuplicateFilter(v as "all" | "true" | "false")
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
          onValueChange={(v) => setSourceFilter(v as SourceCategory)}
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
    </div>
  );
}
