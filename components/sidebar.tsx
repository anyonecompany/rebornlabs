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
  Share2,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { UserRole } from "@/types/database";

interface SidebarUser {
  name: string;
  role: UserRole;
  email: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const ADMIN_MENU: NavItem[] = [
  { label: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { label: "차량 관리", href: "/vehicles", icon: Car },
  { label: "차량 모델 관리", href: "/vehicle-models", icon: GalleryVerticalEnd },
  { label: "상담 관리", href: "/consultations", icon: MessageSquare },
  { label: "판매 관리", href: "/sales", icon: CreditCard },
  { label: "견적서 관리", href: "/quotes", icon: FileText },
  { label: "공유 링크", href: "/share-links", icon: Share2 },
  { label: "정산", href: "/settlements", icon: Calculator },
  { label: "지출결의", href: "/expenses", icon: Receipt },
  { label: "문서함", href: "/documents", icon: FolderOpen },
  { label: "사용자 관리", href: "/users", icon: Users },
  { label: "조직 관리", href: "/team-structure", icon: Network },
  { label: "감사 로그", href: "/audit-logs", icon: Shield },
];

const STAFF_MENU: NavItem[] = ADMIN_MENU.filter(
  (item) =>
    item.href !== "/users" &&
    item.href !== "/team-structure" &&
    item.href !== "/audit-logs",
);

// director / team_leader — 조직 데이터 + 정산 조회. 경영 전용 기능(지출/문서/사용자/조직/감사/차량모델) 제외.
const MANAGER_MENU: NavItem[] = [
  { label: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { label: "차량 관리", href: "/vehicles", icon: Car },
  { label: "상담 관리", href: "/consultations", icon: MessageSquare },
  { label: "판매 관리", href: "/sales", icon: CreditCard },
  { label: "견적서 관리", href: "/quotes", icon: FileText },
  { label: "정산", href: "/settlements", icon: Calculator },
];

const DEALER_MENU: NavItem[] = [
  { label: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { label: "차량 목록", href: "/vehicles", icon: Car },
  { label: "내 상담", href: "/consultations", icon: MessageSquare },
  { label: "내 판매", href: "/sales", icon: CreditCard },
  { label: "내 견적서", href: "/quotes", icon: FileText },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "관리자",
  director: "본부장",
  team_leader: "팀장",
  staff: "스태프",
  dealer: "딜러",
  pending: "대기중",
};

function getMenuItems(role: UserRole): NavItem[] {
  if (role === "admin") return ADMIN_MENU;
  if (role === "staff") return STAFF_MENU;
  if (role === "director" || role === "team_leader") return MANAGER_MENU;
  return DEALER_MENU;
}

function getInitials(name: string): string {
  return name.slice(0, 2);
}

interface NavListProps {
  items: NavItem[];
  currentPath: string;
  onNavigate?: () => void;
}

function NavList({ items, currentPath, onNavigate }: NavListProps) {
  return (
    <nav className="flex-1 px-2 py-2 space-y-0.5">
      {items.map((item) => {
        const isActive =
          currentPath === item.href || currentPath.startsWith(item.href + "/");
        const Icon = item.icon;
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
      })}
    </nav>
  );
}

interface SidebarContentProps {
  user: SidebarUser;
  currentPath: string;
  onNavigate?: () => void;
  onLogout: () => void;
}

function SidebarContent({
  user,
  currentPath,
  onNavigate,
  onLogout,
}: SidebarContentProps) {
  const menuItems = getMenuItems(user.role);

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="px-5 py-5">
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
          REBORN LABS
        </span>
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
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex w-[260px] shrink-0 h-screen flex-col border-r border-sidebar-border">
        <SidebarContent
          user={user}
          currentPath={pathname}
          onLogout={handleLogout}
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
        <span className="ml-3 text-sm font-bold tracking-tight">REBORN LABS</span>
      </div>
    </>
  );
}
