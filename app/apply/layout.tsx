import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "상담 신청 | REBORN LABS",
  description:
    "보증금 0원부터 월 50만원대까지. 프리미엄 차량을 새로운 방식으로 이용하세요.",
  openGraph: {
    title: "상담 신청 | REBORN LABS",
    description: "보증금 0원부터 월 50만원대까지. 프리미엄 차량 반납형 상품 상담.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[#0a0a0a] text-white">{children}</div>;
}
