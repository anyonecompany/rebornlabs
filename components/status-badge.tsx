import { Badge } from "@/components/ui/badge";
import type { VehicleStatus, ConsultationStatus, UserRole } from "@/types/database";

const vehicleStatusMap: Record<
  VehicleStatus | "rejected",
  { label: string; className: string }
> = {
  available: {
    label: "출고가능",
    className: "bg-green-600 text-white border-green-600",
  },
  consulting: {
    label: "상담중",
    className: "bg-orange-600 text-white border-orange-600",
  },
  sold: {
    label: "판매완료",
    className: "bg-purple-600 text-white border-purple-600",
  },
  rejected: {
    label: "거부",
    className: "bg-red-600 text-white border-red-600",
  },
  vehicle_waiting: {
    label: "차량대기",
    className: "bg-violet-500 text-white border-violet-500",
  },
  deleted: {
    label: "삭제됨",
    className: "bg-zinc-600 text-white border-zinc-600",
  },
};

const consultationStatusMap: Record<
  ConsultationStatus,
  { label: string; className: string }
> = {
  new: {
    label: "신규",
    className: "bg-blue-600 text-white border-blue-600",
  },
  consulting: {
    label: "상담중",
    className: "bg-orange-600 text-white border-orange-600",
  },
  vehicle_waiting: {
    label: "차량대기",
    className: "bg-violet-500 text-white border-violet-500",
  },
  rejected: {
    label: "거부",
    className: "bg-red-600 text-white border-red-600",
  },
  sold: {
    label: "판매완료",
    className: "bg-purple-600 text-white border-purple-600",
  },
};

const roleMap: Record<UserRole, { label: string; className: string }> = {
  admin: {
    label: "경영진",
    className: "bg-amber-600 text-white border-amber-600",
  },
  staff: {
    label: "직원",
    className: "bg-blue-600 text-white border-blue-600",
  },
  dealer: {
    label: "딜러",
    className: "bg-green-600 text-white border-green-600",
  },
  pending: {
    label: "대기",
    className: "bg-zinc-500 text-white border-zinc-500",
  },
};

type StatusBadgeProps =
  | { type: "vehicle"; value: VehicleStatus | "rejected" }
  | { type: "consultation"; value: ConsultationStatus }
  | { type: "role"; value: UserRole };

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
