"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  /** 다이얼로그 열림 여부 */
  open: boolean;
  /** 열림 상태 변경 핸들러 */
  onOpenChange: (open: boolean) => void;
  /** 다이얼로그 제목 */
  title: string;
  /** 다이얼로그 설명 */
  description: string;
  /** 확인 버튼 라벨 (기본: "확인") */
  confirmLabel?: string;
  /** 취소 버튼 라벨 (기본: "취소") */
  cancelLabel?: string;
  /** 확인 버튼 스타일 */
  variant?: "default" | "destructive";
  /** 확인 시 실행할 함수 */
  onConfirm: () => void | Promise<void>;
  /** 로딩 상태 */
  loading?: boolean;
}

/**
 * 위험 액션 확인용 모달 다이얼로그.
 * destructive variant 사용 시 확인 버튼이 빨간색으로 표시됩니다.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  variant = "default",
  onConfirm,
  loading,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = loading || isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDisabled}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isDisabled}
          >
            {isDisabled ? "처리 중..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
