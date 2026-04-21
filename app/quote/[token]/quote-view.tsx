"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Phone } from "lucide-react";

type Props = {
  data: {
    quote: {
      quoteNumber: string;
      createdAt: string;
      expiresAt: string | null;
      viewCount: number;
    };
    vehicle: {
      vehicleCode: string;
      make: string;
      model: string;
      year: number;
      mileage: number | null;
      color: string | null;
      vin: string | null;
      sellingPrice: number;
      deposit: number | null;
      monthlyPayment: number | null;
      images: { url: string; order: number }[];
      primaryImageUrl: string | null;
      status: string;
    };
    dealer: { name: string; phone: string | null } | null;
  };
};

function formatKRW(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("ko-KR") + "원";
}

function formatDate(iso: string | null): string {
  if (!iso) return "무제한";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function QuoteView({ data }: Props) {
  const { quote, vehicle, dealer } = data;
  const [imageIdx, setImageIdx] = useState(0);
  const images = vehicle.images.length > 0 ? vehicle.images : [];
  const daysLeft = daysUntil(quote.expiresAt);
  const expiringSoon = daysLeft !== null && daysLeft <= 2;

  const nextImage = () =>
    setImageIdx((i) => (images.length > 0 ? (i + 1) % images.length : 0));
  const prevImage = () =>
    setImageIdx((i) =>
      images.length > 0 ? (i - 1 + images.length) % images.length : 0,
    );

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* 헤더: 로고 + 견적번호 */}
      <header className="border-b border-[#c8bfa8]/15 bg-gradient-to-b from-[#13110b] to-[#0a0a0a]">
        <div className="max-w-3xl mx-auto px-5 py-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-[#b8a875] uppercase mb-0.5">
              Reborn Labs
            </p>
            <p className="text-xs text-[#c8bfa8]/70">프리미엄 중고차 견적서</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#c8bfa8]/50 uppercase tracking-wider">
              Quote No.
            </p>
            <p className="font-mono text-sm text-[#c8bfa8] tracking-wider">
              {quote.quoteNumber}
            </p>
          </div>
        </div>
      </header>

      {/* 발행 정보 */}
      <section className="max-w-3xl mx-auto px-5 pt-6 pb-2">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[#c8bfa8]/60">발행일</span>
          <span className="text-[#c8bfa8]">{formatDate(quote.createdAt)}</span>
          <span className="text-[#c8bfa8]/20">|</span>
          <span className="text-[#c8bfa8]/60">유효기간</span>
          <span
            className={
              expiringSoon
                ? "text-amber-300 font-medium"
                : "text-[#c8bfa8]"
            }
          >
            {formatDate(quote.expiresAt)}
            {daysLeft !== null && (
              <span className="ml-1.5 text-[11px] text-[#c8bfa8]/60">
                (D-{daysLeft})
              </span>
            )}
          </span>
        </div>
      </section>

      {/* 차량 갤러리 */}
      <section className="max-w-3xl mx-auto px-5 pt-5">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#1a1a1a] border border-[#c8bfa8]/10">
          {images.length > 0 ? (
            <>
              <Image
                src={images[imageIdx]?.url ?? ""}
                alt={`${vehicle.make} ${vehicle.model}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 768px"
                priority={imageIdx === 0}
                unoptimized
              />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="이전 사진"
                    onClick={prevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-[#c8bfa8] hover:bg-black/70 transition"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="다음 사진"
                    onClick={nextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-[#c8bfa8] hover:bg-black/70 transition"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((img, idx) => (
                      <button
                        type="button"
                        key={img.url}
                        aria-label={`사진 ${idx + 1}번으로 이동`}
                        onClick={() => setImageIdx(idx)}
                        className={`h-1.5 rounded-full transition-all ${
                          idx === imageIdx
                            ? "w-6 bg-[#b8a875]"
                            : "w-1.5 bg-white/40"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[#c8bfa8]/50">
              차량 사진 준비 중
            </div>
          )}
        </div>
      </section>

      {/* 차량 제목 */}
      <section className="max-w-3xl mx-auto px-5 pt-6">
        <p className="text-xs tracking-widest text-[#b8a875] uppercase mb-1.5">
          {vehicle.year}
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          {vehicle.make} {vehicle.model}
        </h1>
        <p className="mt-1 font-mono text-[11px] text-[#c8bfa8]/50 tracking-wider">
          {vehicle.vehicleCode}
        </p>
      </section>

      {/* 가격 정보 카드 — 고객 의사결정 숫자(월 납입료·보증금) 최상위 강조 */}
      <section className="max-w-3xl mx-auto px-5 pt-6">
        <div className="rounded-2xl bg-gradient-to-br from-[#16140e] to-[#0d0b07] border border-[#c8bfa8]/20 p-6 sm:p-8">
          {/* 월 납입료 — Level 1 (display) */}
          <p className="text-[10px] tracking-[0.3em] text-[#b8a875] uppercase">
            월 납입료
          </p>
          <p className="mt-1 text-4xl sm:text-5xl font-bold tracking-tight text-white">
            {formatKRW(vehicle.monthlyPayment)}
          </p>

          {/* 보증금 — Level 2 */}
          <div className="mt-6 border-t border-[#c8bfa8]/15 pt-5">
            <p className="text-[10px] tracking-[0.25em] text-[#b8a875] uppercase">
              보증금
            </p>
            <p className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              {formatKRW(vehicle.deposit)}
            </p>
          </div>

          {/* 차량 판매가 — Level 4 (caption/muted), 신뢰성 시그널로 유지 */}
          <div className="mt-5 pt-3 border-t border-[#c8bfa8]/10">
            <div className="flex items-center justify-between text-xs text-[#c8bfa8]/50">
              <span>차량 판매가</span>
              <span className="font-medium text-[#c8bfa8]/70">
                {formatKRW(vehicle.sellingPrice)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 차량 세부 정보 */}
      <section className="max-w-3xl mx-auto px-5 pt-6">
        <h2 className="text-[11px] tracking-[0.25em] text-[#b8a875] uppercase mb-3">
          Vehicle Info
        </h2>
        <dl className="rounded-2xl border border-[#c8bfa8]/10 bg-[#121109] divide-y divide-[#c8bfa8]/10">
          <InfoRow label="연식" value={`${vehicle.year}년`} />
          <InfoRow
            label="주행거리"
            value={
              vehicle.mileage != null
                ? `${vehicle.mileage.toLocaleString("ko-KR")} km`
                : "-"
            }
          />
          <InfoRow label="색상" value={vehicle.color ?? "-"} />
          <InfoRow label="차대번호(VIN)" value={vehicle.vin ?? "-"} mono />
        </dl>
      </section>

      {/* 담당자 + CTA */}
      <section className="max-w-3xl mx-auto px-5 pt-6">
        <div className="rounded-2xl border border-[#c8bfa8]/15 bg-[#12110a] p-5">
          <p className="text-[11px] tracking-[0.25em] text-[#b8a875] uppercase mb-2">
            Your Advisor
          </p>
          <p className="text-lg font-semibold text-white">
            {dealer?.name ?? "담당 미지정"}
          </p>
          {dealer?.phone && (
            <a
              href={`tel:${dealer.phone.replace(/[^0-9+]/g, "")}`}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#c8bfa8] text-[#0a0a0a] font-semibold py-3.5 hover:bg-[#b8a875] transition-colors"
            >
              <Phone className="h-4 w-4" />
              상담 문의하기 · {dealer.phone}
            </a>
          )}
        </div>
      </section>

      {/* 안내 문구 */}
      <section className="max-w-3xl mx-auto px-5 pt-5">
        <div className="rounded-xl border border-[#c8bfa8]/10 bg-[#0f0e08] p-4 space-y-1.5 text-[11.5px] leading-relaxed text-[#c8bfa8]/60">
          <p>• 본 견적서는 상담 안내용이며, 실제 계약 조건은 상담 후 확정됩니다.</p>
          <p>• 유효기간 이후에는 가격 및 조건이 변동될 수 있습니다.</p>
          <p>• 차량 상태/옵션은 실물 확인을 권장드립니다.</p>
        </div>
      </section>

      {/* 하단 여백 */}
      <div className="h-10" />
    </main>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-xs text-[#c8bfa8]/60">{label}</dt>
      <dd
        className={`text-sm text-white ${
          mono ? "font-mono tracking-wider text-[#c8bfa8]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
