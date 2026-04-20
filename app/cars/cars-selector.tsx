"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { PriceCard } from "./price-card";

export interface TrimNode {
  id: string;
  trim: string;
  carPrice: number;
  maxDeposit: number;
  displayOrder: number;
}
export interface ModelNode {
  name: string;
  trimCount: number;
  trims: TrimNode[];
}
export interface BrandNode {
  name: string;
  modelCount: number;
  models: ModelNode[];
}

interface Props {
  brands: BrandNode[];
}

type Step = "brand" | "model" | "trim";

export function CarsSelector({ brands }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialBrand = searchParams.get("brand") ?? "";
  const initialModel = searchParams.get("model") ?? "";
  const initialTrim = searchParams.get("trim") ?? "";

  const [selectedBrand, setSelectedBrand] = useState<string>(initialBrand);
  const [selectedModel, setSelectedModel] = useState<string>(initialModel);
  const [selectedTrim, setSelectedTrim] = useState<string>(initialTrim);

  const currentBrand = useMemo(
    () => brands.find((b) => b.name === selectedBrand) ?? null,
    [brands, selectedBrand],
  );
  const currentModel = useMemo(
    () => currentBrand?.models.find((m) => m.name === selectedModel) ?? null,
    [currentBrand, selectedModel],
  );
  const currentTrim = useMemo(
    () => currentModel?.trims.find((t) => t.trim === selectedTrim) ?? null,
    [currentModel, selectedTrim],
  );

  const step: Step = selectedTrim && currentTrim
    ? "trim"
    : selectedModel && currentModel
      ? "model"
      : "brand";

  // URL 쿼리와 상태 동기화
  const syncUrl = useCallback(
    (brand: string, model: string, trim: string) => {
      const params = new URLSearchParams();
      if (brand) params.set("brand", brand);
      if (model) params.set("model", model);
      if (trim) params.set("trim", trim);
      const qs = params.toString();
      router.replace(qs ? `/cars?${qs}` : "/cars", { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    syncUrl(selectedBrand, selectedModel, selectedTrim);
  }, [selectedBrand, selectedModel, selectedTrim, syncUrl]);

  const chooseBrand = (name: string) => {
    setSelectedBrand(name);
    setSelectedModel("");
    setSelectedTrim("");
  };

  const chooseModel = (name: string) => {
    setSelectedModel(name);
    const model = currentBrand?.models.find((m) => m.name === name);
    // 등급이 하나면 자동 선택
    if (model && model.trims.length === 1) {
      setSelectedTrim(model.trims[0].trim);
    } else {
      setSelectedTrim("");
    }
  };

  const chooseTrim = (trim: string) => setSelectedTrim(trim);

  const backToBrand = () => {
    setSelectedBrand("");
    setSelectedModel("");
    setSelectedTrim("");
  };
  const backToModel = () => {
    setSelectedModel("");
    setSelectedTrim("");
  };
  const backToTrim = () => {
    setSelectedTrim("");
  };

  const buildConsultationUrl = () => {
    if (!currentBrand || !currentModel || !currentTrim) return "/consultation/new";
    const params = new URLSearchParams({
      vehicle_model_id: currentTrim.id,
      brand: currentBrand.name,
      model: currentModel.name,
      trim: currentTrim.trim,
    });
    return `/consultation/new?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Progress */}
      <StepIndicator step={step} />

      {/* Step 1: 브랜드 */}
      {step === "brand" && (
        <section>
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            원하시는 브랜드를 선택해주세요
          </h2>
          <p className="text-xs text-[#c8bfa8]/70 mt-1">
            {brands.length}개 프리미엄 브랜드
          </p>
          <div className="mt-5 grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {brands.map((b) => (
              <button
                key={b.name}
                type="button"
                onClick={() => chooseBrand(b.name)}
                className="group rounded-xl border border-[#c8bfa8]/15 bg-[#13110b] p-4 text-center transition-all hover:border-[#c8bfa8]/40 hover:bg-[#1a1711]"
              >
                <p className="text-sm font-semibold text-white">{b.name}</p>
                <p className="mt-0.5 text-[11px] text-[#c8bfa8]/60">
                  {b.modelCount}종
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 2: 모델 */}
      {step === "model" && currentBrand && (
        <section>
          <button
            type="button"
            onClick={backToBrand}
            className="inline-flex items-center gap-1.5 text-xs text-[#c8bfa8]/70 hover:text-[#c8bfa8] mb-4"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            브랜드 다시 선택
          </button>
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            <span className="text-[#b8a875]">{currentBrand.name}</span> — 모델을
            선택해주세요
          </h2>
          <p className="text-xs text-[#c8bfa8]/70 mt-1">
            {currentBrand.modelCount}개 모델
          </p>
          <div className="mt-5 space-y-2">
            {currentBrand.models.map((m) => (
              <button
                key={m.name}
                type="button"
                onClick={() => chooseModel(m.name)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#c8bfa8]/15 bg-[#13110b] px-4 py-3.5 text-left transition-all hover:border-[#c8bfa8]/40 hover:bg-[#1a1711]"
              >
                <div>
                  <p className="text-sm font-medium text-white">{m.name}</p>
                  <p className="text-[11px] text-[#c8bfa8]/60">
                    {m.trimCount}개 등급
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#c8bfa8]/50" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 3: 등급 + 가격 */}
      {step === "trim" && currentBrand && currentModel && currentTrim && (
        <section>
          <button
            type="button"
            onClick={backToModel}
            className="inline-flex items-center gap-1.5 text-xs text-[#c8bfa8]/70 hover:text-[#c8bfa8] mb-4"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {currentBrand.name} 다른 모델
          </button>

          {currentModel.trims.length > 1 && (
            <div className="mb-5">
              <p className="text-xs text-[#c8bfa8]/60 mb-2">
                {currentModel.name} — 등급 선택
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {currentModel.trims.map((t) => {
                  const active = t.trim === currentTrim.trim;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => chooseTrim(t.trim)}
                      className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                        active
                          ? "border-[#c8bfa8] bg-[#c8bfa8]/10 text-white"
                          : "border-[#c8bfa8]/15 bg-[#13110b] text-[#c8bfa8]/80 hover:border-[#c8bfa8]/40"
                      }`}
                    >
                      {active && <Check className="inline h-3.5 w-3.5 mr-1" />}
                      {t.trim}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <PriceCard
            brand={currentBrand.name}
            model={currentModel.name}
            trim={currentTrim.trim}
            carPrice={currentTrim.carPrice}
            maxDeposit={currentTrim.maxDeposit}
          />

          <a
            href={buildConsultationUrl()}
            className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-[#c8bfa8] text-[#0a0a0a] font-semibold py-3.5 hover:bg-[#b8a875] transition-colors"
          >
            상담 신청하기
          </a>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {currentModel.trims.length === 1 ? (
              <button
                type="button"
                onClick={backToModel}
                className="rounded-md border border-[#c8bfa8]/15 bg-[#13110b] px-3 py-2 text-xs text-[#c8bfa8]/70 hover:border-[#c8bfa8]/40"
              >
                다른 모델 보기
              </button>
            ) : (
              <button
                type="button"
                onClick={backToTrim}
                className="rounded-md border border-[#c8bfa8]/15 bg-[#13110b] px-3 py-2 text-xs text-[#c8bfa8]/70 hover:border-[#c8bfa8]/40"
              >
                다른 등급 보기
              </button>
            )}
            <button
              type="button"
              onClick={backToBrand}
              className="rounded-md border border-[#c8bfa8]/15 bg-[#13110b] px-3 py-2 text-xs text-[#c8bfa8]/70 hover:border-[#c8bfa8]/40"
            >
              다른 브랜드 보기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels: { key: Step; label: string }[] = [
    { key: "brand", label: "브랜드" },
    { key: "model", label: "모델" },
    { key: "trim", label: "등급" },
  ];
  const activeIdx =
    step === "brand" ? 0 : step === "model" ? 1 : 2;
  return (
    <div className="flex items-center justify-center gap-1.5 text-[11px]">
      {labels.map((l, i) => {
        const done = i < activeIdx;
        const current = i === activeIdx;
        return (
          <div key={l.key} className="flex items-center gap-1.5">
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                current
                  ? "bg-[#c8bfa8] text-[#0a0a0a]"
                  : done
                    ? "bg-[#b8a875]/70 text-[#0a0a0a]"
                    : "bg-[#1a1711] text-[#c8bfa8]/40"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={
                current
                  ? "text-[#c8bfa8]"
                  : done
                    ? "text-[#c8bfa8]/70"
                    : "text-[#c8bfa8]/40"
              }
            >
              {l.label}
            </span>
            {i < labels.length - 1 && (
              <span className="text-[#c8bfa8]/25">———</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
