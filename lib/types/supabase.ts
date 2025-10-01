export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  core: {
    Tables: {
      audit_logs: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          customer_id: string | null
          entity: string
          entity_id: string | null
          event: string
          id: number
          level: string
          meta: Json | null
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          entity: string
          entity_id?: string | null
          event: string
          id?: number
          level?: string
          meta?: Json | null
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          entity?: string
          entity_id?: string | null
          event?: string
          id?: number
          level?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          mobile_phone: string | null
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          mobile_phone?: string | null
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          mobile_phone?: string | null
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          billing_end_date: string | null
          billing_start_date: string | null
          contracted_power_by_period: number | null
          created_at: string
          cups: string | null
          currency: string
          customer_id: string
          energy_price_eur_per_kwh: number | null
          extracted_raw: Json | null
          id: string
          issue_date: string | null
          power_price_eur_per_kw: number | null
          provider: string | null
          status: string
          storage_object_path: string
          tariff: string | null
          total_amount_eur: number | null
          updated_at: string
        }
        Insert: {
          billing_end_date?: string | null
          billing_start_date?: string | null
          contracted_power_by_period?: number | null
          created_at?: string
          cups?: string | null
          currency?: string
          customer_id: string
          energy_price_eur_per_kwh?: number | null
          extracted_raw?: Json | null
          id?: string
          issue_date?: string | null
          power_price_eur_per_kw?: number | null
          provider?: string | null
          status?: string
          storage_object_path: string
          tariff?: string | null
          total_amount_eur?: number | null
          updated_at?: string
        }
        Update: {
          billing_end_date?: string | null
          billing_start_date?: string | null
          contracted_power_by_period?: number | null
          created_at?: string
          cups?: string | null
          currency?: string
          customer_id?: string
          energy_price_eur_per_kwh?: number | null
          extracted_raw?: Json | null
          id?: string
          issue_date?: string | null
          power_price_eur_per_kw?: number | null
          provider?: string | null
          status?: string
          storage_object_path?: string
          tariff?: string | null
          total_amount_eur?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dashboard_invoice_aggregates: {
        Args: { p_from: string; p_query?: string; p_to: string }
        Returns: Json
      }
      get_customers_last_invoice: {
        Args: { p_customer_ids: string[] }
        Returns: {
          customer_id: string
          last_invoice_at: string
        }[]
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
