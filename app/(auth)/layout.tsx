export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { createServiceClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { PasswordBanner } from "@/components/password-banner";
import type { UserRole } from "@/types/database";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSSRClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // service_role로 profiles 조회 (RLS bypass — JWT custom claim 미설정 환경 대응)
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("name, role, email, must_change_password")
    .eq("id", user.id)
    .single();

  if (!profile) {
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
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
