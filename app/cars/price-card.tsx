"use client";

import { formatKRW } from "@/src/lib/vehicle-price";

interface Props {
  brand: string;
  model: string;
  trim: string;
  monthlyPayment: number | null;
  maxDeposit: number;
}

export function PriceCard({
  brand,
  model,
  trim,
  monthlyPayment,
  maxDeposit,
}: Props) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#16140e] to-[#0d0b07] border border-[#c8bfa8]/20 p-6 sm:p-8">
      <p className="text-[10px] tracking-[0.3em] text-[#b8a875] uppercase mb-1">
        {brand}
      </p>
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
        {model} · {trim}
      </h2>

      <div className="mt-6 border-t border-[#c8bfa8]/15 pt-5 space-y-4">
        <div className="rounded-xl bg-[#c8bfa8]/10 border border-[#c8bfa8]/25 p-4">
          <p className="text-[10px] tracking-[0.25em] text-[#b8a875] uppercase">
            월 납입료
          </p>
          <p className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-white">
            {formatKRW(monthlyPayment)}
          </p>
        </div>

        <Row label="최대 보증금" value={formatKRW(maxDeposit)} />
      </div>

      <div className="mt-6 border-t border-[#c8bfa8]/10 pt-4 space-y-1.5 text-[11.5px] leading-relaxed text-[#c8bfa8]/60">
        <p>※ 표시된 가격은 예상가격이며, 신용점수에 따라 월 납입료가 조정될 수 있습니다.</p>
        <p>※ 무보증 진행 가능 (보증금이 낮아질수록 차량 연식·주행거리가 상향됩니다).</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#c8bfa8]/60">{label}</span>
      <span className="text-sm text-[#c8bfa8] font-medium">{value}</span>
    </div>
  );
}
