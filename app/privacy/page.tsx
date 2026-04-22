import Link from "next/link";

// TODO: 실제 법인명/사업자번호/주소 확정 시 아래 상수 갱신
const COMPANY_NAME = "리본랩스"; // 법인화 이후 "리본랩스 주식회사" 로 변경
const COMPANY_REG_NO = "[확인 필요]";
const COMPANY_ADDRESS =
  "서울특별시 성동구 아차산로7길 21, 4층 199호 (성수동2가)";
const COMPANY_REPRESENTATIVE = "심재윤";
const PRIVACY_OFFICER_EMAIL = "[확인 필요]";
const UPDATED_AT = "2026-04-22";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 md:py-16">
      <header className="flex flex-col gap-2 border-b border-[#c8bfa8]/15 pb-6">
        <Link
          href="/apply"
          className="text-[11px] tracking-[0.3em] text-[#c8bfa8]/65 hover:text-white"
        >
          ← 상담 신청으로 돌아가기
        </Link>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          개인정보처리방침
        </h1>
        <p className="text-xs text-[#c8bfa8]/60">최종 갱신: {UPDATED_AT}</p>
      </header>

      <article className="prose-invert mt-8 flex flex-col gap-8 text-sm leading-relaxed text-[#d4cbba]">
        <Section title="1. 개인정보의 수집 항목 및 방법">
          <p>
            {COMPANY_NAME}(이하 &ldquo;회사&rdquo;)는 상담 신청 및 차량
            안내 서비스를 제공하기 위해 아래와 같이 최소한의 개인정보를
            수집합니다.
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>
              <strong className="text-white">필수:</strong> 이름, 연락처
            </li>
            <li>
              <strong className="text-white">선택:</strong> 관심 차종, 보증금
              가능 금액, 희망 월 납입료, 문의사항
            </li>
            <li>
              <strong className="text-white">자동 수집:</strong> 접속 IP,
              접속 시각, 유입 경로(UTM 파라미터)
            </li>
          </ul>
          <p className="mt-3">
            수집 방법: 상담 신청 폼 제출 시 이용자가 직접 입력하는 방식과, 웹
            서비스 이용 중 자동으로 기록되는 방식.
          </p>
        </Section>

        <Section title="2. 개인정보의 이용 목적">
          <ul className="list-disc pl-5">
            <li>상담 요청에 대한 응대 및 차량 안내</li>
            <li>본인 확인 및 부정 이용 방지</li>
            <li>
              서비스 개선을 위한 통계 분석 (광고 유입 채널 효과 측정 포함)
            </li>
            <li>법령상 의무 이행 및 분쟁 대응</li>
          </ul>
        </Section>

        <Section title="3. 개인정보의 보유 및 이용 기간">
          <p>
            회사는 개인정보의 수집·이용 목적이 달성된 후에는 해당 정보를
            지체 없이 파기합니다. 다만 아래의 경우 관계 법령에 따라 일정
            기간 보관합니다.
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>상담 기록: 수집일로부터 3년 (전자상거래법)</li>
            <li>부정 이용 기록: 수집일로부터 1년</li>
            <li>
              계약 또는 청약철회 기록: 5년 (전자상거래 등에서의 소비자보호에
              관한 법률)
            </li>
          </ul>
        </Section>

        <Section title="4. 개인정보의 제3자 제공">
          <p>
            회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.
            다만, 아래의 경우에는 예외로 합니다.
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>이용자가 사전에 동의한 경우</li>
            <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
          </ul>
        </Section>

        <Section title="5. 개인정보처리 위탁">
          <p>
            원활한 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를
            위탁하고 있습니다.
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>클라우드 인프라: Supabase, Vercel (데이터 저장·전송)</li>
            <li>상담 응대: 협력 딜러사 (상담 단계에서만 제한적 공유)</li>
          </ul>
        </Section>

        <Section title="6. 이용자의 권리와 행사 방법">
          <p>
            이용자는 언제든지 본인의 개인정보에 대한 열람, 정정, 삭제,
            처리정지를 요청할 수 있습니다. 요청은 아래 개인정보 보호책임자
            연락처로 접수해 주시기 바랍니다.
          </p>
        </Section>

        <Section title="7. 개인정보의 안전성 확보 조치">
          <ul className="list-disc pl-5">
            <li>전송 구간 TLS 암호화</li>
            <li>접근 권한 최소화 및 관리자 접근 통제</li>
            <li>개인정보 처리시스템 접속 기록 보관</li>
          </ul>
        </Section>

        <Section title="8. 개인정보 보호책임자">
          <ul className="list-disc pl-5">
            <li>상호: {COMPANY_NAME}</li>
            <li>대표자: {COMPANY_REPRESENTATIVE}</li>
            <li>사업자등록번호: {COMPANY_REG_NO}</li>
            <li>주소: {COMPANY_ADDRESS}</li>
            <li>개인정보 문의: {PRIVACY_OFFICER_EMAIL}</li>
          </ul>
        </Section>

        <Section title="9. 고지의 의무">
          <p>
            본 개인정보처리방침은 법령·정책·보안기술 변경에 따라 내용이
            추가·삭제 및 수정될 수 있으며, 변경 시 최소 7일 전 본 페이지를
            통해 고지합니다.
          </p>
        </Section>

        <p className="pt-4 text-xs text-[#c8bfa8]/50">
          본 방침은 {UPDATED_AT} 부터 시행됩니다.
        </p>
      </article>

      <footer className="mt-16 border-t border-[#c8bfa8]/10 pt-6 text-xs text-[#c8bfa8]/40">
        © {new Date().getFullYear()} REBORN LABS
      </footer>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold tracking-tight text-white">
        {title}
      </h2>
      <div className="text-[13.5px] text-[#c8bfa8]/75 md:text-sm">
        {children}
      </div>
    </section>
  );
}
