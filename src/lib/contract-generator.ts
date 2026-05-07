/**
 * 계약서 HTML 생성 + 클라이언트 사이드 PDF 변환.
 * html2pdf.js로 브라우저에서 HTML→PDF 변환.
 * 서버 사이드에서는 generateContractHTML()만 호출 가능.
 */

import {
  CONTRACT_NOTICE,
  getContractArticles,
  type ContractType,
} from "./contract-articles";

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
  /** 계약서 유형. 미지정 시 'accident'(기본, 기존 계약서와 동일). */
  contractType?: ContractType;
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
    contractType,
  } = params;

  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, "0")}월 ${String(today.getDate()).padStart(2, "0")}일`;

  let signatureHtml = '<span class="seal">(인)</span>';
  if (signatureImage) {
    const base64 = typeof Buffer !== "undefined"
      ? Buffer.from(signatureImage).toString("base64")
      : btoa(String.fromCharCode(...signatureImage));
    signatureHtml = `<span class="sig-wrap"><img src="data:image/png;base64,${base64}" class="sig-img" /><span class="seal">(인)</span></span>`;
  }

  const articles = getContractArticles(contractType);
  const articlesHtml = articles.map((article) => {
    if (article.title === "제3조 (차량 정보)") {
      return `<div class="article"><div class="at">${esc(article.title)}</div><div class="ab" style="color:#888;font-style:italic">위 차량 정보 테이블 참조</div></div>`;
    }
    const body = article.body
      .replace("{sellingPrice}", formatKRW(sellingPrice))
      .replace("{deposit}", formatKRW(deposit));
    // 들여쓰기 처리: " 가." " 나." → indent-2, "1." "2." → indent-1
    const lines = esc(body).split("\n").map((line) => {
      if (/^ [가-힣]\./.test(line)) return `<div class="indent2">${line.trim()}</div>`;
      if (/^\d+\./.test(line)) return `<div class="indent1">${line}</div>`;
      if (/^\[/.test(line)) return `<div class="indent1" style="color:#555">${line}</div>`;
      return `<div>${line}</div>`;
    }).join("\n");
    return `<div class="article"><div class="at">${esc(article.title)}</div><div class="ab">${lines}</div></div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans KR',sans-serif;font-size:10pt;line-height:1.8;color:#111;background:#fff;padding:30mm 25mm 25mm 25mm}
h1{text-align:center;font-size:16pt;font-weight:700;letter-spacing:1px;margin-bottom:2px}
.sub{text-align:center;font-size:10pt;color:#555;margin-bottom:24px}
.divider{border:none;border-top:2px solid #222;margin:20px 0}
.divider-thin{border:none;border-top:1px solid #bbb;margin:16px 0}

/* 차량 정보 테이블 */
.vtbl{width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #333}
.vtbl td{border:1px solid #333;padding:8px 12px;font-size:9.5pt;vertical-align:middle}
.vtbl .l{background:#f5f5f5;font-weight:700;width:18%;color:#222}
.vtbl .v{width:32%;min-height:24px}

/* 조항 */
.article{margin-bottom:12px;page-break-inside:avoid}
.at{font-weight:700;font-size:10.5pt;margin-bottom:4px;margin-top:16px;color:#111}
.ab{font-size:9.5pt;line-height:1.75}
.indent1{padding-left:20px}
.indent2{padding-left:40px}

/* 중요 고지 */
.notice{margin:20px 0;padding:12px 16px;background:#f8f8f8;border:1.5px solid #333;font-size:9.5pt;font-weight:700;text-align:center}

/* 계약 당사자 */
.parties{margin-top:28px}
.ptitle{font-weight:700;font-size:12pt;margin-bottom:16px;text-align:center}
.party{margin-bottom:24px}
.party-h{font-weight:700;font-size:10.5pt;margin-bottom:8px;border-bottom:1px solid #ddd;padding-bottom:4px}
.pf{font-size:9.5pt;margin-bottom:5px;display:flex;align-items:baseline}
.pf .k{display:inline-block;width:90px;color:#444;font-weight:500;flex-shrink:0}
.pf .val{flex:1}

/* 서명 */
.sig-wrap{position:relative;display:inline-block}
.sig-img{height:48px;position:relative;z-index:2;opacity:0.9}
.seal{color:#ccc;font-size:9pt;margin-left:4px}

/* 날짜 */
.date{text-align:center;font-size:10pt;color:#333;margin-top:32px;font-weight:500}
</style>
</head>
<body>

<h1>REBORN CAR 차량 매매 및 이용 계약서</h1>
<p class="sub">(REBORN LABS Co., Ltd)</p>
<hr class="divider">

<table class="vtbl">
<tr><td class="l">1. 차량 브랜드</td><td class="v">${esc(make)}</td><td class="l">2. 차종</td><td class="v">${esc(model)}</td></tr>
<tr><td class="l">3. 차량번호</td><td class="v">${esc(plateNumber ?? "")}</td><td class="l">4. 차대번호</td><td class="v">${esc(vin ?? "")}</td></tr>
<tr><td class="l">5. 연식</td><td class="v">${year}년</td><td class="l">6. 주행거리</td><td class="v">${mileage.toLocaleString()}km</td></tr>
<tr><td class="l">7. 색상</td><td class="v">${esc(color ?? "")}</td><td class="l">8. 비고</td><td class="v"></td></tr>
</table>

${articlesHtml}

<div class="notice">${esc(CONTRACT_NOTICE)}</div>

<hr class="divider">

<div class="parties">
<div class="ptitle">계약 당사자</div>

<div class="party">
<div class="party-h">1. 구매자</div>
<div class="pf"><span class="k">성명</span><span class="val">${esc(customerName)} ${signatureHtml}</span></div>
<div class="pf"><span class="k">주민등록번호</span><span class="val"></span></div>
<div class="pf"><span class="k">주소</span><span class="val">${esc(customerAddress ?? "")}</span></div>
<div class="pf"><span class="k">전화</span><span class="val">${esc(customerPhone)}</span></div>
</div>

<div class="party">
<div class="party-h">2. 판매자</div>
<div class="pf"><span class="val" style="font-weight:700">REBORN LABS Co., Ltd</span></div>
<div class="pf"><span class="k">대표</span><span class="val">심재윤 <span class="seal">(직인)</span></span></div>
<div class="pf"><span class="k">사업자번호</span><span class="val"></span></div>
<div class="pf"><span class="k">주소</span><span class="val">대구광역시 동구 안심로69길 35 반야월매매단지</span></div>
<div class="pf"><span class="k">전화</span><span class="val"></span></div>
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
): Promise<Blob> {
  const html = generateContractHTML(params);

  return new Promise((resolve, reject) => {
    // iframe으로 CSS 격리 — 페이지 레이아웃에 영향 안 줌
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:none;z-index:-1";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      reject(new Error("iframe 생성 실패"));
      return;
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // 폰트 로드 + 렌더링 대기 후 PDF 변환
    setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const html2pdf = (await import("html2pdf.js" as any)).default;

        const pdf = await html2pdf().set({
          margin: [10, 10, 10, 10],
          filename: "contract.pdf",
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        }).from(iframeDoc.body).toPdf().get("pdf");

        const blob = pdf.output("blob") as Blob;
        document.body.removeChild(iframe);
        resolve(blob);
      } catch (err) {
        document.body.removeChild(iframe);
        reject(err);
      }
    }, 2000);
  });
}
