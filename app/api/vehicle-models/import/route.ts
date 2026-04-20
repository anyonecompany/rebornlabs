import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

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
 * 파일 포맷:
 *   - 첫 번째 시트 사용
 *   - 1~8행: 안내/빈 행
 *   - 9행: 헤더 (차종/모델/등급/차량가격/추가된가격/월납입료/최대보증금)
 *   - 10행~: 데이터
 *
 * 컬럼 인덱스 (0-based):
 *   C(2)=brand, D(3)=model, E(4)=trim,
 *   F(5)=car_price, G(6)=추가된가격(무시), H(7)=월납입료(무시), I(8)=max_deposit
 *
 * brand/model 컬럼은 merge cell → 직전 값 forward-fill.
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

  const DATA_START_IDX = 9; // 1-indexed 10행 = 0-indexed 9
  const COL_BRAND = 2;
  const COL_MODEL = 3;
  const COL_TRIM = 4;
  const COL_CAR_PRICE = 5;
  const COL_MAX_DEPOSIT = 8;

  for (let i = DATA_START_IDX; i < data.length; i++) {
    const row = data[i] ?? [];
    const rowNum = i + 1;

    const rawBrand = stringCell(row[COL_BRAND]);
    const rawModel = stringCell(row[COL_MODEL]);
    const rawTrim = stringCell(row[COL_TRIM]);
    const rawCarPrice = row[COL_CAR_PRICE];
    const rawMaxDeposit = row[COL_MAX_DEPOSIT];

    // forward-fill
    if (rawBrand) currentBrand = rawBrand;
    if (rawModel) currentModel = rawModel;

    // 완전 빈 행 스킵
    if (!rawTrim && rawCarPrice == null && rawMaxDeposit == null) {
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
    const maxDeposit = toInt(rawMaxDeposit);
    if (carPrice === null || carPrice <= 0) {
      errors.push(`${rowNum}행: 차량가격이 올바르지 않습니다 (${rawCarPrice}).`);
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
    const { error: upsertError } = await serviceClient
      .from("vehicle_models")
      .upsert(rows, { onConflict: "brand,model,trim" });

    if (upsertError) {
      return NextResponse.json(
        {
          success: false,
          error: "업서트 중 오류가 발생했습니다.",
          detail: upsertError.message,
        },
        { status: 500 },
      );
    }

    // 감사 로그
    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "vehicle_models_imported",
      target_type: "vehicle_models",
      target_id: null,
      metadata: {
        count: rows.length,
        parse_errors_count: errors.length,
      },
    });

    // 브랜드별 카운트 응답 (참고용)
    const byBrand: Record<string, number> = {};
    for (const r of rows) {
      byBrand[r.brand] = (byBrand[r.brand] ?? 0) + 1;
    }

    return NextResponse.json({
      success: true,
      count: rows.length,
      byBrand,
      parseErrors: errors,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
