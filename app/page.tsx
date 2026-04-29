import { headers } from "next/headers";
import { redirect } from "next/navigation";

import RebornLabsLanding from "./landing";

/**
 * 루트(/) 진입 분기.
 *
 * - 어드민 도메인(rebornlabs-admin.vercel.app 등) → /login
 * - 공개 도메인(rebornlabs.vercel.app, rebornlabs.co.kr 등) → 랜딩 페이지 노출
 *
 * 공개 도메인 진입한 외부 고객·매니저 추적링크 사용자는 어드민 로그인을
 * 보지 않고 곧바로 신청 가능한 랜딩을 본다.
 */
export default async function Page() {
  const h = await headers();
  const host = h.get("host") ?? "";

  // 어드민 도메인은 직접 로그인 페이지로
  if (host.includes("rebornlabs-admin")) {
    redirect("/login");
  }

  // 공개 도메인 (rebornlabs.vercel.app, 커스텀 도메인 등) → 랜딩
  return <RebornLabsLanding />;
}
