import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

interface ParsedRow {
  brand: string;
  model: string;
  trim: string;
  car_price: number;
  monthly_payment: number;
  max_deposit: number;
  display_order: number;
}

interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
}

/**
 * 엑셀 bytes → ParsedRow[].
 *
 * 파일 포맷 (업로드.xlsx, 2026-04-26부터 6컬럼):
 *   - 첫 번째 시트 사용 (Sheet1)
 *   - row 0~5: 안내 문구 (띄엄띄엄)
 *   - row 6:   헤더 ["차종", "모델", "등급", "차량가격", "월 납입료", "최대보증금"]
 *   - row 7~:  데이터
 *
 * 컬럼 인덱스 (0-based):
 *   0=brand, 1=model, 2=trim,
 *   3=car_price, 4=monthly_payment, 5=max_deposit
 *
 * brand/model 컬럼은 merge cell → 직전 값 forward-fill.
 *
 * 변경 이력:
 *   2026-04-26: 기존 7컬럼(추가가격 포함)에서 6컬럼으로 변경. monthly_payment를
 *               공식 계산 대신 엑셀 값으로 직접 저장하도록 전환.
 */
function parseWorkbook(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["시트가 없습니다."] };
  }
  const sheet = wb.Sheets[sheetName];
  const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  });

  const errors: string[] = [];
  const rows: ParsedRow[] = [];
  let currentBrand = "";
  let currentModel = "";
  let order = 10;

  const DATA_START_IDX = 7; // 0-indexed row 7 (row 6은 헤더)
  const COL_BRAND = 0;
  const COL_MODEL = 1;
  const COL_TRIM = 2;
  const COL_CAR_PRICE = 3;
  const COL_MONTHLY_PAYMENT = 4;
  const COL_MAX_DEPOSIT = 5;

  for (let i = DATA_START_IDX; i < data.length; i++) {
    const row = data[i] ?? [];
    const rowNum = i + 1;

    const rawBrand = stringCell(row[COL_BRAND]);
    const rawModel = stringCell(row[COL_MODEL]);
    const rawTrim = stringCell(row[COL_TRIM]);
    const rawCarPrice = row[COL_CAR_PRICE];
    const rawMonthlyPayment = row[COL_MONTHLY_PAYMENT];
    const rawMaxDeposit = row[COL_MAX_DEPOSIT];

    // forward-fill
    if (rawBrand) currentBrand = rawBrand;
    if (rawModel) currentModel = rawModel;

    // 완전 빈 행 스킵
    if (
      !rawTrim &&
      rawCarPrice == null &&
      rawMonthlyPayment == null &&
      rawMaxDeposit == null
    ) {
      continue;
    }

    if (!currentBrand) {
      errors.push(`${rowNum}행: 브랜드를 찾을 수 없습니다.`);
      continue;
    }
    if (!currentModel) {
      errors.push(`${rowNum}행: 모델을 찾을 수 없습니다.`);
      continue;
    }
    if (!rawTrim) {
      errors.push(`${rowNum}행: 등급이 비어 있습니다.`);
      continue;
    }

    const carPrice = toInt(rawCarPrice);
    const monthlyPayment = toInt(rawMonthlyPayment);
    const maxDeposit = toInt(rawMaxDeposit);
    if (carPrice === null || carPrice <= 0) {
      errors.push(`${rowNum}행: 차량가격이 올바르지 않습니다 (${rawCarPrice}).`);
      continue;
    }
    if (monthlyPayment === null || monthlyPayment <= 0) {
      errors.push(
        `${rowNum}행: 월 납입료가 올바르지 않습니다 (${rawMonthlyPayment}).`,
      );
      continue;
    }
    if (maxDeposit === null || maxDeposit < 0) {
      errors.push(`${rowNum}행: 최대보증금이 올바르지 않습니다 (${rawMaxDeposit}).`);
      continue;
    }

    rows.push({
      brand: currentBrand,
      model: currentModel,
      trim: rawTrim,
      car_price: carPrice,
      monthly_payment: monthlyPayment,
      max_deposit: maxDeposit,
      display_order: order,
    });
    order += 10;
  }

  return { rows, errors };
}

function stringCell(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function toInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.round(v);
  }
  const cleaned = String(v).replace(/[,\s원]/g, "");
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

// ─── POST /api/vehicle-models/import ────────────────────────
// multipart/form-data: file
// 권한: admin/staff
// 처리: 파싱 → 검증 → upsert → 브랜드별 카운트 응답

export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    const role = user.role as string;
    if (role !== "admin" && role !== "staff") {
      return NextResponse.json(
        { error: "가져오기 권한이 없습니다." },
        { status: 403 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "파일이 첨부되지 않았습니다." },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const { rows, errors } = parseWorkbook(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "가져올 수 있는 데이터가 없습니다.",
          parseErrors: errors,
        },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    // upsert: UNIQUE(brand, model, trim) 기준
    // 전체 배치 upsert 시도 → 실패 시 행별 개별 upsert로 폴백하여 실패 행 특정
    interface FailedRow { row: ParsedRow; error: string }
    let successCount = 0;
    const failedRows: FailedRow[] = [];

    const { error: batchError } = await serviceClient
      .from("vehicle_models")
      .upsert(rows, { onConflict: "brand,model,trim" });

    if (batchError) {
      // 배치 실패 시 행별 개별 upsert로 재시도하여 실패 행 특정
      for (const row of rows) {
        const { error: rowError } = await serviceClient
          .from("vehicle_models")
          .upsert(row, { onConflict: "brand,model,trim" });
        if (rowError) {
          failedRows.push({ row, error: rowError.message });
        } else {
          successCount++;
        }
      }

      if (successCount === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "모든 행 업서트에 실패했습니다.",
            failed: failedRows.map((f) => ({
              brand: f.row.brand,
              model: f.row.model,
              trim: f.row.trim,
              error: f.error,
            })),
          },
          { status: 500 },
        );
      }
    } else {
      successCount = rows.length;
    }

    // 감사 로그
    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "vehicle_models_imported",
      target_type: "vehicle_models",
      target_id: null,
      metadata: {
        count: successCount,
        failed_count: failedRows.length,
        parse_errors_count: errors.length,
      },
    });

    // 브랜드별 카운트 응답 (참고용) — 성공 행 기준
    const successRows = failedRows.length > 0
      ? rows.filter((r) => !failedRows.some((f) => f.row === r))
      : rows;
    const byBrand: Record<string, number> = {};
    for (const r of successRows) {
      byBrand[r.brand] = (byBrand[r.brand] ?? 0) + 1;
    }

    return NextResponse.json({
      success: true,
      count: successCount,
      failed: failedRows.map((f) => ({
        brand: f.row.brand,
        model: f.row.model,
        trim: f.row.trim,
        error: f.error,
      })),
      byBrand,
      parseErrors: errors,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
