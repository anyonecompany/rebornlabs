"use client";

import { useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { PriceCard } from "./price-card";

export interface TrimNode {
  id: string;
  trim: string;
  carPrice: number;
  monthlyPayment: number | null;
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
  // useSearchParams는 초기값 lazy initializer에서만 읽는다.
  // 이후 state 변경은 useState + window.history.replaceState 쌍으로 일원화.
  const searchParams = useSearchParams();

  const [selectedBrand, setSelectedBrand] = useState<string>(
    () => searchParams.get("brand") ?? "",
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    () => searchParams.get("model") ?? "",
  );
  const [selectedTrim, setSelectedTrim] = useState<string>(
    () => searchParams.get("trim") ?? "",
  );

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

  // URL 쓰기 헬퍼 (읽기 금지, setState 직후에만 호출)
  const writeUrl = useCallback(
    (brand: string, model: string, trim: string) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams();
      if (brand) params.set("brand", brand);
      if (model) params.set("model", model);
      if (trim) params.set("trim", trim);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/cars?${qs}` : "/cars");
    },
    [],
  );

  const chooseBrand = (name: string) => {
    setSelectedBrand(name);
    setSelectedModel("");
    setSelectedTrim("");
    writeUrl(name, "", "");
  };

  const chooseModel = (name: string) => {
    const model = currentBrand?.models.find((m) => m.name === name);
    // 등급이 하나면 자동 선택
    const autoTrim =
      model && model.trims.length === 1 ? model.trims[0].trim : "";
    setSelectedModel(name);
    setSelectedTrim(autoTrim);
    writeUrl(selectedBrand, name, autoTrim);
  };

  const chooseTrim = (trim: string) => {
    setSelectedTrim(trim);
    writeUrl(selectedBrand, selectedModel, trim);
  };

  const backToBrand = () => {
    setSelectedBrand("");
    setSelectedModel("");
    setSelectedTrim("");
    writeUrl("", "", "");
  };
  const backToModel = () => {
    setSelectedModel("");
    setSelectedTrim("");
    writeUrl(selectedBrand, "", "");
  };
  const backToTrim = () => {
    setSelectedTrim("");
    writeUrl(selectedBrand, selectedModel, "");
  };

  // 공개 페이지이므로 어드민 내부 경로(/consultation/new) 대신 외부 랜딩
  // 상담 폼으로 연결. 차량 정보는 쿼리 파라미터로 전달.
  const LANDING_URL =
    process.env.NEXT_PUBLIC_LANDING_URL ?? "https://rebornlabs.vercel.app";

  const buildConsultationUrl = () => {
    if (!currentBrand || !currentModel || !currentTrim) return LANDING_URL;
    const params = new URLSearchParams({
      vehicle_model_id: currentTrim.id,
      brand: currentBrand.name,
      model: currentModel.name,
      trim: currentTrim.trim,
    });
    return `${LANDING_URL}?${params.toString()}`;
  };

  // 명시적 분기로 렌더. step 변수는 indicator 에만 사용.
  let body: React.ReactNode;
  if (!selectedBrand || !currentBrand) {
    body = (
      <section key="step-brand">
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
    );
  } else if (!selectedModel || !currentModel) {
    body = (
      <section key="step-model">
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
    );
  } else {
    // Step 3: trim 화면. trim 미선택 상태도 여기서 처리(등급 그리드만 표시)
    const selectedTrimNode = currentTrim;
    body = (
      <section key="step-trim">
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
                const active = selectedTrimNode?.trim === t.trim;
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

        {selectedTrimNode ? (
          <>
            <PriceCard
              brand={currentBrand.name}
              model={currentModel.name}
              trim={selectedTrimNode.trim}
              monthlyPayment={selectedTrimNode.monthlyPayment}
              maxDeposit={selectedTrimNode.maxDeposit}
            />

            <a
              href={buildConsultationUrl()}
              target="_blank"
              rel="noopener noreferrer"
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
          </>
        ) : (
          <p className="text-sm text-[#c8bfa8]/60">
            등급을 선택해 가격을 확인해 주세요.
          </p>
        )}
      </section>
    );
  }

  const step: Step = !selectedBrand
    ? "brand"
    : !selectedModel
      ? "model"
      : "trim";

  return (
    <div className="space-y-6">
      <StepIndicator step={step} />
      {body}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels: { key: Step; label: string }[] = [
    { key: "brand", label: "브랜드" },
    { key: "model", label: "모델" },
    { key: "trim", label: "등급" },
  ];
  const activeIdx = step === "brand" ? 0 : step === "model" ? 1 : 2;
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
