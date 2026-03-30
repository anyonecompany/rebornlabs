export default function AuthLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* PageHeader 스켈레톤 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-9 w-28 bg-muted rounded" />
      </div>

      {/* 카드 스켈레톤 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-lg" />
        ))}
      </div>

      {/* 테이블 스켈레톤 */}
      <div className="space-y-2">
        <div className="h-10 bg-muted rounded" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-muted/60 rounded" />
        ))}
      </div>
    </div>
  );
}
