"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  Download,
  FileText,
  PenLine,
  AlertTriangle,
  FilePlus,
  Send,
  Link2,
  Clock,
  CheckCircle,
  PackageCheck,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { LoadingState } from "@/components/loading-state";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUpload } from "@/components/file-upload";
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
import type { UserRole } from "@/types/database";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------
interface Sale {
  id: string;
  consultation_id: string | null;
  vehicle_id: string;
  dealer_id: string;
  actor_id: string;
  is_db_provided: boolean;
  dealer_fee: number;
  marketing_fee: number;
  cancelled_at: string | null;
  delivery_confirmed_at: string | null;
  delivery_confirmed_by: string | null;
  created_at: string;
}

interface DeliveryConfirmedBy {
  id: string;
  name: string;
}

interface VehicleInfo {
  id: string;
  vehicle_code: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  selling_price: number;
  deposit: number;
}

interface DealerInfo {
  id: string;
  name: string;
  email: string;
}

interface ConsultationInfo {
  id: string;
  customer_name: string;
  customer_phone: string;
}

interface ContractFile {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  metadata: Record<string, unknown> | null;
  url: string;
}

/** 전자 계약서 */
interface ElectronicContract {
  id: string;
  sale_id: string;
  token: string;
  status: "draft" | "sent" | "signed";
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string | null;
  vehicle_info: {
    make: string;
    model: string;
    year: number;
    mileage: number;
    vehicle_code: string;
  };
  selling_price: number;
  deposit: number;
  signature_url: string | null;
  signed_at: string | null;
  pdf_url: string | null;
  created_at: string;
}

interface SaleDetail {
  data: Sale;
  vehicle: VehicleInfo | null;
  dealer: DealerInfo | null;
  consultation: ConsultationInfo | null;
  deliveryConfirmedBy: DeliveryConfirmedBy | null;
  signatureUrl: string | null;
  contractFiles: ContractFile[];
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------
function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
}

// ---------------------------------------------------------------------------
// InfoItem 보조 컴포넌트
// ---------------------------------------------------------------------------
function InfoItem({
  label,
  value,
  children,
  valueClass,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      {children ?? (
        <p className={`font-medium text-sm ${valueClass ?? ""}`}>
          {value ?? "—"}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------
export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { role: userRole } = useUserRole();

  // 서명 패드 상태
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  // 계약서 업로드 상태
  const [uploadingContract, setUploadingContract] = useState(false);

  // 계약서 PDF 생성 상태
  const [generatingContract, setGeneratingContract] = useState(false);

  // 취소 다이얼로그 상태
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // 출고 확인 다이얼로그 상태
  const [confirmDeliveryOpen, setConfirmDeliveryOpen] = useState(false);
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);

  // 전자 계약서 상태
  const [electronicContract, setElectronicContract] = useState<ElectronicContract | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [sendingContract, setSendingContract] = useState(false);

  // 전자 계약서 생성 폼
  const [contractForm, setContractForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    customer_address: "",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_year: "",
    vehicle_mileage: "",
    vehicle_plate_number: "",
    vehicle_vin: "",
    vehicle_color: "",
    contract_type: "accident" as "accident" | "safe",
  });
  const [creatingContract, setCreatingContract] = useState(false);

  // 판매 상세 로드
  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/sales/${id}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "판매 정보를 불러오지 못했습니다.");
        router.push("/sales");
        return;
      }
      const data: SaleDetail = await res.json();
      setDetail(data);

      // actor 이름은 API 응답의 dealer 정보에서 확인
    } catch {
      toast.error("판매 정보를 불러오는 중 오류가 발생했습니다.");
      router.push("/sales");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // 전자 계약서 로드
  const fetchElectronicContract = useCallback(async () => {
    setContractLoading(true);
    try {
      const res = await apiFetch(`/api/contracts?sale_id=${id}`);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        console.log("[contracts] 조회 실패:", res.status, d?.error);
        return;
      }
      const data = await res.json();
      const contracts: ElectronicContract[] = data.data ?? [];
      // 가장 최신 계약서를 사용
      setElectronicContract(contracts[0] ?? null);
    } catch {
      // 에러 시 무시 (전자 계약서는 선택 기능)
    } finally {
      setContractLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchElectronicContract();
  }, [fetchElectronicContract]);

  // 전자 계약서 생성 폼 초기값: 상담 정보 + 차량 정보에서 자동 입력
  useEffect(() => {
    if (detail) {
      setContractForm((prev) => ({
        ...prev,
        customer_name: detail.consultation?.customer_name ?? prev.customer_name,
        vehicle_make: detail.vehicle?.make ?? prev.vehicle_make,
        vehicle_model: detail.vehicle?.model ?? prev.vehicle_model,
        vehicle_year: detail.vehicle?.year ? String(detail.vehicle.year) : prev.vehicle_year,
        vehicle_mileage: detail.vehicle?.mileage ? String(detail.vehicle.mileage) : prev.vehicle_mileage,
      }));
    }
  }, [detail]);

  // 전자 계약서 생성
  const handleCreateContract = useCallback(async () => {
    if (!contractForm.customer_name.trim() || !contractForm.customer_email.trim()) {
      toast.error("고객명과 이메일은 필수입니다.");
      return;
    }
    setCreatingContract(true);
    try {
      // 차량 정보 — 입력값이 있으면 우선 사용, 없으면 undefined (API가 DB에서 조회)
      const vehicleInfoOverride: Record<string, unknown> = {};
      if (contractForm.vehicle_make.trim()) vehicleInfoOverride.make = contractForm.vehicle_make.trim();
      if (contractForm.vehicle_model.trim()) vehicleInfoOverride.model = contractForm.vehicle_model.trim();
      if (contractForm.vehicle_year.trim()) vehicleInfoOverride.year = Number(contractForm.vehicle_year.trim());
      if (contractForm.vehicle_mileage.trim()) vehicleInfoOverride.mileage = Number(contractForm.vehicle_mileage.trim());
      if (contractForm.vehicle_plate_number.trim()) vehicleInfoOverride.plate_number = contractForm.vehicle_plate_number.trim();
      if (contractForm.vehicle_vin.trim()) vehicleInfoOverride.vin = contractForm.vehicle_vin.trim();
      if (contractForm.vehicle_color.trim()) vehicleInfoOverride.color = contractForm.vehicle_color.trim();

      const res = await apiFetch("/api/contracts", {
        method: "POST",
        body: JSON.stringify({
          sale_id: id,
          customer_name: contractForm.customer_name.trim(),
          customer_phone: contractForm.customer_phone.trim(),
          customer_email: contractForm.customer_email.trim(),
          customer_address: contractForm.customer_address.trim() || undefined,
          vehicle_info: Object.keys(vehicleInfoOverride).length > 0 ? vehicleInfoOverride : undefined,
          contract_type: contractForm.contract_type,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "계약서 생성에 실패했습니다.");
        return;
      }
      toast.success("전자 계약서가 생성되었습니다.");
      setContractDialogOpen(false);
      setElectronicContract(data.data);
    } catch {
      toast.error("계약서 생성 중 오류가 발생했습니다.");
    } finally {
      setCreatingContract(false);
    }
  }, [id, contractForm]);

  // 서명 요청 발송
  const handleSendContract = useCallback(async () => {
    if (!electronicContract) return;
    setSendingContract(true);
    try {
      const res = await apiFetch(`/api/contracts/${electronicContract.id}/send`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "발송에 실패했습니다.");
        return;
      }
      toast.success("서명 요청이 발송되었습니다.");
      setElectronicContract((prev) =>
        prev ? { ...prev, status: "sent" } : prev,
      );
    } catch {
      toast.error("발송 중 오류가 발생했습니다.");
    } finally {
      setSendingContract(false);
    }
  }, [electronicContract]);

  // 서명 링크 복사
  const handleCopySignLink = useCallback(() => {
    if (!electronicContract) return;
    const url = `${window.location.origin}/sign/${electronicContract.token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("서명 링크가 복사되었습니다.");
    }).catch(() => {
      toast.error("링크 복사에 실패했습니다.");
    });
  }, [electronicContract]);

  // 서명 업로드 핸들러
  const handleSignatureComplete = useCallback(
    async (blob: Blob) => {
      setSignaturePadOpen(false);
      setUploadingSignature(true);
      try {
        const formData = new FormData();
        formData.append("signature", blob, "signature.png");

        const res = await apiFetch(`/api/sales/${id}/signature`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "서명 업로드에 실패했습니다.");
          return;
        }
        toast.success("서명이 완료되었습니다.");
        // 서명 URL 업데이트
        setDetail((prev) =>
          prev ? { ...prev, signatureUrl: data.signatureUrl } : prev,
        );
      } catch {
        toast.error("서명 업로드 중 오류가 발생했습니다.");
      } finally {
        setUploadingSignature(false);
      }
    },
    [id],
  );

  // 계약서 업로드 핸들러
  const handleContractUpload = useCallback(
    async (file: File) => {
      setUploadingContract(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await apiFetch(`/api/sales/${id}/contracts`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "계약서 업로드에 실패했습니다.");
        }
        toast.success("계약서가 업로드되었습니다.");
        // 상세 새로고침 (계약서 목록 갱신)
        await fetchDetail();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "계약서 업로드 중 오류가 발생했습니다.";
        toast.error(message);
        throw err;
      } finally {
        setUploadingContract(false);
      }
    },
    [id, fetchDetail],
  );

  // 출고 확인 핸들러 — 수당 자동 배분 트리거
  const handleConfirmDelivery = useCallback(async () => {
    setConfirmingDelivery(true);
    try {
      const res = await apiFetch(`/api/sales/${id}/confirm-delivery`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "출고 확인에 실패했습니다.");
        return;
      }
      toast.success("출고 확인 완료. 수당이 배분되었습니다.");
      setConfirmDeliveryOpen(false);
      await fetchDetail();
    } catch {
      toast.error("출고 확인 처리 중 오류가 발생했습니다.");
    } finally {
      setConfirmingDelivery(false);
    }
  }, [id, fetchDetail]);

  // 판매 취소 핸들러
  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error("취소 사유를 입력해주세요.");
      return;
    }
    setCancelling(true);
    try {
      const res = await apiFetch(`/api/sales/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "판매 취소에 실패했습니다.");
        return;
      }
      toast.success("판매가 취소되었습니다.");
      setCancelOpen(false);
      setCancelReason("");
      // 페이지 새로고침 (취소 상태 반영)
      await fetchDetail();
    } catch {
      toast.error("판매 취소 중 오류가 발생했습니다.");
    } finally {
      setCancelling(false);
    }
  };

  // 계약서 PDF 생성 핸들러
  const handleGenerateContract = useCallback(async () => {
    if (!detail?.vehicle) {
      toast.error("차량 정보가 없어 계약서를 생성할 수 없습니다.");
      return;
    }

    setGeneratingContract(true);
    try {
      // 클라이언트 사이드에서 PDF 생성
      const { generateContractPDF } = await import("@/src/lib/contract-generator");

      // 서명 이미지가 있으면 fetch하여 Uint8Array로 변환
      let signatureImage: Uint8Array | undefined;
      if (detail.signatureUrl) {
        try {
          const sigResponse = await fetch(detail.signatureUrl);
          if (sigResponse.ok) {
            const sigBuffer = await sigResponse.arrayBuffer();
            signatureImage = new Uint8Array(sigBuffer);
          }
        } catch {
          // 서명 이미지 로드 실패 시 서명 없이 계속
        }
      }

      const blob = await generateContractPDF({
        make: detail.vehicle.make,
        model: detail.vehicle.model,
        year: detail.vehicle.year,
        mileage: detail.vehicle.mileage,
        sellingPrice: detail.vehicle.selling_price,
        deposit: detail.vehicle.deposit,
        customerName: detail.consultation?.customer_name ?? "—",
        customerPhone: detail.consultation?.customer_phone ?? "—",
        signatureImage,
      });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");

      // Storage에도 저장 (백그라운드)
      const formData = new FormData();
      formData.append("pdf", blob, "contract.pdf");

      const saveRes = await apiFetch(`/api/sales/${id}/contract-pdf`, {
        method: "POST",
        body: formData,
      });

      if (saveRes.ok) {
        toast.success("계약서가 생성되었습니다.");
        // 계약서 목록 갱신
        await fetchDetail();
      } else {
        // Storage 저장 실패 시도 PDF는 이미 열렸으므로 경고만
        toast.warning("계약서를 열었지만 저장에 실패했습니다. 다운로드하여 보관해주세요.");
      }

      // Blob URL 해제 (메모리 정리)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      toast.error("계약서 생성 중 오류가 발생했습니다.");
    } finally {
      setGeneratingContract(false);
    }
  }, [detail, id, fetchDetail]);

  const isPrivileged = userRole === "admin" || userRole === "staff";

  if (loading) {
    return (
      <div>
        <div className="mb-4">
          <Link
            href="/sales"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            판매 목록으로
          </Link>
        </div>
        <LoadingState variant="form" />
      </div>
    );
  }

  if (!detail) return null;

  const {
    data: sale,
    vehicle,
    dealer,
    consultation,
    deliveryConfirmedBy,
    signatureUrl,
    contractFiles,
  } = detail;

  const isCancelled = !!sale.cancelled_at;
  const isDeliveryConfirmed = !!sale.delivery_confirmed_at;
  const hasActorDiff = sale.actor_id !== sale.dealer_id;
  // 출고 확인 권한: 인증된 유효 역할 전원 (admin/staff/director/team_leader/dealer)
  const canConfirmDelivery =
    userRole === "admin" ||
    userRole === "staff" ||
    userRole === "director" ||
    userRole === "team_leader" ||
    userRole === "dealer";

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/sales"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          판매 목록으로
        </Link>
      </div>

      <PageHeader
        title={
          vehicle
            ? `${vehicle.make} ${vehicle.model} 판매`
            : "판매 상세"
        }
      />

      <div className="space-y-6 max-w-4xl mx-auto">
        {/* ── 판매 정보 카드 ── */}
        <Card>
          <CardContent className="pt-6">
            {/* 상태 배지 */}
            <div className="flex items-center gap-3 mb-6">
              {isCancelled ? (
                <Badge
                  variant="outline"
                  className="bg-red-500/10 text-red-400 border-red-500/20"
                >
                  취소됨
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                >
                  활성
                </Badge>
              )}
              {sale.is_db_provided && (
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-400 border-blue-500/20"
                >
                  DB제공
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
              {/* 차량 정보 */}
              <InfoItem
                label="차량코드"
                value={vehicle?.vehicle_code ?? "—"}
              />
              <InfoItem
                label="차종/모델"
                value={
                  vehicle
                    ? `${vehicle.make} ${vehicle.model}`
                    : "—"
                }
              />
              <InfoItem
                label="연식"
                value={vehicle ? `${vehicle.year}년` : "—"}
              />

              {/* 딜러 */}
              <InfoItem label="딜러" value={dealer?.name ?? "—"} />

              {/* 고객 (상담 경유 시) */}
              <InfoItem
                label="고객명"
                value={consultation?.customer_name ?? "자체 판매"}
              />

              {/* 수당/수수료 */}
              <InfoItem
                label="수당"
                value={formatKRW(sale.dealer_fee)}
                valueClass="text-emerald-400"
              />
              <InfoItem
                label="수수료"
                value={formatKRW(sale.marketing_fee)}
              />

              {/* 등록일 */}
              <InfoItem
                label="등록일"
                value={formatDate(sale.created_at)}
              />
            </div>

            {/* actor vs dealer 다를 때 표시 */}
            {hasActorDiff && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  등록자:{" "}
                  <span className="text-foreground font-medium">
                    {sale.actor_id !== sale.dealer_id}
                  </span>{" "}
                  (딜러: {dealer?.name ?? "—"})
                </p>
              </div>
            )}

            {/* 취소 정보 */}
            {isCancelled && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">취소일</p>
                <p className="text-sm font-medium text-red-400">
                  {formatDate(sale.cancelled_at!)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 출고 확인 섹션 — 수당 자동 배분 트리거 ── */}
        {!isCancelled && (
          <Card
            className={
              isDeliveryConfirmed
                ? "border-emerald-500/20"
                : "border-primary/30"
            }
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <PackageCheck className="h-4 w-4" />
                출고 확인
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isDeliveryConfirmed ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 font-medium">
                    출고 확인 완료
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-foreground">
                    {deliveryConfirmedBy?.name ?? "—"}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {formatDate(sale.delivery_confirmed_at!)}
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    확인 시 수당이 자동 배분됩니다. 취소할 수 없습니다.
                  </p>
                  {canConfirmDelivery && (
                    <Button
                      size="sm"
                      onClick={() => setConfirmDeliveryOpen(true)}
                      disabled={confirmingDelivery}
                    >
                      <PackageCheck className="h-4 w-4 mr-1.5" />
                      출고 확인
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── 전자 계약서 섹션 ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">전자 계약서</CardTitle>
          </CardHeader>
          <CardContent>
            {contractLoading ? (
              <p className="text-sm text-muted-foreground">불러오는 중...</p>
            ) : !electronicContract ? (
              /* a. 계약서 없음 */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  아직 전자 계약서가 없습니다.
                </p>
                {!isCancelled && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setContractForm({
                        customer_name: consultation?.customer_name ?? "",
                        customer_phone: consultation?.customer_phone ?? "",
                        customer_email: "",
                        customer_address: "",
                        vehicle_make: vehicle?.make ?? "",
                        vehicle_model: vehicle?.model ?? "",
                        vehicle_year: vehicle?.year ? String(vehicle.year) : "",
                        vehicle_mileage: vehicle?.mileage ? String(vehicle.mileage) : "",
                        vehicle_plate_number: "",
                        vehicle_vin: "",
                        vehicle_color: "",
                        contract_type: "accident",
                      });
                      setContractDialogOpen(true);
                    }}
                  >
                    <FilePlus className="h-4 w-4 mr-1.5" />
                    전자 계약서 작성
                  </Button>
                )}
              </div>
            ) : electronicContract.status === "draft" ? (
              /* b. draft — 작성됨, 미발송 */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="bg-muted text-muted-foreground border-border"
                  >
                    작성됨
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">고객명</p>
                    <p className="font-medium">{electronicContract.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">전화</p>
                    <p className="font-medium">{electronicContract.customer_phone || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">이메일</p>
                    <p className="font-medium">{electronicContract.customer_email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleSendContract}
                    disabled={sendingContract}
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    {sendingContract ? "발송 중..." : "서명 요청 발송"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCopySignLink}>
                    <Link2 className="h-4 w-4 mr-1.5" />
                    서명 링크 복사
                  </Button>
                </div>
              </div>
            ) : electronicContract.status === "sent" ? (
              /* c. sent — 발송됨, 서명 대기 */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    서명 대기
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">서명 링크</p>
                  <a
                    href={`/sign/${electronicContract.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:underline break-all"
                  >
                    {`${typeof window !== "undefined" ? window.location.origin : ""}/sign/${electronicContract.token}`}
                  </a>
                </div>
                <Button size="sm" variant="outline" onClick={handleCopySignLink}>
                  <Link2 className="h-4 w-4 mr-1.5" />
                  서명 링크 복사
                </Button>
              </div>
            ) : (
              /* d. signed — 서명 완료 */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    서명 완료
                  </Badge>
                  {electronicContract.signed_at && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(electronicContract.signed_at)}
                    </span>
                  )}
                </div>

                {/* 서명 이미지 미리보기 */}
                {electronicContract.signature_url && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">서명</p>
                    <div className="max-w-xs rounded-lg overflow-hidden border border-border bg-muted/30 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={electronicContract.signature_url}
                        alt="고객 서명"
                        className="h-16 object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* PDF 다운로드 / 재생성 */}
                {electronicContract.pdf_url ? (
                  <a
                    href={electronicContract.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download="계약서.pdf"
                  >
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-1.5" />
                      계약서 PDF 다운로드
                    </Button>
                  </a>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        toast.info("PDF 생성 중...");
                        const res = await apiFetch(`/api/contracts/${electronicContract.id}/regenerate-pdf`, { method: "POST" });
                        const d = await res.json();
                        if (!res.ok) { toast.error(d.error ?? "PDF 생성 실패"); return; }
                        toast.success("PDF가 생성되었습니다.");
                        if (d.url) window.open(d.url, "_blank");
                        await fetchDetail();
                      } catch {
                        toast.error("PDF 생성에 실패했습니다.");
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    PDF 재생성
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 판매 취소 섹션 (admin/staff, 취소 전) ── */}
        {isPrivileged && !isCancelled && (
          <Card className="border-red-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                판매 취소
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                판매를 취소하면 차량 상태가 변경됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setCancelOpen(true)}
              >
                판매 취소
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 서명 패드 다이얼로그 */}
      <SignaturePad
        open={signaturePadOpen}
        onClose={() => setSignaturePadOpen(false)}
        onComplete={handleSignatureComplete}
      />

      {/* 전자 계약서 생성 다이얼로그 */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>전자 계약서 작성</DialogTitle>
            <DialogDescription>
              차량 정보와 고객 정보를 확인하고 수정하세요.
              이메일로 서명 요청 링크를 발송할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* 차량 정보 섹션 */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                차량 정보
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">브랜드</Label>
                  <Input
                    placeholder="현대"
                    value={contractForm.vehicle_make}
                    onChange={(e) =>
                      setContractForm((prev) => ({
                        ...prev,
                        vehicle_make: e.target.value,
                      }))
                    }
                    disabled={creatingContract}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">차종</Label>
                  <Input
                    placeholder="아반떼"
                    value={contractForm.vehicle_model}
                    onChange={(e) =>
                      setContractForm((prev) => ({
                        ...prev,
                        vehicle_model: e.target.value,
                      }))
                    }
                    disabled={creatingContract}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">연식</Label>
                  <Input
                    placeholder="2022"
                    value={contractForm.vehicle_year}
                    onChange={(e) =>
                      setContractForm((prev) => ({
                        ...prev,
                        vehicle_year: e.target.value,
                      }))
                    }
                    disabled={creatingContract}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">주행거리 (km)</Label>
                  <Input
                    placeholder="30000"
                    value={contractForm.vehicle_mileage}
                    onChange={(e) =>
                      setContractForm((prev) => ({
                        ...prev,
                        vehicle_mileage: e.target.value,
                      }))
                    }
                    disabled={creatingContract}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">차량번호</Label>
                  <Input
                    placeholder="12가 3456"
                    value={contractForm.vehicle_plate_number}
                    onChange={(e) =>
                      setContractForm((prev) => ({
                        ...prev,
                        vehicle_plate_number: e.target.value,
                      }))
                    }
                    disabled={creatingContract}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">차대번호</Label>
                  <Input
                    placeholder="KMHXX..."
                    value={contractForm.vehicle_vin}
                    onChange={(e) =>
                      setContractForm((prev) => ({
                        ...prev,
                        vehicle_vin: e.target.value,
                      }))
                    }
                    disabled={creatingContract}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">색상</Label>
                  <Input
                    placeholder="흰색"
                    value={contractForm.vehicle_color}
                    onChange={(e) =>
                      setContractForm((prev) => ({
                        ...prev,
                        vehicle_color: e.target.value,
                      }))
                    }
                    disabled={creatingContract}
                  />
                </div>
              </div>
            </div>

            {/* 구분선 */}
            <div className="border-t border-border" />

            {/* 계약서 유형 — 사고/무사고 분기 */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                계약서 유형
              </p>
              <div className="flex gap-2">
                {(
                  [
                    { value: "accident" as const, label: "사고 차량" },
                    { value: "safe" as const, label: "무사고 차량" },
                  ]
                ).map((opt) => {
                  const active = contractForm.contract_type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setContractForm((prev) => ({
                          ...prev,
                          contract_type: opt.value,
                        }))
                      }
                      disabled={creatingContract}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                ※ 무사고 차량 선택 시 6조·7조가 무사고용 텍스트로 출력됩니다. 기본값은 "사고 차량".
              </p>
            </div>

            {/* 구분선 */}
            <div className="border-t border-border" />

            {/* 고객 정보 섹션 */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                고객 정보
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  고객명 <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="홍길동"
                  value={contractForm.customer_name}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      customer_name: e.target.value,
                    }))
                  }
                  disabled={creatingContract}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">전화번호</Label>
                <Input
                  placeholder="010-0000-0000"
                  value={contractForm.customer_phone}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      customer_phone: e.target.value,
                    }))
                  }
                  disabled={creatingContract}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  이메일 <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  placeholder="example@email.com"
                  value={contractForm.customer_email}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      customer_email: e.target.value,
                    }))
                  }
                  disabled={creatingContract}
                />
                <p className="text-xs text-muted-foreground">
                  서명 요청 이메일 발송에 사용됩니다.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">주소 (선택)</Label>
                <Input
                  placeholder="서울특별시 ..."
                  value={contractForm.customer_address}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      customer_address: e.target.value,
                    }))
                  }
                  disabled={creatingContract}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setContractDialogOpen(false)}
              disabled={creatingContract}
            >
              취소
            </Button>
            <Button
              onClick={handleCreateContract}
              disabled={
                creatingContract ||
                !contractForm.customer_name.trim() ||
                !contractForm.customer_email.trim()
              }
            >
              {creatingContract ? "생성 중..." : "계약서 생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 출고 확인 다이얼로그 */}
      <Dialog
        open={confirmDeliveryOpen}
        onOpenChange={setConfirmDeliveryOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>출고 확인하시겠습니까?</DialogTitle>
            <DialogDescription>
              확인 시 담당자·상위자에게 수당이 자동 배분되며, 되돌릴 수
              없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDeliveryOpen(false)}
              disabled={confirmingDelivery}
            >
              취소
            </Button>
            <Button
              onClick={handleConfirmDelivery}
              disabled={confirmingDelivery}
            >
              {confirmingDelivery ? "처리 중..." : "출고 확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 판매 취소 확인 다이얼로그 (사유 textarea 포함) */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>판매를 취소하시겠습니까?</DialogTitle>
            <DialogDescription>
              취소된 판매는 복원할 수 없습니다. 취소 사유를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">취소 사유 *</Label>
            <Textarea
              placeholder="취소 사유를 입력하세요"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="resize-none"
              disabled={cancelling}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCancelOpen(false);
                setCancelReason("");
              }}
              disabled={cancelling}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelling || !cancelReason.trim()}
            >
              {cancelling ? "처리 중..." : "판매 취소 확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
