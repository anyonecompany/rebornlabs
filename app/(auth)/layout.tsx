export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { PasswordBanner } from "@/components/password-banner";
import type { UserRole } from "@/types/database";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const userId = headerStore.get("x-user-id");
  const profileJson = headerStore.get("x-user-profile");

  // proxy.ts가 항상 헤더를 주입하므로 여기 도달 시 반드시 존재
  // 만약 없으면 proxy가 /login으로 리다이렉트했을 것
  if (!userId || !profileJson) {
    redirect("/login");
  }

  let profile: {
    name: string;
    role: string;
    email: string;
    must_change_password: boolean;
  };

  try {
    profile = JSON.parse(decodeURIComponent(profileJson));
  } catch {
    redirect("/login");
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
