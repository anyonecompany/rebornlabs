"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Car,
  MessageSquare,
  TrendingUp,
  DollarSign,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createBrowserClient } from "@/src/lib/supabase/browser";
import { apiFetch } from "@/src/lib/api-client";
import type { UserRole, ConsultationStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

/** 숫자를 한국 원화 형식으로 포맷합니다. */
function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

/** ISO 날짜를 상대 시간 또는 날짜로 포맷합니다. */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface DashboardStats {
  available_vehicles: number;
  new_consultations: number;
  monthly_sales: number;
  monthly_dealer_fee: number;
  monthly_marketing_fee: number;
  // 딜러 전용
  my_active_consultations?: number;
  my_monthly_sales?: number;
}

interface RecentConsultation {
  id: string;
  customer_name: string;
  interested_vehicle: string | null;
  status: ConsultationStatus;
  created_at: string;
}

interface RecentSale {
  id: string;
  vehicle_code: string | null;
  dealer_name: string | null;
  dealer_fee: number;
  created_at: string;
}

interface RecentData {
  consultations: RecentConsultation[];
  sales: RecentSale[];
}

// ---------------------------------------------------------------------------
// 상담 상태 한글 맵
// ---------------------------------------------------------------------------

const CONSULTATION_STATUS_LABELS: Record<ConsultationStatus, string> = {
  new: "신규",
  consulting: "상담중",
  vehicle_waiting: "차량대기",
  rejected: "거절",
  sold: "판매완료",
};

// ---------------------------------------------------------------------------
// 통계 카드 (경영진/직원 뷰)
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
}

function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <Card>
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
  );
}

// ---------------------------------------------------------------------------
// 경영진/직원 대시보드
// ---------------------------------------------------------------------------

interface StaffDashboardProps {
  stats: DashboardStats;
  recent: RecentData;
}

function StaffDashboard({ stats, recent }: StaffDashboardProps) {
  const router = useRouter();

  const statCards = [
    {
      label: "출고가능 차량",
      value: `${stats.available_vehicles}대`,
      icon: Car,
    },
    {
      label: "신규 상담",
      value: `${stats.new_consultations}건`,
      icon: MessageSquare,
    },
    {
      label: "이번 달 판매",
      value: `${stats.monthly_sales}건`,
      icon: TrendingUp,
    },
    {
      label: "딜러 수당 합계",
      value: formatKRW(stats.monthly_dealer_fee),
      icon: DollarSign,
    },
    {
      label: "마케팅 수수료",
      value: formatKRW(stats.monthly_marketing_fee),
      icon: Users,
    },
  ];

  return (
    <div>
      {/* 통계 카드: 모바일 1열, sm 2열, lg 3열 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {statCards.map(({ label, value, icon }) => (
          <StatCard key={label} label={label} value={value} icon={icon} />
        ))}
      </div>

      {/* 최근 데이터: 모바일 1열, lg 2열 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 최근 상담 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">최근 상담</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.consultations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                최근 상담이 없습니다.
              </p>
            ) : (
              recent.consultations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/consultations/${c.id}`)}
                  className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">
                      {c.customer_name}
                    </span>
                    <span className="text-muted-foreground text-xs truncate block">
                      {c.interested_vehicle ?? "차종 미정"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {CONSULTATION_STATUS_LABELS[c.status]}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(c.created_at)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* 최근 판매 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">최근 판매</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.sales.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                최근 판매가 없습니다.
              </p>
            ) : (
              recent.sales.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/sales/${s.id}`)}
                  className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">
                      {s.vehicle_code ?? "—"}
                    </span>
                    <span className="text-muted-foreground text-xs truncate block">
                      {s.dealer_name ?? "딜러 정보 없음"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs font-medium whitespace-nowrap">
                      {formatKRW(s.dealer_fee)}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(s.created_at)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 딜러 대시보드
// ---------------------------------------------------------------------------

interface DealerConsultation {
  id: string;
  customer_name: string;
  interested_vehicle: string | null;
  status: ConsultationStatus;
  created_at: string;
}

interface DealerDashboardProps {
  stats: DashboardStats;
  consultations: DealerConsultation[];
}

function DealerDashboard({ stats, consultations }: DealerDashboardProps) {
  const router = useRouter();

  const statCards = [
    {
      label: "내 활성 상담",
      value: `${stats.my_active_consultations ?? 0}건`,
      icon: MessageSquare,
    },
    {
      label: "출고가능 차량",
      value: `${stats.available_vehicles}대`,
      icon: Car,
    },
    {
      label: "이번 달 내 판매",
      value: `${stats.my_monthly_sales ?? 0}건`,
      icon: TrendingUp,
    },
  ];

  return (
    <div>
      {/* 통계 카드: 모바일 1열, sm 3열 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {statCards.map(({ label, value, icon }) => (
          <StatCard key={label} label={label} value={value} icon={icon} />
        ))}
      </div>

      {/* 내 배정 상담 목록 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">내 배정 상담</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {consultations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              배정된 상담이 없습니다.
            </p>
          ) : (
            consultations.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/consultations/${c.id}`)}
                className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium truncate block">
                    {c.customer_name}
                  </span>
                  <span className="text-muted-foreground text-xs truncate block">
                    {c.interested_vehicle ?? "차종 미정"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {CONSULTATION_STATUS_LABELS[c.status]}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(c.created_at)}
                  </span>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 페이지
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [userRole, setUserRole] = useState<UserRole>("dealer");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<RecentData>({ consultations: [], sales: [] });
  const [dealerConsultations, setDealerConsultations] = useState<DealerConsultation[]>([]);
  const [loading, setLoading] = useState(true);

  // 프로필 로드 → 역할 확인
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

  // 역할 확정 후 데이터 로드
  useEffect(() => {
    if (!userRole) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // 공통: 대시보드 통계
        const statsRes = await apiFetch("/api/dashboard");
        if (statsRes.ok) {
          const d = await statsRes.json();
          setStats(d.data ?? d);
        }

        const isPrivileged = userRole === "admin" || userRole === "staff";

        if (isPrivileged) {
          // 경영진/직원: 최근 상담 + 판매
          const recentRes = await apiFetch("/api/dashboard/recent");
          if (recentRes.ok) {
            const d = await recentRes.json();
            setRecent({
              consultations: d.consultations ?? [],
              sales: d.sales ?? [],
            });
          }
        } else {
          // 딜러: 내 배정 상담 (본인 기준 최신 순)
          const cRes = await apiFetch("/api/consultations?limit=20");
          if (cRes.ok) {
            const d = await cRes.json();
            setDealerConsultations(d.data ?? []);
          }
        }
      } catch {
        toast.error("대시보드 데이터를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [userRole]);

  const isPrivileged = userRole === "admin" || userRole === "staff";

  // 로딩 중이거나 아직 stats가 없을 때 스켈레톤 카드 표시
  if (loading || !stats) {
    const count = isPrivileged ? 5 : 3;
    return (
      <div>
        <PageHeader
          title="대시보드"
          description="리본랩스 운영 현황을 한눈에 확인합니다."
        />
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${isPrivileged ? "lg:grid-cols-3" : "sm:grid-cols-3"} gap-4 mb-6`}
        >
          {Array.from({ length: count }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-9 w-20 rounded bg-muted animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="대시보드"
        description="리본랩스 운영 현황을 한눈에 확인합니다."
      />

      {isPrivileged ? (
        <StaffDashboard stats={stats} recent={recent} />
      ) : (
        <DealerDashboard stats={stats} consultations={dealerConsultations} />
      )}
    </div>
  );
}
