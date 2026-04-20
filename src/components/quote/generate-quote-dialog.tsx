"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/src/lib/api-client";

type Option = { label: string; days: number | null };

const EXPIRATION_OPTIONS: Option[] = [
  { label: "7일", days: 7 },
  { label: "14일", days: 14 },
  { label: "30일", days: 30 },
  { label: "무제한", days: null },
];

type Result = {
  quoteId: string;
  quoteNumber: string;
  url: string;
  expiresAt: string | null;
  isExisting: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  vehicleLabel: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "무제한";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function GenerateQuoteDialog({
  open,
  onOpenChange,
  vehicleId,
  vehicleLabel,
}: Props) {
  const [selectedOption, setSelectedOption] = useState<Option>(
    EXPIRATION_OPTIONS[0],
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setSelectedOption(EXPIRATION_OPTIONS[0]);
    setResult(null);
    setCopied(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const requestGenerate = async (force: boolean) => {
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId,
          expiresInDays: selectedOption.days,
          force,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "견적서 생성에 실패했습니다.");
        return;
      }
      setResult(data as Result);
    } catch {
      toast.error("견적서 생성 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast.success("링크가 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사에 실패했습니다. 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>견적서 만들기</DialogTitle>
          <DialogDescription>{vehicleLabel}</DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-4 pt-1">
            <div>
              <p className="text-xs text-muted-foreground mb-2">유효기간</p>
              <div className="grid grid-cols-4 gap-2">
                {EXPIRATION_OPTIONS.map((opt) => {
                  const active = selectedOption.days === opt.days;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedOption(opt)}
                      className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClose(false)}
                disabled={submitting}
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => requestGenerate(false)}
                disabled={submitting}
              >
                {submitting ? "생성 중..." : "생성"}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4 pt-1">
            {result.isExisting && (
              <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-300">
                이 차량에 이미 발급한 활성 견적서가 있어 **기존 링크를 재사용**합니다.
                유효기간 다시 설정하려면 아래 버튼으로 새로 발급하세요.
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">견적번호</p>
              <p className="font-mono text-sm tracking-wider">
                {result.quoteNumber}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">공개 링크</p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={result.url}
                  className="font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  aria-label="링크 복사"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" />
              <span>유효기간</span>
              <span className="text-foreground">
                {formatDate(result.expiresAt)}
              </span>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              {result.isExisting ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => requestGenerate(true)}
                  disabled={submitting}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  새로 발급
                </Button>
              ) : (
                <span />
              )}
              <Button size="sm" onClick={() => handleClose(false)}>
                닫기
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
