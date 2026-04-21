import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { CarsSelector, type BrandNode } from "./cars-selector";

export const revalidate = 300;

export const metadata = {
  title: "리본랩스 — 프리미엄 중고차 카탈로그",
  description: "브랜드 → 모델 → 등급을 선택하고 바로 월 납입료를 확인하세요.",
};

async function fetchCatalog(): Promise<{ brands: BrandNode[] }> {
  const hdr = await headers();
  const host = hdr.get("host") ?? "localhost:3000";
  const proto = hdr.get("x-forwarded-proto") ?? "http";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`;

  const res = await fetch(
    `${base.replace(/\/$/, "")}/api/vehicle-models/public`,
    { next: { revalidate: 300 } },
  );
  if (!res.ok) return { brands: [] };
  return (await res.json()) as { brands: BrandNode[] };
}

export default async function CarsPage() {
  const { brands } = await fetchCatalog();

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-[#c8bfa8]/15 bg-gradient-to-b from-[#13110b] to-[#0a0a0a]">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-[#b8a875] uppercase">
              Reborn Labs
            </p>
            <p className="text-xs text-[#c8bfa8]/70 mt-0.5">
              프리미엄 중고차 카탈로그
            </p>
          </div>
          <Link
            href="/cars"
            className="text-[11px] text-[#c8bfa8]/70 hover:text-[#c8bfa8]"
          >
            전체 모델
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-5 py-8">
        {brands.length === 0 ? (
          <div className="rounded-xl border border-[#c8bfa8]/15 bg-[#13110b] p-8 text-center">
            <p className="text-sm text-[#c8bfa8]/70">
              등록된 차량 모델이 아직 없습니다. 잠시 후 다시 확인해 주세요.
            </p>
          </div>
        ) : (
          // useSearchParams는 Suspense boundary 내에서만 사용 가능.
          // 누락 시 Next.js가 전체 페이지 CSR로 바일아웃 → 하이드레이션 이후
          // 클라이언트 state가 유지되지 않는 현상 발생.
          <Suspense
            fallback={
              <div className="py-10 text-center text-sm text-[#c8bfa8]/70">
                불러오는 중...
              </div>
            }
          >
            <CarsSelector brands={brands} />
          </Suspense>
        )}
      </section>

      <footer className="border-t border-[#c8bfa8]/10 py-6 mt-10">
        <div className="max-w-3xl mx-auto px-5 text-[11px] text-[#c8bfa8]/50 space-y-1">
          <p className="text-[#c8bfa8] font-semibold tracking-widest">
            REBORN LABS · 중고차 전문
          </p>
          <p>가격은 상담 과정에서 변동될 수 있습니다.</p>
        </div>
      </footer>
    </main>
  );
}
