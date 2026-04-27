"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/src/lib/api-client";

export interface VehicleModelItem {
  id: string;
  brand: string;
  model: string;
  trim: string;
  carPrice: number;
  monthlyPayment: number | null;
  maxDeposit: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: VehicleModelItem | null;
  onSaved: () => void;
}

export function ModelFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: Props) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [carPrice, setCarPrice] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [maxDeposit, setMaxDeposit] = useState("");
  const [displayOrder, setDisplayOrder] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      setBrand(editing.brand);
      setModel(editing.model);
      setTrim(editing.trim);
      setCarPrice(String(editing.carPrice));
      setMonthlyPayment(
        editing.monthlyPayment != null ? String(editing.monthlyPayment) : "",
      );
      setMaxDeposit(String(editing.maxDeposit));
      setDisplayOrder(String(editing.displayOrder));
      setIsActive(editing.isActive);
    } else {
      setBrand("");
      setModel("");
      setTrim("");
      setCarPrice("");
      setMonthlyPayment("");
      setMaxDeposit("");
      setDisplayOrder("0");
      setIsActive(true);
    }
  }, [editing, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(carPrice);
    const depositNum = Number(maxDeposit);
    const orderNum = Number(displayOrder || "0");
    const monthlyTrimmed = monthlyPayment.trim();
    const monthlyNum = monthlyTrimmed === "" ? null : Number(monthlyTrimmed);

    if (!brand.trim() || !model.trim() || !trim.trim()) {
      toast.error("브랜드, 모델, 등급은 필수입니다.");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error("차량가격을 올바르게 입력해 주세요.");
      return;
    }
    if (
      monthlyNum !== null &&
      (!Number.isFinite(monthlyNum) || monthlyNum <= 0)
    ) {
      toast.error("월 납입료를 올바르게 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(depositNum) || depositNum < 0) {
      toast.error("최대보증금을 올바르게 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const url = editing
        ? `/api/vehicle-models/${editing.id}`
        : "/api/vehicle-models";
      const method = editing ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          model: model.trim(),
          trim: trim.trim(),
          carPrice: priceNum,
          monthlyPayment: monthlyNum,
          maxDeposit: depositNum,
          displayOrder: orderNum,
          isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "저장에 실패했습니다.");
        return;
      }
      toast.success(editing ? "수정되었습니다." : "등록되었습니다.");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "차량 모델 수정" : "차량 모델 등록"}
          </DialogTitle>
          <DialogDescription>
            브랜드/모델/등급 조합은 중복 불가
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>브랜드</Label>
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="벤츠"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label>모델</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="C 클래스"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>등급</Label>
            <Input
              value={trim}
              onChange={(e) => setTrim(e.target.value)}
              placeholder="C200"
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>차량가격 (원)</Label>
              <Input
                type="number"
                value={carPrice}
                onChange={(e) => setCarPrice(e.target.value)}
                placeholder="22000000"
                disabled={submitting}
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>월 납입료 (원)</Label>
              <Input
                type="number"
                value={monthlyPayment}
                onChange={(e) => setMonthlyPayment(e.target.value)}
                placeholder="435000 (비우면 미설정)"
                disabled={submitting}
                min={0}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>최대보증금 (원)</Label>
              <Input
                type="number"
                value={maxDeposit}
                onChange={(e) => setMaxDeposit(e.target.value)}
                placeholder="5000000"
                disabled={submitting}
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>표시 순서</Label>
              <Input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                disabled={submitting}
                min={0}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>상태</Label>
            <button
              type="button"
              onClick={() => setIsActive((p) => !p)}
              disabled={submitting}
              className={`w-full rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                isActive
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {isActive ? "활성 (공개 노출)" : "비활성 (공개 미노출)"}
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "저장 중..." : editing ? "수정" : "등록"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
