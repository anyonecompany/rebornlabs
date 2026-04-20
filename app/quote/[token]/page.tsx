import { headers } from "next/headers";
import { QuoteView } from "./quote-view";
import { ExpiredView } from "./expired";

type PageProps = { params: Promise<{ token: string }> };

type QuoteApiResponse = {
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

type ExpiredResponse = {
  error: "expired";
  message: string;
  quote: { quoteNumber: string; expiresAt: string | null };
  dealer: { name: string; phone: string | null } | null;
};

async function fetchQuote(
  token: string,
): Promise<
  | { status: "ok"; data: QuoteApiResponse }
  | { status: "expired"; data: ExpiredResponse }
  | { status: "notfound" }
> {
  const hdr = await headers();
  const host = hdr.get("host") ?? "localhost:3000";
  const proto = hdr.get("x-forwarded-proto") ?? "http";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`;

  const res = await fetch(`${base.replace(/\/$/, "")}/api/quotes/${token}`, {
    cache: "no-store",
  });

  if (res.status === 410) {
    const data = (await res.json()) as ExpiredResponse;
    return { status: "expired", data };
  }
  if (!res.ok) {
    return { status: "notfound" };
  }
  const data = (await res.json()) as QuoteApiResponse;
  return { status: "ok", data };
}

export const metadata = {
  title: "리본랩스 견적서",
  description: "프리미엄 중고차 견적 안내",
};

export default async function QuotePage({ params }: PageProps) {
  const { token } = await params;
  const result = await fetchQuote(token);

  if (result.status === "notfound") {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-[#c8bfa8] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-sm tracking-widest text-[#b8a875] uppercase mb-3">
            Reborn Labs
          </p>
          <h1 className="text-2xl font-semibold text-white mb-2">
            견적서를 찾을 수 없습니다
          </h1>
          <p className="text-sm text-[#c8bfa8]/70">
            링크가 올바르지 않거나 삭제되었습니다. 담당 딜러에게 문의해 주세요.
          </p>
        </div>
      </main>
    );
  }

  if (result.status === "expired") {
    return <ExpiredView data={result.data} />;
  }

  return <QuoteView data={result.data} />;
}
