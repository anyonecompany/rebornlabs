"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="rounded-full bg-muted p-5">
          <ShieldOff className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
          <p className="text-sm text-muted-foreground">
            계정이 승인되지 않았거나 비활성화되었습니다.
            <br />
            관리자에게 문의하세요.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleLogout}
          disabled={isLoading}
          className="mt-2"
        >
          {isLoading ? "로그아웃 중..." : "로그아웃"}
        </Button>
      </div>
    </div>
  );
}
