"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Copy, Check, UserPlus, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
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

interface MarketingCompanyRow {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 마케팅업체 관리 섹션
// ---------------------------------------------------------------------------

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? "https://rebornlabs.vercel.app";

function MarketingCompaniesSection() {
  const [companies, setCompanies] = useState<MarketingCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLink = (company: MarketingCompanyRow) => {
    const url = `${LANDING_URL}?ref=${encodeURIComponent(company.name)}`;
    navigator.clipboard.writeText(url);
    setCopiedId(company.id);
    toast.success("UTM 링크가 복사되었습니다.");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/marketing-companies");
      if (!res.ok) return;
      const data = await res.json();
      setCompanies(data.data ?? []);
    } catch {
      // 조용히 처리
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("업체명을 입력해주세요.");
      return;
    }
    setAdding(true);
    try {
      const res = await apiFetch("/api/marketing-companies", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "업체 추가에 실패했습니다.");
        return;
      }
      toast.success("업체가 추가되었습니다.");
      setNewName("");
      await fetchCompanies();
    } catch {
      toast.error("업체 추가 중 오류가 발생했습니다.");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (company: MarketingCompanyRow) => {
    setTogglingId(company.id);
    try {
      const res = await apiFetch(`/api/marketing-companies/${company.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !company.is_active }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "상태 변경에 실패했습니다.");
        return;
      }
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === company.id ? { ...c, is_active: !c.is_active } : c,
        ),
      );
    } catch {
      toast.error("상태 변경 중 오류가 발생했습니다.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-base">마케팅업체 관리</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 추가 폼 */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            placeholder="업체명 입력"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={adding}
            className="flex-1 max-w-xs"
          />
          <Button type="submit" size="sm" disabled={adding}>
            <Plus className="h-4 w-4 mr-1.5" />
            {adding ? "추가 중..." : "추가"}
          </Button>
        </form>

        {/* 업체 목록 */}
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            등록된 마케팅업체가 없습니다.
          </p>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    업체명
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    상태
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    UTM 링크
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr
                    key={company.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{company.name}</td>
                    <td className="px-4 py-3">
                      {company.is_active ? (
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
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 gap-1"
                        onClick={() => handleCopyLink(company)}
                      >
                        {copiedId === company.id ? (
                          <><Check className="h-3 w-3 text-emerald-400" /> 복사됨</>
                        ) : (
                          <><Copy className="h-3 w-3" /> 링크 복사</>
                        )}
                      </Button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleToggleActive(company)}
                        disabled={togglingId === company.id}
                      >
                        {togglingId === company.id
                          ? "처리 중..."
                          : company.is_active
                            ? "비활성화"
                            : "활성화"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { role: currentUserRole } = useUserRole();
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

  // 편집 Dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("staff");
  const [editActive, setEditActive] = useState(true);
  const [editLoading, setEditLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/users");
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
      const res = await apiFetch("/api/users/invite", {
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
      const res = await apiFetch(`/api/users/${selectedUser.id}/role`, {
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

  // 편집 모달 열기
  const openEditDialog = (user: UserRow) => {
    setEditUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditActive(user.is_active);
    setEditOpen(true);
  };

  // 편집 제출
  const handleEdit = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      // 역할 변경
      if (editRole !== editUser.role) {
        const roleRes = await apiFetch(`/api/users/${editUser.id}/role`, {
          method: "PATCH",
          body: JSON.stringify({ role: editRole }),
        });
        if (!roleRes.ok) {
          const d = await roleRes.json();
          toast.error(d.error ?? "역할 변경에 실패했습니다.");
          return;
        }
      }
      // 이름 변경 (service_role API 필요 — 간단히 프로필 PATCH API 활용)
      if (editName !== editUser.name || editActive !== editUser.is_active) {
        const profileRes = await apiFetch(`/api/users/${editUser.id}/profile`, {
          method: "PATCH",
          body: JSON.stringify({ name: editName, is_active: editActive }),
        });
        if (!profileRes.ok) {
          const d = await profileRes.json();
          toast.error(d.error ?? "정보 수정에 실패했습니다.");
          return;
        }
      }
      toast.success("사용자 정보가 수정되었습니다.");
      setEditOpen(false);
      await fetchUsers();
    } catch {
      toast.error("수정 중 오류가 발생했습니다.");
    } finally {
      setEditLoading(false);
    }
  };

  // 비활성화 제출
  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    const res = await apiFetch(`/api/users/${deactivateTarget.id}/deactivate`, {
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
              <DropdownMenuItem onClick={() => openEditDialog(user)}>
                정보 수정
              </DropdownMenuItem>
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

      {/* 마케팅업체 관리 (admin만) */}
      {currentUserRole === "admin" && <MarketingCompaniesSection />}

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

      {/* 정보 수정 Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>사용자 정보 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>이메일</Label>
              <Input value={editEmail} disabled className="opacity-60" />
            </div>
            <div className="space-y-2">
              <Label>이름</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={editLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>역할</Label>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as UserRole)}
                disabled={editLoading}
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
            <div className="flex items-center gap-2">
              <Label>활성 상태</Label>
              <button
                type="button"
                onClick={() => setEditActive((p) => !p)}
                disabled={editLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editActive ? "bg-emerald-500" : "bg-zinc-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editActive ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-muted-foreground">{editActive ? "활성" : "비활성"}</span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editLoading}>
                취소
              </Button>
              <Button onClick={handleEdit} disabled={editLoading}>
                {editLoading ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
