import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "REBORN LABS - 프리미엄 차량을 새로운 방식으로",
  description:
    "완벽히 복원된 프리미엄 차량을 합리적인 비용으로. 36개월 이용 후 반납하는 새로운 카 라이프를 경험하세요.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
