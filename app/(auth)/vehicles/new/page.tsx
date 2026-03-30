"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, X, Loader2, ChevronLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createBrowserClient } from "@/src/lib/supabase/browser";
import { processImage, uploadVehicleImage } from "@/src/lib/image-utils";
import { apiFetch } from "@/src/lib/api-client";
import type { UserRole } from "@/types/database";

interface FormState {
  make: string;
  model: string;
  year: string;
  mileage: string;
  purchase_price: string;
  selling_price: string;
  deposit: string;
  monthly_payment: string;
}

interface UploadedImage {
  url: string;
  previewUrl: string;
}

const INITIAL_FORM: FormState = {
  make: "",
  model: "",
  year: "",
  mileage: "",
  purchase_price: "",
  selling_price: "",
  deposit: "",
  monthly_payment: "",
};

/** 숫자 문자열을 한국 원화 형식으로 포맷합니다. */
function formatNumber(value: string): string {
  const num = parseInt(value.replace(/[^0-9]/g, ""), 10);
  if (isNaN(num)) return "";
  return num.toLocaleString("ko-KR");
}

export default function VehicleNewPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>("staff");

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
          const role = data?.role as UserRole | undefined;
          if (role) {
            setUserRole(role);
            if (role === "dealer" || role === "pending") {
              toast.error("권한이 없습니다.");
              router.push("/vehicles");
            }
          }
        });
    });
  }, [router]);

  const margin =
    form.selling_price && form.purchase_price
      ? parseInt(form.selling_price.replace(/[^0-9]/g, ""), 10) -
        parseInt(form.purchase_price.replace(/[^0-9]/g, ""), 10)
      : null;

  const handleNumberInput = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setForm((prev) => ({ ...prev, [key]: raw }));
  };

  const processAndUploadImages = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);

    const supabase = createBrowserClient();
    const results: UploadedImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const previewUrl = URL.createObjectURL(file);
        const blob = await processImage(file);
        const url = await uploadVehicleImage(supabase, blob);
        results.push({ url, previewUrl });
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      } catch (err) {
        toast.error(`${file.name} 업로드에 실패했습니다.`);
        console.error(err);
      }
    }

    setImages((prev) => [...prev, ...results]);
    setUploading(false);
    setUploadProgress(0);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    processAndUploadImages(files);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    processAndUploadImages(files);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.make.trim() || !form.model.trim() || !form.year || !form.mileage) {
      toast.error("차종, 모델, 연식, 주행거리는 필수입니다.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        make: form.make.trim(),
        model: form.model.trim(),
        year: parseInt(form.year, 10),
        mileage: parseInt(form.mileage.replace(/[^0-9]/g, ""), 10),
        purchase_price: parseInt(form.purchase_price.replace(/[^0-9]/g, ""), 10) || 0,
        selling_price: parseInt(form.selling_price.replace(/[^0-9]/g, ""), 10) || 0,
        deposit: parseInt(form.deposit.replace(/[^0-9]/g, ""), 10) || 0,
        monthly_payment: parseInt(form.monthly_payment.replace(/[^0-9]/g, ""), 10) || 0,
        photos: images.map((img) => img.url),
      };

      const res = await apiFetch("/api/vehicles", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "차량 등록에 실패했습니다.");
        return;
      }

      toast.success("차량이 등록되었습니다.");
      // API 응답: { data: vehicle }
      router.push(`/vehicles/${data.data.id}`);
    } catch {
      toast.error("차량 등록 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (userRole === "dealer") return null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/vehicles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          차량 목록으로
        </Link>
      </div>

      <PageHeader title="차량 등록" description="새 차량을 등록합니다." />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* 기본 정보 */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              기본 정보
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">
                  차종 <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="make"
                  value={form.make}
                  onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))}
                  placeholder="현대, 기아, BMW 등"
                  required
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">
                  모델 <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="model"
                  value={form.model}
                  onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                  placeholder="아반떼, K5, 5시리즈 등"
                  required
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">
                  연식 <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="year"
                  type="number"
                  min={1990}
                  max={new Date().getFullYear() + 1}
                  value={form.year}
                  onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                  placeholder="2022"
                  required
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mileage">
                  주행거리 <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="mileage"
                    value={form.mileage ? formatNumber(form.mileage) : ""}
                    onChange={handleNumberInput("mileage")}
                    placeholder="50,000"
                    required
                    disabled={saving}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    km
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 가격 정보 */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              가격 정보
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchase_price">매입가</Label>
                <div className="relative">
                  <Input
                    id="purchase_price"
                    value={form.purchase_price ? formatNumber(form.purchase_price) : ""}
                    onChange={handleNumberInput("purchase_price")}
                    placeholder="15,000,000"
                    disabled={saving}
                    className="pr-6"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    원
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="selling_price">판매가</Label>
                <div className="relative">
                  <Input
                    id="selling_price"
                    value={form.selling_price ? formatNumber(form.selling_price) : ""}
                    onChange={handleNumberInput("selling_price")}
                    placeholder="18,000,000"
                    disabled={saving}
                    className="pr-6"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    원
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deposit">보증금</Label>
                <div className="relative">
                  <Input
                    id="deposit"
                    value={form.deposit ? formatNumber(form.deposit) : ""}
                    onChange={handleNumberInput("deposit")}
                    placeholder="3,000,000"
                    disabled={saving}
                    className="pr-6"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    원
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthly_payment">월납입료</Label>
                <div className="relative">
                  <Input
                    id="monthly_payment"
                    value={form.monthly_payment ? formatNumber(form.monthly_payment) : ""}
                    onChange={handleNumberInput("monthly_payment")}
                    placeholder="500,000"
                    disabled={saving}
                    className="pr-6"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    원
                  </span>
                </div>
              </div>
            </div>

            {/* 마진 자동 계산 표시 */}
            {margin !== null && (
              <div className="flex items-center justify-between rounded-md bg-muted px-4 py-2 text-sm">
                <span className="text-muted-foreground">예상 마진</span>
                <span
                  className={
                    margin >= 0 ? "font-medium text-emerald-400" : "font-medium text-red-400"
                  }
                >
                  {margin.toLocaleString("ko-KR")}원
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 사진 업로드 */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              차량 사진
            </h2>

            {/* 업로드 진행률 */}
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>이미지 처리 중... {uploadProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* 이미지 미리보기 그리드 */}
            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-video rounded-lg overflow-hidden border border-border bg-muted group"
                  >
                    <Image
                      src={img.previewUrl}
                      alt={`차량 사진 ${idx + 1}`}
                      fill
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1.5 right-1.5 rounded-full bg-background/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 드롭존 */}
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={[
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/50",
                uploading ? "pointer-events-none opacity-60" : "",
              ].join(" ")}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  사진을 드래그하거나 클릭하여 업로드
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG, WEBP · 최대 10MB · 복수 선택 가능
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </CardContent>
        </Card>

        {/* 액션 버튼 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/vehicles")}
            disabled={saving}
          >
            취소
          </Button>
          <Button type="submit" disabled={saving || uploading}>
            {saving ? "등록 중..." : "차량 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
