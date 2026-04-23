"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Calculator, DollarSign, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
import CommissionsTab from "@/src/components/settlements/commissions-tab";

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

/** 숫자를 한국 원화 형식으로 포맷합니다. */
function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

/** Date를 YYYY-MM-DD 문자열로 변환합니다. */
function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** 이번 달 1일 반환 */
function firstDayOfMonth(): string {
  const d = new Date();
  return toDateString(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** 오늘 날짜 반환 */
function today(): string {
  return toDateString(new Date());
}

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface SettlementSummary {
  total_sales: number;
  total_dealer_fees: number;
  total_marketing_fees: number;
  total_cost: number;
}

interface DealerSettlementRow {
  dealer_id: string;
  dealer_name: string;
  total_count: number;
  db_provided_count: number;
  self_count: number;
  total_dealer_fee: number;
}

interface MarketingSettlementRow {
  marketing_company: string | null;
  count: number;
  total_marketing_fee: number;
}

interface DealerOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// 요약 카드
// ---------------------------------------------------------------------------

interface SummaryCard {
  label: string;
  value: string;
  icon: React.ElementType;
}

interface SummaryCardsProps {
  summary: SettlementSummary | null;
  loading: boolean;
}

function SummaryCards({ summary, loading }: SummaryCardsProps) {
  const cards: SummaryCard[] = [
    {
      label: "총 판매건수",
      value: loading ? "—" : `${summary?.total_sales ?? 0}건`,
      icon: TrendingUp,
    },
    {
      label: "딜러 수당 합계",
      value: loading ? "—" : formatKRW(summary?.total_dealer_fees ?? 0),
      icon: Users,
    },
    {
      label: "마케팅 수수료 합계",
      value: loading ? "—" : formatKRW(summary?.total_marketing_fees ?? 0),
      icon: DollarSign,
    },
    {
      label: "전체 정산 비용",
      value: loading ? "—" : formatKRW(summary?.total_cost ?? 0),
      icon: Calculator,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {label}
            </CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 딜러 정산 탭
// ---------------------------------------------------------------------------

function DealerSettlementTab() {
  const [rows, setRows] = useState<DealerSettlementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [dealerId, setDealerId] = useState<string>("all");
  const [dealers, setDealers] = useState<DealerOption[]>([]);

  // 딜러 목록 로드
  useEffect(() => {
    apiFetch("/api/dealers/names")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.data) setDealers(d.data as DealerOption[]);
      })
      .catch(() => null);
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (dealerId !== "all") params.set("dealer_id", dealerId);

      const res = await apiFetch(`/api/settlements/dealers?${params.toString()}`);
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "딜러 정산 데이터를 불러오지 못했습니다.");
        return;
      }
      const d = await res.json();
      setRows(d.data ?? []);
    } catch {
      toast.error("딜러 정산 데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, dealerId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const columns = [
    { key: "dealer_name", header: "딜러명" },
    {
      key: "total_count",
      header: "총 판매건수",
      render: (v: unknown) => `${(v as number) ?? 0}건`,
    },
    {
      key: "db_provided_count",
      header: "DB제공 건수",
      render: (v: unknown) => `${(v as number) ?? 0}건`,
    },
    {
      key: "self_count",
      header: "자체판매 건수",
      render: (v: unknown) => `${(v as number) ?? 0}건`,
    },
    {
      key: "total_dealer_fee",
      header: "총 수당",
      render: (v: unknown) => formatKRW(v as number),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
          <span className="text-muted-foreground text-sm shrink-0">~</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>
        <Select value={dealerId} onValueChange={setDealerId}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="딜러 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 딜러</SelectItem>
            {dealers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="해당 기간의 딜러 정산 데이터가 없습니다."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 마케팅업체 정산 탭
// ---------------------------------------------------------------------------

interface MarketingCompanyOption {
  id: string;
  name: string;
}

function MarketingSettlementTab() {
  const [rows, setRows] = useState<MarketingSettlementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [company, setCompany] = useState<string>("all");
  const [marketingCompanies, setMarketingCompanies] = useState<MarketingCompanyOption[]>([]);

  // 마케팅업체 목록 로드
  useEffect(() => {
    apiFetch("/api/marketing-companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.data) setMarketingCompanies(d.data as MarketingCompanyOption[]);
      })
      .catch(() => null);
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (company !== "all") params.set("company", company);

      const res = await apiFetch(`/api/settlements/marketing?${params.toString()}`);
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "마케팅 정산 데이터를 불러오지 못했습니다.");
        return;
      }
      const d = await res.json();
      setRows(d.data ?? []);
    } catch {
      toast.error("마케팅 정산 데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, company]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const columns = [
    {
      key: "marketing_company",
      header: "업체명",
      render: (v: unknown) => (v as string) || "미지정",
    },
    {
      key: "count",
      header: "DB제공 판매건수",
      render: (v: unknown) => `${(v as number) ?? 0}건`,
    },
    {
      key: "total_marketing_fee",
      header: "총 수수료",
      render: (v: unknown) => formatKRW((v as number) ?? 0),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
          <span className="text-muted-foreground text-sm shrink-0">~</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="업체 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 업체</SelectItem>
            {marketingCompanies.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="해당 기간의 마케팅 정산 데이터가 없습니다."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 페이지
// ---------------------------------------------------------------------------

export default function SettlementsPage() {
  const { role: userRole } = useUserRole();
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const isPrivileged = userRole === "admin" || userRole === "staff";

  // admin/staff 전용: 판매액 기반 월 요약(sales 테이블)
  useEffect(() => {
    if (!isPrivileged) {
      setSummaryLoading(false);
      return;
    }
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    apiFetch(`/api/settlements/summary?month=${month}`)
      .then(async (res) => {
        if (!res.ok) return;
        const d = await res.json();
        setSummary(d.data ?? d);
      })
      .catch(() => null)
      .finally(() => setSummaryLoading(false));
  }, [isPrivileged]);

  if (!userRole) {
    return (
      <div>
        <PageHeader
          title="정산 관리"
          description="수당 배분 및 정산 현황을 확인합니다."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="정산 관리"
        description="수당 배분 및 정산 현황을 확인합니다."
      />

      {/* admin/staff: 전체 판매 요약 카드 (sales 기반) */}
      {isPrivileged && (
        <SummaryCards summary={summary} loading={summaryLoading} />
      )}

      {/* 탭: 수당 배분(전원) + 딜러/마케팅(admin/staff) */}
      <Tabs defaultValue="commissions">
        <TabsList className="mb-4">
          <TabsTrigger value="commissions">수당 배분</TabsTrigger>
          {isPrivileged && (
            <TabsTrigger value="dealers">딜러 정산</TabsTrigger>
          )}
          {isPrivileged && (
            <TabsTrigger value="marketing">마케팅업체 정산</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="commissions">
          <CommissionsTab userRole={userRole} />
        </TabsContent>

        {isPrivileged && (
          <TabsContent value="dealers">
            <DealerSettlementTab />
          </TabsContent>
        )}

        {isPrivileged && (
          <TabsContent value="marketing">
            <MarketingSettlementTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
