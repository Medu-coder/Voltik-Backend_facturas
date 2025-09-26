export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
  core: {
    Tables: {
      customers: {
        Row: {
          id: string
          user_id: string
          name: string | null
          email: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name?: string | null
          email?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string | null
          email?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          customer_id: string
          storage_object_path: string
          cups: string | null
          energy_price_eur_per_kwh: number | null
          power_price_eur_per_kw: number | null
          contracted_power_by_period: Json | null
          provider: string | null
          tariff: string | null
          billing_start_date: string | null
          billing_end_date: string | null
          issue_date: string | null
          total_amount_eur: number | null
          currency: string
          status: string
          extracted_raw: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          storage_object_path: string
          cups?: string | null
          energy_price_eur_per_kwh?: number | null
          power_price_eur_per_kw?: number | null
          contracted_power_by_period?: Json | null
          provider?: string | null
          tariff?: string | null
          billing_start_date?: string | null
          billing_end_date?: string | null
          issue_date?: string | null
          total_amount_eur?: number | null
          currency?: string
          status?: string
          extracted_raw?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          storage_object_path?: string
          cups?: string | null
          energy_price_eur_per_kwh?: number | null
          power_price_eur_per_kw?: number | null
          contracted_power_by_period?: Json | null
          provider?: string | null
          tariff?: string | null
          billing_start_date?: string | null
          billing_end_date?: string | null
          issue_date?: string | null
          total_amount_eur?: number | null
          currency?: string
          status?: string
          extracted_raw?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_customer_id_fkey'
            columns: ['customer_id']
            referencedRelation: 'customers'
            referencedColumns: ['id']
          }
        ]
      }
      audit_logs: {
        Row: {
          id: number
          created_at: string
          actor_user_id: string | null
          actor_role: string | null
          event: string
          entity: string
          entity_id: string | null
          customer_id: string | null
          level: string
          meta: Json | null
        }
        Insert: {
          id?: number
          created_at?: string
          actor_user_id?: string | null
          actor_role?: string | null
          event: string
          entity: string
          entity_id?: string | null
          customer_id?: string | null
          level?: string
          meta?: Json | null
        }
        Update: {
          id?: number
          created_at?: string
          actor_user_id?: string | null
          actor_role?: string | null
          event?: string
          entity?: string
          entity_id?: string | null
          customer_id?: string | null
          level?: string
          meta?: Json | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      dashboard_invoice_aggregates: {
        Args: { p_from: string | null; p_to: string | null; p_query?: string | null }
        Returns: Json
      }
      get_customers_last_invoice: {
        Args: { p_customer_ids: string[] | null }
        Returns: {
          customer_id: string
          last_invoice_at: string | null
        }[]
      }
    }
    Enums: Record<string, never>
  }
  storage: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
