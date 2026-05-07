"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Car,
  MessageSquare,
  CreditCard,
  Calculator,
  Receipt,
  FolderOpen,
  Users,
  Shield,
  LogOut,
  Menu,
  FileText,
  Network,
  GalleryVerticalEnd,
  Tag,
  ExternalLink,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notification-bell";
import type { UserRole } from "@/types/database";
import { can, type Capability } from "@/lib/auth/capabilities";

interface SidebarUser {
  name: string;
  role: UserRole;
  email: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** capability — capabilities.ts SSOT의 메뉴 노출 권한 */
  capability: Capability;
  /** dealer 등 일부 역할에서 라벨이 다른 경우 — 예: "차량 관리" → "차량 목록" */
  dealerLabel?: string;
  /** true 면 새 탭으로 열고 외부 링크 아이콘 표시. (예: 고객 시점 공개 페이지) */
  external?: boolean;
  /** 메뉴 그룹 — 같은 group 끼리 모이고 첫 항목 위에 헤더 라벨 표시. */
  group?: string;
}

/**
 * 단일 메뉴 정의 — capability로 노출 여부 결정.
 *
 * 신규 메뉴 추가 시:
 *   1. 본 배열에 항목 추가
 *   2. lib/auth/capabilities.ts CAPABILITIES에 menu:* 매핑 추가
 *   3. proxy.ts PATH_CAPABILITY에 path → capability 매핑 추가
 *
 * 누락 시 컴파일러가 Capability 유니언으로 자동 감지.
 */
const ALL_MENU: NavItem[] = [
  { label: "대시보드", href: "/dashboard", icon: LayoutDashboard, capability: "menu:dashboard", group: "현황" },
  { label: "차량 관리", href: "/vehicles", icon: Car, capability: "menu:vehicles", dealerLabel: "차량 목록", group: "운영" },
  { label: "차량 모델 관리", href: "/vehicle-models", icon: GalleryVerticalEnd, capability: "menu:vehicle-models", group: "운영" },
  { label: "고객 가격 페이지", href: "/cars", icon: Tag, capability: "menu:cars-public", external: true, group: "운영" },
  { label: "상담 관리", href: "/consultations", icon: MessageSquare, capability: "menu:consultations", dealerLabel: "내 상담", group: "영업" },
  { label: "판매 관리", href: "/sales", icon: CreditCard, capability: "menu:sales", dealerLabel: "내 판매", group: "영업" },
  { label: "견적서 관리", href: "/quotes", icon: FileText, capability: "menu:quotes", dealerLabel: "내 견적서", group: "영업" },
  { label: "정산", href: "/settlements", icon: Calculator, capability: "menu:settlements", group: "재무" },
  { label: "지출결의", href: "/expenses", icon: Receipt, capability: "menu:expenses", group: "재무" },
  { label: "문서함", href: "/documents", icon: FolderOpen, capability: "menu:documents", group: "재무" },
  { label: "사용자 관리", href: "/users", icon: Users, capability: "menu:users", group: "관리" },
  { label: "조직 관리", href: "/team-structure", icon: Network, capability: "menu:team-structure", group: "관리" },
  { label: "감사 로그", href: "/audit-logs", icon: Shield, capability: "menu:audit-logs", group: "관리" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "관리자",
  director: "본부장",
  team_leader: "팀장",
  staff: "스태프",
  dealer: "딜러",
  pending: "대기중",
};

/**
 * capabilities.ts SSOT 기반 메뉴 필터링.
 *
 * - pending: 모든 capability false → 빈 배열 (proxy가 /unauthorized로 리다이렉트하므로 도달 X, 방어)
 * - 그 외 역할: can(role, item.capability) 통과 항목만
 * - dealer는 일부 라벨 변형 (dealerLabel)
 */
function getMenuItems(role: UserRole): NavItem[] {
  if (role === "pending") return [];
  const isDealer = role === "dealer";
  return ALL_MENU
    .filter((item) => can(role, item.capability))
    .map((item) =>
      isDealer && item.dealerLabel ? { ...item, label: item.dealerLabel } : item,
    );
}

function getInitials(name: string): string {
  return name.slice(0, 2);
}

interface NavListProps {
  items: NavItem[];
  currentPath: string;
  onNavigate?: () => void;
}

function renderNavItem(
  item: NavItem,
  currentPath: string,
  onNavigate?: () => void,
) {
  const Icon = item.icon;

  // 외부/새 탭 링크
  if (item.external) {
    return (
      <a
        key={item.href}
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground border-l-[3px] border-transparent"
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
      </a>
    );
  }

  const isActive =
    currentPath === item.href || currentPath.startsWith(item.href + "/");
  return (
    <Link
      key={item.href}
      href={item.href}
      onClick={onNavigate}
      className={[
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-[3px] border-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground border-l-[3px] border-transparent",
      ].join(" ")}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function NavList({ items, currentPath, onNavigate }: NavListProps) {
  // group 별로 묶어 헤더 + 항목 렌더. group 미지정 항목은 그룹 헤더 없이 평평하게.
  const groups: { name: string | null; items: NavItem[] }[] = [];
  for (const item of items) {
    const groupName = item.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.name === groupName) {
      last.items.push(item);
    } else {
      groups.push({ name: groupName, items: [item] });
    }
  }

  return (
    <nav className="flex-1 px-2 py-2 space-y-3 overflow-y-auto">
      {groups.map((g, idx) => (
        <div key={g.name ?? `__${idx}`} className="space-y-0.5">
          {g.name && (
            <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              {g.name}
            </p>
          )}
          {g.items.map((item) => renderNavItem(item, currentPath, onNavigate))}
        </div>
      ))}
    </nav>
  );
}

interface SidebarContentProps {
  user: SidebarUser;
  currentPath: string;
  onNavigate?: () => void;
  onLogout: () => void;
  /** 데스크톱 사이드바에서만 종을 표시. 모바일은 별도 fixed 헤더의 종을 사용. */
  showBell?: boolean;
}

function SidebarContent({
  user,
  currentPath,
  onNavigate,
  onLogout,
  showBell = false,
}: SidebarContentProps) {
  const menuItems = getMenuItems(user.role);

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="px-5 py-5 flex items-center justify-between gap-2">
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
          REBORN LABS
        </span>
        {showBell && <NotificationBell role={user.role} />}
      </div>

      <Separator className="bg-sidebar-border" />

      <NavList items={menuItems} currentPath={currentPath} onNavigate={onNavigate} />

      <Separator className="bg-sidebar-border mt-auto" />

      <div className="px-4 py-3 flex items-center gap-3">
        <Link href="/profile" className="flex items-center gap-3 flex-1 min-w-0 rounded-md hover:bg-sidebar-accent transition-colors px-1 py-1">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs font-medium">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user.name}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {ROLE_LABELS[user.role]}
            </p>
          </div>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={onLogout}
          className="w-7 h-7 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          title="로그아웃"
          aria-label="로그아웃"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  /** same-origin path 만 허용. 외부 URL / protocol-relative 거부. */
  function sanitizeReturnUrl(raw: string): string {
    if (!raw.startsWith("/")) return "/dashboard";
    if (raw.startsWith("//")) return "/dashboard"; // protocol-relative
    return raw;
  }

  const handleLogout = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await supabase.auth.signOut();
    const safeReturn = sanitizeReturnUrl(pathname);
    router.push(`/login?returnUrl=${encodeURIComponent(safeReturn)}`);
  };

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex w-[260px] shrink-0 h-dvh flex-col border-r border-sidebar-border">
        <SidebarContent
          user={user}
          currentPath={pathname}
          onLogout={handleLogout}
          showBell
        />
      </aside>

      {/* 모바일 햄버거 + Sheet */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center h-14 px-4 border-b border-border bg-background">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" className="w-8 h-8">
                <Menu className="w-5 h-5" />
              </Button>
            }
          />
          <SheetContent side="left" className="p-0 w-[260px] bg-sidebar border-sidebar-border">
            <SidebarContent
              user={user}
              currentPath={pathname}
              onNavigate={() => setSheetOpen(false)}
              onLogout={handleLogout}
            />
          </SheetContent>
        </Sheet>
        <span className="ml-3 mr-2 text-sm font-bold tracking-tight">REBORN LABS</span>
        {/* 좌측 그룹 — 알림 종 (우측 PageHeader 액션과 충돌 방지) */}
        <NotificationBell role={user.role} />
      </div>
    </>
  );
}
