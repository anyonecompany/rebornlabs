"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/src/lib/api-client";
import { formatDate } from "@/src/lib/format";

// 감사 로그는 정확한 시각(초 단위) 필요.
const formatDateTime = (iso: string) => formatDate(iso, "datetime-seconds");

// ---------------------------------------------------------------------------
// 액션 한글 매핑
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  user_login: "로그인",
  user_invited: "사용자 초대",
  role_changed: "역할 변경",
  user_deactivated: "비활성화",
  vehicle_deleted: "차량 삭제",
  gas_consultation_created: "상담 접수",
  sale_completed: "판매 완료",
  sale_cancelled: "판매 취소",
  dealer_assigned: "딜러 배정",
  dealer_unassigned: "배정 해제",
  document_uploaded: "문서 업로드",
  document_deleted: "문서 삭제",
  expense_created: "지출 등록",
  expense_deleted: "지출 삭제",
};

const ACTION_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "user_invited", label: "사용자 초대" },
  { value: "role_changed", label: "역할 변경" },
  { value: "user_deactivated", label: "사용자 비활성화" },
  { value: "vehicle_deleted", label: "차량 삭제" },
  { value: "gas_consultation_created", label: "상담 접수 (GAS)" },
  { value: "sale_completed", label: "판매 완료" },
  { value: "sale_cancelled", label: "판매 취소" },
  { value: "document_uploaded", label: "문서 업로드" },
  { value: "document_deleted", label: "문서 삭제" },
  { value: "expense_created", label: "지출 등록" },
  { value: "expense_deleted", label: "지출 삭제" },
];

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface AuditLogRow {
  id: string;
  created_at: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// 날짜 포맷
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 메타데이터 표시 컴포넌트
// ---------------------------------------------------------------------------

function MetadataCell({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <div className="max-w-xs">
      <table className="text-xs w-full">
        <tbody>
          {Object.entries(metadata).map(([key, value]) => (
            <tr key={key}>
              <td className="pr-2 text-muted-foreground font-medium whitespace-nowrap align-top py-0.5">
                {key}
              </td>
              <td className="text-foreground align-top py-0.5 break-all">
                {typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 페이지
// ---------------------------------------------------------------------------

export default function AuditLogsPage() {
  const PAGE_SIZE = 20;
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>("all");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (actionFilter !== "all") params.set("action", actionFilter);

      const res = await apiFetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "감사 로그를 불러오지 못했습니다.");
        return;
      }
      const d = await res.json();
      setLogs(d.data ?? []);
      setTotal(d.total ?? 0);
      setTotalPages(d.totalPages ?? 1);
    } catch {
      toast.error("감사 로그를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter]);

  const columns = [
    {
      key: "created_at",
      header: "시각",
      render: (v: unknown) => (
        <span className="text-xs whitespace-nowrap font-mono">
          {formatDateTime(v as string)}
        </span>
      ),
    },
    {
      key: "actor_name",
      header: "사용자",
      render: (v: unknown) =>
        v ? (
          <span className="text-sm">{v as string}</span>
        ) : (
          <span className="text-muted-foreground text-sm">시스템</span>
        ),
    },
    {
      key: "action",
      header: "액션",
      render: (v: unknown) => {
        const action = v as string;
        const label = ACTION_LABELS[action] ?? action;
        return <span className="text-sm font-medium">{label}</span>;
      },
    },
    {
      key: "target_type",
      header: "대상 타입",
      render: (v: unknown) =>
        v ? (
          <span className="text-xs text-muted-foreground">{v as string}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "target_id",
      header: "대상 ID",
      render: (v: unknown) =>
        v ? (
          <span
            className="text-xs font-mono text-muted-foreground"
            title={v as string}
          >
            {(v as string).slice(0, 8)}...
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "metadata",
      header: "상세",
      render: (v: unknown) => (
        <MetadataCell metadata={v as Record<string, unknown> | null} />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="감사 로그"
        description="시스템 내 주요 이벤트 기록을 확인합니다."
      />

      {/* 액션 필터 */}
      <div className="mb-4">
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="액션 필터" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={logs as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="감사 로그가 없습니다."
      />

      {/* 페이지네이션 */}
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                setPage((p) => Math.min(totalPages, p + 1))
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
