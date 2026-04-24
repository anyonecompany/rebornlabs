"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Copy,
  Check,
  UserPlus,
  Plus,
  Globe,
  LayoutGrid,
  MessageSquareText,
  ExternalLink,
} from "lucide-react";
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

type InviteRole = "director" | "team_leader" | "staff" | "dealer";

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

type LinkKind = "landing" | "cars" | "apply";

const LINK_KINDS: {
  key: LinkKind;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    key: "landing",
    label: "고객 홈 랜딩",
    shortLabel: "홈",
    description: "SNS 광고·바이오에 붙일 기본 링크",
    icon: Globe,
  },
  {
    key: "cars",
    label: "차량 카탈로그",
    shortLabel: "카탈로그",
    description: "재고 목록을 바로 보여줄 때",
    icon: LayoutGrid,
  },
  {
    key: "apply",
    label: "상담 신청 폼",
    shortLabel: "상담폼",
    description: "상담 신청 폼을 바로 열 때",
    icon: MessageSquareText,
  },
];

function MarketingCompaniesSection() {
  const [companies, setCompanies] = useState<MarketingCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  // 어드민 도메인(/cars, /apply 용) 은 클라이언트 측 origin 으로 확정.
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const buildUrl = useCallback(
    (kind: LinkKind, companyName: string): string => {
      const ref = encodeURIComponent(companyName);
      if (kind === "landing") return `${LANDING_URL}?ref=${ref}`;
      if (kind === "cars") return `${origin}/cars?ref=${ref}`;
      return `${origin}/apply?ref=${ref}`;
    },
    [origin],
  );

  const handleCopy = useCallback(
    async (kind: LinkKind, company: MarketingCompanyRow) => {
      const meta = LINK_KINDS.find((k) => k.key === kind);
      if (!meta) return;
      const url = buildUrl(kind, company.name);
      try {
        await navigator.clipboard.writeText(url);
        setCopiedKey(`${company.id}:${kind}`);
        toast.success(`${company.name} · ${meta.label} 링크가 복사되었습니다.`);
        setTimeout(() => setCopiedKey(null), 2000);
      } catch {
        toast.error("클립보드 복사에 실패했습니다.");
      }
    },
    [buildUrl],
  );

  const handleOpen = useCallback(
    (kind: LinkKind, company: MarketingCompanyRow) => {
      const url = buildUrl(kind, company.name);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    [buildUrl],
  );

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

  const activeCount = companies.filter((c) => c.is_active).length;

  return (
    <Card className="mt-8">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">마케팅 업체 · 공유 링크</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              SNS·광고용 업체를 등록하고 업체별 공유 URL 을 생성합니다. 고객이 이
              링크로 상담 신청하면 어느 업체에서 왔는지 자동으로 기록됩니다.
            </p>
          </div>
          {!loading && companies.length > 0 && (
            <div className="text-xs text-muted-foreground">
              전체 <span className="text-foreground font-medium">{companies.length}</span>
              {" / "}활성 <span className="text-emerald-400 font-medium">{activeCount}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 업체 추가 */}
        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3"
        >
          <Input
            placeholder="새 업체명 (예: 인스타그램, 네이버, 카카오)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={adding}
            maxLength={50}
            className="flex-1 min-w-[200px] bg-background"
          />
          <Button type="submit" size="sm" disabled={adding || !newName.trim()}>
            <Plus className="h-4 w-4 mr-1.5" />
            {adding ? "추가 중..." : "업체 추가"}
          </Button>
        </form>

        {/* 업체 목록 */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-md bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : companies.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/20 py-10 text-center">
            <Globe className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">등록된 업체가 없습니다</p>
            <p className="text-xs text-muted-foreground">
              위에서 첫 업체를 추가하면 공유 링크 3종이 자동 생성됩니다.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    업체
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    상태
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    공유 링크 · 클릭하면 복사
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr
                    key={company.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium">{company.name}</div>
                      <div className="text-xs text-muted-foreground">
                        ref = {company.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
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
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {LINK_KINDS.map((kind) => {
                          const Icon = kind.icon;
                          const isCopied =
                            copiedKey === `${company.id}:${kind.key}`;
                          return (
                            <div
                              key={kind.key}
                              className="inline-flex items-center rounded-md border border-border bg-background"
                            >
                              <button
                                type="button"
                                onClick={() => handleCopy(kind.key, company)}
                                title={`${kind.label} 링크 복사 — ${kind.description}`}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-muted transition-colors rounded-l-md"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-400" />
                                    <span className="text-emerald-400">복사됨</span>
                                  </>
                                ) : (
                                  <>
                                    <Icon className="h-3 w-3" />
                                    <span>{kind.shortLabel}</span>
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpen(kind.key, company)}
                                title={`${kind.label} 새 창에서 열기`}
                                className="flex items-center px-1.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-l border-border rounded-r-md"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
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

  // 비활성화/활성화 토글
  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    const willDeactivate = deactivateTarget.is_active;
    const res = await apiFetch(`/api/users/${deactivateTarget.id}/profile`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !willDeactivate }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "상태 변경에 실패했습니다.");
      return;
    }
    toast.success(willDeactivate ? "사용자가 비활성화되었습니다." : "사용자가 활성화되었습니다.");
    setDeactivateOpen(false);
    await fetchUsers();
  };

  // 사용자 삭제
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/users/${deleteTarget.id}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      toast.success("사용자가 삭제되었습니다.");
      setDeleteOpen(false);
      await fetchUsers();
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
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
              >
                {user.is_active ? "비활성화" : "활성화"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setDeleteTarget(user);
                  setDeleteOpen(true);
                }}
                className="text-red-400"
              >
                삭제
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
                    <SelectItem value="director">본부장</SelectItem>
                    <SelectItem value="team_leader">팀장</SelectItem>
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
                  <SelectItem value="director">본부장</SelectItem>
                  <SelectItem value="team_leader">팀장</SelectItem>
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
        title={deactivateTarget?.is_active ? "사용자 비활성화" : "사용자 활성화"}
        description={deactivateTarget?.is_active
          ? "이 사용자를 비활성화하시겠습니까? 즉시 로그아웃됩니다."
          : "이 사용자를 다시 활성화하시겠습니까?"}
        confirmLabel={deactivateTarget?.is_active ? "비활성화" : "활성화"}
        variant="destructive"
        onConfirm={handleDeactivate}
      />

      {/* 사용자 삭제 Dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="사용자 삭제"
        description="정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
        confirmLabel={deleting ? "삭제 중..." : "삭제"}
        variant="destructive"
        onConfirm={handleDelete}
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
                  <SelectItem value="director">본부장</SelectItem>
                  <SelectItem value="team_leader">팀장</SelectItem>
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
