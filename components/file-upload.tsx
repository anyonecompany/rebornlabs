"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

interface FileUploadProps {
  /** 허용할 파일 타입 (e.g. "image/*") */
  accept?: string;
  /** 최대 파일 크기 (MB 단위, 기본: 10) */
  maxSizeMB?: number;
  /** 업로드 처리 함수 */
  onUpload: (file: File) => Promise<void>;
  /** 이미지 미리보기 여부 */
  preview?: boolean;
}

/**
 * 드래그&드롭 + 클릭 파일 업로드 컴포넌트.
 * 파일 크기 초과 시 toast 에러, 업로드 중 스피너를 표시합니다.
 */
export function FileUpload({
  accept,
  maxSizeMB = 10,
  onUpload,
  preview = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const validateAndUpload = useCallback(
    async (file: File) => {
      const maxBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        toast.error(`파일 크기가 ${maxSizeMB}MB를 초과합니다.`);
        return;
      }

      if (preview && file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }

      setIsUploading(true);
      try {
        await onUpload(file);
      } catch {
        toast.error("파일 업로드에 실패했습니다. 다시 시도해주세요.");
        setPreviewUrl(null);
      } finally {
        setIsUploading(false);
      }
    },
    [maxSizeMB, onUpload, preview],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await validateAndUpload(file);
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await validateAndUpload(file);
    // 같은 파일 재선택 허용
    e.target.value = "";
  };

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  return (
    <div className="space-y-2">
      {/* 미리보기 */}
      {preview && previewUrl && (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-muted">
          <Image
            src={previewUrl}
            alt="미리보기"
            fill
            className="object-contain"
          />
          <button
            type="button"
            onClick={clearPreview}
            className="absolute top-2 right-2 rounded-full bg-background/80 p-1 hover:bg-background transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 드롭존 */}
      <div
        onClick={() => !isUploading && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50",
          isUploading ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">업로드 중...</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                파일을 드래그하거나 클릭하여 업로드
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                최대 {maxSizeMB}MB
                {accept ? ` · ${accept}` : ""}
              </p>
            </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
