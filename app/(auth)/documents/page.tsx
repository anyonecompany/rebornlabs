"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatDate } from "@/src/lib/format";
import type { UserRole } from "@/types/database";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const DOCUMENT_CATEGORIES = [
  { value: "all", label: "전체" },
  { value: "business_registration", label: "사업자등록증" },
  { value: "contract_template", label: "계약서" },
  { value: "other", label: "기타" },
] as const;

type DocumentCategory = "business_registration" | "contract_template" | "other";

const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  business_registration: "사업자등록증",
  contract_template: "계약서",
  other: "기타",
};

const CATEGORY_VARIANT: Record<
  DocumentCategory,
  "default" | "secondary" | "outline"
> = {
  business_registration: "default",
  contract_template: "secondary",
  other: "outline",
};

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface DocumentRow {
  id: string;
  file_name: string;
  category: DocumentCategory;
  uploader_name: string;
  file_url: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 날짜 포맷
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 문서 업로드 Dialog
// ---------------------------------------------------------------------------

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function UploadDocumentDialog({
  open,
  onOpenChange,
  onSuccess,
}: UploadDocumentDialogProps) {
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [fileTitle, setFileTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCategory("other");
    setFileTitle("");
    setSelectedFile(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    const isDirty = selectedFile !== null || fileTitle.trim() !== "" || category !== "other";
    if (isDirty && !window.confirm("저장하지 않은 입력이 있습니다. 닫으시겠습니까?")) return;
    reset();
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";

    if (!file) return;
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error("파일 크기가 50MB를 초과합니다.");
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error("파일을 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", category);
      if (fileTitle.trim()) {
        formData.append("file_name", fileTitle.trim());
      }

      const res = await apiFetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "문서 업로드에 실패했습니다.");
        return;
      }
      toast.success("문서가 업로드되었습니다.");
      reset();
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("문서 업로드 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>문서 업로드</DialogTitle>
          <DialogDescription>
            카테고리를 선택하고 파일을 업로드하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 카테고리 */}
          <div className="space-y-1.5">
            <Label>카테고리 *</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as DocumentCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="business_registration">사업자등록증</SelectItem>
                <SelectItem value="contract_template">계약서</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 제목 (optional) */}
          <div className="space-y-1.5">
            <Label>
              제목{" "}
              <span className="text-muted-foreground text-xs">
                (미입력 시 파일명 사용)
              </span>
            </Label>
            <Input
              placeholder="문서 제목"
              value={fileTitle}
              onChange={(e) => setFileTitle(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* 파일 선택 */}
          <div className="space-y-1.5">
            <Label>파일 *</Label>
            <label className="block cursor-pointer">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  {selectedFile ? (
                    <p className="text-sm truncate font-medium">
                      {selectedFile.name}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      클릭하여 파일 선택
                    </p>
                  )}
                </div>
              </div>
              <input
                type="file"
                className="hidden"
                onChange={handleFileChange}
                disabled={submitting}
              />
            </label>
            <p className="text-xs text-muted-foreground">최대 50MB</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !selectedFile}>
            {submitting ? "업로드 중..." : "업로드"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 메인 페이지
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  const PAGE_SIZE = 20;
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { role: userRole } = useUserRole();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const res = await apiFetch(`/api/documents?${params.toString()}`);
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "문서 목록을 불러오지 못했습니다.");
        return;
      }
      const d = await res.json();
      setDocuments(d.data ?? []);
      setTotal(d.total ?? 0);
      setTotalPages(d.totalPages ?? 1);
    } catch {
      toast.error("문서 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter]);

  // categoryFilter 변경 시 page를 1로 리셋 (fetchDocuments보다 먼저 처리)
  useEffect(() => {
    setPage(1);
  }, [categoryFilter]);

  // 300ms debounce — categoryFilter 변경 → setPage(1) 연쇄로 인한 중복 fetch 방지
  useEffect(() => {
    const id = setTimeout(() => {
      fetchDocuments();
    }, 300);
    return () => clearTimeout(id);
  }, [fetchDocuments]);

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/documents/${deleteTargetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "삭제에 실패했습니다.");
        return;
      }
      toast.success("문서가 삭제되었습니다.");
      setDeleteTargetId(null);
      fetchDocuments();
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  // 다운로드 — file_url 은 만료 가능한 signed URL 이므로 클릭 시점에 새로 발급.
  const handleDownload = useCallback(async (docId: string) => {
    try {
      const res = await apiFetch(`/api/documents/${docId}/file-url`);
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error ?? "다운로드 링크 생성에 실패했습니다.");
        return;
      }
      if (!d.url) {
        toast.error("다운로드 URL을 받을 수 없습니다.");
        return;
      }
      window.open(d.url as string, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("다운로드 중 오류가 발생했습니다.");
    }
  }, []);

  const isAdmin = userRole === "admin";
  const isPrivileged =
    userRole === "admin" ||
    userRole === "staff" ||
    userRole === "director" ||
    userRole === "team_leader";

  const columns = [
    {
      key: "file_name",
      header: "파일명",
      render: (v: unknown) => (
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{v as string}</span>
        </div>
      ),
    },
    {
      key: "category",
      header: "카테고리",
      render: (v: unknown) => {
        const cat = v as DocumentCategory;
        return (
          <Badge variant={CATEGORY_VARIANT[cat] ?? "outline"}>
            {CATEGORY_LABEL[cat] ?? cat}
          </Badge>
        );
      },
    },
    { key: "uploader_name", header: "업로더" },
    {
      key: "created_at",
      header: "등록일",
      render: (v: unknown) => formatDate(v as string),
    },
    {
      key: "actions__download",
      header: "다운로드",
      render: (_v: unknown, row: Record<string, unknown>) => (
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            handleDownload(row.id as string);
          }}
          aria-label="다운로드"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: "actions__delete",
            header: "",
            render: (_v: unknown, row: Record<string, unknown>) => (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTargetId(row.id as string);
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
      <PageHeader
        title="공통 문서함"
        description="회사 공용 문서·계약서를 카테고리별로 보관·다운로드합니다."
      >
        {isPrivileged && (
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            문서 업로드
          </Button>
        )}
      </PageHeader>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {DOCUMENT_CATEGORIES.map(({ value, label }) => (
          <Button
            key={value}
            variant={categoryFilter === value ? "default" : "outline"}
            size="sm"
            onClick={() => setCategoryFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className={loading && documents.length > 0 ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
        <DataTable
          columns={columns}
          data={documents as unknown as Record<string, unknown>[]}
          loading={loading && documents.length === 0}
          emptyMessage={
            categoryFilter !== "all"
              ? "검색 결과가 없습니다."
              : "등록된 문서가 없습니다."
          }
        />
        {loading && documents.length > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-2">새로고침 중...</p>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} / {total}건
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              aria-label="이전 페이지"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={page >= totalPages || loading}
              aria-label="다음 페이지"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 문서 업로드 Dialog */}
      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={() => fetchDocuments()}
      />

      {/* 삭제 확인 Dialog */}
      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        title="문서를 삭제하시겠습니까?"
        description="삭제된 문서는 복원할 수 없습니다."
        confirmLabel="삭제"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
