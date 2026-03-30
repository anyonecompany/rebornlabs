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
  // proxy.ts에서 주입한 헤더에서 profile 읽기 (DB 조회 0회)
  const headerStore = await headers();
  const userId = headerStore.get("x-user-id");
  const profileJson = headerStore.get("x-user-profile");

  if (!userId || !profileJson) {
    redirect("/login");
  }

  const profile = JSON.parse(decodeURIComponent(profileJson)) as {
    name: string;
    role: string;
    email: string;
    must_change_password: boolean;
  };

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
        <div className="p-6" data-user-role={profile.role} data-user-id={userId}>{children}</div>
      </main>
    </div>
  );
}
