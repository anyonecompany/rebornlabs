import { Badge } from "@/components/ui/badge";
import type { VehicleStatus, ConsultationStatus, UserRole } from "@/types/database";

const vehicleStatusMap: Record<
  VehicleStatus | "rejected",
  { label: string; className: string }
> = {
  available: {
    label: "출고가능",
    className:
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  consulting: {
    label: "상담중",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  sold: {
    label: "판매완료",
    className: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  },
  rejected: {
    label: "거부",
    className: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  vehicle_waiting: {
    label: "차량대기",
    className:
      "bg-violet-300/10 text-violet-300 border-violet-300/20",
  },
  deleted: {
    label: "삭제됨",
    className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
};

const consultationStatusMap: Record<
  ConsultationStatus,
  { label: string; className: string }
> = {
  new: {
    label: "신규",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  consulting: {
    label: "상담중",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  vehicle_waiting: {
    label: "차량대기",
    className:
      "bg-violet-300/10 text-violet-300 border-violet-300/20",
  },
  rejected: {
    label: "거부",
    className: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  sold: {
    label: "판매완료",
    className: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  },
};

const roleMap: Record<UserRole, { label: string; className: string }> = {
  admin: {
    label: "경영진",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  staff: {
    label: "직원",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  dealer: {
    label: "딜러",
    className:
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  pending: {
    label: "대기",
    className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
};

type StatusBadgeProps =
  | { type: "vehicle"; value: VehicleStatus | "rejected" }
  | { type: "consultation"; value: ConsultationStatus }
  | { type: "role"; value: UserRole };

/**
 * status ENUM 값을 색상 Badge로 변환합니다.
 */
export function StatusBadge({ type, value }: StatusBadgeProps) {
  let config: { label: string; className: string } | undefined;

  if (type === "vehicle") {
    config = vehicleStatusMap[value as VehicleStatus | "rejected"];
  } else if (type === "consultation") {
    config = consultationStatusMap[value as ConsultationStatus];
  } else {
    config = roleMap[value as UserRole];
  }

  if (!config) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {value}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={[
        "text-xs px-2 py-0.5 font-medium tracking-tight",
        config.className,
      ].join(" ")}
    >
      {config.label}
    </Badge>
  );
}
