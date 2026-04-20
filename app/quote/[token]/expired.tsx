import { Phone } from "lucide-react";

type Props = {
  data: {
    error: "expired";
    message: string;
    quote: { quoteNumber: string; expiresAt: string | null };
    dealer: { name: string; phone: string | null } | null;
  };
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function ExpiredView({ data }: Props) {
  const { quote, dealer } = data;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <header className="border-b border-[#c8bfa8]/15">
        <div className="max-w-3xl mx-auto px-5 py-6">
          <p className="text-[10px] tracking-[0.3em] text-[#b8a875] uppercase">
            Reborn Labs
          </p>
          <p className="text-xs text-[#c8bfa8]/70 mt-0.5">
            프리미엄 중고차 견적서
          </p>
        </div>
      </header>

      <section className="flex-1 max-w-3xl w-full mx-auto px-5 py-12 flex flex-col items-center justify-center text-center">
        <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/5 px-3 py-1 text-[11px] font-medium tracking-widest text-amber-300 uppercase">
          Expired
        </span>
        <h1 className="mt-5 text-2xl sm:text-3xl font-semibold tracking-tight">
          견적서 유효기간이 만료되었습니다
        </h1>
        <p className="mt-3 text-sm text-[#c8bfa8]/70 max-w-md">
          이 견적서는 {formatDate(quote.expiresAt)}에 만료되었습니다.<br />
          최신 가격과 조건은 담당 딜러에게 재요청을 부탁드립니다.
        </p>

        <p className="mt-6 font-mono text-[11px] text-[#c8bfa8]/40 tracking-wider">
          Quote No. {quote.quoteNumber}
        </p>

        {dealer && (
          <div className="mt-10 w-full max-w-sm rounded-2xl border border-[#c8bfa8]/15 bg-[#12110a] p-5 text-left">
            <p className="text-[11px] tracking-[0.25em] text-[#b8a875] uppercase mb-2">
              Your Advisor
            </p>
            <p className="text-lg font-semibold text-white">{dealer.name}</p>
            {dealer.phone && (
              <a
                href={`tel:${dealer.phone.replace(/[^0-9+]/g, "")}`}
                className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#c8bfa8] text-[#0a0a0a] font-semibold py-3.5 hover:bg-[#b8a875] transition-colors"
              >
                <Phone className="h-4 w-4" />
                재요청 문의 · {dealer.phone}
              </a>
            )}
          </div>
        )}
      </section>

      <div className="h-6" />
    </main>
  );
}
