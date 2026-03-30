"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Copy, Check, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/types/database";

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

type InviteRole = "staff" | "dealer";

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 초대 Dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("staff");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 역할 변경 Dialog
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState<UserRole>("staff");
  const [roleLoading, setRoleLoading] = useState(false);

  // 비활성화 Dialog
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "사용자 목록을 불러오지 못했습니다.");
        return;
      }
      const data = await res.json();
      setUsers(data.users);
    } catch {
      toast.error("사용자 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 초대 제출
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) {
      toast.error("이메일과 이름을 입력해주세요.");
      return;
    }
    setInviteLoading(true);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim(),
          role: inviteRole,
          phone: invitePhone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "초대에 실패했습니다.");
        return;
      }
      setTempPassword(data.temporaryPassword);
      await fetchUsers();
    } catch {
      toast.error("초대 중 오류가 발생했습니다.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyPassword = () => {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetInviteForm = () => {
    setInviteEmail("");
    setInviteName("");
    setInviteRole("staff");
    setInvitePhone("");
    setTempPassword(null);
    setCopied(false);
  };

  // 역할 변경 제출
  const handleRoleChange = async () => {
    if (!selectedUser) return;
    setRoleLoading(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "역할 변경에 실패했습니다.");
        return;
      }
      toast.success("역할이 변경되었습니다.");
      setRoleDialogOpen(false);
      await fetchUsers();
    } catch {
      toast.error("역할 변경 중 오류가 발생했습니다.");
    } finally {
      setRoleLoading(false);
    }
  };

  // 비활성화 제출
  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    const res = await fetch(`/api/users/${deactivateTarget.id}/deactivate`, {
      method: "PATCH",
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "비활성화에 실패했습니다.");
      return;
    }
    toast.success("사용자가 비활성화되었습니다.");
    setDeactivateOpen(false);
    await fetchUsers();
  };

  // 테이블 컬럼
  const columns = [
    { key: "name", header: "이름" },
    { key: "email", header: "이메일" },
    {
      key: "role",
      header: "역할",
      render: (value: unknown) => (
        <StatusBadge type="role" value={value as UserRole} />
      ),
    },
    {
      key: "is_active",
      header: "상태",
      render: (value: unknown) =>
        value ? (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          >
            활성
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
          >
            비활성
          </Badge>
        ),
    },
    {
      key: "created_at",
      header: "가입일",
      render: (value: unknown) =>
        new Date(value as string).toLocaleDateString("ko-KR"),
    },
    {
      key: "id",
      header: "액션",
      render: (_: unknown, row: Record<string, unknown>) => {
        const user = row as unknown as UserRow;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md px-2 py-1 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
              •••
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setSelectedUser(user);
                  setNewRole(user.role);
                  setRoleDialogOpen(true);
                }}
              >
                역할 변경
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setDeactivateTarget(user);
                  setDeactivateOpen(true);
                }}
                disabled={!user.is_active}
                className="text-red-400"
              >
                비활성화
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="사용자 관리">
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          사용자 초대
        </Button>
      </PageHeader>

      <DataTable
        columns={columns}
        data={users as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="등록된 사용자가 없습니다."
      />

      {/* 초대 Dialog */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) resetInviteForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>사용자 초대</DialogTitle>
          </DialogHeader>

          {!tempPassword ? (
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">
                  이메일 <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@rebornlabs.kr"
                  required
                  disabled={inviteLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-name">
                  이름 <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="invite-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="홍길동"
                  required
                  disabled={inviteLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">역할</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as InviteRole)}
                  disabled={inviteLoading}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">직원</SelectItem>
                    <SelectItem value="dealer">딜러</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-phone">전화번호 (선택)</Label>
                <Input
                  id="invite-phone"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  placeholder="010-0000-0000"
                  disabled={inviteLoading}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInviteOpen(false)}
                  disabled={inviteLoading}
                >
                  취소
                </Button>
                <Button type="submit" disabled={inviteLoading}>
                  {inviteLoading ? "초대 중..." : "초대"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                초대가 완료되었습니다. 아래 임시 비밀번호를 전달해주세요.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
                <code className="flex-1 font-mono text-sm">{tempPassword}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleCopyPassword}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                최초 로그인 시 비밀번호 변경을 요청받습니다.
              </p>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setInviteOpen(false);
                    resetInviteForm();
                  }}
                >
                  완료
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 역할 변경 Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>역할 변경</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedUser?.name}
              </span>{" "}
              의 역할을 변경합니다.
            </p>
            <div className="space-y-2">
              <Label>새 역할</Label>
              <Select
                value={newRole}
                onValueChange={(v) => setNewRole(v as UserRole)}
                disabled={roleLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">경영진</SelectItem>
                  <SelectItem value="staff">직원</SelectItem>
                  <SelectItem value="dealer">딜러</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRoleDialogOpen(false)}
                disabled={roleLoading}
              >
                취소
              </Button>
              <Button onClick={handleRoleChange} disabled={roleLoading}>
                {roleLoading ? "변경 중..." : "변경"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 비활성화 확인 Dialog */}
      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="사용자 비활성화"
        description={`이 사용자를 비활성화하시겠습니까? 즉시 로그아웃됩니다.`}
        confirmLabel="비활성화"
        variant="destructive"
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
