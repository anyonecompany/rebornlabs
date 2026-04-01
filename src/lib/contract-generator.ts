import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export interface ContractParams {
  /** 브랜드 (예: BMW) */
  make: string;
  /** 차종 (예: 520d) */
  model: string;
  /** 연식 */
  year: number;
  /** 주행거리 (km) */
  mileage: number;
  /** 판매 가격 (원) */
  sellingPrice: number;
  /** 보증금 (원) */
  deposit: number;
  /** 구매자 성명 */
  customerName: string;
  /** 구매자 전화번호 */
  customerPhone: string;
  /** 구매자 서명 PNG (Uint8Array, 선택) */
  signatureImage?: Uint8Array;
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** A4 치수 (포인트) */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** 폰트 크기 */
const FONT_TITLE = 16;
const FONT_HEADING = 11;
const FONT_BODY = 9;

/** 줄 간격 */
const LINE_HEIGHT_BODY = 14;
const LINE_HEIGHT_HEADING = 18;

// ---------------------------------------------------------------------------
// 계약서 조항 전문
// ---------------------------------------------------------------------------

const ARTICLES: Array<{ title: string; lines: string[] }> = [
  {
    title: "제1조 (목적)",
    lines: [
      "본 계약은 REBORN LABS 주식회사(이하 \"회사\")가 판매하는 리빌드 차량 브랜드 REBORN CAR의 매매, 이용,",
      "차량 반납 조건 및 관련 권리·의무를 규정함을 목적으로 한다.",
    ],
  },
  {
    title: "제2조 (정의)",
    lines: [
      "본 계약에서 사용하는 용어의 정의는 다음과 같다.",
      "1. REBORN CAR: 사고 또는 전손 차량을 전문 공업사에서 수리 후 판매하는 리빌드 차량",
      "2. 구매자: 본 계약에 따라 차량을 구매하는 개인 또는 법인",
      "3. 반납: 본 계약에 따라 인도된 차량을, 구매자가 회사에 재매수 요청하면서 인도하는 행위",
      "4. 리빌드 차량: 사고 또는 전손 이력이 있는 차량을 복원하여 판매하는 차량",
      "5. 잔존가치: 반납 시점 기준 차량에 남아 있는 할부 잔여금 또는 차량 가치",
    ],
  },
  {
    title: "제3조 (차량 정보)",
    lines: ["위 차량 정보 테이블 참조"],
  },
  {
    title: "제4조 (판매 가격)",
    lines: [
      "1. 차량 판매 가격 : {sellingPrice}원 (VAT 별도)",
      "2. 회사는 위 대금을 지급받는 즉시 차량을 구매자에게 인도한다.",
    ],
  },
  {
    title: "제5조 (금융 조건)",
    lines: [
      "1. 할부 기간 : 최대 60개월",
      "2. 금리 : 금융사 기준",
      "3. 반납 시 잔존 처리 : 반납 시점 기준 남은 할부 잔액",
      "4. 금융 계약은 구매자와 금융사 간 계약이며, 금융 계약의 효력이나 내용은 본 계약에 어떠한 영향도 미치지 아니한다.",
    ],
  },
  {
    title: "제6조 (차량 인도)",
    lines: [
      "1. 회사는 대금 수령 후 계약서에 명시된 차량을 구매자에게 인도한다.",
      "2. 인도 시 차량의 상태는 구매자가 확인하며, 이후 외관상 하자에 대한 이의를 제기할 수 없다.",
      "3. 차량 인도 시 구매자는 차량 상태 확인서에 서명하여야 한다.",
    ],
  },
  {
    title: "제7조 (소유권 이전)",
    lines: [
      "1. 차량의 소유권은 매매 대금 전액 지급 완료 시 구매자에게 이전된다.",
      "2. 할부 구매의 경우, 할부금이 완납될 때까지 소유권은 금융사 또는 회사에 귀속될 수 있다.",
      "3. 소유권 이전에 필요한 제반 비용은 구매자가 부담한다.",
    ],
  },
  {
    title: "제8조 (리빌드 차량 고지)",
    lines: [
      "1. 구매자는 본 계약의 차량이 사고 또는 전손 이력이 있는 리빌드 차량임을 충분히 인지하고 구매한다.",
      "2. 리빌드 차량의 특성상 일반 중고차와 상이한 부분이 있을 수 있으며, 구매자는 이를 인정한다.",
      "3. 차량 이력 관련 정보는 계약 체결 전 구매자에게 고지되었으며, 구매자는 이를 확인하였다.",
    ],
  },
  {
    title: "제9조 (품질 보증)",
    lines: [
      "1. 회사는 리빌드 차량에 대해 인도일로부터 1개월 또는 1,000km(먼저 도래하는 기준) 이내의",
      "   주요 구조 부품에 대한 품질 보증을 제공한다.",
      "2. 단, 소모품(타이어, 브레이크 패드, 오일류 등), 외관 부품, 전기 계통에 대한 보증은 제외한다.",
      "3. 구매자의 과실 또는 부적절한 사용으로 인한 결함은 품질 보증에서 제외된다.",
    ],
  },
  {
    title: "제10조 (반납 조건)",
    lines: [
      "1. 구매자는 다음 조건을 모두 충족하는 경우 차량을 반납할 수 있다.",
      "   가. 인도일로부터 12개월 이상 경과",
      "   나. 회사와 사전 협의 후 반납 일정 결정",
      "   다. 차량의 원상태 유지 (사고, 불법 개조 없음)",
      "2. 반납 시 잔존 할부금이 있는 경우, 해당 금액은 구매자가 부담한다.",
      "3. 반납 차량의 가치 평가는 회사가 지정한 전문 평가 기관의 기준에 따른다.",
    ],
  },
  {
    title: "제11조 (반납 불가 사유)",
    lines: [
      "1. 다음의 경우 반납이 불가능하다.",
      "   가. 차량에 사고 이력 발생 (신규)",
      "   나. 불법 개조 또는 튜닝",
      "   다. 주행거리가 계약 조건을 초과한 경우",
      "   라. 차량 번호판 분실 또는 차대번호 훼손",
      "   마. 세금 및 공과금 미납 상태",
      "2. 위 사유가 발생한 경우, 구매자는 반납 권리를 상실하며 잔여 할부금을 전액 부담한다.",
    ],
  },
  {
    title: "제12조 (보증금)",
    lines: [
      "1. 구매자는 계약 체결 시 보증금 {deposit}원을 회사에 납입한다.",
      "2. 보증금은 반납 조건 충족 시 잔존가치 정산 후 반환된다.",
      "3. 제11조의 반납 불가 사유 발생 시 보증금은 위약금으로 처리되어 반환되지 않는다.",
    ],
  },
  {
    title: "제13조 (구매자의 의무)",
    lines: [
      "1. 구매자는 차량을 정기적으로 점검·정비하여 차량 상태를 유지하여야 한다.",
      "2. 구매자는 차량의 임의 개조, 불법 튜닝 등의 행위를 금한다.",
      "3. 구매자는 차량 사고 발생 시 즉시 회사에 통보하여야 한다.",
      "4. 구매자는 자동차세, 보험료 등 차량 관련 모든 법적 의무를 이행하여야 한다.",
    ],
  },
  {
    title: "제14조 (책임 제한)",
    lines: [
      "1. 회사는 리빌드 차량의 특성상 발생할 수 있는 이하 사항에 대해 책임을 지지 않는다.",
      "   가. 차량 외관의 미세한 색상 차이 또는 도장 불균일",
      "   나. 리빌드 과정에서 교체된 부품의 노화 속도 차이",
      "   다. 구매자의 과실로 인한 기계적 결함",
      "2. 단, 회사의 고의 또는 중과실로 인한 손해는 본 조의 책임 제한에서 제외된다.",
    ],
  },
  {
    title: "제15조 (개인정보 처리)",
    lines: [
      "1. 회사는 본 계약의 이행을 위해 구매자의 개인정보를 수집·이용한다.",
      "2. 수집 항목: 성명, 주민등록번호, 주소, 연락처",
      "3. 이용 목적: 차량 명의 이전, 보증 서비스 제공, 고객 관리",
      "4. 보유 기간: 계약 종료 후 5년",
      "5. 구매자는 개인정보 처리에 동의하며, 동의를 철회할 경우 계약 이행이 불가능할 수 있다.",
    ],
  },
  {
    title: "제16조 (계약의 해제·해지)",
    lines: [
      "1. 구매자가 다음의 사유에 해당하는 경우 회사는 계약을 해제·해지할 수 있다.",
      "   가. 매매 대금 미납 (2회 이상 연속 연체)",
      "   나. 제13조의 구매자 의무를 중대하게 위반한 경우",
      "   다. 허위 정보 제공으로 계약을 체결한 경우",
      "2. 계약 해제·해지 시 회사는 구매자에게 서면(이메일 포함)으로 통보한다.",
    ],
  },
  {
    title: "제17조 (위약금)",
    lines: [
      "1. 구매자의 귀책으로 계약이 해제·해지되는 경우, 구매자는 매매 대금의 10%를 위약금으로 지급한다.",
      "2. 회사의 귀책으로 계약이 해제·해지되는 경우, 회사는 구매자에게 계약금을 반환하고",
      "   추가로 매매 대금의 10%를 배상한다.",
    ],
  },
  {
    title: "제18조 (분쟁 해결)",
    lines: [
      "1. 본 계약에 관한 분쟁은 당사자 간 협의를 통해 우선 해결한다.",
      "2. 협의가 불가능한 경우, 서울중앙지방법원을 제1심 전속 관할법원으로 한다.",
      "3. 본 계약에 관한 준거법은 대한민국 법률로 한다.",
    ],
  },
  {
    title: "제19조 (계약의 효력)",
    lines: [
      "1. 본 계약은 양 당사자의 서명·날인으로 효력이 발생한다.",
      "2. 본 계약의 일부 조항이 무효인 경우에도 나머지 조항은 효력을 유지한다.",
    ],
  },
  {
    title: "제20조 (특약 사항)",
    lines: [
      "1. 본 계약에 명시되지 않은 사항은 상관습 및 민법·상법 등 관계 법령에 따른다.",
      "2. 양 당사자가 합의한 특약은 별도 서면으로 작성하여 본 계약의 일부로 한다.",
    ],
  },
  {
    title: "제21조 (계약서 교부)",
    lines: [
      "1. 본 계약서는 2부 작성하여 회사와 구매자가 각 1부씩 보관한다.",
      "2. 전자서명이 포함된 전자계약서는 원본과 동일한 효력을 가진다.",
    ],
  },
  {
    title: "제22조 (중요 고지)",
    lines: [
      "본 계약은 자동차 매매 계약이며 렌트 또는 리스 계약이 아닙니다.",
      "구매자는 차량 구매 후 소유자로서의 모든 권리와 의무를 갖습니다.",
    ],
  },
];

// ---------------------------------------------------------------------------
// 유틸리티 함수
// ---------------------------------------------------------------------------

/** 숫자를 한국식 금액 형식으로 변환 */
function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR");
}

/**
 * 텍스트를 주어진 너비에 맞게 줄바꿈 처리.
 * pdf-lib는 한글 자동 줄바꿈을 지원하지 않으므로 직접 처리.
 */
function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  avgCharWidth: number,
): string[] {
  const charsPerLine = Math.floor(maxWidth / (fontSize * avgCharWidth));
  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= charsPerLine) {
      lines.push(remaining);
      break;
    }
    lines.push(remaining.slice(0, charsPerLine));
    remaining = remaining.slice(charsPerLine);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// 메인 함수
// ---------------------------------------------------------------------------

/**
 * 차량 매매 계약서 PDF를 생성한다.
 *
 * @param params - 계약서에 삽입할 차량/구매자 정보
 * @returns PDF 바이트 배열 (Uint8Array)
 */
export async function generateContractPDF(
  params: ContractParams,
): Promise<Uint8Array> {
  const {
    make,
    model,
    year,
    mileage,
    sellingPrice,
    deposit,
    customerName,
    customerPhone,
    signatureImage,
  } = params;

  // PDF 문서 생성
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // 한글 폰트 로드 (Pretendard OTF)
  const fontUrl =
    "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Regular.otf";

  let customFont;
  try {
    const fontResponse = await fetch(fontUrl);
    if (!fontResponse.ok) {
      throw new Error(`폰트 로드 실패: ${fontResponse.status}`);
    }
    const fontBytes = await fontResponse.arrayBuffer();
    customFont = await pdfDoc.embedFont(fontBytes);
  } catch {
    // 폰트 로드 실패 시 Helvetica 폴백 (한글 깨짐 발생할 수 있음)
    const { StandardFonts } = await import("pdf-lib");
    customFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  // 색상 상수
  const BLACK = rgb(0, 0, 0);
  const GRAY = rgb(0.4, 0.4, 0.4);
  const LIGHT_GRAY = rgb(0.85, 0.85, 0.85);
  const DARK_GRAY = rgb(0.15, 0.15, 0.15);

  // 현재 페이지 및 Y 커서 관리
  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  /** 새 페이지가 필요하면 추가하고 Y를 초기화 */
  function ensureSpace(requiredHeight: number) {
    if (y - requiredHeight < MARGIN) {
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  /** 줄 그리기 */
  function drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness = 0.5,
    color = LIGHT_GRAY,
  ) {
    currentPage.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
      color,
    });
  }

  /** 텍스트 그리기 */
  function drawText(
    text: string,
    x: number,
    yPos: number,
    size: number,
    color = BLACK,
    bold = false,
  ) {
    void bold; // bold는 커스텀 폰트에서는 별도 처리 필요 — 현재는 무시
    currentPage.drawText(text, {
      x,
      y: yPos,
      size,
      font: customFont,
      color,
    });
  }

  // ─── 1. 타이틀 ────────────────────────────────────────────────

  // 회사명 (소형)
  drawText("REBORN LABS Co., Ltd", MARGIN, y, 8, GRAY);
  y -= 6;

  // 계약서 제목
  const titleText = "REBORN CAR 차량 매매 및 이용 계약서";
  const titleWidth = customFont.widthOfTextAtSize(titleText, FONT_TITLE);
  const titleX = (PAGE_WIDTH - titleWidth) / 2;
  drawText(titleText, titleX, y - 4, FONT_TITLE, DARK_GRAY);
  y -= 30;

  // 구분선
  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, 1, DARK_GRAY);
  y -= 16;

  // ─── 2. 차량 정보 테이블 ───────────────────────────────────────

  drawText("차량 정보", MARGIN, y, FONT_HEADING, DARK_GRAY);
  y -= LINE_HEIGHT_HEADING;

  const tableData: [string, string, string, string][] = [
    ["1. 차량 브랜드", make, "2. 차종", model],
    ["3. 차량번호", "_________________", "4. 차대번호", "_________________"],
    ["5. 연식", `${year}년`, "6. 주행거리", `${mileage.toLocaleString()}km`],
    ["7. 색상", "_________________", "8. 비고", ""],
  ];

  const colW = CONTENT_WIDTH / 4;
  const rowH = 20;

  for (const row of tableData) {
    ensureSpace(rowH + 4);

    // 행 배경
    currentPage.drawRectangle({
      x: MARGIN,
      y: y - rowH + 4,
      width: CONTENT_WIDTH,
      height: rowH,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: LIGHT_GRAY,
      borderWidth: 0.5,
    });

    // 열 내용 (라벨/값 쌍 2개)
    const cols = [
      { label: row[0], value: row[1] },
      { label: row[2], value: row[3] },
    ];

    cols.forEach((col, i) => {
      const x = MARGIN + i * colW * 2;
      drawText(col.label, x + 4, y - 4, 7.5, GRAY);
      drawText(col.value, x + colW + 4, y - 4, 8, DARK_GRAY);

      // 열 구분선
      if (i === 0) {
        drawLine(
          MARGIN + colW * 2,
          y - rowH + 4,
          MARGIN + colW * 2,
          y + 4,
          0.5,
        );
        drawLine(MARGIN + colW, y - rowH + 4, MARGIN + colW, y + 4, 0.3, LIGHT_GRAY);
      }
    });

    y -= rowH;
  }

  y -= 12;

  // ─── 3. 계약 조항 ─────────────────────────────────────────────

  for (const article of ARTICLES) {
    ensureSpace(LINE_HEIGHT_HEADING + LINE_HEIGHT_BODY * 2);

    // 제4조 판매 가격, 제12조 보증금 — 플레이스홀더 치환
    const processedLines = article.lines.map((line) =>
      line
        .replace("{sellingPrice}", formatKRW(sellingPrice))
        .replace("{deposit}", formatKRW(deposit)),
    );

    // 조항 제목
    drawText(article.title, MARGIN, y, FONT_HEADING, DARK_GRAY);
    y -= LINE_HEIGHT_HEADING;

    // 조항 본문
    for (const line of processedLines) {
      // 제3조는 테이블을 이미 그렸으므로 스킵
      if (line === "위 차량 정보 테이블 참조") {
        continue;
      }

      // 긴 줄 자동 줄바꿈 (한 글자당 평균 0.55 비율 적용)
      const wrappedLines = wrapText(line, CONTENT_WIDTH - 8, FONT_BODY, 0.55);

      for (const wrappedLine of wrappedLines) {
        ensureSpace(LINE_HEIGHT_BODY);
        drawText(wrappedLine, MARGIN + 8, y, FONT_BODY, rgb(0.2, 0.2, 0.2));
        y -= LINE_HEIGHT_BODY;
      }
    }

    y -= 4; // 조항 간격
  }

  y -= 12;

  // ─── 4. 계약 당사자 섹션 ──────────────────────────────────────

  ensureSpace(200);

  // 섹션 구분선
  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, 1, DARK_GRAY);
  y -= 16;

  drawText("계약 당사자", MARGIN, y, FONT_HEADING, DARK_GRAY);
  y -= LINE_HEIGHT_HEADING + 4;

  // ── 구매자 정보 ──

  drawText("1. 구매자", MARGIN, y, FONT_HEADING, DARK_GRAY);
  y -= LINE_HEIGHT_HEADING;

  const buyerFields: [string, string][] = [
    ["성명", customerName],
    ["주민등록번호", "_________________"],
    ["주소", "_________________"],
    ["전화", customerPhone],
  ];

  for (const [label, value] of buyerFields) {
    ensureSpace(LINE_HEIGHT_BODY + 2);
    drawText(`- ${label}: `, MARGIN + 8, y, FONT_BODY, GRAY);
    drawText(value, MARGIN + 60, y, FONT_BODY, DARK_GRAY);
    y -= LINE_HEIGHT_BODY + 2;
  }

  // 서명 영역
  ensureSpace(80);
  drawText("- 서명:", MARGIN + 8, y, FONT_BODY, GRAY);
  y -= 8;

  if (signatureImage) {
    // 서명 이미지 삽입
    try {
      const signatureEmbed = await pdfDoc.embedPng(signatureImage);
      const sigWidth = 160;
      const sigHeight = 50;
      currentPage.drawImage(signatureEmbed, {
        x: MARGIN + 8,
        y: y - sigHeight,
        width: sigWidth,
        height: sigHeight,
      });
      y -= sigHeight + 8;
    } catch {
      // 이미지 삽입 실패 시 빈 서명란
      currentPage.drawRectangle({
        x: MARGIN + 8,
        y: y - 50,
        width: 160,
        height: 50,
        borderColor: LIGHT_GRAY,
        borderWidth: 0.5,
      });
      y -= 58;
    }
  } else {
    // 빈 서명란
    currentPage.drawRectangle({
      x: MARGIN + 8,
      y: y - 50,
      width: 160,
      height: 50,
      borderColor: LIGHT_GRAY,
      borderWidth: 0.5,
    });
    y -= 58;
  }

  y -= 16;

  // ── 판매자 정보 ──

  ensureSpace(120);

  drawText("2. 판매자", MARGIN, y, FONT_HEADING, DARK_GRAY);
  y -= LINE_HEIGHT_HEADING;
  drawText("REBORN LABS Co., Ltd", MARGIN + 8, y, FONT_BODY, DARK_GRAY);
  y -= LINE_HEIGHT_BODY + 2;

  const sellerFields: [string, string][] = [
    ["대표", "_________________"],
    ["사업자번호", "_________________"],
    ["주소", "_________________"],
    ["전화", "_________________"],
  ];

  for (const [label, value] of sellerFields) {
    ensureSpace(LINE_HEIGHT_BODY + 2);
    drawText(`- ${label}: `, MARGIN + 8, y, FONT_BODY, GRAY);
    drawText(value, MARGIN + 65, y, FONT_BODY, DARK_GRAY);
    y -= LINE_HEIGHT_BODY + 2;
  }

  // 회사 직인 영역
  ensureSpace(80);
  drawText("- 서명/직인:", MARGIN + 8, y, FONT_BODY, GRAY);
  y -= 8;

  currentPage.drawRectangle({
    x: MARGIN + 8,
    y: y - 50,
    width: 80,
    height: 50,
    borderColor: LIGHT_GRAY,
    borderWidth: 0.5,
  });
  drawText("(직인)", MARGIN + 28, y - 28, 8, LIGHT_GRAY);

  y -= 58;

  // ─── 5. 날짜 및 하단 ──────────────────────────────────────────

  ensureSpace(30);
  y -= 10;

  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, "0")}월 ${String(today.getDate()).padStart(2, "0")}일`;
  const dateWidth = customFont.widthOfTextAtSize(dateStr, FONT_BODY);
  drawText(dateStr, (PAGE_WIDTH - dateWidth) / 2, y, FONT_BODY, GRAY);
  y -= 20;

  // 하단 구분선
  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, 0.5, LIGHT_GRAY);
  y -= 10;

  // 페이지 번호
  const pages = pdfDoc.getPages();
  pages.forEach((page, i) => {
    page.drawText(`${i + 1} / ${pages.length}`, {
      x: PAGE_WIDTH / 2 - 10,
      y: MARGIN / 2,
      size: 7,
      font: customFont,
      color: GRAY,
    });
  });

  // PDF 직렬화
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
