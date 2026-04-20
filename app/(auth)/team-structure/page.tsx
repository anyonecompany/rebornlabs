"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  ChevronRight,
  UserPlus,
  Unlink,
  Building2,
  Users as UsersIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiFetch } from "@/src/lib/api-client";
import { useUserRole } from "@/src/lib/use-user-role";
import {
  AssignDialog,
  type UserOption,
} from "@/src/components/team/assign-dialog";
import type { UserRole } from "@/types/database";

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

interface Assignment {
  id: string;
  userId: string;
  leaderId: string;
  leaderType: "team_leader" | "director";
  createdAt: string;
}

export default function TeamStructurePage() {
  const { role: currentRole } = useUserRole();
  const isAdmin = currentRole === "admin";

  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignLeaderType, setAssignLeaderType] = useState<
    "team_leader" | "director"
  >("team_leader");
  const [assignDefaultLeaderId, setAssignDefaultLeaderId] = useState<
    string | null
  >(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    assignmentId: string;
    userName: string;
    leaderName: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, assignmentsRes] = await Promise.all([
        apiFetch("/api/users"),
        apiFetch("/api/team-assignments"),
      ]);
      if (!usersRes.ok || !assignmentsRes.ok) {
        toast.error("조직 정보를 불러오지 못했습니다.");
        return;
      }
      const uData = await usersRes.json();
      const aData = await assignmentsRes.json();
      setUsers((uData.users ?? uData.data ?? []) as ProfileRow[]);
      setAssignments((aData.assignments ?? []) as Assignment[]);
    } catch {
      toast.error("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users],
  );

  const directors = useMemo(
    () => users.filter((u) => u.role === "director" && u.is_active),
    [users],
  );
  const teamLeaders = useMemo(
    () => users.filter((u) => u.role === "team_leader" && u.is_active),
    [users],
  );
  const dealers = useMemo(
    () => users.filter((u) => u.role === "dealer" && u.is_active),
    [users],
  );

  // assignments 인덱싱: leader_id → children user_ids
  const childrenOf = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const arr = map.get(a.leaderId) ?? [];
      arr.push(a);
      map.set(a.leaderId, arr);
    }
    return map;
  }, [assignments]);

  // 배치되지 않은 팀장/딜러
  const unassignedTeamLeaders = useMemo(
    () =>
      teamLeaders.filter(
        (tl) =>
          !assignments.some(
            (a) => a.userId === tl.id && a.leaderType === "director",
          ),
      ),
    [teamLeaders, assignments],
  );
  const unassignedDealers = useMemo(
    () =>
      dealers.filter(
        (d) =>
          !assignments.some(
            (a) => a.userId === d.id && a.leaderType === "team_leader",
          ),
      ),
    [dealers, assignments],
  );

  const openAssignDealer = (leaderId?: string | null) => {
    setAssignLeaderType("team_leader");
    setAssignDefaultLeaderId(leaderId ?? null);
    setAssignDialogOpen(true);
  };
  const openAssignTeamLeader = (directorId?: string | null) => {
    setAssignLeaderType("director");
    setAssignDefaultLeaderId(directorId ?? null);
    setAssignDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(
        `/api/team-assignments/${deleteTarget.assignmentId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "해제에 실패했습니다.");
        return;
      }
      toast.success("배치가 해제되었습니다.");
      fetchData();
    } catch {
      toast.error("해제 중 오류가 발생했습니다.");
    }
  };

  const assignOptions = useMemo<{
    userCandidates: UserOption[];
    leaderCandidates: UserOption[];
  }>(() => {
    if (assignLeaderType === "team_leader") {
      return {
        userCandidates: unassignedDealers.map(
          (u): UserOption => ({ id: u.id, name: u.name, role: u.role }),
        ),
        leaderCandidates: teamLeaders.map(
          (u): UserOption => ({ id: u.id, name: u.name, role: u.role }),
        ),
      };
    }
    return {
      userCandidates: unassignedTeamLeaders.map(
        (u): UserOption => ({ id: u.id, name: u.name, role: u.role }),
      ),
      leaderCandidates: directors.map(
        (u): UserOption => ({ id: u.id, name: u.name, role: u.role }),
      ),
    };
  }, [
    assignLeaderType,
    unassignedDealers,
    unassignedTeamLeaders,
    teamLeaders,
    directors,
  ]);

  if (loading) {
    return (
      <div>
        <PageHeader title="조직 관리" />
        <LoadingState variant="card" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="조직 관리">
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openAssignTeamLeader(null)}
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              팀장 배치
            </Button>
            <Button size="sm" onClick={() => openAssignDealer(null)}>
              <UserPlus className="h-4 w-4 mr-1.5" />
              딜러 배치
            </Button>
          </div>
        )}
      </PageHeader>

      {/* 본부장 → 팀장 → 딜러 트리 */}
      <section className="space-y-5">
        {directors.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            등록된 본부장이 없습니다. 사용자 관리에서 본부장 역할로 초대하세요.
          </div>
        )}

        {directors.map((director) => {
          const teamLeadersUnder = (childrenOf.get(director.id) ?? []).filter(
            (a) => a.leaderType === "director",
          );
          return (
            <div
              key={director.id}
              className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-rose-400" />
                  <div>
                    <p className="text-sm font-semibold">
                      {director.name}{" "}
                      <span className="text-xs text-rose-300 font-normal">
                        본부장
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {director.email}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAssignTeamLeader(director.id)}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                    팀장 추가
                  </Button>
                )}
              </div>

              <div className="ml-4 space-y-3 border-l-2 border-rose-500/20 pl-4">
                {teamLeadersUnder.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    산하 팀장 없음
                  </p>
                )}
                {teamLeadersUnder.map((ta) => {
                  const tl = userMap.get(ta.userId);
                  if (!tl) return null;
                  const dealersUnder = (childrenOf.get(tl.id) ?? []).filter(
                    (a) => a.leaderType === "team_leader",
                  );
                  return (
                    <div
                      key={ta.id}
                      className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <UsersIcon className="h-4 w-4 text-indigo-400" />
                          <div>
                            <p className="text-sm font-medium">
                              {tl.name}{" "}
                              <span className="text-[11px] text-indigo-300 font-normal">
                                팀장
                              </span>
                            </p>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAssignDealer(tl.id)}
                            >
                              <UserPlus className="h-3.5 w-3.5 mr-1" />
                              딜러
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-red-400"
                              onClick={() =>
                                setDeleteTarget({
                                  assignmentId: ta.id,
                                  userName: tl.name,
                                  leaderName: director.name,
                                })
                              }
                            >
                              <Unlink className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="ml-3 space-y-1 border-l border-indigo-500/20 pl-3">
                        {dealersUnder.length === 0 && (
                          <p className="text-[11px] text-muted-foreground italic">
                            산하 딜러 없음
                          </p>
                        )}
                        {dealersUnder.map((da) => {
                          const dealer = userMap.get(da.userId);
                          if (!dealer) return null;
                          return (
                            <div
                              key={da.id}
                              className="flex items-center justify-between gap-2 py-1"
                            >
                              <div className="flex items-center gap-1.5 text-sm">
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                <span>{dealer.name}</span>
                                <span className="text-[11px] text-muted-foreground">
                                  {dealer.email}
                                </span>
                              </div>
                              {isAdmin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-muted-foreground hover:text-red-400"
                                  onClick={() =>
                                    setDeleteTarget({
                                      assignmentId: da.id,
                                      userName: dealer.name,
                                      leaderName: tl.name,
                                    })
                                  }
                                >
                                  <Unlink className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* 미배치 팀장 */}
      {unassignedTeamLeaders.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold mb-3">
            미배치 팀장{" "}
            <span className="text-xs text-muted-foreground">
              ({unassignedTeamLeaders.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unassignedTeamLeaders.map((tl) => (
              <div
                key={tl.id}
                className="rounded-md border border-border p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm">{tl.name}</p>
                  <p className="text-[11px] text-muted-foreground">{tl.email}</p>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAssignTeamLeader(null)}
                  >
                    배치
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 미배치 딜러 */}
      {unassignedDealers.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold mb-3">
            미배치 딜러{" "}
            <span className="text-xs text-muted-foreground">
              ({unassignedDealers.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unassignedDealers.map((d) => (
              <div
                key={d.id}
                className="rounded-md border border-border p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">{d.email}</p>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAssignDealer(null)}
                  >
                    배치
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <AssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        leaderType={assignLeaderType}
        userCandidates={assignOptions.userCandidates}
        leaderCandidates={assignOptions.leaderCandidates}
        defaultLeaderId={assignDefaultLeaderId}
        onAssigned={fetchData}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="배치 해제"
        description={
          deleteTarget
            ? `${deleteTarget.userName} 을(를) ${deleteTarget.leaderName} 밑에서 해제합니다. 판매 기록은 그대로 유지됩니다.`
            : ""
        }
        confirmLabel="해제"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
