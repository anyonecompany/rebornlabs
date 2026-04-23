/**
 * 수당 자동 배분 계산기 (조직 Phase 3).
 *
 * 순수 함수. 판매 1건의 메타데이터 + 조직 관계를 입력받아
 * commissions 테이블에 insert할 row 리스트를 반환한다.
 *
 * 6케이스 (DB/개인 × dealer/team_leader/director) 전부 건당 20만원 통일
 * (리본랩스 + 대표 결정, 2026-04-23).
 *
 * 상위자(team_leader, director)가 없으면 해당 레코드는 생성하지 않는다.
 */

export type CommissionRecipientRole = "dealer" | "team_leader" | "director";

export type CommissionType =
  | "direct_sale" // 본인 판매분
  | "team_leader_override" // 산하 딜러 판매에 대한 팀장 수당
  | "director_override"; // 산하 판매에 대한 본부장 수당

export type CaseType =
  | "1_db_dealer"
  | "2_db_team_leader"
  | "3_db_director"
  | "4_personal_dealer"
  | "5_personal_team_leader"
  | "6_personal_director";

export interface CommissionInput {
  sale_id: string;
  is_db_provided: boolean;
  /** sales.dealer_id — 실제 판매 담당자 */
  dealer_id: string;
  /** sales.dealer_id 의 역할 (profiles.role) */
  dealer_role: CommissionRecipientRole;
  /**
   * 상위 팀장 id.
   * - dealer 판매: dealer의 팀장 (team_assignments leader_type='team_leader')
   * - team_leader/director 판매: null (의미 없음)
   */
  team_leader_id: string | null;
  /**
   * 상위 본부장 id.
   * - dealer 판매: 팀장의 본부장 (2단계)
   * - team_leader 판매: 팀장의 본부장
   * - director 판매: null
   */
  director_id: string | null;
}

export interface CommissionRecord {
  sale_id: string;
  recipient_id: string;
  recipient_role: CommissionRecipientRole;
  amount: number;
  commission_type: CommissionType;
  case_type: CaseType;
}

/** 대표 결정: 6케이스 전부 건당 20만원 통일 (2026-04-23). */
export const COMMISSION_AMOUNT = 200_000;

/** 6케이스 판정: DB/개인 × dealer/team_leader/director. */
export function determineCaseType(
  isDbProvided: boolean,
  role: CommissionRecipientRole,
): CaseType {
  if (isDbProvided) {
    if (role === "dealer") return "1_db_dealer";
    if (role === "team_leader") return "2_db_team_leader";
    return "3_db_director";
  }
  if (role === "dealer") return "4_personal_dealer";
  if (role === "team_leader") return "5_personal_team_leader";
  return "6_personal_director";
}

/**
 * 수당 레코드 리스트 계산.
 *
 * - 케이스 1/4 (dealer 판매): dealer + (팀장?) + (본부장?)
 * - 케이스 2/5 (team_leader 직판매): team_leader 본인 + (본부장?)
 * - 케이스 3/6 (director 직판매): director 본인
 *
 * "?" 표시는 상위자가 없으면 해당 레코드 건너뜀.
 */
export function calculateCommissions(
  input: CommissionInput,
): CommissionRecord[] {
  const {
    sale_id,
    is_db_provided,
    dealer_id,
    dealer_role,
    team_leader_id,
    director_id,
  } = input;

  const case_type = determineCaseType(is_db_provided, dealer_role);
  const records: CommissionRecord[] = [];

  if (dealer_role === "dealer") {
    records.push({
      sale_id,
      recipient_id: dealer_id,
      recipient_role: "dealer",
      amount: COMMISSION_AMOUNT,
      commission_type: "direct_sale",
      case_type,
    });
    if (team_leader_id) {
      records.push({
        sale_id,
        recipient_id: team_leader_id,
        recipient_role: "team_leader",
        amount: COMMISSION_AMOUNT,
        commission_type: "team_leader_override",
        case_type,
      });
    }
    if (director_id) {
      records.push({
        sale_id,
        recipient_id: director_id,
        recipient_role: "director",
        amount: COMMISSION_AMOUNT,
        commission_type: "director_override",
        case_type,
      });
    }
    return records;
  }

  if (dealer_role === "team_leader") {
    records.push({
      sale_id,
      recipient_id: dealer_id,
      recipient_role: "team_leader",
      amount: COMMISSION_AMOUNT,
      commission_type: "direct_sale",
      case_type,
    });
    if (director_id) {
      records.push({
        sale_id,
        recipient_id: director_id,
        recipient_role: "director",
        amount: COMMISSION_AMOUNT,
        commission_type: "director_override",
        case_type,
      });
    }
    return records;
  }

  records.push({
    sale_id,
    recipient_id: dealer_id,
    recipient_role: "director",
    amount: COMMISSION_AMOUNT,
    commission_type: "direct_sale",
    case_type,
  });
  return records;
}
