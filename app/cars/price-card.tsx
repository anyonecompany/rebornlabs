"use client";

import {
  calculateExtraPrice,
  calculateMonthlyPayment,
  formatKRW,
  INSTALLMENT_MONTHS,
} from "@/src/lib/vehicle-price";

interface Props {
  brand: string;
  model: string;
  trim: string;
  carPrice: number;
  maxDeposit: number;
}

export function PriceCard({ brand, model, trim, carPrice, maxDeposit }: Props) {
  const extraPrice = calculateExtraPrice(carPrice);
  const monthly = calculateMonthlyPayment(carPrice);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#16140e] to-[#0d0b07] border border-[#c8bfa8]/20 p-6 sm:p-8">
      <p className="text-[10px] tracking-[0.3em] text-[#b8a875] uppercase mb-1">
        {brand}
      </p>
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
        {model} · {trim}
      </h2>

      <div className="mt-6 border-t border-[#c8bfa8]/15 pt-5 space-y-4">
        <Row label="차량 가격" value={formatKRW(carPrice)} />
        <Row label="추가된 가격" value={formatKRW(extraPrice)} />

        <div className="rounded-xl bg-[#c8bfa8]/10 border border-[#c8bfa8]/25 p-4">
          <p className="text-[10px] tracking-[0.25em] text-[#b8a875] uppercase">
            월 납입료 · {INSTALLMENT_MONTHS}개월
          </p>
          <p className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-white">
            {formatKRW(monthly)}
          </p>
        </div>

        <Row label="최대 보증금" value={formatKRW(maxDeposit)} />
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
