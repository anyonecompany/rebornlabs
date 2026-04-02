/**
 * 계약서 HTML 생성 + 클라이언트 사이드 PDF 변환.
 * html2pdf.js로 브라우저에서 HTML→PDF 변환.
 * 서버 사이드에서는 generateContractHTML()만 호출 가능.
 */

import { CONTRACT_ARTICLES, CONTRACT_NOTICE } from "./contract-articles";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export interface ContractParams {
  make: string;
  model: string;
  year: number;
  mileage: number;
  sellingPrice: number;
  deposit: number;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerEmail?: string;
  plateNumber?: string;
  vin?: string;
  color?: string;
  signatureImage?: Uint8Array;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR");
}

// ---------------------------------------------------------------------------
// HTML 생성 (서버/클라이언트 양쪽 사용 가능)
// ---------------------------------------------------------------------------

export function generateContractHTML(params: ContractParams): string {
  const {
    make, model, year, mileage, sellingPrice, deposit,
    customerName, customerPhone, customerAddress,
    plateNumber, vin, color, signatureImage,
  } = params;

  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, "0")}월 ${String(today.getDate()).padStart(2, "0")}일`;

  let signatureHtml = "";
  if (signatureImage) {
    const base64 = typeof Buffer !== "undefined"
      ? Buffer.from(signatureImage).toString("base64")
      : btoa(String.fromCharCode(...signatureImage));
    signatureHtml = `<div style="margin-top:8px;"><img src="data:image/png;base64,${base64}" style="height:50px;" /></div>`;
  }

  const articlesHtml = CONTRACT_ARTICLES.map((article) => {
    if (article.title === "제3조 (차량 정보)") {
      return `<div class="article"><div class="article-title">${esc(article.title)}</div><div class="article-body" style="color:#999;font-style:italic">위 차량 정보 테이블 참조</div></div>`;
    }
    const body = article.body
      .replace("{sellingPrice}", formatKRW(sellingPrice))
      .replace("{deposit}", formatKRW(deposit));
    return `<div class="article"><div class="article-title">${esc(article.title)}</div><div class="article-body">${esc(body)}</div></div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans KR',sans-serif;font-size:10pt;line-height:1.6;color:#111;padding:40px 50px;background:#fff}
h1{text-align:center;font-size:15pt;font-weight:700;margin-bottom:4px}
.subtitle{text-align:center;font-size:9pt;color:#666;margin-bottom:20px}
hr{border:none;border-top:1.5px solid #111;margin:14px 0}
.vehicle-table{width:100%;border-collapse:collapse;margin:14px 0}
.vehicle-table td{border:1px solid #ccc;padding:5px 10px;font-size:9pt}
.vehicle-table .label{background:#f5f5f5;color:#444;width:20%;font-weight:500}
.vehicle-table .value{width:30%}
.article{margin-bottom:10px}
.article-title{font-weight:700;font-size:10pt;margin-bottom:3px}
.article-body{font-size:9pt;white-space:pre-wrap;line-height:1.7}
.notice{margin:16px 0;padding:10px 14px;background:#f5f5f5;border:1px solid #ddd;font-size:9pt;font-weight:700}
.parties{margin-top:20px}
.party{margin-bottom:16px}
.party-title{font-weight:700;font-size:10pt;margin-bottom:6px}
.party-field{font-size:9pt;margin-bottom:3px}
.party-field .lbl{display:inline-block;width:80px;color:#555}
.date{text-align:center;font-size:9pt;color:#555;margin-top:20px}
</style>
</head>
<body>
<h1>REBORN CAR 차량 매매 및 이용 계약서</h1>
<p class="subtitle">(REBORN LABS Co., Ltd)</p>
<hr>

<table class="vehicle-table">
<tr><td class="label">1. 차량 브랜드</td><td class="value">${esc(make)}</td><td class="label">2. 차종</td><td class="value">${esc(model)}</td></tr>
<tr><td class="label">3. 차량번호</td><td class="value">${esc(plateNumber ?? "")}</td><td class="label">4. 차대번호</td><td class="value">${esc(vin ?? "")}</td></tr>
<tr><td class="label">5. 연식</td><td class="value">${year}년</td><td class="label">6. 주행거리</td><td class="value">${mileage.toLocaleString()}km</td></tr>
<tr><td class="label">7. 색상</td><td class="value">${esc(color ?? "")}</td><td class="label">8. 비고</td><td class="value"></td></tr>
</table>

${articlesHtml}

<div class="notice">${esc(CONTRACT_NOTICE)}</div>
<hr>

<div class="parties">
<div class="party">
<div class="party-title">1. 구매자</div>
<div class="party-field"><span class="lbl">성명</span>${esc(customerName)} (인)</div>
<div class="party-field"><span class="lbl">주민등록번호</span></div>
<div class="party-field"><span class="lbl">주소</span>${esc(customerAddress ?? "")}</div>
<div class="party-field"><span class="lbl">전화</span>${esc(customerPhone)}</div>
${signatureHtml}
</div>

<div class="party">
<div class="party-title">2. 판매자</div>
<div class="party-field" style="font-weight:700">REBORN LABS Co., Ltd</div>
<div class="party-field"><span class="lbl">대표</span>심재윤 (직인)</div>
<div class="party-field"><span class="lbl">사업자번호</span></div>
<div class="party-field"><span class="lbl">주소</span>서울특별시 성동구 아차산로7길 21, 4층 199호 (성수동2가)</div>
<div class="party-field"><span class="lbl">전화</span></div>
</div>
</div>

<div class="date">${dateStr}</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 클라이언트 사이드 PDF 생성 (html2pdf.js)
// ---------------------------------------------------------------------------

/**
 * 브라우저에서 HTML→PDF 변환.
 * html2pdf.js를 동적 import하여 사용.
 * 서버 사이드에서는 호출하지 말 것.
 */
export async function generateContractPDF(
  params: ContractParams,
): Promise<Uint8Array> {
  const html = generateContractHTML(params);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html2pdf = (await import("html2pdf.js" as any)).default;

  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.width = "210mm";
  document.body.appendChild(container);

  // Google Fonts 로드 대기
  await new Promise((r) => setTimeout(r, 1000));

  try {
    const pdfBlob: Blob = await html2pdf()
      .set({
        margin: 0,
        filename: "contract.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(container)
      .outputPdf("blob");

    const buffer = await pdfBlob.arrayBuffer();
    return new Uint8Array(buffer);
  } finally {
    document.body.removeChild(container);
  }
}
