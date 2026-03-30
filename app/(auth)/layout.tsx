export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createSSRClient } from "@/lib/supabase/server-ssr";
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

  const { data: profile } = await supabase
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
