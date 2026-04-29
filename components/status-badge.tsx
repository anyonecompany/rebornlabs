import {
  Bell,
  Car,
  CheckCircle,
  MessageSquare,
  Shield,
  ShoppingBag,
  Timer,
  Trash2,
  UserCheck,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VehicleStatus, ConsultationStatus, UserRole } from "@/types/database";

const vehicleStatusMap: Record<
  VehicleStatus | "rejected",
  { label: string; className: string; Icon: React.ElementType }
> = {
  available: {
    label: "출고가능",
    className: "bg-green-600 text-white border-green-600",
    Icon: CheckCircle,
  },
  consulting: {
    label: "상담중",
    className: "bg-orange-600 text-white border-orange-600",
    Icon: MessageSquare,
  },
  sold: {
    label: "판매완료",
    className: "bg-purple-600 text-white border-purple-600",
    Icon: ShoppingBag,
  },
  rejected: {
    label: "거부",
    className: "bg-red-600 text-white border-red-600",
    Icon: XCircle,
  },
  deleted: {
    label: "삭제됨",
    className: "bg-zinc-600 text-white border-zinc-600",
    Icon: Trash2,
  },
};

const consultationStatusMap: Record<
  ConsultationStatus,
  { label: string; className: string; Icon: React.ElementType }
> = {
  new: {
    label: "신규",
    className: "bg-blue-600 text-white border-blue-600",
    Icon: Bell,
  },
  consulting: {
    label: "상담중",
    className: "bg-orange-600 text-white border-orange-600",
    Icon: MessageSquare,
  },
  vehicle_waiting: {
    label: "차량대기",
    className: "bg-violet-500 text-white border-violet-500",
    Icon: Car,
  },
  rejected: {
    label: "거부",
    className: "bg-red-600 text-white border-red-600",
    Icon: XCircle,
  },
  sold: {
    label: "판매완료",
    className: "bg-purple-600 text-white border-purple-600",
    Icon: ShoppingBag,
  },
};

const roleMap: Record<UserRole, { label: string; className: string; Icon: React.ElementType }> = {
  admin: {
    label: "경영진",
    className: "bg-amber-600 text-white border-amber-600",
    Icon: Shield,
  },
  director: {
    label: "본부장",
    className: "bg-rose-600 text-white border-rose-600",
    Icon: UserCheck,
  },
  team_leader: {
    label: "팀장",
    className: "bg-indigo-600 text-white border-indigo-600",
    Icon: Users,
  },
  staff: {
    label: "직원",
    className: "bg-blue-600 text-white border-blue-600",
    Icon: UserCog,
  },
  dealer: {
    label: "딜러",
    className: "bg-green-600 text-white border-green-600",
    Icon: Car,
  },
  pending: {
    label: "대기",
    className: "bg-zinc-500 text-white border-zinc-500",
    Icon: Timer,
  },
};

type StatusBadgeProps =
  | { type: "vehicle"; value: VehicleStatus | "rejected" }
  | { type: "consultation"; value: ConsultationStatus }
  | { type: "role"; value: UserRole };

export function StatusBadge({ type, value }: StatusBadgeProps) {
  let config: { label: string; className: string; Icon: React.ElementType } | undefined;

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

  const { Icon } = config;

  return (
    <Badge
      variant="outline"
      className={[
        "inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium tracking-tight",
        config.className,
      ].join(" ")}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}
