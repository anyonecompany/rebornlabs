"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, Check, Smartphone } from "lucide-react";

interface SignaturePadProps {
  /** 다이얼로그 열림 여부 */
  open: boolean;
  /** 닫기 핸들러 */
  onClose: () => void;
  /** 서명 완료 시 Blob 반환 */
  onComplete: (blob: Blob) => void;
}

/**
 * 풀스크린 서명 패드 컴포넌트.
 * canvas 기반 터치/마우스 드로잉을 지원합니다.
 * react-signature-canvas 없이 canvas 직접 구현.
 */
export function SignaturePad({ open, onClose, onComplete }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // 캔버스 초기화
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 컨테이너 크기에 맞게 리사이즈
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // 투명 배경
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  // 다이얼로그 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setHasDrawn(false);
      // DOM 업데이트 후 초기화
      setTimeout(initCanvas, 50);
    }
  }, [open, initCanvas]);

  // 리사이즈 감지
  useEffect(() => {
    if (!open) return;
    const handleResize = () => initCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open, initCanvas]);

  // canvas 상대 좌표 계산
  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();

      if ("touches" in e) {
        const touch = e.touches[0];
        if (!touch) return null;
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      }
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top,
      };
    },
    [],
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const pos = getPos(e);
      if (!pos) return;
      isDrawingRef.current = true;
      lastPointRef.current = pos;

      // 점 찍기 (클릭만 해도 표시)
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      setHasDrawn(true);
    },
    [getPos],
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      const pos = getPos(e);
      if (!pos) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !lastPointRef.current) return;

      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPointRef.current = pos;
      setHasDrawn(true);
    },
    [getPos],
  );

  const stopDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      isDrawingRef.current = false;
      lastPointRef.current = null;
    },
    [],
  );

  // 지우기
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // 투명 배경
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }, []);

  // 완료 — canvas → Blob
  const handleComplete = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onComplete(blob);
      },
      "image/png",
      1.0,
    );
  }, [onComplete]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-none w-screen h-screen m-0 p-0 rounded-none flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DialogTitle className="text-base">서명하기</DialogTitle>
        </DialogHeader>

        {/* 안내 텍스트 */}
        <div className="px-4 py-2 shrink-0">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Smartphone className="h-3 w-3" />
            가로 모드에서 더 넓게 서명하실 수 있습니다.
          </p>
        </div>

        {/* 캔버스 영역 */}
        <div className="flex-1 relative overflow-hidden bg-[#1a1a1a] mx-4 rounded-lg border border-border">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {!hasDrawn && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-sm text-zinc-600 select-none">
                이곳에 서명하세요
              </p>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0 border-t border-border">
          <Button variant="outline" size="sm" onClick={handleClear}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            지우기
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              취소
            </Button>
            <Button size="sm" onClick={handleComplete} disabled={!hasDrawn}>
              <Check className="h-4 w-4 mr-1.5" />
              완료
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
