"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { LoadingState } from "@/components/loading-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/src/lib/api-client";
import type { UserRole } from "@/types/database";

interface ProfileData {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  role: UserRole;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // 프로필 수정 폼
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // 비밀번호 변경 폼
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/profile");
      if (!res.ok) throw new Error("프로필을 불러오지 못했습니다.");
      const data = await res.json();
      setProfile(data.profile);
      setName(data.profile.name);
      setPhone(data.profile.phone ?? "");
    } catch {
      toast.error("프로필을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("이름을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "저장에 실패했습니다.");
        return;
      }
      toast.success("프로필이 저장되었습니다.");
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("모든 필드를 입력해주세요.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    setChangingPassword(true);
    try {
      const res = await apiFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "비밀번호 변경에 실패했습니다.");
        return;
      }
      toast.success("비밀번호가 변경되었습니다.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("비밀번호 변경 중 오류가 발생했습니다.");
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="내 프로필" />
        <LoadingState variant="form" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="내 프로필" />

      <div className="space-y-6 max-w-xl mx-auto">
        {/* 프로필 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">기본 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">전화번호</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  value={profile?.email ?? ""}
                  readOnly
                  disabled
                  className="opacity-60"
                />
              </div>
              <div className="space-y-2">
                <Label>역할</Label>
                <div className="pt-1">
                  {profile && (
                    <StatusBadge type="role" value={profile.role} />
                  )}
                </div>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 비밀번호 변경 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">비밀번호 변경</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">현재 비밀번호</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={changingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">새 비밀번호</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordMismatch(false);
                  }}
                  disabled={changingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordMismatch(
                      newPassword !== e.target.value && e.target.value.length > 0,
                    );
                  }}
                  disabled={changingPassword}
                  className={passwordMismatch ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {passwordMismatch && (
                  <p className="text-xs text-red-400">
                    새 비밀번호가 일치하지 않습니다.
                  </p>
                )}
              </div>
              <Button type="submit" disabled={changingPassword || passwordMismatch}>
                {changingPassword ? "변경 중..." : "변경"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
