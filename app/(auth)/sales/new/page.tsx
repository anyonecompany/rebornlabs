"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
import type { UserRole } from "@/types/database";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------
interface VehicleOption {
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

// ---------------------------------------------------------------------------
// 상수 (자체 판매 수당/수수료)
// ---------------------------------------------------------------------------
const SELF_SALE_DEALER_FEE = 1_000_000; // 100만
const SELF_SALE_MARKETING_FEE = 0;

/** 숫자를 한국 원화 형식으로 포맷합니다. */
function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

export default function NewSalePage() {
  const router = useRouter();

  const { role: userRole, userId } = useUserRole();

  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [dealers, setDealers] = useState<DealerOption[]>([]);

  const searchParams = useSearchParams();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(searchParams.get("vehicle_id") ?? "");
  const [selectedDealerId, setSelectedDealerId] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingDealers, setLoadingDealers] = useState(false);

  // 딜러인 경우 본인 ID를 딜러로 고정
  useEffect(() => {
    if (userRole === "dealer" && userId) {
      setSelectedDealerId(userId);
    }
  }, [userRole, userId]);

  // 출고가능 차량 목록 로드
  const fetchVehicles = useCallback(async () => {
    setLoadingVehicles(true);
    try {
      const res = await apiFetch("/api/vehicles?status=available");
      if (!res.ok) return;
      const data = await res.json();
      setVehicles(data.data ?? []);
    } catch {
      toast.error("차량 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingVehicles(false);
    }
  }, []);

  // 딜러 목록 로드 (admin/staff용)
  const fetchDealers = useCallback(async () => {
    setLoadingDealers(true);
    try {
      const res = await apiFetch("/api/consultations/dealers");
      if (!res.ok) return;
      const data = await res.json();
      setDealers(data.data ?? []);
    } catch {
      // 조용히 처리
    } finally {
      setLoadingDealers(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    if (userRole === "admin" || userRole === "staff") {
      fetchDealers();
    }
  }, [userRole, fetchDealers]);

  const isPrivileged = userRole === "admin" || userRole === "staff";

  const handleSubmit = async () => {
    if (!selectedVehicleId) {
      toast.error("차량을 선택해주세요.");
      return;
    }
    if (!selectedDealerId) {
      toast.error("딜러를 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          vehicle_id: selectedVehicleId,
          dealer_id: selectedDealerId,
          consultation_id: null,
          is_db_provided: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "판매 등록에 실패했습니다.");
        return;
      }
      toast.success("판매가 등록되었습니다.");
      router.push(`/sales/${data.data.sale_id}`);
    } catch {
      toast.error("판매 등록 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

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

      <PageHeader title="직접 판매 등록" />

      <div className="space-y-6 max-w-4xl mx-auto">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">판매 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  {vehicles.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      출고가능 차량이 없습니다
                    </SelectItem>
                  ) : (
                    vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.vehicle_code ?? v.id.slice(0, 8)} — {v.make} {v.model} ({v.year}년)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* 딜러 선택 */}
            <div className="space-y-1.5">
              <Label className="text-xs">딜러</Label>
              {isPrivileged ? (
                <Select
                  value={selectedDealerId}
                  onValueChange={setSelectedDealerId}
                  disabled={loadingDealers}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingDealers ? "로딩 중..." : "딜러 선택"
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
              ) : (
                <p className="text-sm font-medium px-3 py-2 rounded-md bg-muted/50 border border-border">
                  {"본인"}{" "}
                  <span className="text-xs text-muted-foreground">
                    (본인 고정)
                  </span>
                </p>
              )}
            </div>

            {/* DB제공 여부 (고정) */}
            <div className="space-y-1.5">
              <Label className="text-xs">DB제공 여부</Label>
              <p className="text-sm font-medium px-3 py-2 rounded-md bg-muted/50 border border-border text-muted-foreground">
                자체 판매 (DB제공 아님)
              </p>
            </div>

            {/* 수당/수수료 (읽기전용) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">수당</Label>
                <p className="text-sm font-medium px-3 py-2 rounded-md bg-muted/50 border border-border text-emerald-400">
                  {formatKRW(SELF_SALE_DEALER_FEE)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">수수료</Label>
                <p className="text-sm font-medium px-3 py-2 rounded-md bg-muted/50 border border-border">
                  {formatKRW(SELF_SALE_MARKETING_FEE)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 선택된 차량 요약 */}
        {selectedVehicle && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">선택된 차량</p>
              <p className="font-medium text-sm">
                {selectedVehicle.vehicle_code} —{" "}
                {selectedVehicle.make} {selectedVehicle.model}{" "}
                ({selectedVehicle.year}년)
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/sales")}
            disabled={submitting}
          >
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedVehicleId || !selectedDealerId}
          >
            {submitting ? "등록 중..." : "판매 등록"}
          </Button>
        </div>
      </div>
    </div>
  );
}
