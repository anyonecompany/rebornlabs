"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Upload, X, Loader2, Star } from "lucide-react";
import Image from "next/image";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { processImage, uploadVehicleImage } from "@/src/lib/image-utils";
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
import type { VehicleStatus, UserRole } from "@/types/database";

interface FormState {
  make: string;
  model: string;
  year: string;
  mileage: string;
  purchase_price: string;
  selling_price: string;
  deposit: string;
  monthly_payment: string;
  status: VehicleStatus;
  plate_number: string;
  vin: string;
  color: string;
}

function formatNumber(value: string): string {
  const num = parseInt(value.replace(/[^0-9]/g, ""), 10);
  if (isNaN(num)) return "";
  return num.toLocaleString("ko-KR");
}

export default function VehicleEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>({
    make: "",
    model: "",
    year: "",
    mileage: "",
    purchase_price: "",
    selling_price: "",
    deposit: "",
    monthly_payment: "",
    status: "available",
    plate_number: "",
    vin: "",
    color: "",
  });

  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const { role: userRole } = useUserRole();

  const fetchVehicle = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/vehicles/${id}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "차량 정보를 불러오지 못했습니다.");
        router.push("/vehicles");
        return;
      }
      const data = await res.json();
      // API 응답: { data: vehicle, checklists: [...] }
      const v = data.data;
      setForm({
        make: v.make,
        model: v.model,
        year: String(v.year),
        mileage: String(v.mileage),
        purchase_price: String(v.purchase_price),
        selling_price: String(v.selling_price),
        deposit: String(v.deposit),
        monthly_payment: String(v.monthly_payment),
        status: v.status,
        plate_number: v.plate_number ?? "",
        vin: v.vin ?? "",
        color: v.color ?? "",
      });
      setPhotos(v.photos ?? []);
    } catch {
      toast.error("차량 정보를 불러오는 중 오류가 발생했습니다.");
      router.push("/vehicles");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchVehicle();
  }, [fetchVehicle]);

  const margin =
    form.selling_price && form.purchase_price
      ? parseInt(form.selling_price.replace(/[^0-9]/g, ""), 10) -
        parseInt(form.purchase_price.replace(/[^0-9]/g, ""), 10)
      : null;

  const handleNumberInput =
    (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9]/g, "");
      setForm((prev) => ({ ...prev, [key]: raw }));
    };

  const processAndUploadImages = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setUploadProgress(0);

      const newUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const blob = await processImage(file);
          const url = await uploadVehicleImage(null, blob, id);
          newUrls.push(url);
          setUploadProgress(Math.round(((i + 1) / files.length) * 100));
        } catch (err) {
          toast.error(`${file.name} 업로드에 실패했습니다.`);
        }
      }

      setPhotos((prev) => [...prev, ...newUrls]);
      setUploading(false);
      setUploadProgress(0);
    },
    [id],
  );

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

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const setThumbnail = (index: number) => {
    if (index === 0) return;
    setPhotos((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
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
        status: form.status,
        photos,
        plate_number: form.plate_number.trim() || null,
        vin: form.vin.trim() || null,
        color: form.color.trim() || null,
      };

      const res = await apiFetch(`/api/vehicles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "차량 수정에 실패했습니다.");
        return;
      }

      toast.success("차량 정보가 수정되었습니다.");
      router.push(`/vehicles/${id}`);
    } catch {
      toast.error("차량 수정 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="mb-4">
          <BackLink href={`/vehicles/${id}`}>상세 페이지로</BackLink>
        </div>
        <LoadingState variant="form" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <BackLink href={`/vehicles/${id}`}>상세 페이지로</BackLink>
      </div>

      <PageHeader title="차량 수정" description="차량 정보를 수정합니다." />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
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
                  onChange={(e) =>
                    setForm((p) => ({ ...p, make: e.target.value }))
                  }
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
                  onChange={(e) =>
                    setForm((p) => ({ ...p, model: e.target.value }))
                  }
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
                  onChange={(e) =>
                    setForm((p) => ({ ...p, year: e.target.value }))
                  }
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
                    required
                    disabled={saving}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    km
                  </span>
                </div>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="status">상태</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, status: v as VehicleStatus }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">출고가능</SelectItem>
                    <SelectItem value="consulting">상담중</SelectItem>
                    <SelectItem value="vehicle_waiting">차량대기</SelectItem>
                    <SelectItem value="sold">판매완료</SelectItem>
                  </SelectContent>
                </Select>
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
              {(
                [
                  { key: "purchase_price", label: "매입가" },
                  { key: "selling_price", label: "판매가" },
                  { key: "deposit", label: "보증금" },
                  { key: "monthly_payment", label: "월납입료" },
                ] as { key: keyof FormState; label: string }[]
              ).map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <div className="relative">
                    <Input
                      id={key}
                      value={
                        form[key] ? formatNumber(String(form[key])) : ""
                      }
                      onChange={handleNumberInput(key)}
                      disabled={saving}
                      className="pr-6"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      원
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {margin !== null && (
              <div className="flex items-center justify-between rounded-md bg-muted px-4 py-2 text-sm">
                <span className="text-muted-foreground">예상 마진</span>
                <span
                  className={
                    margin >= 0
                      ? "font-medium text-emerald-400"
                      : "font-medium text-red-400"
                  }
                >
                  {margin.toLocaleString("ko-KR")}원
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 사진 관리 */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              차량 사진
            </h2>

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

            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((url, idx) => (
                  <div
                    key={idx}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 bg-muted group ${idx === 0 ? "border-primary" : "border-border"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`차량 사진 ${idx + 1}`}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {idx === 0 ? (
                      <span className="absolute top-1.5 left-1.5 z-10 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-medium">
                        대표
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setThumbnail(idx); }}
                        className="absolute top-1.5 left-1.5 z-10 rounded bg-background/80 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background cursor-pointer"
                        title="대표 사진으로 설정"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                      className="absolute top-1.5 right-1.5 z-10 rounded-full bg-background/80 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
                  사진 추가 (드래그 또는 클릭)
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

        {/* 액션 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/vehicles/${id}`)}
            disabled={saving}
          >
            취소
          </Button>
          <Button type="submit" disabled={saving || uploading}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}
