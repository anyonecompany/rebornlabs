export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { createServiceClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { PasswordBanner } from "@/components/password-banner";
import type { UserRole } from "@/types/database";

const COOKIE_NAME = "x-profile-cache";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const profileFromHeader = headerStore.get("x-user-profile");
  const userIdFromHeader = headerStore.get("x-user-id");

  let profile: {
    name: string;
    role: string;
    email: string;
    must_change_password: boolean;
  };
  let userId: string;

  if (profileFromHeader && userIdFromHeader) {
    // 캐시 히트 — DB 조회 0회
    profile = JSON.parse(decodeURIComponent(profileFromHeader));
    userId = userIdFromHeader;
  } else {
    // 캐시 미스 — 1회 DB 조회 + 쿠키 캐싱
    const supabase = await createSSRClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      redirect("/login");
    }

    const serviceClient = createServiceClient();
    const { data } = await serviceClient
      .from("profiles")
      .select("name, role, email, is_active, must_change_password")
      .eq("id", user.id)
      .single();

    if (!data || !data.is_active) {
      redirect("/unauthorized");
    }

    profile = {
      name: data.name,
      role: data.role,
      email: data.email,
      must_change_password: data.must_change_password,
    };
    userId = user.id;

    // 쿠키에 캐싱 (다음 요청부터 미들웨어에서 DB 조회 스킵)
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, encodeURIComponent(JSON.stringify({
      id: userId,
      ...profile,
      ts: Date.now(),
    })), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 300,
      path: "/",
    });
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        user={{
          name: profile.name,
          role: profile.role as UserRole,
          email: profile.email,
        }}
      />
      <main className="flex-1 overflow-auto">
        {profile.must_change_password && <PasswordBanner />}
        <div
          className="px-6 py-6 md:px-8 md:py-8 max-w-7xl mx-auto w-full"
          data-user-role={profile.role}
          data-user-id={userId}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
