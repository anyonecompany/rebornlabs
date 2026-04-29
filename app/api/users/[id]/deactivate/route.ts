import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireRole, verifyUser, getAuthErrorMessage} from "@/lib/auth/verify";
import { createServiceClient } from "@/lib/supabase/server";

function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return request.cookies.get("sb-access-token")?.value ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const user = await verifyUser(token);
    requireRole(user, ["admin"]);
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === "NO_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    return NextResponse.json(
      { error: "인증 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const { id: userId } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json(
      { error: "계정 비활성화 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  await supabase.auth.admin.signOut(userId);

  return NextResponse.json({ success: true });
}
