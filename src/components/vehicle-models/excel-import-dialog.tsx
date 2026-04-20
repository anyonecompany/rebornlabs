"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ImportResult {
  success: boolean;
  count: number;
  byBrand: Record<string, number>;
  parseErrors: string[];
}

export function ExcelImportDialog({ open, onOpenChange, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      toast.error(".xlsx 파일만 지원됩니다.");
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("파일을 선택해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch("/api/vehicle-models/import", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "가져오기에 실패했습니다.");
        return;
      }
      toast.success(`${data.count}건 처리 완료`);
      setResult(data);
      onImported();
    } catch {
      toast.error("업로드 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>엑셀 파일로 가져오기</DialogTitle>
          <DialogDescription>
            고객용 가격표 엑셀 파일(.xlsx)을 업로드하면 브랜드/모델/등급 단위로
            upsert 됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p>• 데이터는 9행(헤더) 아래에서 읽기 시작</p>
            <p>• 브랜드/모델 병합 셀은 자동 forward-fill</p>
            <p>• 동일 브랜드+모델+등급 조합은 업데이트</p>
            <p>• 추가가격/월납입료는 저장 안 함 (공식 재계산)</p>
          </div>

          <div className="space-y-2">
            <Input
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              disabled={submitting}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                선택된 파일: {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          {result && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
              <p className="text-sm font-medium text-emerald-300">
                총 {result.count.toLocaleString("ko-KR")}건 처리
              </p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {Object.entries(result.byBrand).map(([brand, count]) => (
                  <div key={brand} className="flex justify-between">
                    <span className="text-muted-foreground">{brand}</span>
                    <span>{count}건</span>
                  </div>
                ))}
              </div>
              {result.parseErrors.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-amber-300">
                    파싱 경고 {result.parseErrors.length}건
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {result.parseErrors.slice(0, 10).map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                    {result.parseErrors.length > 10 && (
                      <li>... 외 {result.parseErrors.length - 10}건</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              {result ? "닫기" : "취소"}
            </Button>
            {!result && (
              <Button onClick={handleUpload} disabled={!file || submitting}>
                {submitting ? (
                  "처리 중..."
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-1.5" />
                    업로드
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
