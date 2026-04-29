"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
import { useUrlState } from "@/src/lib/use-url-state";
import { QuoteListTable, type QuoteRow } from "@/src/components/quote/quote-list-table";
import { QuoteDetailDialog } from "@/src/components/quote/quote-detail-dialog";

type Status = "all" | "active" | "expired";

const STATUS_TABS: { value: Status; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "활성" },
  { value: "expired", label: "만료" },
];

const PAGE_SIZE = 20;

function QuotesPageInner() {
  const { role } = useUserRole();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useUrlState<Status>("status", "all");
  const [search, setSearch] = useUrlState<string>("search", "");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useUrlState<number>("page", 1);

  // URL의 검색어 → input에 동기화 (초기 로드 + 외부 URL 변경 시)
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const [selectedQuote, setSelectedQuote] = useState<QuoteRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const showDealer = useMemo(
    () => role === "admin" || role === "staff",
    [role],
  );

  const title = useMemo(() => {
    if (role === "admin" || role === "staff") return "견적서 관리";
    return "내 견적서";
  }, [role]);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const res = await apiFetch(`/api/quotes?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "견적 목록을 불러오지 못했습니다.");
        return;
      }
      const data = await res.json();
      setQuotes(data.quotes ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("견적 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [status, search, page]);

  // 필터 활성 여부: 검색어가 있거나 상태 탭이 전체가 아닌 경우
  const isFiltered = search.trim() !== "" || status !== "all";

  // stale: 첫 로드 이후 재조회 중
  const isStale = loading && initialized;

  // 300ms debounce — status/search/page가 연속으로 바뀔 때 마지막 값으로만 fetch
  useEffect(() => {
    const id = setTimeout(() => {
      fetchQuotes();
    }, 300);
    return () => clearTimeout(id);
  }, [fetchQuotes]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleRowClick = (quote: QuoteRow) => {
    setSelectedQuote(quote);
    setDetailOpen(true);
  };

  const handleQuoteUpdated = ({
    id,
    expiresAt,
  }: {
    id: string;
    expiresAt: string | null;
  }) => {
    const now = Date.now();
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === id
          ? {
              ...q,
              expiresAt,
              status:
                expiresAt && new Date(expiresAt).getTime() <= now
                  ? "expired"
                  : "active",
            }
          : q,
      ),
    );
    if (selectedQuote?.id === id) {
      setSelectedQuote({
        ...selectedQuote,
        expiresAt,
        status:
          expiresAt && new Date(expiresAt).getTime() <= now
            ? "expired"
            : "active",
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title={title}
        description="발급된 견적서를 조회하고 고객에게 전달할 공유 링크를 관리합니다."
      />

      {/* 탭 + 검색 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="inline-flex rounded-md border border-border p-1 bg-card">
          {STATUS_TABS.map((tab) => {
            const active = status === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setPage(1);
                  setStatus(tab.value);
                }}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  active
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="relative flex-1 max-w-md"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="견적번호 또는 차량명으로 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>

        <div className="sm:ml-auto text-xs text-muted-foreground">
          총 {total.toLocaleString("ko-KR")}건
        </div>
      </div>

      {/* stale 오버레이: 데이터가 있는 상태에서 재조회 중 */}
      <div className={`relative transition-opacity ${isStale ? "opacity-50 pointer-events-none" : ""}`}>
        {isStale && (
          <div className="absolute inset-0 flex items-start justify-center pt-4 z-10">
            <span className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-md border border-border">
              새로고침 중...
            </span>
          </div>
        )}
        <QuoteListTable
          quotes={quotes}
          loading={!initialized && loading}
          showDealer={showDealer}
          onRowClick={handleRowClick}
          emptyMessage={isFiltered ? "검색 결과가 없습니다." : "등록된 견적서가 없습니다."}
        />
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} / {total}개
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <QuoteDetailDialog
        quote={selectedQuote}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={handleQuoteUpdated}
      />
    </div>
  );
}

export default function QuotesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">불러오는 중...</div>}>
      <QuotesPageInner />
    </Suspense>
  );
}
