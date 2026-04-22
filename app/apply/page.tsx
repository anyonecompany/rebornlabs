import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";

import ApplyForm from "./apply-form";

const vehiclePreview = [
  { name: "Mercedes-Benz E300", monthly: "50만원대", img: "/vehicle-45.webp" },
  { name: "Range Rover Evoque", monthly: "70만원대", img: "/vehicle-47.webp" },
  { name: "BMW 525d", monthly: "60만원대", img: "/vehicle-51.webp" },
  { name: "Audi New A7", monthly: "90만원대", img: "/vehicle-49.webp" },
];

const benefits: { title: string; desc: string; icon: React.ReactNode }[] = [
  {
    title: "보증금 0원부터",
    desc: "무보증금 플랜 상담 가능",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8M12 8v8" />
      </svg>
    ),
  },
  {
    title: "월 50만원대부터",
    desc: "리스·렌터카 대비 월등한 가격",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    title: "전 브랜드 출고",
    desc: "벤츠·BMW·포르쉐·랜드로버 등",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 17h8M5 17h1l1-5h10l1 5h1M5 12l1-5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2l1 5" />
        <circle cx="7.5" cy="17.5" r="1.5" />
        <circle cx="16.5" cy="17.5" r="1.5" />
      </svg>
    ),
  },
  {
    title: "반납형 · 일반번호판",
    desc: "36개월 후 반납, 렌터카 번호판 아님",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
    ),
  },
];

export default function ApplyPage() {
  return (
    <main className="relative">
      {/* Top bar */}
      <header className="absolute left-0 right-0 top-0 z-10">
        <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-4">
          <p className="text-[13px] font-semibold tracking-[0.35em] text-white">
            REBORN LABS
          </p>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[78svh] w-full flex-col justify-end overflow-hidden px-5 pb-12 pt-20">
        <Image
          src="/hero-bg-mobile.webp"
          alt="프리미엄 차량"
          fill
          priority
          className="object-cover object-center md:hidden"
          unoptimized
        />
        <Image
          src="/hero-bg.webp"
          alt="프리미엄 차량"
          fill
          priority
          className="hidden object-cover object-center md:block"
          unoptimized
        />
        {/* 하단 어둡게 — 텍스트 가독성 */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/85"
          aria-hidden="true"
        />

        <div className="relative mx-auto flex w-full max-w-xl flex-col gap-4">
          <p className="text-[10px] font-medium tracking-[0.4em] text-[#c8bfa8] md:text-xs">
            REBORN LABS
          </p>
          <h1 className="text-[30px] font-bold leading-[1.25] tracking-tight text-white md:text-5xl md:leading-tight">
            프리미엄 차량을,
            <br />
            새로운 방식으로.
          </h1>
          <p className="text-sm leading-relaxed text-[#d4cbba] md:text-base">
            보증금 0원부터, 월 50만원대까지.
            <br />
            36개월 이용 후 반납하는 새로운 카 라이프.
          </p>
          <div className="mt-2">
            <a
              href="#apply-form"
              className="inline-flex min-h-[52px] items-center justify-center rounded-md bg-white px-7 py-3 text-sm font-semibold tracking-tight text-[#0a0a0a] transition hover:opacity-90 md:text-base"
            >
              상담 신청하기
              <span aria-hidden="true" className="ml-1">
                ↓
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-[#0a0a0a] px-5 py-16 md:py-24">
        <div className="mx-auto max-w-xl">
          <p className="text-[10px] font-medium tracking-[0.4em] text-[#a09880]">
            WHY REBORN LABS
          </p>
          <h2 className="mt-3 text-[22px] font-bold leading-tight tracking-tight md:text-3xl">
            같은 차, 같은 성능.
            <br />
            절반의 비용으로.
          </h2>

          <ul className="mt-8 flex flex-col gap-3">
            {benefits.map((b) => (
              <li
                key={b.title}
                className="flex items-center gap-4 rounded-xl border border-[#c8bfa8]/10 bg-gradient-to-br from-[#1a1a1a] to-[#111] px-5 py-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#c8bfa8]/15 bg-[#c8bfa8]/5 text-[#c8bfa8]">
                  {b.icon}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold tracking-tight text-white">
                    {b.title}
                  </span>
                  <span className="text-[13px] text-[#c8bfa8]/65">
                    {b.desc}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Vehicle preview */}
      <section className="bg-[#f2f0eb] px-5 py-16 md:py-24">
        <div className="mx-auto max-w-xl">
          <p className="text-[10px] font-medium tracking-[0.4em] text-black/40">
            LINEUP
          </p>
          <h2 className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-[#111] md:text-3xl">
            인기 라인업 일부
          </h2>
          <p className="mt-3 text-[13px] text-black/55 md:text-sm">
            더 많은 차량은 상담 시 안내드립니다.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            {vehiclePreview.map((v) => (
              <div
                key={v.name}
                className="overflow-hidden rounded-lg border border-black/5 bg-white"
              >
                <div className="relative aspect-[16/10] w-full bg-[#f5f5f3]">
                  <Image
                    src={v.img}
                    alt={v.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 45vw, 200px"
                    unoptimized
                  />
                </div>
                <div className="flex flex-col gap-1 px-3 py-3">
                  <p className="truncate text-[12px] font-semibold text-[#111]">
                    {v.name}
                  </p>
                  <p className="text-[11px] text-black/50">
                    월 {v.monthly}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="bg-[#0a0a0a] px-5 py-16 md:py-24">
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <p className="text-[10px] font-medium tracking-[0.4em] text-[#a09880]">
              CONTACT
            </p>
            <h2 className="mt-3 text-[22px] font-bold leading-tight tracking-tight md:text-3xl">
              상담 신청
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-[#c8bfa8]/65 md:text-sm">
              연락처를 남겨주시면 담당 매니저가
              <br />
              24시간 내에 연락드립니다.
            </p>
          </div>

          <div className="mt-10">
            <Suspense
              fallback={
                <div className="py-10 text-center text-sm text-[#c8bfa8]/60">
                  불러오는 중...
                </div>
              }
            >
              <ApplyForm />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#c8bfa8]/10 bg-[#0a0a0a] px-5 py-10">
        <div className="mx-auto flex max-w-xl flex-col gap-4 text-[#c8bfa8]/45">
          <p className="text-[13px] font-semibold tracking-[0.35em] text-[#c8bfa8]/85">
            REBORN LABS
          </p>
          <div className="flex flex-col gap-1 text-[11px] leading-relaxed">
            <span>리본랩스 · 대표 심재윤</span>
            <span>서울특별시 성동구 아차산로7길 21, 4층 199호 (성수동2가)</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
            <Link
              href="/privacy"
              className="underline decoration-[#c8bfa8]/20 underline-offset-4 hover:text-white"
            >
              개인정보처리방침
            </Link>
            <span className="text-[#c8bfa8]/30">
              © {new Date().getFullYear()} REBORN LABS
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
