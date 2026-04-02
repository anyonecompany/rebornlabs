import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError } from "@/lib/auth/verify";
import type { DocumentCategory } from "@/types/database";

// ─── 유효 카테고리 상수 ────────────────────────────────────────

const VALID_CATEGORIES: DocumentCategory[] = [
  "business_registration",
  "contract",
  "other",
];

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/documents — 문서 목록 조회 ─────────────────────

/**
 * 공통 문서 목록 조회 (커서 기반 페이지네이션).
 *
 * - admin/staff만 접근 가능 (dealer 차단)
 * - query: category (optional 필터)
 * - 커서: "created_at__id" 형식, 20건씩
 * - 응답: { data: Document[], nextCursor: string|null }
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor"); // "created_at__id" 형식
    const categoryParam = searchParams.get("category");
    const PAGE_SIZE = 20;

    const serviceClient = createServiceClient();

    let query = serviceClient
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);

    // 카테고리 필터 (유효한 값인 경우에만 적용)
    if (
      categoryParam &&
      VALID_CATEGORIES.includes(categoryParam as DocumentCategory)
    ) {
      query = query.eq("category", categoryParam as DocumentCategory);
    }

    if (cursor) {
      const [cursorDate, cursorId] = cursor.split("__");
      if (cursorDate && cursorId) {
        query = query.or(
          `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`,
        );
      }
    }

    const { data: documents, error: listError } = await query;
    if (listError) {
      return NextResponse.json(
        { error: `문서 목록을 불러오지 못했습니다: ${listError.message}` },
        { status: 500 },
      );
    }

    const hasMore = (documents?.length ?? 0) > PAGE_SIZE;
    const items = hasMore ? documents!.slice(0, PAGE_SIZE) : (documents ?? []);

    if (items.length === 0) {
      return NextResponse.json({ data: [], nextCursor: null });
    }

    // 업로더 이름 join
    const uploaderIds = [...new Set(items.map((d) => d.uploaded_by))];
    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("id, name")
      .in("id", uploaderIds);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.name]),
    );

    const merged = items.map((doc) => ({
      ...doc,
      uploader_name: profileMap.get(doc.uploaded_by) ?? null,
    }));

    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem ? `${lastItem.created_at}__${lastItem.id}` : null;

    return NextResponse.json({ data: merged, nextCursor });
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

// ─── POST /api/documents — 문서 등록 ─────────────────────────

/**
 * 공통 문서 등록 (admin/staff 전용).
 *
 * - FormData: file + category + file_name (optional, 표시용 제목)
 * - documents 버킷에 업로드: {category}/{timestamp}_{filename}
 * - documents 테이블 INSERT
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "파일이 없습니다." },
        { status: 400 },
      );
    }

    const categoryRaw = formData.get("category");
    if (!categoryRaw || typeof categoryRaw !== "string") {
      return NextResponse.json(
        { error: "카테고리는 필수입니다." },
        { status: 400 },
      );
    }
    if (!VALID_CATEGORIES.includes(categoryRaw as DocumentCategory)) {
      return NextResponse.json(
        {
          error: `카테고리는 ${VALID_CATEGORIES.join(", ")} 중 하나여야 합니다.`,
        },
        { status: 400 },
      );
    }
    const category = categoryRaw as DocumentCategory;

    // 표시용 파일명: file_name 파라미터가 있으면 사용, 없으면 원본 파일명
    const fileNameParam = formData.get("file_name");
    const displayName =
      typeof fileNameParam === "string" && fileNameParam.trim()
        ? fileNameParam.trim()
        : file.name;

    // 파일 크기 확인 (10MB 제한)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 10MB 이하여야 합니다." },
        { status: 400 },
      );
    }

    // 스토리지 경로: {category}/{timestamp}_{filename}
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${category}/${timestamp}_${safeFilename}`;

    const fileBuffer = await file.arrayBuffer();

    const serviceClient = createServiceClient();

    const { error: uploadError } = await serviceClient.storage
      .from("documents")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `파일 업로드에 실패했습니다: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const { data: publicUrlData } = await serviceClient.storage
      .from("documents")
      .createSignedUrl(storagePath, 3600);

    // documents 테이블 INSERT
    const { data: document, error: insertError } = await serviceClient
      .from("documents")
      .insert({
        uploaded_by: user.id,
        category,
        file_name: displayName,
        file_url: publicUrlData?.signedUrl ?? "",
      })
      .select()
      .single();

    if (insertError) {
      // 스토리지 업로드는 성공했지만 DB 저장 실패 시 파일 정리
      await serviceClient.storage.from("documents").remove([storagePath]);
      return NextResponse.json(
        { error: "문서 등록에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: document }, { status: 201 });
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
