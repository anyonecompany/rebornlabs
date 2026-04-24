"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  ExternalLink,
  Plus,
  Share2,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/src/lib/api-client";

// ─── 타입 ──────────────────────────────────────────────────

interface MarketingCompany {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

type LinkKind = "cars" | "apply";

const LINK_META: Record<LinkKind, { label: string; path: string; hint: string }> = {
  cars: {
    label: "차량 카탈로그",
    path: "/cars",
    hint: "재고 차량 목록을 공유할 때",
  },
  apply: {
    label: "상담 신청 폼",
    path: "/apply",
    hint: "SNS 광고·업체별 상담 유치에 사용",
  },
};

// ─── 유틸 ──────────────────────────────────────────────────

function buildShareUrl(origin: string, path: string, refName: string): string {
  const encoded = encodeURIComponent(refName);
  return `${origin}${path}?ref=${encoded}`;
}

// ─── 컴포넌트 ──────────────────────────────────────────────

export default function ShareLinksPage() {
  const [companies, setCompanies] = useState<MarketingCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  // 페이지 마운트 후 origin 확정 — SSR 에는 window 없으므로.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/marketing-companies?is_active=true");
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        toast.error(d?.error ?? "업체 목록을 불러오지 못했습니다.");
        setCompanies([]);
        return;
      }
      const d = await res.json();
      setCompanies((d.data ?? []) as MarketingCompany[]);
    } catch {
      toast.error("업체 목록 조회 중 오류가 발생했습니다.");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = useCallback(async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${label} 링크가 복사되었습니다.`);
    } catch {
      toast.error("클립보드 복사에 실패했습니다. 수동으로 복사해주세요.");
    }
  }, []);

  const handleAddCompany = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("업체명을 입력해주세요.");
      return;
    }
    setAdding(true);
    try {
      const res = await apiFetch("/api/marketing-companies", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(d?.error ?? "업체 등록에 실패했습니다.");
        return;
      }
      toast.success("업체가 등록되었습니다.");
      setAddOpen(false);
      setNewName("");
      await load();
    } catch {
      toast.error("업체 등록 중 오류가 발생했습니다.");
    } finally {
      setAdding(false);
    }
  }, [newName, load]);

  const sorted = useMemo(
    () =>
      [...companies].sort((a, b) =>
        a.name.localeCompare(b.name, "ko"),
      ),
    [companies],
  );

  return (
    <div>
      <PageHeader
        title="공유 링크"
        description="마케팅 업체별로 /cars, /apply 공유 URL 을 생성·복사할 수 있습니다. 고객이 이 링크로 접속해 상담 신청하면 어느 업체에서 유입됐는지 자동으로 기록됩니다."
      />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          등록된 업체 {loading ? "—" : sorted.length}개
        </p>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          업체 추가
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-5 w-32 bg-muted animate-pulse rounded mb-4" />
                <div className="h-10 bg-muted animate-pulse rounded mb-2" />
                <div className="h-10 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Share2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">등록된 업체가 없습니다</p>
            <p className="text-xs text-muted-foreground mb-4">
              인스타그램·네이버·카카오 등 SNS 업체를 추가하면 업체별 공유 링크가 자동 생성됩니다.
            </p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              첫 업체 추가하기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sorted.map((company) => (
            <Card key={company.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{company.name}</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    ref={company.name}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(Object.keys(LINK_META) as LinkKind[]).map((kind) => {
                  const meta = LINK_META[kind];
                  const url = origin
                    ? buildShareUrl(origin, meta.path, company.name)
                    : "";
                  return (
                    <div
                      key={kind}
                      className="rounded-md border border-border bg-muted/30 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{meta.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {meta.hint}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleCopy(url, `${company.name} ${meta.label}`)
                            }
                            disabled={!url}
                          >
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            복사
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (url) window.open(url, "_blank", "noopener,noreferrer");
                            }}
                            disabled={!url}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            새 창
                          </Button>
                        </div>
                      </div>
                      <code className="block text-xs text-muted-foreground break-all">
                        {url || "불러오는 중..."}
                      </code>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>마케팅 업체 추가</DialogTitle>
            <DialogDescription>
              업체명은 상담 접수 시 그대로 기록됩니다. 한글 또는 영문 모두 가능하며 중복은 허용되지 않습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="new-company-name" className="text-xs">
              업체명 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-company-name"
              placeholder="예: 인스타그램, 네이버, 카카오"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={adding}
              maxLength={50}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setNewName("");
              }}
              disabled={adding}
            >
              취소
            </Button>
            <Button
              onClick={handleAddCompany}
              disabled={adding || !newName.trim()}
            >
              {adding ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
