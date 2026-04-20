"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/src/lib/api-client";
import type { UserRole } from "@/types/database";

export interface UserOption {
  id: string;
  name: string;
  role: UserRole;
}

type LeaderType = "team_leader" | "director";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaderType: LeaderType;
  /** 배치 대상 후보 (팀장 배치면 dealer, 본부장 배치면 team_leader) */
  userCandidates: UserOption[];
  /** 상위 리더 후보 */
  leaderCandidates: UserOption[];
  /** 사전 선택 값 (해당 리더 밑에 배치) */
  defaultLeaderId?: string | null;
  onAssigned: () => void;
}

export function AssignDialog({
  open,
  onOpenChange,
  leaderType,
  userCandidates,
  leaderCandidates,
  defaultLeaderId,
  onAssigned,
}: Props) {
  const [userId, setUserId] = useState<string>("");
  const [leaderId, setLeaderId] = useState<string>(defaultLeaderId ?? "");
  const [submitting, setSubmitting] = useState(false);

  const title =
    leaderType === "team_leader" ? "팀장 밑에 딜러 배치" : "본부장 밑에 팀장 배치";
  const userLabel = leaderType === "team_leader" ? "배치할 딜러" : "배치할 팀장";
  const leaderLabel = leaderType === "team_leader" ? "팀장" : "본부장";

  const defaultLeader = useMemo(
    () =>
      defaultLeaderId && leaderCandidates.find((l) => l.id === defaultLeaderId)
        ? defaultLeaderId
        : "",
    [defaultLeaderId, leaderCandidates],
  );

  const handleSubmit = async () => {
    if (!userId || !leaderId) {
      toast.error("배치 대상과 상위 리더를 모두 선택해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/team-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, leaderId, leaderType }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "배치 생성에 실패했습니다.");
        return;
      }
      toast.success("배치가 생성되었습니다.");
      onAssigned();
      onOpenChange(false);
      setUserId("");
      setLeaderId(defaultLeader);
    } catch {
      toast.error("배치 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setUserId("");
      setLeaderId(defaultLeader);
    } else {
      setLeaderId(defaultLeader);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            중복 배치는 불가능합니다. 기존 배치가 있으면 먼저 해제해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label>{userLabel}</Label>
            <Select
              value={userId}
              onValueChange={(v) => setUserId(v)}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                {userCandidates.length === 0 && (
                  <SelectItem value="__empty" disabled>
                    후보 없음
                  </SelectItem>
                )}
                {userCandidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{leaderLabel}</Label>
            <Select
              value={leaderId}
              onValueChange={(v) => setLeaderId(v)}
              disabled={submitting || !!defaultLeaderId}
            >
              <SelectTrigger>
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                {leaderCandidates.length === 0 && (
                  <SelectItem value="__empty" disabled>
                    후보 없음
                  </SelectItem>
                )}
                {leaderCandidates.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "배치 중..." : "배치"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
