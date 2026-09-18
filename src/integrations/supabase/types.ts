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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      courier_profiles: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          source_file: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          source_file?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          source_file?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string | null
          phone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          phone: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          phone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          cod_amount: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          id: string
          invoice_number: string
          invoice_text: string
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          phone: string | null
          total: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cod_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_number: string
          invoice_text: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          phone?: string | null
          total?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          cod_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_number?: string
          invoice_text?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          phone?: string | null
          total?: number | null
          updated_at?: string
          workspace_id?: string
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
      order_templates: {
        Row: {
          created_at: string
          id: string
          is_selected: boolean
          name: string
          template_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_selected?: boolean
          name?: string
          template_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_selected?: boolean
          name?: string
          template_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string | null
          advance: string | null
          city: string | null
          cod_amount: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          delivery: string | null
          id: string
          order_number: string | null
          order_text: string
          payment_method: string | null
          phone: string | null
          product: string | null
          product_total: number | null
          qty: string | null
          status: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          advance?: string | null
          city?: string | null
          cod_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          delivery?: string | null
          id?: string
          order_number?: string | null
          order_text: string
          payment_method?: string | null
          phone?: string | null
          product?: string | null
          product_total?: number | null
          qty?: string | null
          status?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          address?: string | null
          advance?: string | null
          city?: string | null
          cod_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          delivery?: string | null
          id?: string
          order_number?: string | null
          order_text?: string
          payment_method?: string | null
          phone?: string | null
          product?: string | null
          product_total?: number | null
          qty?: string | null
          status?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          custom_p100_price: number | null
          custom_p250_price: number | null
          custom_p500_price: number | null
          custom_sale_price: number | null
          id: string
          is_active: boolean
          name: string
          normalized_name: string
          p100_staff_price: number | null
          p250_staff_price: number | null
          p500_staff_price: number | null
          sale_price: number
          stock: number
          unit: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          custom_p100_price?: number | null
          custom_p250_price?: number | null
          custom_p500_price?: number | null
          custom_sale_price?: number | null
          id?: string
          is_active?: boolean
          name: string
          normalized_name: string
          p100_staff_price?: number | null
          p250_staff_price?: number | null
          p500_staff_price?: number | null
          sale_price?: number
          stock?: number
          unit: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          custom_p100_price?: number | null
          custom_p250_price?: number | null
          custom_p500_price?: number | null
          custom_sale_price?: number | null
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string
          p100_staff_price?: number | null
          p250_staff_price?: number | null
          p500_staff_price?: number | null
          sale_price?: number
          stock?: number
          unit?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          role: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          error_count: number
          error_details: Json | null
          id: string
          inserted_count: number
          skipped_count: number
          status: string
          synced_at: string
          total_rows: number
          updated_count: number
          workspace_id: string | null
        }
        Insert: {
          error_count?: number
          error_details?: Json | null
          id?: string
          inserted_count?: number
          skipped_count?: number
          status?: string
          synced_at?: string
          total_rows?: number
          updated_count?: number
          workspace_id?: string | null
        }
        Update: {
          error_count?: number
          error_details?: Json | null
          id?: string
          inserted_count?: number
          skipped_count?: number
          status?: string
          synced_at?: string
          total_rows?: number
          updated_count?: number
          workspace_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          allowed_sections: Json
          auto_order_number: boolean
          compact_mode: boolean
          default_city: string
          default_courier_profile_id: string | null
          default_delivery: string
          default_payment_method: string
          default_weight: string
          payment_enabled: boolean
          theme: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          allowed_sections?: Json
          auto_order_number?: boolean
          compact_mode?: boolean
          default_city?: string
          default_courier_profile_id?: string | null
          default_delivery?: string
          default_payment_method?: string
          default_weight?: string
          payment_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          allowed_sections?: Json
          auto_order_number?: boolean
          compact_mode?: boolean
          default_city?: string
          default_courier_profile_id?: string | null
          default_delivery?: string
          default_payment_method?: string
          default_weight?: string
          payment_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_settings: {
        Row: {
          allowed_sections: Json
          business_address: string
          business_name: string
          business_phone: string
          currency: string
          default_delivery: string
          default_payment_method: string
          invoice_prefix: string
          order_number_start: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          allowed_sections?: Json
          business_address?: string
          business_name?: string
          business_phone?: string
          currency?: string
          default_delivery?: string
          default_payment_method?: string
          invoice_prefix?: string
          order_number_start?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          allowed_sections?: Json
          business_address?: string
          business_name?: string
          business_phone?: string
          currency?: string
          default_delivery?: string
          default_payment_method?: string
          invoice_prefix?: string
          order_number_start?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_workspace: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_team_member: { Args: { _user_id: string }; Returns: boolean }
      next_invoice_number: { Args: never; Returns: string }
      next_order_number: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const
