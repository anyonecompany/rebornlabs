/** Supabase Database 타입 정의 — Phase 3 수동 정의 (supabase gen types 대체) */
// @supabase/supabase-js v2.100+ 호환: __InternalSupabase + Relationships 필드 필수

export type UserRole = "admin" | "staff" | "dealer" | "pending";

export type VehicleStatus =
  | "available"
  | "consulting"
  | "sold"
  | "deleted"
  | "vehicle_waiting";

export type ConsultationStatus =
  | "new"
  | "consulting"
  | "vehicle_waiting"
  | "rejected"
  | "sold";

export type DocumentCategory = "business_registration" | "contract" | "other";

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
        Args: Record<string, unknown>;
        Returns: unknown;
      };
      cancel_sale: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
      get_dashboard_stats: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
  };
}
