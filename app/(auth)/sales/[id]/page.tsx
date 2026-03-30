"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Download, FileText, PenLine, AlertTriangle } from "lucide-react";
import Image from "next/image";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUpload } from "@/components/file-upload";
import { createBrowserClient } from "@/src/lib/supabase/browser";
import { apiFetch } from "@/src/lib/api-client";
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
  created_at: string;
}

interface VehicleInfo {
  id: string;
  vehicle_code: string;
  make: string;
  model: string;
  year: number;
}

interface DealerInfo {
  id: string;
  name: string;
  email: string;
}

interface ConsultationInfo {
  id: string;
  customer_name: string;
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

interface SaleDetail {
  data: Sale;
  vehicle: VehicleInfo | null;
  dealer: DealerInfo | null;
  consultation: ConsultationInfo | null;
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
  const [userRole, setUserRole] = useState<UserRole>("dealer");
  const [actorName, setActorName] = useState<string>("");

  // 서명 패드 상태
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  // 계약서 업로드 상태
  const [uploadingContract, setUploadingContract] = useState(false);

  // 취소 다이얼로그 상태
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // 프로필 로드
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

      // actor가 dealer와 다를 경우 actor 이름도 조회
      if (data.data.actor_id !== data.data.dealer_id) {
        const supabase = createBrowserClient();
        const { data: profile } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", data.data.actor_id)
          .single();
        if (profile?.name) setActorName(profile.name);
      }
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

  const { data: sale, vehicle, dealer, consultation, signatureUrl, contractFiles } =
    detail;

  const isCancelled = !!sale.cancelled_at;
  const hasActorDiff = sale.actor_id !== sale.dealer_id && actorName;

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
                    {actorName}
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

        {/* ── 전자서명 섹션 ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">전자서명</CardTitle>
          </CardHeader>
          <CardContent>
            {signatureUrl ? (
              /* 서명 완료 */
              <div className="space-y-3">
                <div className="relative aspect-[3/1] rounded-lg overflow-hidden border border-border bg-[#1a1a1a]">
                  <Image
                    src={signatureUrl}
                    alt="전자서명"
                    fill
                    className="object-contain p-2"
                  />
                </div>
                <p className="text-xs text-emerald-400">서명 완료</p>
              </div>
            ) : isCancelled ? (
              /* 취소된 건 — 서명 불가 */
              <p className="text-sm text-muted-foreground">
                취소된 판매에는 서명할 수 없습니다.
              </p>
            ) : (
              /* 서명 미완료 */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  아직 서명이 완료되지 않았습니다.
                </p>
                <Button
                  size="sm"
                  onClick={() => setSignaturePadOpen(true)}
                  disabled={uploadingSignature}
                >
                  <PenLine className="h-4 w-4 mr-1.5" />
                  {uploadingSignature ? "업로드 중..." : "서명하기"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 계약서 섹션 ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">계약서</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 업로드된 파일 목록 */}
            {contractFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                업로드된 계약서가 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {contractFiles.map((file) => {
                  // 파일명에서 타임스탬프 접두어 제거 (표시용)
                  const displayName = file.name.replace(/^\d+_/, "");
                  return (
                    <div
                      key={file.name}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {displayName}
                          </p>
                          {file.created_at && (
                            <p className="text-xs text-muted-foreground">
                              {formatDate(file.created_at)}
                            </p>
                          )}
                        </div>
                      </div>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={displayName}
                        className="shrink-0 ml-3"
                      >
                        <Button variant="outline" size="icon" className="h-8 w-8">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 파일 업로드 (취소된 건은 숨김) */}
            {!isCancelled && (
              <FileUpload
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                maxSizeMB={20}
                onUpload={handleContractUpload}
              />
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
