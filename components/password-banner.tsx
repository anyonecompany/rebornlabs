import Link from "next/link";

export function PasswordBanner() {
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-sm text-amber-400 flex items-center justify-between">
      <span>⚠️ 임시 비밀번호를 사용 중입니다. 비밀번호를 변경해주세요.</span>
      <Link href="/profile" className="underline font-medium">
        변경하기
      </Link>
    </div>
  );
}
