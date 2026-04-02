import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
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
  /** 구매자 주소 (선택) */
  customerAddress?: string;
  /** 구매자 이메일 (선택) */
  customerEmail?: string;
  /** 차량번호 (선택) */
  plateNumber?: string;
  /** 차대번호 (선택) */
  vin?: string;
  /** 색상 (선택) */
  color?: string;
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
const FONT_TITLE = 14;
const FONT_HEADING = 11;
const FONT_BODY = 9;

/** 줄 간격 */
const LINE_HEIGHT_BODY = 14;
const LINE_HEIGHT_HEADING = 18;

/** 한글 폰트 URL */
const NOTO_SANS_KR_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-400-normal.ttf";

/** NotoSansKR 평균 글자 너비 비율 */
const AVG_CHAR_WIDTH_RATIO = 0.5;

// ---------------------------------------------------------------------------
// 계약서 조항 전문 (원문 그대로)
// ---------------------------------------------------------------------------

const ARTICLES: Array<{ title: string; body: string }> = [
  {
    title: "제1조 (목적)",
    body: `본 계약은 REBORN LABS 주식회사(이하 "회사")가 판매하는 리빌드 차량 브랜드 REBORN CAR의 매매, 이용, 차량 반납 조건 및 관련 권리·의무를 규정함을 목적으로 한다.`,
  },
  {
    title: "제2조 (정의)",
    body: `본 계약에서 사용하는 용어의 정의는 다음과 같다.
1. REBORN CAR: 사고 또는 전손 차량을 전문 공업사에서 수리 후 판매하는 리빌드 차량
2. 구매자: 본 계약에 따라 차량을 구매하는 개인 또는 법인
3. 반납: 본 계약에 따라 인도된 차량을, 구매자가 회사에 재매수 요청하면서 인도하는 행위
4. 리빌드 차량: 사고 또는 전손 이력이 있는 차량을 복원하여 판매하는 차량
5. 잔존가치: 반납 시점 기준 차량에 남아 있는 할부 잔여금 또는 차량 가치`,
  },
  {
    title: "제3조 (차량 정보)",
    body: `위 차량 정보 테이블 참조`,
  },
  {
    title: "제4조 (판매 가격)",
    body: `1. 차량 판매 가격 : {sellingPrice}원 (VAT 별도) (구매자는 금융사의 할부상품을 통하여 해당 대금을 지급할 수 있으며 이 경우 금융 조건은 금융사 심사 결과에 따라 결정된다)
2. 회사는 위 대금을 지급받는 즉시 차량을 구매자에게 인도한다.`,
  },
  {
    title: "제5조 (금융 조건)",
    body: `1. 할부 기간 : 최대 60개월 (자세한 조건은 금융사가 별도 안내함)
2. 금리 : 금융사 기준
3. 반납 시 잔존 처리 : 반납 시점 기준 남은 할부 잔액
4. 금융 계약은 구매자와 금융사 간 계약이며, 금융 계약의 효력이나 내용은 본 계약에 어떠한 영향도 미치지 아니한다.`,
  },
  {
    title: "제6조 (사고 차량 고지)",
    body: `본 차량은 보험사 사고 차량 또는 전손 이력이 있는 차량으로, 전문 공업사를 통해 수리 및 정비 후 판매되는 리빌드 차량이다.`,
  },
  {
    title: "제7조 (리빌드 인증 및 검수완료)",
    body: `1. 본 차량은 다음 절차를 거쳐 복원되었다.
[손상 상태 확인→전문 공업사 수리→부품 교체→정밀 점검→성능 검사]
2. 구매자는 전항의 내용을 충분히 설명 듣고 이해하였음을 확인한다.
3. 구매자는 차량의 외부/내부 상태, 성능, 하자 여부를 모두 확인한 뒤 구매하는 것이며, 차량을 인도받은 뒤에 구매자가 주장하는 하자에 대하여 회사는 책임을 지지 아니한다.
4. 인도일로부터 30일 이내 또는 주행거리 2,000km 중 먼저 도래하는 조건 내에서, 구매자의 과실이나 사고 등 외부적 요인의 개입없이 발생한 '엔진, 변속기, 주요 전기장치, 조향장치 등 주요 부품의 고장'에 대하여는 회사가 무상 수리한다.`,
  },
  {
    title: "제8조 (보험 가입)",
    body: `1. 구매자는 차량 인수 시 다음 보험에 가입해야 한다.
 가. 종합 자동차 보험   나. 대인 및 대물 보험   다. 자기차량 손해 보험 (권장)
2. 보험 미가입으로 인한 책임은 구매자에게 있다.`,
  },
  {
    title: "제9조 (차량 관리 의무)",
    body: `구매자는 차량을 정상적인 용도로 사용해야 하며, 다음 행위를 금지한다.
 가. 불법 운행   나. 영업용 무단 사용   다. 불법 개조   라. 차량을 이용한 범죄행위`,
  },
  {
    title: "제10조 (보증금)",
    body: `1. 구매자는 제4조의 판매대금과 별개로 다음 보증금을 회사에 납입한다 : {deposit}원
2. 전항의 보증금은 다음 사항을 담보한다.
 가. 차량 반납 의무 이행   나. 차량 손상 및 훼손 보상   다. 계약 위반에 따른 손해 배상   라. 미납 비용 정산`,
  },
  {
    title: "제11조 (보증금 반환)",
    body: `1. 다음 조건 충족 시 보증금을 반환한다.
 가. 차량 정상 반납 완료   나. 차량 상태 기준 충족   다. 잔여 비용 정산 완료   라. 차량에 부과된 각종 제세공과금 완납   마. 차량에 대한 사법적 또는 행정적 조치의 미존재
2. 보증금의 반환 시점은 차량 인수 후 30일 이내로 한다.`,
  },
  {
    title: "제12조 (보증금 차감)",
    body: `1. 다음 항목은 보증금에서 차감될 수 있다.
 가. 차량 수리 비용   나. 차량 감가 비용   다. 미납 비용 (세금, 보험, 과태료 등)
2. 전항의 차량 감가 비용은 전문 공업소의 객관적인 견적서 또는 자료에 따른다.`,
  },
  {
    title: "제13조 (보증금 미반환)",
    body: `다음의 경우 보증금은 일부 또는 전부 반환되지 않을 수 있다.
 가. 차량 반납 거부   나. 전손 사고   다. 차량 침수   라. 구조 손상의 발생   마. 계약 위반으로 인한 회사의 손해 발생 또는 발생의 우려`,
  },
  {
    title: "제14조 (추가 손해 배상)",
    body: `보증금으로 손해가 충당되지 않을 경우 구매자는 초과 손해에 대해 추가 배상해야 한다.`,
  },
  {
    title: "제15조 (구매자의 재매수청구)",
    body: `1. 본 차량의 인도일에서 3년이 지난 시점부터 30일 이내에, 구매자는 회사에 차량을 반납(=재매수요청)하면서 제10조의 보증금의 반환을 청구할 수 있다.
2. 전항의 기간이 경과하거나, 전항의 기간내라도 본 차량의 서류상 소유자가 구매자 아닌 자로 변경된 경우, 전항에 규정된 구매자의 재매수요청권은 소멸하며, 이 경우 제10조에 규정된 보증금은 회사의 소유로 한다.`,
  },
  {
    title: "제16조 (반납 차량 상태)",
    body: `반납 시 차량은 다음 상태를 충족해야 한다.
 가. 정상 주행 가능   나. 일반적인 마모 상태   다. 구조 손상 없음   라. 침수 이력 없음`,
  },
  {
    title: "제17조 (반납 제한)",
    body: `1. 다음의 경우 차량 반납이 제한될 수 있다.
 가. 전손 사고   나. 차량 침수   다. 구조 손상   라. 정상적 주행 불가 상태
2. 이 경우 구매자는 차량 가치 하락분 및 회사의 손해에 대해 배상해야 한다.`,
  },
  {
    title: "제18조 (계약 해지 사유)",
    body: `1. 다음 각호의 경우, 회사는 본 계약을 해지 또는 해제할 수 있다.
 가. 구매자가 할부금을 3회 이상 미납한 경우
 나. 구매자가 차량을 인도받은 날로부터 1개월 이내 보험에 미가입한 경우
 다. 구매자가 차량을 불법 용도로 사용한 경우
2. 전항의 경우 차량은 금융사 또는 회사에 의해 회수될 수 있다.`,
  },
  {
    title: "제19조 (면책)",
    body: `회사는 다음 사항에 대해 책임을 지지 않는다.
 가. 금융 계약 관련 분쟁   나. 구매자의 차량 관리 소홀   다. 보험 미가입으로 인한 손해`,
  },
  {
    title: "제20조 (설명 의무)",
    body: `회사는 차량 상태 및 리빌드 이력에 대해 충분히 설명하였고, 구매자는 이를 확인 후 계약을 체결함을 확인한다.`,
  },
  {
    title: "제21조 (준거법)",
    body: `본 계약은 대한민국 법률에 따른다.`,
  },
  {
    title: "제22조 (관할 법원)",
    body: `본 계약과 관련된 분쟁은 회사 본점 소재지 관할 법원으로 한다.`,
  },
];

/** 중요 고지 문구 */
const IMPORTANT_NOTICE =
  "중요 고지: 본 계약은 자동차 매매 계약이며 렌트 또는 리스 계약이 아닙니다.";

// ---------------------------------------------------------------------------
// 유틸리티 함수
// ---------------------------------------------------------------------------

/** 숫자를 한국식 금액 형식으로 변환 */
function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR");
}

/**
 * 텍스트를 주어진 너비에 맞게 줄바꿈 처리.
 * NotoSansKR 평균 글자 너비를 fontSize * AVG_CHAR_WIDTH_RATIO로 계산.
 */
function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const charsPerLine = Math.floor(
    maxWidth / (fontSize * AVG_CHAR_WIDTH_RATIO),
  );
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
    customerAddress,
    plateNumber,
    vin,
    color,
    signatureImage,
  } = params;

  // PDF 문서 생성
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // 한글 폰트 로드 (NotoSansKR TTF)
  let customFont;
  try {
    const fontResponse = await fetch(NOTO_SANS_KR_URL);
    if (!fontResponse.ok) {
      throw new Error(`폰트 로드 실패: ${fontResponse.status}`);
    }
    const fontBytes = await fontResponse.arrayBuffer();
    customFont = await pdfDoc.embedFont(fontBytes);
  } catch {
    // 폰트 로드 실패 시 Helvetica 폴백
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
  function ensureSpace(requiredHeight: number): void {
    if (y - requiredHeight < MARGIN + 20) {
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
  ): void {
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
  ): void {
    currentPage.drawText(text, {
      x,
      y: yPos,
      size,
      font: customFont,
      color,
    });
  }

  // ─── 1. 타이틀 ────────────────────────────────────────────────

  const titleText =
    "REBORN CAR 차량 매매 및 이용 계약서 (REBORN LABS Co., Ltd)";
  const titleWidth = customFont.widthOfTextAtSize(titleText, FONT_TITLE);
  const titleX = (PAGE_WIDTH - titleWidth) / 2;
  drawText(titleText, titleX, y, FONT_TITLE, DARK_GRAY);
  y -= 24;

  // 구분선
  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, 1, DARK_GRAY);
  y -= 16;

  // ─── 2. 차량 정보 테이블 (4행 2열) ────────────────────────────

  const tableData: [string, string, string, string][] = [
    ["1. 차량 브랜드", make, "2. 차종", model],
    ["3. 차량번호", plateNumber ?? "", "4. 차대번호", vin ?? ""],
    ["5. 연식", `${year}년`, "6. 주행거리", `${mileage.toLocaleString()}km`],
    ["7. 색상", color ?? "", "8. 비고", ""],
  ];

  const halfWidth = CONTENT_WIDTH / 2;
  const rowH = 22;

  for (const row of tableData) {
    ensureSpace(rowH + 4);

    // 행 외곽 테두리
    currentPage.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: CONTENT_WIDTH,
      height: rowH,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: LIGHT_GRAY,
      borderWidth: 0.5,
    });

    // 좌측 셀
    drawText(row[0], MARGIN + 4, y - 14, 7.5, GRAY);
    drawText(row[1], MARGIN + 4 + halfWidth / 2, y - 14, FONT_BODY, DARK_GRAY);

    // 중간 구분선
    drawLine(MARGIN + halfWidth, y - rowH, MARGIN + halfWidth, y, 0.5);

    // 우측 셀
    drawText(row[2], MARGIN + halfWidth + 4, y - 14, 7.5, GRAY);
    drawText(
      row[3],
      MARGIN + halfWidth + 4 + halfWidth / 2,
      y - 14,
      FONT_BODY,
      DARK_GRAY,
    );

    y -= rowH;
  }

  y -= 14;

  // ─── 3. 계약 조항 ─────────────────────────────────────────────

  for (const article of ARTICLES) {
    // 제3조는 테이블 이미 표시했으므로 본문 스킵
    if (article.title === "제3조 (차량 정보)") {
      ensureSpace(LINE_HEIGHT_HEADING);
      drawText(article.title, MARGIN, y, FONT_HEADING, DARK_GRAY);
      y -= LINE_HEIGHT_HEADING;
      drawText(
        "위 차량 정보 테이블 참조",
        MARGIN + 8,
        y,
        FONT_BODY,
        rgb(0.2, 0.2, 0.2),
      );
      y -= LINE_HEIGHT_BODY;
      y -= LINE_HEIGHT_BODY * 1.5; // 조항 간격
      continue;
    }

    ensureSpace(LINE_HEIGHT_HEADING + LINE_HEIGHT_BODY * 2);

    // 조항 제목
    drawText(article.title, MARGIN, y, FONT_HEADING, DARK_GRAY);
    y -= LINE_HEIGHT_HEADING;

    // 본문 — 플레이스홀더 치환 후 줄바꿈
    const processedBody = article.body
      .replace("{sellingPrice}", formatKRW(sellingPrice))
      .replace("{deposit}", formatKRW(deposit));

    const rawLines = processedBody.split("\n");
    for (const rawLine of rawLines) {
      const wrappedLines = wrapText(rawLine, CONTENT_WIDTH - 8, FONT_BODY);
      for (const wrappedLine of wrappedLines) {
        ensureSpace(LINE_HEIGHT_BODY);
        drawText(wrappedLine, MARGIN + 8, y, FONT_BODY, rgb(0.2, 0.2, 0.2));
        y -= LINE_HEIGHT_BODY;
      }
    }

    y -= LINE_HEIGHT_BODY * 1.5; // 조항 간 간격
  }

  // 중요 고지
  ensureSpace(LINE_HEIGHT_BODY * 2);
  drawText(IMPORTANT_NOTICE, MARGIN, y, FONT_BODY, DARK_GRAY);
  y -= LINE_HEIGHT_BODY * 1.5;

  // ─── 4. 계약 당사자 섹션 ──────────────────────────────────────

  ensureSpace(240);

  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, 1, DARK_GRAY);
  y -= 16;

  // ── 구매자 정보 ──

  drawText("구매자", MARGIN, y, FONT_HEADING, DARK_GRAY);
  y -= LINE_HEIGHT_HEADING;

  // 성명 + (인)
  drawText(`성명: ${customerName}`, MARGIN + 8, y, FONT_BODY, DARK_GRAY);
  drawText("(인)", MARGIN + 8 + customFont.widthOfTextAtSize(`성명: ${customerName}`, FONT_BODY) + 4, y, FONT_BODY, DARK_GRAY);

  // 서명 이미지 오버레이 — (인) 위치 근방
  if (signatureImage) {
    const sigXBase =
      MARGIN +
      8 +
      customFont.widthOfTextAtSize(`성명: ${customerName}`, FONT_BODY) +
      4;
    try {
      const signatureEmbed = await pdfDoc.embedPng(signatureImage);
      currentPage.drawImage(signatureEmbed, {
        x: sigXBase,
        y: y - 6,
        width: 50,
        height: 20,
        opacity: 0.85,
      });
    } catch {
      // 서명 이미지 삽입 실패 시 무시
    }
  }

  y -= LINE_HEIGHT_BODY + 2;

  drawText("주민등록번호:", MARGIN + 8, y, FONT_BODY, DARK_GRAY);
  y -= LINE_HEIGHT_BODY + 2;

  drawText(
    `주소: ${customerAddress ?? ""}`,
    MARGIN + 8,
    y,
    FONT_BODY,
    DARK_GRAY,
  );
  y -= LINE_HEIGHT_BODY + 2;

  drawText(`전화: ${customerPhone}`, MARGIN + 8, y, FONT_BODY, DARK_GRAY);
  y -= LINE_HEIGHT_BODY + 16;

  // ── 판매자 정보 ──

  ensureSpace(120);

  drawText("판매자", MARGIN, y, FONT_HEADING, DARK_GRAY);
  y -= LINE_HEIGHT_HEADING;

  drawText(
    "REBORN LABS Co., Ltd",
    MARGIN + 8,
    y,
    FONT_BODY,
    DARK_GRAY,
  );
  y -= LINE_HEIGHT_BODY + 2;

  drawText("대표: 심재윤 (직인)", MARGIN + 8, y, FONT_BODY, DARK_GRAY);
  y -= LINE_HEIGHT_BODY + 2;

  drawText("사업자번호:", MARGIN + 8, y, FONT_BODY, DARK_GRAY);
  y -= LINE_HEIGHT_BODY + 2;

  drawText(
    "주소: 서울특별시 성동구 아차산로7길 21, 4층 199호 (성수동2가)",
    MARGIN + 8,
    y,
    FONT_BODY,
    DARK_GRAY,
  );
  y -= LINE_HEIGHT_BODY + 2;

  drawText("전화:", MARGIN + 8, y, FONT_BODY, DARK_GRAY);
  y -= LINE_HEIGHT_BODY + 16;

  // ─── 5. 날짜 ──────────────────────────────────────────────────

  ensureSpace(40);
  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, "0")}월 ${String(today.getDate()).padStart(2, "0")}일`;
  const dateWidth = customFont.widthOfTextAtSize(dateStr, FONT_BODY);
  drawText(dateStr, (PAGE_WIDTH - dateWidth) / 2, y, FONT_BODY, GRAY);

  // ─── 6. 페이지 번호 (모든 페이지 하단 중앙) ───────────────────

  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  pages.forEach((page, i) => {
    const pageNumText = `${i + 1} / ${totalPages}`;
    const pageNumWidth = customFont.widthOfTextAtSize(pageNumText, 7);
    page.drawText(pageNumText, {
      x: (PAGE_WIDTH - pageNumWidth) / 2,
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
