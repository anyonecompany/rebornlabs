"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  Pencil,
  Trash2,
  FileText,
  ChevronLeft as ArrowLeft,
  ChevronRight as ArrowRight,
} from "lucide-react";
import Image from "next/image";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/src/lib/api-client";
import { getReturnUrl } from "@/src/lib/return-url";
import { formatKRW, formatMileage, formatDate as formatDateBase } from "@/src/lib/format";

const formatDate = (iso: string) => formatDateBase(iso, "datetime");
import { useUserRole } from "@/src/lib/use-user-role";
import { GenerateQuoteDialog } from "@/src/components/quote/generate-quote-dialog";
import type { VehicleStatus, UserRole } from "@/types/database";

interface Vehicle {
  id: string;
  vehicle_code: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  purchase_price: number;
  selling_price: number;
  deposit: number;
  monthly_payment: number;
  margin: number;
  status: VehicleStatus;
  photos: string[];
  plate_number: string | null;
  vin: string | null;
  color: string | null;
  created_at: string;
}

interface DeliveryChecklist {
  id: string;
  vehicle_id: string;
  dealer_id: string;
  dealer_name?: string;
  contract_uploaded: boolean;
  deposit_confirmed: boolean;
  customer_briefed: boolean;
  delivery_photo_uploaded: boolean;
  completed_at: string | null;
  created_at: string;
}

type ChecklistField =
  | "contract_uploaded"
  | "deposit_confirmed"
  | "customer_briefed"
  | "delivery_photo_uploaded";

const CHECKLIST_LABELS: Record<ChecklistField, string> = {
  contract_uploaded: "계약서 업로드",
  deposit_confirmed: "보증금 확인",
  customer_briefed: "고객 설명",
  delivery_photo_uploaded: "출고 사진 업로드",
};


export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [checklists, setChecklists] = useState<DeliveryChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const { role: userRole, userId } = useUserRole();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [checklistUpdating, setChecklistUpdating] = useState<
    Record<string, boolean>
  >({});

  const fetchVehicle = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/vehicles/${id}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "차량 정보를 불러오지 못했습니다.");
        router.push(getReturnUrl("vehicles", "/vehicles"));
        return;
      }
      const data = await res.json();
      // API 응답: { data: vehicle, checklists: [...] }
      setVehicle(data.data);
      setChecklists(data.checklists ?? []);
    } catch {
      toast.error("차량 정보를 불러오는 중 오류가 발생했습니다.");
      router.push(getReturnUrl("vehicles", "/vehicles"));
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchVehicle();
  }, [fetchVehicle]);

  useEffect(() => {
    if (vehicle) {
      document.title = `${vehicle.vehicle_code} ${vehicle.make} ${vehicle.model} - REBORN LABS`;
    }
  }, [vehicle]);

  const handleDelete = async () => {
    try {
      const res = await apiFetch(`/api/vehicles/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "차량 삭제에 실패했습니다.");
        return;
      }
      toast.success("차량이 삭제되었습니다.");
      router.push(getReturnUrl("vehicles", "/vehicles"));
    } catch {
      toast.error("차량 삭제 중 오류가 발생했습니다.");
    }
  };

  const handleChecklistToggle = async (
    field: ChecklistField,
    currentValue: boolean,
  ) => {
    // 딜러: 본인 체크리스트 기준, admin/staff: 딜러 id 기준
    const targetChecklist = checklists.find(
      (c) => userRole === "dealer" ? c.dealer_id === userId : true,
    );

    if (!targetChecklist) {
      // 체크리스트 없으면 먼저 생성
      try {
        const createRes = await apiFetch(`/api/vehicles/${id}/checklist`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          toast.error(createData.error ?? "체크리스트 생성에 실패했습니다.");
          return;
        }
        setChecklists([createData.data]);
        return;
      } catch {
        toast.error("체크리스트 생성 중 오류가 발생했습니다.");
        return;
      }
    }

    const key = `${targetChecklist.id}_${field}`;
    setChecklistUpdating((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await apiFetch(`/api/vehicles/${id}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: !currentValue }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "체크리스트 업데이트에 실패했습니다.");
        return;
      }

      setChecklists((prev) =>
        prev.map((c) =>
          c.id === targetChecklist.id ? { ...c, ...data.data } : c,
        ),
      );
    } catch {
      toast.error("체크리스트 업데이트 중 오류가 발생했습니다.");
    } finally {
      setChecklistUpdating((prev) => ({ ...prev, [key]: false }));
    }
  };

  const isPrivileged =
    userRole === "admin" ||
    userRole === "staff" ||
    userRole === "director" ||
    userRole === "team_leader";

  // 딜러는 본인 체크리스트만 표시
  const visibleChecklists = isPrivileged
    ? checklists
    : checklists.filter((c) => c.dealer_id === userId);

  const showChecklist =
    vehicle?.status === "sold" || checklists.length > 0;

  if (loading) {
    return (
      <div>
        <div className="mb-4">
          <BackLink href="/vehicles">차량 목록으로</BackLink>
        </div>
        <LoadingState variant="form" />
      </div>
    );
  }

  if (!vehicle) return null;

  const photos = vehicle.photos ?? [];

  return (
    <div>
      <div className="mb-4">
        <BackLink href="/vehicles">차량 목록으로</BackLink>
      </div>

      <PageHeader title={`${vehicle.make} ${vehicle.model}`}>
        <div className="flex items-center gap-2">
          {/* 어드민에 로그인한 모든 사용자(pending 제외)에게 견적서 발행 노출 */}
          {userRole && userRole !== "pending" && userRole !== "none" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuoteOpen(true)}
            >
              <FileText className="h-4 w-4 mr-1.5" />
              견적서 만들기
            </Button>
          )}
          {vehicle.status === "available" && (
            <Button
              size="sm"
              onClick={() => router.push(`/sales/new?vehicle_id=${id}`)}
            >
              이 차량으로 판매 등록
            </Button>
          )}
          {isPrivileged && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/vehicles/${id}/edit`)}
              >
                <Pencil className="h-4 w-4 mr-1.5" />
                수정
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-400 hover:text-red-400 hover:border-red-400/50"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                삭제
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      <div className="space-y-6 max-w-4xl mx-auto">
        {/* 차량 정보 카드 */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs text-muted-foreground mb-1">차량코드</p>
                <p className="font-mono text-lg font-bold tracking-wider">
                  {vehicle.vehicle_code}
                </p>
              </div>
              <StatusBadge type="vehicle" value={vehicle.status} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
              <InfoItem label="차종" value={vehicle.make} />
              <InfoItem label="모델" value={vehicle.model} />
              <InfoItem label="연식" value={`${vehicle.year}년`} />
              <InfoItem
                label="주행거리"
                value={formatMileage(vehicle.mileage)}
              />
              {vehicle.plate_number && <InfoItem label="차량번호" value={vehicle.plate_number} />}
              {vehicle.vin && <InfoItem label="차대번호" value={vehicle.vin} />}
              {vehicle.color && <InfoItem label="색상" value={vehicle.color} />}
              <InfoItem label="판매가" value={formatKRW(vehicle.selling_price)} />
              <InfoItem label="보증금" value={formatKRW(vehicle.deposit)} />
              <InfoItem label="월납입료" value={formatKRW(vehicle.monthly_payment)} />

              {isPrivileged && (
                <>
                  <InfoItem label="매입가" value={formatKRW(vehicle.purchase_price)} />
                  <InfoItem
                    label="마진"
                    value={formatKRW(vehicle.margin)}
                    valueClass={
                      vehicle.margin >= 0 ? "text-emerald-400" : "text-red-400"
                    }
                  />
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-6">
              등록일: {formatDate(vehicle.created_at)}
            </p>
          </CardContent>
        </Card>

        {/* 사진 갤러리 */}
        {photos.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                차량 사진 ({photos.length}장)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video rounded-lg overflow-hidden border border-border bg-muted mb-3">
                <Image
                  src={photos[galleryIndex]}
                  alt={`${vehicle.make} ${vehicle.model} 차량 사진 ${galleryIndex + 1}`}
                  fill
                  className="object-contain"
                  loading="lazy"
                  decoding="async"
                />
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setGalleryIndex((i) => Math.max(0, i - 1))
                      }
                      disabled={galleryIndex === 0}
                      aria-label="이전 사진"
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 hover:bg-background transition-colors disabled:opacity-30"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setGalleryIndex((i) =>
                          Math.min(photos.length - 1, i + 1),
                        )
                      }
                      disabled={galleryIndex === photos.length - 1}
                      aria-label="다음 사진"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 hover:bg-background transition-colors disabled:opacity-30"
                    >
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>

              {photos.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {photos.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setGalleryIndex(idx)}
                      className={[
                        "relative shrink-0 w-20 h-16 rounded overflow-hidden border-2 transition-colors",
                        idx === galleryIndex
                          ? "border-primary"
                          : "border-border hover:border-primary/50",
                      ].join(" ")}
                    >
                      <Image
                        src={url}
                        alt={`${vehicle.make} ${vehicle.model} 썸네일 ${idx + 1}`}
                        fill
                        className="object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 출고 체크리스트 */}
        {showChecklist && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">출고 체크리스트</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {visibleChecklists.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    등록된 체크리스트가 없습니다.
                  </p>
                  {/* sold 상태면 체크리스트 생성 버튼 표시 */}
                  {vehicle.status === "sold" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const res = await apiFetch(
                            `/api/vehicles/${id}/checklist`,
                            { method: "POST", body: JSON.stringify({}) },
                          );
                          const data = await res.json();
                          if (!res.ok) {
                            toast.error(
                              data.error ?? "체크리스트 생성에 실패했습니다.",
                            );
                            return;
                          }
                          setChecklists([data.data]);
                          toast.success("체크리스트가 생성되었습니다.");
                        } catch {
                          toast.error("체크리스트 생성 중 오류가 발생했습니다.");
                        }
                      }}
                    >
                      체크리스트 생성
                    </Button>
                  )}
                </div>
              ) : (
                visibleChecklists.map((checklist) => {
                  return (
                    <div key={checklist.id} className="space-y-3">
                      {isPrivileged && checklist.dealer_name && (
                        <p className="text-xs font-medium text-muted-foreground">
                          딜러: {checklist.dealer_name}
                        </p>
                      )}

                      {(Object.keys(CHECKLIST_LABELS) as ChecklistField[]).map(
                        (field) => {
                          const key = `${checklist.id}_${field}`;
                          const isUpdating = checklistUpdating[key] ?? false;
                          const isMyChecklist =
                            isPrivileged || checklist.dealer_id === userId;
                          const isChecked = checklist[field] as boolean;

                          return (
                            <div
                              key={field}
                              className="flex items-center justify-between gap-4"
                            >
                              <span className="text-sm">
                                {CHECKLIST_LABELS[field]}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleChecklistToggle(field, isChecked)
                                }
                                disabled={isUpdating || !isMyChecklist}
                                className={[
                                  "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                                  isChecked
                                    ? "bg-primary"
                                    : "bg-muted",
                                ].join(" ")}
                                aria-checked={isChecked}
                                role="switch"
                              >
                                <span
                                  className={[
                                    "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                                    isChecked
                                      ? "translate-x-4"
                                      : "translate-x-0",
                                  ].join(" ")}
                                />
                              </button>
                            </div>
                          );
                        },
                      )}

                      {checklist.completed_at && (
                        <p className="text-xs text-emerald-400 pt-1">
                          출고 완료: {formatDate(checklist.completed_at)}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="차량 삭제"
        description="이 차량을 삭제하시겠습니까? 판매 기록이 있는 경우 삭제할 수 없습니다."
        confirmLabel="삭제"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <GenerateQuoteDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        vehicleId={vehicle.id}
        vehicleLabel={`${vehicle.make} ${vehicle.model} · ${vehicle.vehicle_code}`}
      />
    </div>
  );
}

function InfoItem({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`font-medium ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}
