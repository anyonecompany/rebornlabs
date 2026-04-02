"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { CheckCircle, Car, PenLine, RotateCcw, Check, Smartphone } from "lucide-react";
import { CONTRACT_ARTICLES } from "@/src/lib/contract-articles";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface ContractPublicData {
  id: string;
  status: "draft" | "sent" | "signed";
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  vehicle_info: {
    make: string;
    model: string;
    year: number;
    mileage: number;
    vehicle_code: string;
  };
  selling_price: number;
  deposit: number;
  signed_at: string | null;
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

// ---------------------------------------------------------------------------
// 서명 패드 (인라인 — auth 레이아웃 밖이므로 직접 구현)
// ---------------------------------------------------------------------------

interface SignaturePadProps {
  onClose: () => void;
  onComplete: (dataUrl: string) => void;
}

function InlineSignaturePad({ onClose, onComplete }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    setTimeout(initCanvas, 50);
    const handleResize = () => initCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initCanvas]);

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if ("touches" in e) {
        const touch = e.touches[0];
        if (!touch) return null;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
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
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = "#111827";
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

  const stopDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const handleClear = useCallback(() => {
    initCanvas();
    setHasDrawn(false);
  }, [initCanvas]);

  const handleComplete = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onComplete(dataUrl);
  }, [onComplete]);

  return (
    /* 풀스크린 오버레이 */
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <h2 className="text-base font-semibold text-gray-900">서명하기</h2>
      </div>

      {/* 안내 */}
      <div className="px-4 py-2 shrink-0">
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Smartphone className="h-3 w-3" />
          가로 모드에서 더 넓게 서명하실 수 있습니다.
        </p>
      </div>

      {/* 캔버스 */}
      <div className="flex-1 relative overflow-hidden bg-gray-50 mx-4 rounded-lg border border-gray-200">
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
            <p className="text-sm text-gray-400 select-none">이곳에 서명하세요</p>
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="flex items-center justify-between px-4 py-4 shrink-0 border-t border-gray-200">
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          지우기
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleComplete}
            disabled={!hasDrawn}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="h-4 w-4" />
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 페이지
// ---------------------------------------------------------------------------

export default function SignPage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractPublicData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 서명 관련 상태
  const [agreed, setAgreed] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);

  // 제출 상태
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 계약서 조회
  useEffect(() => {
    async function fetchContract() {
      try {
        const res = await fetch(`/api/contracts/sign/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "계약서를 불러올 수 없습니다.");
          return;
        }
        setContract(data.contract);
        // 이미 서명 완료된 계약서
        if (data.signed || data.contract?.status === "signed") {
          setSubmitted(true);
        }
      } catch {
        setError("계약서를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    void fetchContract();
  }, [token]);

  // 서명 완료 핸들러
  const handleSignatureComplete = useCallback((dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    setPadOpen(false);
  }, []);

  // 계약 제출
  const handleSubmit = useCallback(async () => {
    if (!agreed || !signatureDataUrl) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contracts/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: signatureDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "계약 제출에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setSubmitted(true);
    } catch {
      alert("계약 제출 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [agreed, signatureDataUrl, token]);

  // 계약서 조항 텍스트 치환 (판매가 / 보증금)
  const renderArticleLines = useCallback(
    (lines: string[]) => {
      if (!contract) return lines;
      return lines.map((line) =>
        line
          .replace("{sellingPrice}", contract.selling_price.toLocaleString("ko-KR"))
          .replace("{deposit}", contract.deposit.toLocaleString("ko-KR")),
      );
    },
    [contract],
  );

  const canSubmit = agreed && !!signatureDataUrl && !submitting;

  // ── 렌더 분기 ──────────────────────────────────────────────────────────

  return (
    <>
      {/* 서명 패드 오버레이 */}
      {padOpen && (
        <InlineSignaturePad
          onClose={() => setPadOpen(false)}
          onComplete={handleSignatureComplete}
        />
      )}

      <div className="min-h-screen bg-white">
        {/* 상단 고정 헤더 */}
        <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold tracking-widest text-gray-900">
              REBORN LABS
            </span>
            <span className="text-xs text-gray-500">차량 매매 계약서</span>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

          {/* 로딩 */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* 에러 */}
          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* 서명 완료 상태 */}
          {!loading && !error && submitted && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <CheckCircle className="h-14 w-14 text-green-500" />
              <div className="text-center space-y-1">
                <p className="text-lg font-semibold text-gray-900">
                  {contract?.status === "signed"
                    ? "이미 서명 완료된 계약서입니다."
                    : "계약이 완료되었습니다."}
                </p>
                <p className="text-sm text-gray-500">감사합니다.</p>
              </div>
            </div>
          )}

          {/* 서명 전 — 계약서 본문 */}
          {!loading && !error && !submitted && contract && (
            <>
              {/* 차량 정보 카드 */}
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-900">차량 정보</h2>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">브랜드</p>
                    <p className="font-medium text-gray-900">{contract.vehicle_info.make}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">차종</p>
                    <p className="font-medium text-gray-900">{contract.vehicle_info.model}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">연식</p>
                    <p className="font-medium text-gray-900">{contract.vehicle_info.year}년</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">주행거리</p>
                    <p className="font-medium text-gray-900">
                      {contract.vehicle_info.mileage.toLocaleString("ko-KR")}km
                    </p>
                  </div>
                </div>
              </div>

              {/* 가격 정보 */}
              <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">가격 정보</h2>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">판매가</span>
                  <span className="font-semibold text-gray-900">
                    {formatKRW(contract.selling_price)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">보증금</span>
                  <span className="font-medium text-gray-900">
                    {formatKRW(contract.deposit)}
                  </span>
                </div>
              </div>

              {/* 구매자 정보 */}
              <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">구매자 정보</h2>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">성명</span>
                  <span className="font-medium text-gray-900">{contract.customer_name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">전화번호</span>
                  <span className="font-medium text-gray-900">{contract.customer_phone}</span>
                </div>
              </div>

              {/* 계약서 전문 — 스크롤 영역 */}
              <div className="rounded-xl border border-gray-200">
                <div className="px-4 pt-4 pb-2 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">
                    REBORN CAR 차량 매매 및 이용 계약서
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">아래 내용을 끝까지 읽어주세요.</p>
                </div>
                <div className="max-h-96 overflow-y-auto px-4 py-4 space-y-4 text-xs text-gray-700 leading-relaxed">
                  {CONTRACT_ARTICLES.map((article) => {
                    // 제3조는 차량 정보 카드가 대신하므로 간략 표시
                    if (article.title === "제3조 (차량 정보)") {
                      return (
                        <div key={article.title}>
                          <p className="font-semibold text-gray-900 mb-1">{article.title}</p>
                          <p className="text-gray-500 italic">위 차량 정보 참조</p>
                        </div>
                      );
                    }
                    const processedLines = renderArticleLines(article.body.split("\n"));
                    return (
                      <div key={article.title}>
                        <p className="font-semibold text-gray-900 mb-1">{article.title}</p>
                        {processedLines.map((line, idx) => (
                          <p key={idx} className="whitespace-pre-wrap">
                            {line}
                          </p>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 동의 체크박스 */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 accent-gray-900 cursor-pointer"
                />
                <span className="text-sm text-gray-700">
                  위 내용을 확인하였으며 동의합니다.
                </span>
              </label>

              {/* 서명 영역 */}
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900">전자서명</h2>

                {signatureDataUrl ? (
                  /* 서명 미리보기 */
                  <div className="space-y-3">
                    <div className="relative w-full aspect-[4/1] rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                      <Image
                        src={signatureDataUrl}
                        alt="서명 미리보기"
                        fill
                        className="object-contain p-2"
                      />
                    </div>
                    <button
                      onClick={() => setPadOpen(true)}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      다시 서명
                    </button>
                  </div>
                ) : (
                  /* 서명 전 */
                  <button
                    onClick={() => setPadOpen(true)}
                    className="flex items-center gap-2 w-full justify-center py-4 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <PenLine className="h-4 w-4" />
                    서명하기
                  </button>
                )}
              </div>

              {/* 계약 완료 버튼 */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-4 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "제출 중..." : "계약 완료"}
              </button>

              <p className="text-center text-xs text-gray-400 pb-4">
                계약 완료 버튼을 누르면 법적 효력이 있는 전자서명이 완료됩니다.
              </p>
            </>
          )}
        </main>
      </div>
    </>
  );
}
