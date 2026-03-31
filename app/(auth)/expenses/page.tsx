"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Paperclip, X, FileText } from "lucide-react";
import Image from "next/image";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
import type { UserRole } from "@/types/database";

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

/** 숫자를 한국 원화 형식으로 포맷합니다. */
function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

/** 이번 달 YYYY-MM 문자열을 반환합니다. */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface ExpenseRow {
  id: string;
  expense_date: string;
  amount: number;
  purpose: string;
  author_name: string;
  receipt_urls: string[];
  created_at: string;
}

interface UserOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// 증빙 미리보기 Dialog
// ---------------------------------------------------------------------------

interface ReceiptPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  urls: string[];
}

function ReceiptPreviewDialog({
  open,
  onOpenChange,
  urls,
}: ReceiptPreviewDialogProps) {
  const handleOpenPdf = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>증빙 파일</DialogTitle>
          <DialogDescription>
            {urls.length}개의 증빙 파일이 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
          {urls.map((url, idx) => {
            const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
            const isPdf = /\.pdf(\?|$)/i.test(url);
            const fileName = url.split("/").pop()?.split("?")[0] ?? `파일 ${idx + 1}`;

            if (isImage) {
              return (
                <div
                  key={idx}
                  className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-muted"
                >
                  <Image
                    src={url}
                    alt={`증빙 ${idx + 1}`}
                    fill
                    className="object-contain"
                  />
                </div>
              );
            }

            if (isPdf) {
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleOpenPdf(url)}
                  className="flex items-center gap-3 w-full p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-left"
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="text-sm truncate">{fileName}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                    새 탭으로 열기
                  </span>
                </button>
              );
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleOpenPdf(url)}
                className="flex items-center gap-3 w-full p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-left"
              >
                <Paperclip className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="text-sm truncate">{fileName}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 지출 등록 Dialog
// ---------------------------------------------------------------------------

interface RegisterExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ReceiptItem {
  /** 고유 키 (파일별 추적용) */
  key: string;
  /** 로컬 미리보기 URL (이미지만) */
  previewUrl: string | null;
  /** 업로드 완료된 실제 URL */
  uploadedUrl: string | null;
  /** 원본 파일명 */
  fileName: string;
  /** 업로드 진행 중 여부 */
  uploading: boolean;
  /** 파일 타입 */
  fileType: string;
}

function RegisterExpenseDialog({
  open,
  onOpenChange,
  onSuccess,
}: RegisterExpenseDialogProps) {
  const [expenseDate, setExpenseDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setExpenseDate(new Date().toISOString().split("T")[0]);
    setAmount("");
    setPurpose("");
    setReceipts([]);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (!submitting) {
      reset();
      onOpenChange(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";

    for (const file of files) {
      const maxBytes = 20 * 1024 * 1024;
      if (file.size > maxBytes) {
        toast.error(`${file.name}: 파일 크기가 20MB를 초과합니다.`);
        continue;
      }

      const isImage = file.type.startsWith("image/");
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      const itemKey = `${Date.now()}-${Math.random()}`;

      const item: ReceiptItem = {
        key: itemKey,
        previewUrl,
        uploadedUrl: null,
        fileName: file.name,
        uploading: true,
        fileType: file.type,
      };

      setReceipts((prev) => [...prev, item]);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await apiFetch("/api/expenses/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "파일 업로드에 실패했습니다.");
        }

        setReceipts((prev) =>
          prev.map((r) =>
            r.key === itemKey
              ? { ...r, uploadedUrl: data.url as string, uploading: false }
              : r,
          ),
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "파일 업로드에 실패했습니다.";
        toast.error(msg);
        setReceipts((prev) => prev.filter((r) => r.key !== itemKey));
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }
    }
  };

  const removeReceipt = (key: string) => {
    setReceipts((prev) => {
      const item = prev.find((r) => r.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((r) => r.key !== key);
    });
  };

  const handleSubmit = async () => {
    if (!expenseDate) {
      toast.error("지출일자를 입력해주세요.");
      return;
    }
    const amountNum = Number(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast.error("유효한 금액을 입력해주세요.");
      return;
    }
    if (!purpose.trim()) {
      toast.error("목적을 입력해주세요.");
      return;
    }
    if (receipts.some((r) => r.uploading)) {
      toast.error("파일 업로드가 완료될 때까지 기다려주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const receiptUrls = receipts
        .filter((r) => r.uploadedUrl)
        .map((r) => r.uploadedUrl as string);

      const res = await apiFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          expense_date: expenseDate,
          amount: amountNum,
          purpose: purpose.trim(),
          receipt_urls: receiptUrls,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "지출 등록에 실패했습니다.");
        return;
      }
      toast.success("지출이 등록되었습니다.");
      reset();
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("지출 등록 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const allUploaded = receipts.every((r) => !r.uploading);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>지출 등록</DialogTitle>
          <DialogDescription>
            지출 내역을 입력하고 증빙 파일을 첨부해주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 지출일자 */}
          <div className="space-y-1.5">
            <Label>지출일자 *</Label>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* 금액 */}
          <div className="space-y-1.5">
            <Label>금액 (원) *</Label>
            <div className="relative">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amount ? Number(amount).toLocaleString("ko-KR") : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setAmount(raw);
                }}
                disabled={submitting}
                className="pr-6"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                원
              </span>
            </div>
          </div>

          {/* 목적 */}
          <div className="space-y-1.5">
            <Label>목적 *</Label>
            <Textarea
              placeholder="지출 목적을 입력하세요"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              className="resize-none"
              disabled={submitting}
            />
          </div>

          {/* 증빙파일 */}
          <div className="space-y-2">
            <Label>증빙파일</Label>

            {/* 파일 목록 */}
            {receipts.length > 0 && (
              <div className="space-y-2">
                {receipts.map((r) => (
                  <div
                    key={r.key}
                    className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/30"
                  >
                    {/* 이미지 썸네일 */}
                    {r.previewUrl ? (
                      <div className="relative w-10 h-10 rounded overflow-hidden border border-border shrink-0">
                        <Image
                          src={r.previewUrl}
                          alt={r.fileName}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 flex items-center justify-center rounded border border-border shrink-0 bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}

                    <span className="text-sm truncate flex-1">{r.fileName}</span>

                    {r.uploading ? (
                      <span className="text-xs text-muted-foreground shrink-0">
                        업로드 중...
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeReceipt(r.key)}
                        disabled={submitting}
                        className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 파일 선택 버튼 */}
            <label className="cursor-pointer w-fit">
              <div
                className={[
                  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[min(var(--radius-md),12px)] border border-border bg-background text-[0.8rem] font-medium transition-colors",
                  submitting
                    ? "opacity-50 pointer-events-none"
                    : "hover:bg-muted hover:text-foreground",
                ].join(" ")}
              >
                <Paperclip className="h-3.5 w-3.5" />
                파일 추가
              </div>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                multiple
                className="hidden"
                onChange={handleFileChange}
                disabled={submitting}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              이미지(JPG, PNG, WEBP) 또는 PDF · 최대 20MB
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !allUploaded}
          >
            {submitting ? "등록 중..." : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 메인 페이지
// ---------------------------------------------------------------------------

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);

  const [month, setMonth] = useState(currentMonth);
  const [userFilter, setUserFilter] = useState<string>("all");
  const { role: userRole } = useUserRole();
  const [staffOptions, setStaffOptions] = useState<UserOption[]>([]);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // staff/admin 목록 로드
  useEffect(() => {
    apiFetch("/api/users?roles=admin,staff")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.data) setStaffOptions(d.data as UserOption[]);
      })
      .catch(() => null);
  }, []);

  const fetchExpenses = useCallback(
    async (cursor?: string) => {
      if (!cursor) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({ month });
        if (userFilter !== "all") params.set("user_id", userFilter);
        if (cursor) params.set("cursor", cursor);

        const res = await apiFetch(`/api/expenses?${params.toString()}`);
        if (!res.ok) {
          const d = await res.json();
          toast.error(d.error ?? "지출 목록을 불러오지 못했습니다.");
          return;
        }
        const d = await res.json();

        if (cursor) {
          setExpenses((prev) => [...prev, ...(d.data ?? [])]);
        } else {
          setExpenses(d.data ?? []);
          setTotalAmount(d.totalAmount ?? 0);
        }
        setNextCursor(d.nextCursor ?? null);
      } catch {
        toast.error("지출 목록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [month, userFilter],
  );

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/expenses/${deleteTargetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "삭제에 실패했습니다.");
        return;
      }
      toast.success("지출이 삭제되었습니다.");
      setDeleteTargetId(null);
      fetchExpenses();
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const openPreview = (urls: string[]) => {
    setPreviewUrls(urls);
    setPreviewOpen(true);
  };

  const isAdmin = userRole === "admin";
  const isPrivileged = userRole === "admin" || userRole === "staff";

  const columns = [
    { key: "expense_date", header: "지출일자" },
    {
      key: "amount",
      header: "금액",
      render: (v: unknown) => (
        <span className="font-medium">{formatKRW(v as number)}</span>
      ),
    },
    { key: "purpose", header: "목적" },
    { key: "author_name", header: "작성자" },
    {
      key: "receipt_urls",
      header: "증빙",
      render: (v: unknown, row: Record<string, unknown>) => {
        const urls = v as string[];
        if (!urls || urls.length === 0) {
          return <span className="text-muted-foreground text-xs">없음</span>;
        }
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openPreview(urls);
            }}
          >
            <Badge variant="secondary" className="cursor-pointer hover:opacity-80">
              <Paperclip className="h-3 w-3 mr-1" />
              {urls.length}건
            </Badge>
          </button>
        );
      },
    },
    ...(isAdmin
      ? [
          {
            key: "id",
            header: "",
            render: (v: unknown) => (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTargetId(v as string);
                }}
                className="text-xs text-destructive hover:underline"
              >
                삭제
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader title="지출결의">
        {isPrivileged && (
          <Button onClick={() => setRegisterOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            지출 등록
          </Button>
        )}
      </PageHeader>

      {/* 월별 요약 카드 */}
      <div className="mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {month} 지출 총액
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {loading ? "—" : formatKRW(totalAmount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-full sm:w-44"
        />
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="작성자 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {staffOptions.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={expenses as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="등록된 지출 내역이 없습니다."
      />

      {/* 더보기 버튼 */}
      {nextCursor && !loading && (
        <div className="flex justify-center mt-4">
          <Button
            variant="outline"
            onClick={() => fetchExpenses(nextCursor)}
            disabled={loadingMore}
          >
            {loadingMore ? "불러오는 중..." : "더보기"}
          </Button>
        </div>
      )}

      {/* 지출 등록 Dialog */}
      <RegisterExpenseDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onSuccess={() => fetchExpenses()}
      />

      {/* 증빙 미리보기 Dialog */}
      <ReceiptPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        urls={previewUrls}
      />

      {/* 삭제 확인 Dialog */}
      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        title="지출을 삭제하시겠습니까?"
        description="삭제된 지출 내역은 복원할 수 없습니다."
        confirmLabel="삭제"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
