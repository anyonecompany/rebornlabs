"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DollarSign, Receipt, TrendingUp, Users } from "lucide-react";

import { apiFetch } from "@/src/lib/api-client";
import { formatKRW, formatDate as formatDateBase } from "@/src/lib/format";

const formatDate = (iso: string) => formatDateBase(iso, "compact");
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/types/database";

// ─── 타입 ──────────────────────────────────────────────────

interface CommissionDetail {
  id: string;
  confirmed_at: string;
  sale_id: string;
  recipient_id: string;
  recipient_name: string;
  recipient_role: "dealer" | "team_leader" | "director";
  amount: number;
  commission_type: string;
  case_type: string;
  customer_name: string | null;
  vehicle_summary: string | null;
  sale_cancelled: boolean;
}

interface EmployeeAggregate {
  recipient_id: string;
  recipient_name: string;
  recipient_role: "dealer" | "team_leader" | "director";
  count: number;
  total_amount: number;
}

interface CommissionsResponse {
  month: string;
  summary: {
    my_total_amount: number;
    my_count: number;
    my_average: number;
    all_total_amount?: number;
    all_count?: number;
  };
  details: CommissionDetail[];
  byEmployee?: EmployeeAggregate[];
}

// ─── 라벨 ──────────────────────────────────────────────────

const CASE_LABELS: Record<string, string> = {
  "1_db_dealer": "DB·딜러 판매",
  "2_db_team_leader": "DB·팀장 직판매",
  "3_db_director": "DB·본부장 직판매",
  "4_personal_dealer": "개인·딜러 판매",
  "5_personal_team_leader": "개인·팀장 직판매",
  "6_personal_director": "개인·본부장 직판매",
};

const TYPE_LABELS: Record<string, string> = {
  direct_sale: "본인 판매",
  team_leader_override: "팀장 수당",
  director_override: "본부장 수당",
};

const ROLE_LABELS: Record<string, string> = {
  dealer: "딜러",
  team_leader: "팀장",
  director: "본부장",
  admin: "관리자",
  staff: "직원",
};

/** 최근 12개월 (이번 달 포함, 최신순). */
function getMonthOptions(): string[] {
  const now = new Date();
  const opts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return opts;
}

// ─── 컴포넌트 ──────────────────────────────────────────────

export default function CommissionsTab({ userRole }: { userRole: UserRole }) {
  const months = useMemo(() => getMonthOptions(), []);
  const [month, setMonth] = useState(months[0]);
  const [data, setData] = useState<CommissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const isPrivileged = userRole === "admin" || userRole === "staff";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/settlements/commissions?month=${month}`,
      );
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        toast.error(d?.error ?? "수당 데이터를 불러오지 못했습니다.");
        setData(null);
        return;
      }
      const d = (await res.json()) as CommissionsResponse;
      setData(d);
    } catch {
      toast.error("수당 데이터를 불러오는 중 오류가 발생했습니다.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const summaryCards: {
    label: string;
    value: string;
    icon: React.ElementType;
  }[] = [
    {
      label: "내 수당 총액",
      value: formatKRW(data?.summary.my_total_amount ?? 0),
      icon: DollarSign,
    },
    {
      label: "내 건수",
      value: `${data?.summary.my_count ?? 0}건`,
      icon: Receipt,
    },
    {
      label: "건당 평균",
      value: formatKRW(data?.summary.my_average ?? 0),
      icon: TrendingUp,
    },
  ];

  if (isPrivileged && data?.summary.all_total_amount !== undefined) {
    summaryCards.push({
      label: "전체 수당",
      value: formatKRW(data.summary.all_total_amount),
      icon: Users,
    });
  }

  const detailColumns = [
    {
      key: "confirmed_at",
      header: "확정일",
      render: (v: unknown) => formatDate(v as string),
    },
    {
      key: "customer_name",
      header: "고객",
      render: (v: unknown) => (v as string | null) ?? "자체 판매",
    },
    {
      key: "vehicle_summary",
      header: "차량",
      render: (v: unknown) => (v as string | null) ?? "—",
    },
    { key: "recipient_name", header: "수령자" },
    {
      key: "recipient_role",
      header: "역할",
      render: (v: unknown) => ROLE_LABELS[v as string] ?? (v as string),
    },
    {
      key: "commission_type",
      header: "유형",
      render: (v: unknown) => TYPE_LABELS[v as string] ?? (v as string),
    },
    {
      key: "case_type",
      header: "케이스",
      render: (v: unknown) => CASE_LABELS[v as string] ?? (v as string),
    },
    {
      key: "amount",
      header: "금액",
      render: (v: unknown, row: Record<string, unknown>) =>
        row.sale_cancelled ? (
          <span className="text-muted-foreground line-through">
            {formatKRW(v as number)}
          </span>
        ) : (
          <span>{formatKRW(v as number)}</span>
        ),
    },
    {
      key: "sale_cancelled",
      header: "상태",
      render: (v: unknown) =>
        v ? (
          <Badge
            variant="outline"
            className="bg-red-500/10 text-red-400 border-red-500/20"
          >
            취소
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          >
            확정
          </Badge>
        ),
    },
  ];

  const employeeColumns = [
    { key: "recipient_name", header: "이름" },
    {
      key: "recipient_role",
      header: "역할",
      render: (v: unknown) => ROLE_LABELS[v as string] ?? (v as string),
    },
    {
      key: "count",
      header: "건수",
      render: (v: unknown) => `${(v as number) ?? 0}건`,
    },
    {
      key: "total_amount",
      header: "총 수당",
      render: (v: unknown) => formatKRW(v as number),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 월 선택 + 역할 뱃지 */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="월 선택" />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">현재 권한</span>
          <Badge variant="outline">
            {ROLE_LABELS[userRole] ?? userRole}
          </Badge>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{loading ? "—" : value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 상세 테이블 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">수당 상세 · {month}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={detailColumns}
            data={
              (data?.details ?? []) as unknown as Record<string, unknown>[]
            }
            loading={loading}
            emptyMessage="해당 월의 수당 내역이 없습니다."
          />
        </CardContent>
      </Card>

      {/* 직원별 집계 (admin/staff 전용) */}
      {isPrivileged && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">직원별 집계</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={employeeColumns}
              data={
                (data?.byEmployee ?? []) as unknown as Record<
                  string,
                  unknown
                >[]
              }
              loading={loading}
              emptyMessage="집계 대상이 없습니다."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
