/**
 * 서버 사이드 계약서 PDF 생성 (jsPDF + NotoSansKR).
 * Node.js 환경에서 실행. 브라우저 의존성 없음.
 */

import { jsPDF } from "jspdf";
import { readFileSync } from "fs";
import { join } from "path";
import { CONTRACT_ARTICLES, CONTRACT_NOTICE } from "./contract-articles";

export interface ServerContractParams {
  make: string;
  model: string;
  year: number;
  mileage: number;
  sellingPrice: number;
  deposit: number;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  plateNumber?: string;
  vin?: string;
  color?: string;
  customerIdNumber?: string; // 예: "880101-1******"
  signatureImage?: Buffer; // PNG buffer
}

function formatKRW(v: number): string {
  return v.toLocaleString("ko-KR");
}

let _fontBase64: string | null = null;
function getFontBase64(): string {
  if (!_fontBase64) {
    const fontPath = join(process.cwd(), "public", "fonts", "NotoSansKR-Subset.ttf");
    _fontBase64 = readFileSync(fontPath).toString("base64");
  }
  return _fontBase64;
}

export async function generateContractPDFServer(
  params: ServerContractParams,
): Promise<Buffer> {
  const {
    make, model, year, mileage, sellingPrice, deposit,
    customerName, customerPhone, customerAddress,
    plateNumber, vin, color, customerIdNumber, signatureImage,
  } = params;

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const W = 210;
  const M = 20; // margin
  const CW = W - M * 2; // content width

  // 한글 폰트
  const fontB64 = getFontBase64();
  doc.addFileToVFS("NotoSansKR.ttf", fontB64);
  doc.addFont("NotoSansKR.ttf", "NotoSansKR", "normal");
  doc.setFont("NotoSansKR");

  let y = 25;

  function checkPage(need: number) {
    if (y + need > 280) {
      doc.addPage();
      y = 20;
    }
  }

  // ─── 타이틀 ───
  doc.setFontSize(14);
  doc.text("REBORN CAR 차량 매매 및 이용 계약서", W / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("(REBORN LABS Co., Ltd)", W / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 4;
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 8;

  // ─── 차량 정보 테이블 ───
  doc.setFontSize(10);
  doc.text("차량 정보", M, y);
  y += 5;

  const tableData = [
    ["1. 차량 브랜드", make, "2. 차종", model],
    ["3. 차량번호", plateNumber ?? "", "4. 차대번호", vin ?? ""],
    [`5. 연식`, `${year}년`, "6. 주행거리", `${mileage.toLocaleString()}km`],
    ["7. 색상", color ?? "", "8. 비고", ""],
  ];

  const colW = CW / 4;
  const rowH = 7;

  doc.setFontSize(8);
  for (const row of tableData) {
    checkPage(rowH + 2);
    // 배경
    doc.setFillColor(248, 248, 248);
    doc.rect(M, y - 4, colW, rowH, "F");
    doc.rect(M + colW * 2, y - 4, colW, rowH, "F");
    // 테두리
    doc.setDrawColor(200);
    doc.rect(M, y - 4, CW, rowH);
    doc.line(M + colW, y - 4, M + colW, y - 4 + rowH);
    doc.line(M + colW * 2, y - 4, M + colW * 2, y - 4 + rowH);
    doc.line(M + colW * 3, y - 4, M + colW * 3, y - 4 + rowH);
    // 텍스트
    doc.setTextColor(80);
    doc.text(row[0], M + 2, y);
    doc.setTextColor(0);
    doc.text(row[1], M + colW + 2, y);
    doc.setTextColor(80);
    doc.text(row[2], M + colW * 2 + 2, y);
    doc.setTextColor(0);
    doc.text(row[3], M + colW * 3 + 2, y);
    y += rowH;
  }
  doc.setDrawColor(0);
  y += 6;

  // ─── 22개 조항 ───
  for (const article of CONTRACT_ARTICLES) {
    checkPage(15);

    // 제목
    doc.setFontSize(10);
    doc.setFont("NotoSansKR", "normal");
    doc.text(article.title, M, y);
    y += 5;

    if (article.title === "제3조 (차량 정보)") {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("위 차량 정보 테이블 참조", M + 4, y);
      doc.setTextColor(0);
      y += 6;
      continue;
    }

    // 본문 — {sellingPrice}, {deposit} 치환
    let body = article.body
      .replace("{sellingPrice}", formatKRW(sellingPrice))
      .replace("{deposit}", formatKRW(deposit));

    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(body, CW - 4);
    for (const line of lines) {
      checkPage(5);
      doc.text(line, M + 4, y);
      y += 4.2;
    }
    y += 3;
  }

  // ─── 중요 고지 ───
  checkPage(12);
  doc.setFontSize(8.5);
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y - 3, CW, 10, "FD");
  doc.text(CONTRACT_NOTICE, W / 2, y + 2, { align: "center" });
  y += 12;

  // 구분선
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 8;

  // ─── 계약 당사자 ───
  checkPage(60);
  doc.setFontSize(11);
  doc.text("계약 당사자", W / 2, y, { align: "center" });
  y += 8;

  // 구매자
  doc.setFontSize(10);
  doc.text("1. 구매자", M, y);
  y += 6;
  doc.setFontSize(8.5);

  // 성명 행 — "(인)" 텍스트 좌표를 기록하여 서명 이미지 오버레이에 사용
  doc.setTextColor(100);
  doc.text("- 성명:", M + 4, y);
  doc.setTextColor(0);
  const nameText = `${customerName} (인)`;
  doc.text(nameText, M + 30, y);

  // "(인)" 위에 서명 이미지 오버레이
  if (signatureImage) {
    try {
      const sigB64 = signatureImage.toString("base64");
      // "(인)" 텍스트의 x 좌표 계산: M + 30 + customerName 텍스트 폭 + 공백
      const nameOnlyWidth = doc.getTextWidth(customerName);
      const inX = M + 30 + nameOnlyWidth + 1; // " (인)" 시작 x
      const sigX = inX - 10; // "(인)" 시작에서 -10mm
      const sigY = y - 12;   // 성명 텍스트 y에서 -12mm (위로)
      doc.addImage(`data:image/png;base64,${sigB64}`, "PNG", sigX, sigY, 40, 15);
    } catch {
      // 서명 이미지 오버레이 실패 시 무시
    }
  }
  y += 5;

  // 주민등록번호 행
  doc.setTextColor(100);
  doc.text("- 주민등록번호:", M + 4, y);
  doc.setTextColor(0);
  doc.text(customerIdNumber ?? "", M + 30, y);
  y += 5;

  // 주소 행
  doc.setTextColor(100);
  doc.text("- 주소:", M + 4, y);
  doc.setTextColor(0);
  doc.text(customerAddress ?? "", M + 30, y);
  y += 5;

  // 전화 행
  doc.setTextColor(100);
  doc.text("- 전화:", M + 4, y);
  doc.setTextColor(0);
  doc.text(customerPhone, M + 30, y);
  y += 5;

  y += 6;

  // 판매자
  checkPage(40);
  doc.setFontSize(10);
  doc.text("2. 판매자", M, y);
  y += 6;
  doc.setFontSize(8.5);
  doc.text("REBORN LABS Co., Ltd", M + 4, y);
  y += 5;

  // 대표 + 직인 이미지
  doc.setTextColor(100);
  doc.text("- 대표:", M + 4, y);
  doc.setTextColor(0);
  doc.text("심재윤", M + 30, y);

  // 직인 이미지 합성 (심재윤 옆)
  try {
    const sealPath = join(process.cwd(), "public", "images", "seal.png");
    const sealData = readFileSync(sealPath);
    const sealB64 = sealData.toString("base64");
    const nameWidth = doc.getTextWidth("심재윤");
    doc.addImage(`data:image/png;base64,${sealB64}`, "PNG", M + 30 + nameWidth + 2, y - 10, 22, 22);
  } catch {
    // 직인 이미지 없으면 텍스트 폴백
    doc.text("(직인)", M + 30 + doc.getTextWidth("심재윤") + 3, y);
  }
  y += 5;

  const sellerFields = [
    ["사업자번호", ""],
    ["주소", "서울특별시 성동구 아차산로7길 21, 4층 199호 (성수동2가)"],
  ];
  for (const [label, value] of sellerFields) {
    doc.setTextColor(100);
    doc.text(`- ${label}:`, M + 4, y);
    doc.setTextColor(0);
    doc.text(value, M + 30, y);
    y += 5;
  }

  y += 10;

  // 날짜
  checkPage(10);
  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, "0")}월 ${String(today.getDate()).padStart(2, "0")}일`;
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(dateStr, W / 2, y, { align: "center" });

  // 페이지 번호
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`${i} / ${pageCount}`, W / 2, 290, { align: "center" });
  }

  const arrayBuf = doc.output("arraybuffer");
  const result = Buffer.from(arrayBuf);
  console.log(`[contract-pdf] 생성 완료: ${(result.length / 1024).toFixed(0)}KB, ${pageCount}페이지`);
  return result;
}
