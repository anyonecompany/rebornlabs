/** Supabase Database 타입 정의 — Phase 3 수동 정의 (supabase gen types 대체) */
// @supabase/supabase-js v2.100+ 호환: __InternalSupabase + Relationships 필드 필수

export type UserRole =
  | "admin"
  | "director"
  | "team_leader"
  | "staff"
  | "dealer"
  | "pending";

export type VehicleStatus =
  | "available"
  | "consulting"
  | "sold"
  | "deleted";

export type ConsultationStatus =
  | "new"
  | "consulting"
  | "vehicle_waiting"
  | "rejected"
  | "sold";

export type DocumentCategory =
  | "business_registration"
  | "contract"
  | "contract_template"
  | "other";

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string;
          phone: string | null;
          role: UserRole;
          is_active: boolean;
          must_change_password: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["profiles"]["Row"],
          "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          vehicle_code: string;
          make: string;
          model: string;
          year: number;
          mileage: number;
          purchase_price: number;
          selling_price: number;
          deposit: number;
          monthly_payment: number;
          margin: number;
          status: VehicleStatus;
          photos: string[];
          plate_number: string | null;
          vin: string | null;
          color: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["vehicles"]["Row"],
          "id" | "vehicle_code" | "margin" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
        Relationships: [];
      };
      consultations: {
        Row: {
          id: string;
          customer_name: string;
          phone: string;
          interested_vehicle: string | null;
          message: string | null;
          source_ref: string | null;
          assigned_dealer_id: string | null;
          marketing_company: string | null;
          status: ConsultationStatus;
          is_duplicate: boolean;
          // 20260420_org_structure.sql — 조직 Phase 1
          available_deposit: number | null;
          desired_monthly_payment: number | null;
          // 20260422_apply_utm.sql — SNS 랜딩 UTM 확장
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["consultations"]["Row"],
          "id" | "is_duplicate" | "created_at" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["consultations"]["Insert"]
        >;
        Relationships: [];
      };
      consultation_logs: {
        Row: {
          id: string;
          consultation_id: string;
          dealer_id: string;
          content: string;
          status_snapshot: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["consultation_logs"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["consultation_logs"]["Insert"]
        >;
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          consultation_id: string | null;
          vehicle_id: string;
          dealer_id: string;
          actor_id: string;
          is_db_provided: boolean;
          dealer_fee: number;
          marketing_fee: number;
          cancelled_at: string | null;
          delivery_confirmed_at: string | null;
          delivery_confirmed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["sales"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["sales"]["Insert"]>;
        Relationships: [];
      };
      commissions: {
        Row: {
          id: string;
          sale_id: string;
          recipient_id: string;
          recipient_role: "dealer" | "team_leader" | "director";
          amount: number;
          commission_type:
            | "direct_sale"
            | "team_leader_override"
            | "director_override";
          case_type:
            | "1_db_dealer"
            | "2_db_team_leader"
            | "3_db_director"
            | "4_personal_dealer"
            | "5_personal_team_leader"
            | "6_personal_director";
          confirmed_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["commissions"]["Row"],
          "id" | "confirmed_at"
        > & { id?: string; confirmed_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["commissions"]["Insert"]
        >;
        Relationships: [];
      };
      delivery_checklists: {
        Row: {
          id: string;
          vehicle_id: string;
          dealer_id: string;
          contract_uploaded: boolean;
          deposit_confirmed: boolean;
          customer_briefed: boolean;
          delivery_photo_uploaded: boolean;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["delivery_checklists"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["delivery_checklists"]["Insert"]
        >;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          user_id: string;
          expense_date: string;
          amount: number;
          purpose: string;
          receipt_urls: string[];
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["expenses"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["expenses"]["Insert"]>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          uploaded_by: string;
          category: DocumentCategory;
          file_name: string;
          file_url: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["documents"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_type: string;
          target_id: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["audit_logs"]["Row"],
          "id" | "created_at"
        >;
        Update: Record<string, never>;
        Relationships: [];
      };
      rate_limits: {
        Row: {
          id: string;
          ip_address: string;
          endpoint: string;
          requested_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["rate_limits"]["Row"], "id">;
        Update: Record<string, never>;
        Relationships: [];
      };
      marketing_companies: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          ref_code: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["marketing_companies"]["Row"],
          "id" | "created_at" | "ref_code"
        > & { ref_code?: string };
        Update: Partial<Database["public"]["Tables"]["marketing_companies"]["Insert"]>;
        Relationships: [];
      };
      contracts: {
        Row: {
          id: string;
          sale_id: string;
          token: string;
          status: "draft" | "sent" | "signed";
          customer_name: string;
          customer_phone: string;
          customer_email: string;
          customer_address: string | null;
          customer_id_number: string | null;
          vehicle_info: Record<string, unknown>;
          selling_price: number;
          deposit: number;
          signature_url: string | null;
          signed_at: string | null;
          pdf_url: string | null;
          created_at: string;
          created_by: string;
          contract_type: "accident" | "safe";
        };
        Insert: Omit<
          Database["public"]["Tables"]["contracts"]["Row"],
          "id" | "created_at" | "contract_type"
        > & { contract_type?: "accident" | "safe" };
        Update: Partial<Database["public"]["Tables"]["contracts"]["Insert"]>;
        Relationships: [];
      };
      vehicle_models: {
        Row: {
          id: string;
          brand: string;
          model: string;
          trim: string;
          car_price: number;
          monthly_payment: number | null;
          max_deposit: number;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["vehicle_models"]["Row"],
          | "id"
          | "created_at"
          | "updated_at"
          | "display_order"
          | "is_active"
          | "monthly_payment"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          display_order?: number;
          is_active?: boolean;
          monthly_payment?: number | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["vehicle_models"]["Insert"]
        >;
        Relationships: [];
      };
      team_assignments: {
        Row: {
          id: string;
          user_id: string;
          leader_id: string;
          leader_type: "team_leader" | "director";
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["team_assignments"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["team_assignments"]["Insert"]
        >;
        Relationships: [];
      };
      quotes: {
        Row: {
          id: string;
          vehicle_id: string;
          dealer_id: string | null;
          token: string;
          quote_number: string;
          expires_at: string | null;
          view_count: number;
          first_viewed_at: string | null;
          last_viewed_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["quotes"]["Row"],
          "id" | "view_count" | "first_viewed_at" | "last_viewed_at" | "created_at"
        > & {
          view_count?: number;
          first_viewed_at?: string | null;
          last_viewed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["quotes"]["Insert"]> & {
          view_count?: number;
          first_viewed_at?: string | null;
          last_viewed_at?: string | null;
        };
        Relationships: [];
      };
      consultation_assignments: {
        Row: {
          id: string;
          consultation_id: string;
          dealer_id: string;
          assigned_by: string | null;
          assigned_at: string;
          acknowledged_at: string | null;
          expires_at: string;
          status: "pending" | "acknowledged" | "expired" | "cancelled";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          consultation_id: string;
          dealer_id: string;
          assigned_by?: string | null;
          assigned_at?: string;
          acknowledged_at?: string | null;
          expires_at: string;
          status?: "pending" | "acknowledged" | "expired" | "cancelled";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["consultation_assignments"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: {
      vehicles_dealer_view: {
        Row: Omit<
          Database["public"]["Tables"]["vehicles"]["Row"],
          "purchase_price" | "margin"
        >;
        Relationships: [];
      };
      dealers_name_view: {
        Row: {
          id: string;
          name: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      expire_pending_assignments: {
        Args: Record<string, never>;
        Returns: Array<{
          assignment_id: string;
          consultation_id: string;
          dealer_id: string;
        }>;
      };
      insert_consultation_from_gas: {
        Args: {
          p_customer_name: string;
          p_phone: string;
          p_interested_vehicle?: string | null;
          p_message?: string | null;
          p_source_ref?: string;
        };
        Returns: string; // UUID
      };
      complete_sale: {
        Args: {
          p_consultation_id: string | null;
          p_vehicle_id: string;
          p_dealer_id: string;
          p_actor_id: string;
          p_is_db_provided: boolean;
        };
        Returns: string; // sale_id UUID
      };
      cancel_sale: {
        Args: {
          p_sale_id: string;
          p_actor_id: string;
          p_reason: string;
        };
        Returns: void;
      };
      get_dashboard_stats: {
        Args: {
          p_user_id: string;
          p_role: string;
        };
        Returns: unknown;
      };
      generate_quote_number: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
  };
}
