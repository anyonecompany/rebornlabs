/**
 * 리본랩스 — 스프레드시트 → Supabase 상담 데이터 마이그레이션
 *
 * 사용법:
 *   1. Google 스프레드시트에서 확장 프로그램 → Apps Script 열기
 *   2. 이 코드를 붙여넣기
 *   3. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정
 *   4. SHEET_NAME, HEADER_ROW, DATA_START_ROW 확인
 *   5. migrateToSupabase() 실행
 *
 * 스프레드시트 컬럼 매핑:
 *   A: 접수일시 → created_at (참고용, INSERT 시 DB 자동 생성)
 *   B: 이름 → customer_name (필수)
 *   C: 연락처 → phone (필수)
 *   D: 관심차종 → interested_vehicle
 *   E: 문의사항 → message
 *   F: 유입채널 → source_ref
 *   G: 상태 → (참고용, DB 기본값 'new')
 *   H: 배정딜러 → (마이그레이션 후 어드민에서 수동 배정)
 *   I: 비고 → message에 병합
 */

// ─── 설정 ────────────────────────────────────────────────────

const SUPABASE_URL = "여기에_SUPABASE_URL_입력"; // 예: https://xxxx.supabase.co
const SUPABASE_SERVICE_ROLE_KEY = "여기에_SERVICE_ROLE_KEY_입력";

const SHEET_NAME = "Sheet1"; // 시트 이름 (탭 이름)
const HEADER_ROW = 1; // 헤더 행 번호
const DATA_START_ROW = 2; // 데이터 시작 행

// 컬럼 인덱스 (0-based, 필요 시 조정)
const COL = {
  DATETIME: 0, // A: 접수일시
  NAME: 1, // B: 이름
  PHONE: 2, // C: 연락처
  VEHICLE: 3, // D: 관심차종
  MESSAGE: 4, // E: 문의사항
  SOURCE: 5, // F: 유입채널
  STATUS: 6, // G: 상태
  DEALER: 7, // H: 배정딜러
  NOTE: 8, // I: 비고
};

// ─── 메인 함수 ──────────────────────────────────────────────

function migrateToSupabase() {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log("시트를 찾을 수 없습니다: " + SHEET_NAME);
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    Logger.log("데이터가 없습니다.");
    return;
  }

  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 9).getValues();

  Logger.log("총 " + data.length + "건 마이그레이션 시작");

  let success = 0;
  let skip = 0;
  let fail = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = String(row[COL.NAME] || "").trim();
    const phone = String(row[COL.PHONE] || "").trim();

    // 이름+연락처 필수
    if (!name || !phone) {
      Logger.log("행 " + (DATA_START_ROW + i) + " 스킵: 이름 또는 연락처 없음");
      skip++;
      continue;
    }

    const vehicle = String(row[COL.VEHICLE] || "").trim() || null;
    const messageText = String(row[COL.MESSAGE] || "").trim();
    const note = String(row[COL.NOTE] || "").trim();
    const message = [messageText, note].filter(Boolean).join(" | ") || null;
    const source = String(row[COL.SOURCE] || "").trim() || "spreadsheet_import";

    const result = callInsertRpc(name, phone, vehicle, message, source);

    if (result.success) {
      success++;
    } else {
      Logger.log(
        "행 " + (DATA_START_ROW + i) + " 실패: " + result.error
      );
      fail++;
    }

    // API 속도 제한 방지
    if (i > 0 && i % 50 === 0) {
      Logger.log("진행: " + (i + 1) + "/" + data.length);
      Utilities.sleep(1000);
    }
  }

  Logger.log(
    "마이그레이션 완료 — 성공: " + success + ", 스킵: " + skip + ", 실패: " + fail
  );
}

// ─── Supabase RPC 호출 ─────────────────────────────────────

function callInsertRpc(name, phone, vehicle, message, source) {
  var url = SUPABASE_URL + "/rest/v1/rpc/insert_consultation_from_gas";

  var payload = {
    p_customer_name: name,
    p_phone: phone,
    p_interested_vehicle: vehicle,
    p_message: message,
    p_source_ref: source,
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      return { success: true };
    } else {
      return { success: false, error: code + " " + response.getContentText().substring(0, 200) };
    }
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ─── 테스트: 1건만 전송 ─────────────────────────────────────

function testSingleRow() {
  var result = callInsertRpc(
    "테스트고객",
    "010-0000-0000",
    "아반떼",
    "마이그레이션 테스트",
    "test_import"
  );
  Logger.log("결과: " + JSON.stringify(result));
}

// ─── 건수 확인 (실행 전 검증용) ──────────────────────────────

function countRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log("시트 없음");
    return;
  }
  var lastRow = sheet.getLastRow();
  var dataRows = lastRow - DATA_START_ROW + 1;
  Logger.log("데이터 행: " + dataRows + "건 (헤더 제외)");
}
