import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | REBORN LABS",
  description: "리본랩스의 개인정보 수집·이용·보관·파기 기준.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[#0a0a0a] text-white">{children}</div>;
}
