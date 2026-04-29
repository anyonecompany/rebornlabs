"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/src/lib/api-client";
import { formatDate as formatDateBase } from "@/src/lib/format";
import { getReturnUrl } from "@/src/lib/return-url";

const formatDate = (iso: string) => formatDateBase(iso, "datetime");
import { useUserRole } from "@/src/lib/use-user-role";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { formatPhone } from "@/src/lib/format-phone";
import { formatSourceRef } from "@/src/lib/source-ref";
import type { ConsultationStatus, UserRole } from "@/types/database";

// ---------------------------------------------------------------------------
// 상태 전이 매트릭스
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  new: ["consulting", "rejected"],
  consulting: ["new", "vehicle_waiting", "rejected"],
  vehicle_waiting: ["consulting", "rejected"],
  rejected: ["new", "consulting"], // admin/staff만 허용 (UI에서 필터링)
  sold: [],
};

const STATUS_LABELS: Record<ConsultationStatus, string> = {
  new: "신규",
  consulting: "상담중",
  vehicle_waiting: "차량대기",
  rejected: "거부",
  sold: "판매완료",
};

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------
interface Consultation {
  id: string;
  customer_name: string;
  phone: string;
  interested_vehicle: string | null;
  message: string | null;
  source_ref: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  available_deposit: number | null;
  desired_monthly_payment: number | null;
  assigned_dealer_id: string | null;
  marketing_company: string | null;
  status: ConsultationStatus;
  is_duplicate: boolean;
  created_at: string;
}

interface RelatedConsultation {
  id: string;
  interested_vehicle: string | null;
  status: ConsultationStatus;
  created_at: string;
}

/** 판매 가능 차량 옵션 */
interface AvailableVehicle {
  id: string;
  vehicle_code: string;
  make: string;
  model: string;
  year: number;
}

interface DealerOption {
  id: string;
  name: string;
}

interface MarketingCompanyOption {
  id: string;
  name: string;
  is_active: boolean;
}

interface ConsultationLog {
  id: string;
  consultation_id: string;
  dealer_id: string;
  dealer_name?: string;
  content: string;
  status_snapshot: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// InfoItem 보조 컴포넌트
// ---------------------------------------------------------------------------
function InfoItem({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      {children ?? <p className="font-medium text-sm">{value ?? "—"}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------
export default function ConsultationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [relatedConsultations, setRelatedConsultations] = useState<
    RelatedConsultation[]
  >([]);
  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [marketingCompanies, setMarketingCompanies] = useState<MarketingCompanyOption[]>([]);
  const [logs, setLogs] = useState<ConsultationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { role: userRole } = useUserRole();

  // 딜러 배정 폼 상태
  const [selectedDealerId, setSelectedDealerId] = useState("");
  const [marketingCompany, setMarketingCompany] = useState("");
  // 마케팅업체 선택 모드: "select" | "custom"
  const [marketingMode, setMarketingMode] = useState<"select" | "custom">("select");
  const [assigning, setAssigning] = useState(false);

  // 상담 기록 입력 폼 상태
  const [logContent, setLogContent] = useState("");
  const [logStatus, setLogStatus] = useState<ConsultationStatus | "">("");
  const [submittingLog, setSubmittingLog] = useState(false);

  // 상태 직접 변경 상태
  const [changingStatus, setChangingStatus] = useState(false);

  // 판매 완료 모달 상태
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [availableVehicles, setAvailableVehicles] = useState<AvailableVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);

  // 예산 편집 모달 상태 — admin/staff 가 상담 유입 후 보증금/월납입료 보정용
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetDeposit, setBudgetDeposit] = useState("");
  const [budgetMonthly, setBudgetMonthly] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  const logBottomRef = useRef<HTMLDivElement>(null);

  // 상담 데이터 로드
  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/consultations/${id}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "상담 정보를 불러오지 못했습니다.");
        router.push(getReturnUrl("consultations", "/consultations"));
        return;
      }
      const data = await res.json();
      const c: Consultation = data.data;
      setConsultation(c);
      setRelatedConsultations(data.history ?? []);
      setLogs(data.logs ?? []);
      // 배정 초기값 세팅
      setSelectedDealerId(c.assigned_dealer_id ?? "");
      setMarketingCompany(c.marketing_company ?? "");
    } catch {
      toast.error("상담 정보를 불러오는 중 오류가 발생했습니다.");
      router.push(getReturnUrl("consultations", "/consultations"));
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  // D1 동적 페이지 타이틀
  useEffect(() => {
    if (consultation) {
      document.title = `${consultation.customer_name} 상담 - REBORN LABS`;
    }
  }, [consultation]);

  // 딜러 목록 로드
  const fetchDealers = useCallback(async () => {
    try {
      const res = await apiFetch("/api/consultations/dealers");
      if (!res.ok) return;
      const data = await res.json();
      setDealers(data.data ?? []);
    } catch {
      // 딜러 목록 로드 실패는 조용히 처리
    }
  }, []);

  // 마케팅업체 목록 로드
  const fetchMarketingCompanies = useCallback(async () => {
    try {
      const res = await apiFetch("/api/marketing-companies?is_active=true");
      if (!res.ok) return;
      const data = await res.json();
      setMarketingCompanies(data.data ?? []);
    } catch {
      // 마케팅업체 목록 로드 실패는 조용히 처리
    }
  }, []);

  useEffect(() => {
    fetchDetail();
    fetchDealers();
    fetchMarketingCompanies();
  }, [fetchDetail, fetchDealers, fetchMarketingCompanies]);

  // 딜러 배정
  const handleAssign = async () => {
    if (!selectedDealerId) {
      toast.error("딜러를 선택해주세요.");
      return;
    }
    setAssigning(true);
    try {
      const res = await apiFetch(`/api/consultations/${id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({
          dealer_id: selectedDealerId,
          marketing_company: marketingCompany || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "딜러 배정에 실패했습니다.");
        return;
      }
      toast.success("딜러가 배정되었습니다.");
      // 낙관적 업데이트 후 서버 재조회로 race condition 방지
      await fetchDetail();
    } catch {
      toast.error("딜러 배정 중 오류가 발생했습니다.");
    } finally {
      setAssigning(false);
    }
  };

  // 배정 해제
  const handleUnassign = async () => {
    setAssigning(true);
    try {
      // 배정 해제: dealer_id를 빈 문자열로 전송 → API에서 null 처리
      const res = await apiFetch(`/api/consultations/${id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ dealer_id: null, marketing_company: null }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "배정 해제에 실패했습니다.");
        return;
      }
      // 상태를 신규로 변경
      const statusRes = await apiFetch(`/api/consultations/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "new" }),
      });
      if (!statusRes.ok) {
        toast.error("상태 변경에 실패했습니다.");
      }
      toast.success("배정이 해제되었습니다.");
      await fetchDetail();
    } catch {
      toast.error("배정 해제 중 오류가 발생했습니다.");
    } finally {
      setAssigning(false);
    }
  };

  // 상담 기록 등록
  const handleSubmitLog = async () => {
    if (!logContent.trim()) {
      toast.error("통화 내용을 입력해주세요.");
      return;
    }
    setSubmittingLog(true);
    try {
      const body: Record<string, string> = { content: logContent.trim() };

      const res = await apiFetch(`/api/consultations/${id}/logs`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "상담 기록 등록에 실패했습니다.");
        return;
      }
      toast.success("상담 기록이 등록되었습니다.");

      // 기록 목록에 추가 + 상태 반영
      const newLog: ConsultationLog = data.data ?? data.log;
      setLogs((prev) => [...prev, newLog]);
      if (logStatus && consultation) {
        setConsultation({ ...consultation, status: logStatus });
      }
      setLogContent("");
      setLogStatus("");

      // 스크롤 맨 아래로
      setTimeout(() => {
        logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch {
      toast.error("상담 기록 등록 중 오류가 발생했습니다.");
    } finally {
      setSubmittingLog(false);
    }
  };

  // 상태 직접 변경
  const handleStatusChange = async (newStatus: ConsultationStatus) => {
    setChangingStatus(true);
    try {
      const res = await apiFetch(`/api/consultations/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "상태 변경에 실패했습니다.");
        return;
      }
      toast.success(`상태가 '${STATUS_LABELS[newStatus]}'(으)로 변경되었습니다.`);
      setConsultation((prev) =>
        prev ? { ...prev, status: newStatus } : prev,
      );

      // 자동 로그: "상태를 X로 변경"
      apiFetch(`/api/consultations/${id}/logs`, {
        method: "POST",
        body: JSON.stringify({
          content: `상태를 '${STATUS_LABELS[newStatus]}'(으)로 변경했습니다.`,
          status: newStatus,
        }),
      }).then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          if (d.data) setLogs((prev) => [...prev, d.data]);
        }
      }).catch(() => {});
    } catch {
      toast.error("상태 변경 중 오류가 발생했습니다.");
    } finally {
      setChangingStatus(false);
    }
  };

  // 판매 완료 모달 열기 — 차량 목록 함께 로드
  const openSaleModal = useCallback(async () => {
    setSelectedVehicleId("");
    setSaleModalOpen(true);
    setLoadingVehicles(true);
    try {
      const res = await apiFetch("/api/vehicles?status=available");
      if (!res.ok) return;
      const data = await res.json();
      setAvailableVehicles(data.data ?? []);
    } catch {
      toast.error("차량 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingVehicles(false);
    }
  }, []);

  // 판매 등록 (상담 경유)
  const handleSaleSubmit = useCallback(async () => {
    if (!selectedVehicleId) {
      toast.error("차량을 선택해주세요.");
      return;
    }
    if (!consultation?.assigned_dealer_id) {
      toast.error("배정된 딜러가 없습니다. 먼저 딜러를 배정해주세요.");
      return;
    }
    setSubmittingSale(true);
    try {
      const res = await apiFetch("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          consultation_id: id,
          vehicle_id: selectedVehicleId,
          dealer_id: consultation.assigned_dealer_id,
          is_db_provided: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "판매 등록에 실패했습니다.");
        return;
      }
      toast.success("판매가 등록되었습니다.");
      setSaleModalOpen(false);
      router.push(`/sales/${data.data.sale_id}`);
    } catch {
      toast.error("판매 등록 중 오류가 발생했습니다.");
    } finally {
      setSubmittingSale(false);
    }
  }, [id, selectedVehicleId, consultation, router]);

  const isPrivileged = userRole === "admin" || userRole === "staff";

  // 예산 편집 모달 열기 — 현재 값을 폼에 프리필
  const openBudgetModal = useCallback(() => {
    setBudgetDeposit(
      consultation?.available_deposit != null
        ? String(consultation.available_deposit)
        : "",
    );
    setBudgetMonthly(
      consultation?.desired_monthly_payment != null
        ? String(consultation.desired_monthly_payment)
        : "",
    );
    setBudgetModalOpen(true);
  }, [consultation]);

  // 예산 저장
  const handleBudgetSave = useCallback(async () => {
    const deposit = budgetDeposit.trim();
    const monthly = budgetMonthly.trim();

    const payload = {
      available_deposit: deposit === "" ? null : Number(deposit),
      desired_monthly_payment: monthly === "" ? null : Number(monthly),
    };

    if (
      (payload.available_deposit !== null &&
        !Number.isFinite(payload.available_deposit)) ||
      (payload.desired_monthly_payment !== null &&
        !Number.isFinite(payload.desired_monthly_payment))
    ) {
      toast.error("숫자만 입력해 주세요.");
      return;
    }

    setSavingBudget(true);
    try {
      const res = await apiFetch(`/api/consultations/${id}/budget`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "예산 정보 저장에 실패했습니다.");
        return;
      }
      toast.success("예산 정보가 저장되었습니다.");
      setConsultation((prev) =>
        prev
          ? {
              ...prev,
              available_deposit: payload.available_deposit,
              desired_monthly_payment: payload.desired_monthly_payment,
            }
          : prev,
      );
      setBudgetModalOpen(false);
    } catch {
      toast.error("예산 정보 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingBudget(false);
    }
  }, [id, budgetDeposit, budgetMonthly]);

  if (loading) {
    return (
      <div>
        <div className="mb-4">
          <BackLink href={getReturnUrl("consultations", "/consultations")}>상담 목록으로</BackLink>
        </div>
        <LoadingState variant="form" />
      </div>
    );
  }

  if (!consultation) return null;

  // 현재 상태에서 허용된 전이 목록
  const allowedTransitions = ALLOWED_TRANSITIONS[consultation.status].filter(
    (s) => {
      // rejected → consulting은 admin/staff만
      if (consultation.status === "rejected" && s === "consulting") {
        return isPrivileged;
      }
      return true;
    },
  );

  // 상담 기록 입력 폼에서 보여줄 상태 선택지 (sold 제외)
  const logStatusOptions = allowedTransitions;

  // 배정된 딜러명 조회
  const assignedDealerName = dealers.find(
    (d) => d.id === consultation.assigned_dealer_id,
  )?.name;

  // 메모/통화기록 입력 중 이탈 경고 플래그
  const isFormDirty = logContent.trim().length > 0;

  return (
    <div>
      <div className="mb-4">
        <BackLink href={getReturnUrl("consultations", "/consultations")}>상담 목록으로</BackLink>
      </div>

      <PageHeader title={`${consultation.customer_name} 님 상담`}>
        {/* 판매 완료 버튼: 판매 가능 상태이고, admin/staff 또는 배정 딜러인 경우 */}
        {consultation.status !== "sold" &&
          consultation.status !== "rejected" &&
          (isPrivileged || consultation.assigned_dealer_id !== null) && (
            <Button size="sm" onClick={openSaleModal}>
              <ShoppingCart className="h-4 w-4 mr-1.5" />
              판매 완료
            </Button>
          )}
      </PageHeader>

      <div className="space-y-6 max-w-4xl mx-auto">
        {/* ── 기본 정보 카드 ── */}
        <Card>
          <CardContent className="pt-6">
            {/* 상태 + 상태 변경 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <StatusBadge
                  type="consultation"
                  value={consultation.status}
                />
                {consultation.is_duplicate && (
                  <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5">
                    중복
                  </span>
                )}
              </div>
              {/* 상태 변경 (admin/staff 전용, sold 제외).
                  dealer는 consultation_logs 경유 status_snapshot으로만 상태 변경 가능. */}
              {isPrivileged &&
                consultation.status !== "sold" &&
                allowedTransitions.length > 0 && (
                  <Select
                    disabled={changingStatus}
                    value=""
                    onValueChange={(v) =>
                      handleStatusChange(v as ConsultationStatus)
                    }
                  >
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue placeholder="상태 변경" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedTransitions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
              <InfoItem label="고객명" value={consultation.customer_name} />
              <InfoItem label="전화번호">
                <a
                  href={`tel:${consultation.phone}`}
                  className="font-medium text-sm text-primary hover:underline"
                >
                  {formatPhone(consultation.phone)}
                </a>
              </InfoItem>
              <InfoItem
                label="관심차종"
                value={consultation.interested_vehicle ?? "—"}
              />
              <InfoItem
                label="유입경로"
                value={formatSourceRef(consultation.source_ref)}
              />
              <InfoItem
                label="접수일"
                value={formatDate(consultation.created_at)}
              />
            </div>

            {consultation.message && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">문의 내용</p>
                <p className="text-sm whitespace-pre-wrap">
                  {consultation.message}
                </p>
              </div>
            )}

            {/* 예산 정보 — 값 있을 때 노출. admin/staff 는 값 없어도 편집용으로 노출 */}
            {(consultation.available_deposit != null ||
              consultation.desired_monthly_payment != null ||
              isPrivileged) && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-xs text-muted-foreground">예산 정보</p>
                  {isPrivileged && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBudgetModal}
                      className="h-7 px-2.5 text-xs"
                    >
                      편집
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <InfoItem
                    label="보증금 가능"
                    value={
                      consultation.available_deposit != null
                        ? `${consultation.available_deposit.toLocaleString()}만원`
                        : "—"
                    }
                  />
                  <InfoItem
                    label="희망 월 납입료"
                    value={
                      consultation.desired_monthly_payment != null
                        ? `${consultation.desired_monthly_payment.toLocaleString()}만원`
                        : "—"
                    }
                  />
                </div>
              </div>
            )}

            {/* UTM 상세 — 값 있을 때만 노출 */}
            {(consultation.utm_medium ||
              consultation.utm_campaign ||
              consultation.utm_content) && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">
                  광고 추적 파라미터
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <InfoItem
                    label="utm_medium"
                    value={consultation.utm_medium ?? "—"}
                  />
                  <InfoItem
                    label="utm_campaign"
                    value={consultation.utm_campaign ?? "—"}
                  />
                  <InfoItem
                    label="utm_content"
                    value={consultation.utm_content ?? "—"}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 동일 고객 섹션 ── */}
        {relatedConsultations.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                동일 고객 상담 ({relatedConsultations.length}건)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {relatedConsultations.map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => router.push(`/consultations/${rel.id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm text-left"
                >
                  <span className="text-muted-foreground">
                    {formatDate(rel.created_at)}
                    {rel.interested_vehicle
                      ? ` · ${rel.interested_vehicle}`
                      : ""}
                  </span>
                  <StatusBadge type="consultation" value={rel.status} />
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── 딜러 배정 섹션 (admin/staff만) ── */}
        {isPrivileged && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">딜러 배정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {assignedDealerName && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    현재 배정:{" "}
                    <span className="text-foreground font-medium">
                      {assignedDealerName}
                    </span>
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-400 hover:text-red-400 hover:border-red-400/50 text-xs"
                    onClick={handleUnassign}
                    disabled={assigning}
                  >
                    배정 해제
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">딜러 선택</Label>
                  <Select
                    value={selectedDealerId}
                    onValueChange={setSelectedDealerId}
                    disabled={loading}
                  >
                    <SelectTrigger className={loading ? "opacity-60" : ""}>
                      <SelectValue
                        placeholder={
                          loading ? "로딩 중..." : "딜러를 선택하세요"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {dealers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">마케팅업체</Label>
                  {marketingMode === "select" ? (
                    <Select
                      value={marketingCompany}
                      onValueChange={(v) => {
                        if (v === "__custom__") {
                          setMarketingMode("custom");
                          setMarketingCompany("");
                        } else {
                          setMarketingCompany(v);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="업체 선택 (선택)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">선택 안함</SelectItem>
                        {marketingCompanies.map((c) => (
                          <SelectItem key={c.id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">
                          기타 (직접 입력)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-1.5">
                      <Input
                        placeholder="업체명 직접 입력"
                        value={marketingCompany}
                        onChange={(e) => setMarketingCompany(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs shrink-0"
                        onClick={() => {
                          setMarketingMode("select");
                          setMarketingCompany("");
                        }}
                      >
                        목록
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleAssign}
                disabled={assigning || !selectedDealerId}
              >
                {assigning ? "배정 중..." : "배정"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── 상담 기록 타임라인 ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              상담 기록 ({logs.length}건)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {/* 기록 목록 */}
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                아직 상담 기록이 없습니다.
              </p>
            ) : (
              <div className="space-y-4 mb-6">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-4">
                    {/* 왼쪽: 시간 */}
                    <div className="shrink-0 w-32 text-xs text-muted-foreground pt-1 text-right">
                      {formatDate(log.created_at)}
                    </div>
                    {/* 세로선 */}
                    <div className="shrink-0 flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="w-px flex-1 bg-border mt-1" />
                    </div>
                    {/* 오른쪽: 내용 카드 */}
                    <div className="flex-1 pb-4">
                      <p className="text-xs text-muted-foreground mb-1">
                        {log.dealer_name ?? "알 수 없음"}
                      </p>
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {log.content}
                        </p>
                        <div className="mt-2">
                          <StatusBadge
                            type="consultation"
                            value={log.status_snapshot as ConsultationStatus}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={logBottomRef} />
              </div>
            )}

            {/* 새 기록 입력 폼 (sold 상태면 숨김) */}
            {consultation.status !== "sold" && (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground mb-3">
                  새 상담 기록
                </p>
                <div className="flex gap-3">
                  <Textarea
                    placeholder="통화 내용을 입력하세요"
                    value={logContent}
                    onChange={(e) => setLogContent(e.target.value)}
                    rows={2}
                    className="resize-none flex-1"
                  />
                  <Button
                    size="sm"
                    className="shrink-0 self-end"
                    onClick={handleSubmitLog}
                    disabled={submittingLog || !logContent.trim()}
                  >
                    {submittingLog ? "처리 중..." : "등록"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 판매 완료 모달 ── */}
      <Dialog open={saleModalOpen} onOpenChange={setSaleModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>판매 완료 등록</DialogTitle>
            <DialogDescription>
              {consultation.customer_name} 님 상담을 판매 완료로 처리합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 차량 선택 */}
            <div className="space-y-1.5">
              <Label className="text-xs">차량 선택 *</Label>
              <Select
                value={selectedVehicleId}
                onValueChange={setSelectedVehicleId}
                disabled={loadingVehicles}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingVehicles ? "로딩 중..." : "출고가능 차량 선택"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableVehicles.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      출고가능 차량이 없습니다
                    </SelectItem>
                  ) : (
                    availableVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.vehicle_code} — {v.make} {v.model} ({v.year}년)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* 고정 정보 표시 */}
            <div className="space-y-1.5">
              <Label className="text-xs">DB제공 여부</Label>
              <p className="text-sm font-medium px-3 py-2 rounded-md bg-muted/50 border border-border text-blue-400">
                DB제공 판매
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">수당</Label>
                <p className="text-sm font-medium px-3 py-2 rounded-md bg-muted/50 border border-border text-emerald-400">
                  500,000원
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">수수료</Label>
                <p className="text-sm font-medium px-3 py-2 rounded-md bg-muted/50 border border-border">
                  700,000원
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSaleModalOpen(false)}
              disabled={submittingSale}
            >
              취소
            </Button>
            <Button
              onClick={handleSaleSubmit}
              disabled={submittingSale || !selectedVehicleId}
            >
              {submittingSale ? "처리 중..." : "판매 등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 예산 편집 모달 (admin/staff 전용) ── */}
      <Dialog open={budgetModalOpen} onOpenChange={setBudgetModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>예산 정보 편집</DialogTitle>
            <DialogDescription>
              고객 상담 후 확인된 보증금·희망 월 납입료를 기록합니다.
              빈값으로 저장하면 값이 제거됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="budget-deposit" className="text-xs">
                보증금 가능 금액
              </Label>
              <div className="relative">
                <Input
                  id="budget-deposit"
                  type="text"
                  inputMode="numeric"
                  placeholder="예: 500"
                  value={budgetDeposit}
                  onChange={(e) =>
                    setBudgetDeposit(
                      e.target.value.replace(/[^0-9]/g, "").slice(0, 6),
                    )
                  }
                  className="pr-12"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  만원
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="budget-monthly" className="text-xs">
                희망 월 납입료
              </Label>
              <div className="relative">
                <Input
                  id="budget-monthly"
                  type="text"
                  inputMode="numeric"
                  placeholder="예: 60"
                  value={budgetMonthly}
                  onChange={(e) =>
                    setBudgetMonthly(
                      e.target.value.replace(/[^0-9]/g, "").slice(0, 6),
                    )
                  }
                  className="pr-12"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  만원
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setBudgetModalOpen(false)}
              disabled={savingBudget}
            >
              취소
            </Button>
            <Button onClick={handleBudgetSave} disabled={savingBudget}>
              {savingBudget ? "처리 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 통화기록 입력 중 이탈 경고 */}
      <UnsavedChangesGuard isDirty={isFormDirty} />
    </div>
  );
}
