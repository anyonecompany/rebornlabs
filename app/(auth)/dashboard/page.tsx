import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, MessageSquare, TrendingUp, Users } from "lucide-react";

const placeholderCards = [
  { label: "총 차량", icon: Car },
  { label: "진행중 상담", icon: MessageSquare },
  { label: "이번 달 판매", icon: TrendingUp },
  { label: "활성 딜러", icon: Users },
];

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="대시보드"
        description="리본랩스 운영 현황을 한눈에 확인합니다."
      />

      {/* Placeholder 통계 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {placeholderCards.map(({ label, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">—</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Coming soon 카드 */}
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">
            대시보드 기능은 다음 Phase에서 추가됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
