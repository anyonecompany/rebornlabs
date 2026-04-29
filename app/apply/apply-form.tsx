"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { formatPhoneInput } from "@/src/lib/format-phone";

interface UtmState {
  source: string;
  medium: string;
  campaign: string;
  content: string;
}

const KAKAO_URL =
  process.env.NEXT_PUBLIC_KAKAO_CHAT_URL ?? "https://open.kakao.com/o/sjk1AUoi";
const INSTAGRAM_URL =
  process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "https://instagram.com/reborn_labs_";

function parseMoneyInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, 6);
}

export default function ApplyForm() {
  const searchParams = useSearchParams();

  const [utm, setUtm] = useState<UtmState>({
    source: "direct",
    medium: "",
    campaign: "",
    content: "",
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [deposit, setDeposit] = useState("");
  const [monthly, setMonthly] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [agreed, setAgreed] = useState(false);

  // IME 컴포지션 추적 (한글 입력 시 중간 상태 setState 방지)
  const composingName = useRef(false);
  const composingMessage = useRef(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const fromUrl = {
      source: searchParams.get("utm_source") ?? "",
      medium: searchParams.get("utm_medium") ?? "",
      campaign: searchParams.get("utm_campaign") ?? "",
      content: searchParams.get("utm_content") ?? "",
    };

    if (fromUrl.source) {
      try {
        sessionStorage.setItem("reborn_apply_utm", JSON.stringify(fromUrl));
      } catch {
        // sessionStorage 접근 실패 — 무시
      }
      setUtm({
        source: fromUrl.source,
        medium: fromUrl.medium,
        campaign: fromUrl.campaign,
        content: fromUrl.content,
      });
      return;
    }

    try {
      const stored = sessionStorage.getItem("reborn_apply_utm");
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UtmState>;
        setUtm({
          source: parsed.source || "direct",
          medium: parsed.medium || "",
          campaign: parsed.campaign || "",
          content: parsed.content || "",
        });
      }
    } catch {
      // 무시
    }
  }, [searchParams]);

  const canSubmit =
    name.trim().length > 0 &&
    phone.replace(/[^0-9]/g, "").length >= 10 &&
    agreed &&
    !isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorMessage(null);

    const payload = {
      name: name.trim(),
      phone,
      vehicle: vehicle.trim() || undefined,
      message: message.trim() || undefined,
      ref: utm.source || "direct",
      // Phase 2에서 DB 컬럼과 매칭될 추가 UTM 필드 (현재 API는 무시)
      utm_medium: utm.medium || undefined,
      utm_campaign: utm.campaign || undefined,
      utm_content: utm.content || undefined,
      // 보증금/월납입료 (만원 단위, 숫자)
      available_deposit: deposit ? Number(deposit) : undefined,
      desired_monthly_payment: monthly ? Number(monthly) : undefined,
      website, // honeypot
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/consultations/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          setErrorMessage(
            data?.error ?? "신청 중 오류가 발생했습니다. 다시 시도해 주세요.",
          );
          return;
        }
        setSubmitted(true);
      } catch {
        setErrorMessage("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    });
  }

  if (submitted) {
    return <ApplySuccess />;
  }

  return (
    <form
      id="apply-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      noValidate
    >
      {/* Honeypot (비노출) */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        autoComplete="off"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute left-[-9999px] top-[-9999px] h-0 w-0 opacity-0"
      />

      <Field label="이름" required>
        <input
          className="form-input"
          type="text"
          inputMode="text"
          placeholder="홍길동"
          value={name}
          onCompositionStart={() => { composingName.current = true; }}
          onCompositionEnd={(e) => {
            composingName.current = false;
            setName(e.currentTarget.value);
          }}
          onChange={(e) => { if (!composingName.current) setName(e.target.value); }}
          maxLength={50}
          autoComplete="name"
        />
      </Field>

      <Field label="연락처" required hint="24시간 내 담당 매니저가 연락드립니다">
        <input
          className="form-input"
          type="tel"
          inputMode="numeric"
          placeholder="010-0000-0000"
          value={phone}
          onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
          autoComplete="tel"
        />
      </Field>

      <Field label="관심 차종" hint="선택 사항">
        <input
          className="form-input"
          type="text"
          placeholder="예) 벤츠 E-클래스, BMW 5시리즈"
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          maxLength={60}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
        <Field label="보증금" hint="만원 단위, 선택">
          <div className="relative">
            <input
              className="form-input pr-10"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={deposit}
              onChange={(e) => setDeposit(parseMoneyInput(e.target.value))}
            />
            <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-xs text-[#c8bfa8]/50">
              만원
            </span>
          </div>
        </Field>
        <Field label="희망 월 납입료" hint="만원 단위, 선택">
          <div className="relative">
            <input
              className="form-input pr-10"
              type="text"
              inputMode="numeric"
              placeholder="50"
              value={monthly}
              onChange={(e) => setMonthly(parseMoneyInput(e.target.value))}
            />
            <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-xs text-[#c8bfa8]/50">
              만원
            </span>
          </div>
        </Field>
      </div>

      <Field label="문의사항" hint="선택 사항">
        <textarea
          className="form-input resize-y py-3"
          rows={3}
          placeholder="궁금한 점을 자유롭게 작성해 주세요"
          value={message}
          onCompositionStart={() => { composingMessage.current = true; }}
          onCompositionEnd={(e) => {
            composingMessage.current = false;
            setMessage(e.currentTarget.value);
          }}
          onChange={(e) => { if (!composingMessage.current) setMessage(e.target.value); }}
          maxLength={1000}
        />
      </Field>

      {/* 개인정보 동의 — 체크 시 ✓ 마크 표시 (배경색만 채우던 기존 UI 개선) */}
      <label className="mt-1 flex cursor-pointer items-start gap-3 text-sm text-[#c8bfa8]/80">
        <span className="relative mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-sm border border-[#c8bfa8]/40 bg-transparent checked:border-[#c8bfa8] checked:bg-[#c8bfa8]"
            aria-label="개인정보 수집·이용 동의"
          />
          <Check
            className="pointer-events-none relative h-3 w-3 text-[#0a0a0a] opacity-0 peer-checked:opacity-100"
            strokeWidth={3}
          />
        </span>
        <span className="leading-relaxed">
          <span className="text-[#c8bfa8]">[필수]</span> 개인정보 수집·이용에
          동의합니다.{" "}
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener"
            className="underline decoration-[#c8bfa8]/40 underline-offset-4 hover:text-white"
          >
            자세히 보기
          </Link>
        </span>
      </label>

      {errorMessage && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-2 flex min-h-[56px] w-full items-center justify-center rounded-md bg-[#c8bfa8] px-6 py-4 text-base font-semibold tracking-tight text-[#0a0a0a] transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPending ? "신청 중..." : "상담 신청하기"}
      </button>

      {utm.source && utm.source !== "direct" && (
        <p className="text-center text-[11px] text-[#c8bfa8]/25">
          ref: {utm.source}
        </p>
      )}

      <style jsx>{`
        .form-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(200, 191, 168, 0.2);
          color: #fff;
          font-family: inherit;
          font-size: 16px;
          font-weight: 400;
          padding: 12px 0;
          outline: none;
          transition: border-color 0.2s;
          border-radius: 0;
          -webkit-appearance: none;
        }
        .form-input::placeholder {
          color: rgba(200, 191, 168, 0.35);
        }
        .form-input:focus {
          border-bottom-color: rgba(200, 191, 168, 0.65);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#c8bfa8]/75">
          {label}
          {required && <span className="ml-1 text-red-400">*</span>}
        </label>
        {hint && (
          <span className="text-[11px] text-[#c8bfa8]/35">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function ApplySuccess() {
  return (
    <div className="flex flex-col items-center gap-8 py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#c8bfa8]/30 bg-[#c8bfa8]/10">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#c8bfa8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          상담 신청이 완료되었습니다
        </h2>
        <p className="text-sm leading-relaxed text-[#c8bfa8]/70">
          24시간 내 담당 매니저가 남겨주신 연락처로
          <br />
          연락드리겠습니다.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3 pt-4">
        <p className="text-xs text-[#c8bfa8]/50">
          더 빠른 상담이 필요하신가요?
        </p>
        <a
          href={KAKAO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-md bg-[#FEE500] px-6 py-4 text-base font-semibold text-[#3C1E1E] transition hover:opacity-90"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 3C6.48 3 2 6.58 2 11c0 2.79 1.79 5.25 4.5 6.67-.19.73-.69 2.5-.79 2.88-.12.48.17.47.36.34.15-.1 2.38-1.62 3.33-2.27.86.13 1.73.2 2.6.2 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
          </svg>
          카카오톡 상담하기
        </a>

        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md border border-[#c8bfa8]/25 px-6 py-3 text-sm font-medium text-[#c8bfa8]/85 transition hover:border-[#c8bfa8]/50 hover:text-white"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          인스타그램 @reborn_labs_ 팔로우
        </a>
      </div>
    </div>
  );
}
