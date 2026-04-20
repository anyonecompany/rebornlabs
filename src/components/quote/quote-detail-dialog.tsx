"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/src/lib/api-client";
import { QuoteStatusBadge } from "./quote-status-badge";
import {
  formatAbsoluteDateISO,
  formatRelativeTime,
} from "@/src/lib/format-relative-time";
import type { QuoteRow } from "./quote-list-table";

type ExtendOption = { label: string; addDays: number | null };

const EXTEND_OPTIONS: ExtendOption[] = [
  { label: "+7일", addDays: 7 },
  { label: "+14일", addDays: 14 },
  { label: "+30일", addDays: 30 },
  { label: "무제한", addDays: null },
];

interface Props {
  quote: QuoteRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (updated: { id: string; expiresAt: string | null }) => void;
}

export function QuoteDetailDialog({ quote, open, onOpenChange, onUpdated }: Props) {
  const [copied, setCopied] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [selected, setSelected] = useState<string>("7");
  const [extending, setExtending] = useState(false);

  if (!quote) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(quote.url);
      setCopied(true);
      toast.success("링크가 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사에 실패했습니다. 직접 선택해 복사해 주세요.");
    }
  };

  const handleExtend = async () => {
    const opt =
      selected === "unlimited"
        ? { label: "무제한", addDays: null as number | null }
        : {
            label: `+${selected}일`,
            addDays: Number(selected) as number | null,
          };
    setExtending(true);
    try {
      const res = await apiFetch(`/api/quotes/${quote.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addDays: opt.addDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "연장에 실패했습니다.");
        return;
      }
      toast.success(
        opt.addDays === null
          ? "무제한으로 연장되었습니다."
          : `${opt.label} 연장되었습니다.`,
      );
      onUpdated({ id: data.quote.id, expiresAt: data.quote.expiresAt });
      setExtendOpen(false);
    } catch {
      toast.error("연장 중 오류가 발생했습니다.");
    } finally {
      setExtending(false);
    }
  };

  const vehicleLabel = quote.vehicle
    ? `${quote.vehicle.make} ${quote.vehicle.model}`
    : "-";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="font-mono tracking-wider">
              {quote.quoteNumber}
            </DialogTitle>
            <QuoteStatusBadge status={quote.status} />
          </div>
          <DialogDescription>{vehicleLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* 공개 링크 */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">공개 링크</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={quote.url}
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(quote.url, "_blank", "noopener")}
                aria-label="새 탭에서 열기"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 조회 정보 */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card/50 p-3">
            <div>
              <p className="text-[11px] text-muted-foreground">조회수</p>
              <p
                className={`text-sm mt-0.5 ${
                  quote.viewCount === 0
                    ? "text-muted-foreground"
                    : quote.viewCount >= 2
                      ? "text-primary font-semibold"
                      : "text-foreground"
                }`}
              >
                {quote.viewCount === 0
                  ? "아직 안 봄"
                  : `${quote.viewCount}회 조회`}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">마지막 조회</p>
              <p className="text-sm mt-0.5 text-foreground">
                {quote.lastViewedAt
                  ? formatRelativeTime(quote.lastViewedAt)
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">생성일</p>
              <p className="text-sm mt-0.5">
                {formatAbsoluteDateISO(quote.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">처음 조회</p>
              <p className="text-sm mt-0.5">
                {quote.firstViewedAt
                  ? formatRelativeTime(quote.firstViewedAt)
                  : "-"}
              </p>
            </div>
          </div>

          {/* 유효기간 + 연장 */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">유효기간</p>
                <p className="text-sm mt-0.5">
                  {formatAbsoluteDateISO(quote.expiresAt)}
                </p>
              </div>
              {quote.canExtend && !extendOpen && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExtendOpen(true)}
                >
                  <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                  만료 연장
                </Button>
              )}
            </div>

            {extendOpen && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <p className="text-[11px] text-muted-foreground mb-1">
                    연장 기간
                  </p>
                  <Select
                    value={selected}
                    onValueChange={(v) => setSelected(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXTEND_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.label}
                          value={
                            opt.addDays === null
                              ? "unlimited"
                              : String(opt.addDays)
                          }
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExtendOpen(false)}
                  disabled={extending}
                >
                  취소
                </Button>
                <Button size="sm" onClick={handleExtend} disabled={extending}>
                  {extending ? "적용 중..." : "적용"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
