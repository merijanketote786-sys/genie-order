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
      acc_accounts: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          opening_balance: number
          parent_id: string | null
          system_key: string | null
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          opening_balance?: number
          parent_id?: string | null
          system_key?: string | null
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          opening_balance?: number
          parent_id?: string | null
          system_key?: string | null
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acc_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "acc_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      acc_journal_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          id: string
          journal_id: string
          line_no: number
          memo: string | null
          workspace_id: string
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          id?: string
          journal_id: string
          line_no?: number
          memo?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          id?: string
          journal_id?: string
          line_no?: number
          memo?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acc_journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "acc_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acc_journal_lines_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "acc_journals"
            referencedColumns: ["id"]
          },
        ]
      }
      acc_journals: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          posted_at: string | null
          posted_by: string | null
          reference: string | null
          reversal_of: string | null
          reversed_by: string | null
          source_id: string | null
          source_type: string
          status: string
          total: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date: string
          id?: string
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          reversal_of?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          total?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          reversal_of?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          total?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acc_journals_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "acc_journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acc_journals_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "acc_journals"
            referencedColumns: ["id"]
          },
        ]
      }
      acc_settings: {
        Row: {
          credit_days: number
          fy_end: string | null
          fy_start: string | null
          lock_date: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          credit_days?: number
          fy_end?: string | null
          fy_start?: string | null
          lock_date?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          credit_days?: number
          fy_end?: string | null
          fy_start?: string | null
          lock_date?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      att_days: {
        Row: {
          day: string
          id: string
          in_time: string | null
          labour_id: string
          ot_hours: number
          out_time: string | null
          source: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          day: string
          id?: string
          in_time?: string | null
          labour_id: string
          ot_hours?: number
          out_time?: string | null
          source?: string
          status: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          day?: string
          id?: string
          in_time?: string | null
          labour_id?: string
          ot_hours?: number
          out_time?: string | null
          source?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "att_days_labour_id_fkey"
            columns: ["labour_id"]
            isOneToOne: false
            referencedRelation: "att_labour"
            referencedColumns: ["id"]
          },
        ]
      }
      att_devices: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_seen: string | null
          name: string
          serial: string | null
          token: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          last_seen?: string | null
          name: string
          serial?: string | null
          token?: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_seen?: string | null
          name?: string
          serial?: string | null
          token?: string
          workspace_id?: string
        }
        Relationships: []
      }
      att_labour: {
        Row: {
          bio_id: string | null
          created_at: string
          full_hours: number
          half_hours: number
          id: string
          is_active: boolean
          name: string
          ot_rate: number
          paid_leaves: number
          phone: string | null
          post_expense: boolean
          rate: number
          salary_type: string
          work_days: number
          workspace_id: string
        }
        Insert: {
          bio_id?: string | null
          created_at?: string
          full_hours?: number
          half_hours?: number
          id?: string
          is_active?: boolean
          name: string
          ot_rate?: number
          paid_leaves?: number
          phone?: string | null
          post_expense?: boolean
          rate?: number
          salary_type?: string
          work_days?: number
          workspace_id?: string
        }
        Update: {
          bio_id?: string | null
          created_at?: string
          full_hours?: number
          half_hours?: number
          id?: string
          is_active?: boolean
          name?: string
          ot_rate?: number
          paid_leaves?: number
          phone?: string | null
          post_expense?: boolean
          rate?: number
          salary_type?: string
          work_days?: number
          workspace_id?: string
        }
        Relationships: []
      }
      att_payments: {
        Row: {
          amount: number
          client_ref: string | null
          created_at: string
          created_by: string | null
          expense_posted: boolean
          id: string
          kind: string
          labour_id: string
          method: string
          note: string | null
          pay_date: string
          period_from: string | null
          period_to: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          expense_posted?: boolean
          id?: string
          kind: string
          labour_id: string
          method?: string
          note?: string | null
          pay_date?: string
          period_from?: string | null
          period_to?: string | null
          workspace_id?: string
        }
        Update: {
          amount?: number
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          expense_posted?: boolean
          id?: string
          kind?: string
          labour_id?: string
          method?: string
          note?: string | null
          pay_date?: string
          period_from?: string | null
          period_to?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "att_payments_labour_id_fkey"
            columns: ["labour_id"]
            isOneToOne: false
            referencedRelation: "att_labour"
            referencedColumns: ["id"]
          },
        ]
      }
      att_punches: {
        Row: {
          bio_id: string
          created_at: string
          day: string
          device_id: string | null
          id: string
          source: string
          tm: string
          workspace_id: string
        }
        Insert: {
          bio_id: string
          created_at?: string
          day: string
          device_id?: string | null
          id?: string
          source?: string
          tm: string
          workspace_id?: string
        }
        Update: {
          bio_id?: string
          created_at?: string
          day?: string
          device_id?: string | null
          id?: string
          source?: string
          tm?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "att_punches_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "att_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          details: Json | null
          entity: string
          entity_id: string | null
          id: string
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          workspace_id?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          workspace_id?: string
        }
        Relationships: []
      }
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
          courier_service_name: string | null
          created_at: string
          created_by: string | null
          credit_limit: number | null
          email: string | null
          goods_adda_name: string | null
          id: string
          name: string | null
          opening_balance: number
          phone: string
          pos_scoped: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          courier_service_name?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          email?: string | null
          goods_adda_name?: string | null
          id?: string
          name?: string | null
          opening_balance?: number
          phone: string
          pos_scoped?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          courier_service_name?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          email?: string | null
          goods_adda_name?: string | null
          id?: string
          name?: string | null
          opening_balance?: number
          phone?: string
          pos_scoped?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          attachment: string | null
          category: string
          client_ref: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          method: string
          status: string
          workspace_id: string
        }
        Insert: {
          amount: number
          attachment?: string | null
          category: string
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          method?: string
          status?: string
          workspace_id?: string
        }
        Update: {
          amount?: number
          attachment?: string | null
          category?: string
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          method?: string
          status?: string
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
      label_settings: {
        Row: {
          config: Json
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          config?: Json
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      order_templates: {
        Row: {
          created_at: string
          id: string
          is_selected: boolean
          kind: string
          name: string
          template_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_selected?: boolean
          kind?: string
          name?: string
          template_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_selected?: boolean
          kind?: string
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
      pos_backup_runs: {
        Row: {
          created_at: string
          error: string | null
          file_name: string | null
          id: string
          status: string
          target: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          file_name?: string | null
          id?: string
          status: string
          target: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          file_name?: string | null
          id?: string
          status?: string
          target?: string
          workspace_id?: string
        }
        Relationships: []
      }
      pos_cash_entries: {
        Row: {
          account_id: string | null
          amount: number
          category: string
          client_ref: string | null
          created_at: string
          created_by: string | null
          direction: string
          entry_date: string
          id: string
          journal_id: string | null
          method: string
          note: string | null
          party: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category?: string
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          entry_date: string
          id?: string
          journal_id?: string | null
          method?: string
          note?: string | null
          party?: string | null
          status?: string
          workspace_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          entry_date?: string
          id?: string
          journal_id?: string | null
          method?: string
          note?: string | null
          party?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_cash_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "acc_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_member_roles: {
        Row: {
          perms: string[] | null
          role: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          perms?: string[] | null
          role: string
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          perms?: string[] | null
          role?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      pos_payments: {
        Row: {
          amount: number
          client_ref: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          direction: string
          id: string
          kind: string
          method: string
          note: string | null
          purchase_id: string | null
          sale_id: string | null
          status: string
          supplier_id: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          direction: string
          id?: string
          kind?: string
          method: string
          note?: string | null
          purchase_id?: string | null
          sale_id?: string | null
          status?: string
          supplier_id?: string | null
          workspace_id?: string
        }
        Update: {
          amount?: number
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          direction?: string
          id?: string
          kind?: string
          method?: string
          note?: string | null
          purchase_id?: string | null
          sale_id?: string | null
          status?: string
          supplier_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_recipes: {
        Row: {
          expenses: Json
          id: string
          materials: Json
          output_qty: number
          product_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          expenses?: Json
          id?: string
          materials?: Json
          output_qty?: number
          product_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          expenses?: Json
          id?: string
          materials?: Json
          output_qty?: number
          product_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_items: {
        Row: {
          cost: number
          discount: number
          id: string
          line_total: number
          name: string
          note: string | null
          product_id: string | null
          qty: number
          rate: number
          rate_type: string | null
          sale_id: string
          sku: string | null
          stock_qty: number
          tax_amount: number
          tax_percent: number
          unit: string | null
          workspace_id: string
        }
        Insert: {
          cost?: number
          discount?: number
          id?: string
          line_total: number
          name: string
          note?: string | null
          product_id?: string | null
          qty: number
          rate: number
          rate_type?: string | null
          sale_id: string
          sku?: string | null
          stock_qty?: number
          tax_amount?: number
          tax_percent?: number
          unit?: string | null
          workspace_id: string
        }
        Update: {
          cost?: number
          discount?: number
          id?: string
          line_total?: number
          name?: string
          note?: string | null
          product_id?: string | null
          qty?: number
          rate?: number
          rate_type?: string | null
          sale_id?: string
          sku?: string | null
          stock_qty?: number
          tax_amount?: number
          tax_percent?: number
          unit?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          balance: number
          client_ref: string | null
          cost_total: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery: number
          discount_total: number
          doc_number: string
          doc_type: string
          grand_total: number
          id: string
          invoice_id: string | null
          notes: string | null
          paid_total: number
          payload: Json | null
          payment_status: string
          ref_sale_id: string | null
          status: string
          subtotal: number
          tax_total: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          client_ref?: string | null
          cost_total?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery?: number
          discount_total?: number
          doc_number: string
          doc_type?: string
          grand_total?: number
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_total?: number
          payload?: Json | null
          payment_status?: string
          ref_sale_id?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          balance?: number
          client_ref?: string | null
          cost_total?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery?: number
          discount_total?: number
          doc_number?: string
          doc_type?: string
          grand_total?: number
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_total?: number
          payload?: Json | null
          payment_status?: string
          ref_sale_id?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_ref_sale_id_fkey"
            columns: ["ref_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_settings: {
        Row: {
          config: Json
          mfg_pin_hash: string | null
          pin_hash: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          config?: Json
          mfg_pin_hash?: string | null
          pin_hash?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Update: {
          config?: Json
          mfg_pin_hash?: string | null
          pin_hash?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      pos_store_stock: {
        Row: {
          product_id: string
          qty: number
          store_id: string
          workspace_id: string
        }
        Insert: {
          product_id: string
          qty?: number
          store_id: string
          workspace_id: string
        }
        Update: {
          product_id?: string
          qty?: number
          store_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_store_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_store_stock_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "pos_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stores: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          kind: string
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          name?: string
          workspace_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          created_at: string
          custom_p100_price: number | null
          custom_p250_price: number | null
          custom_p500_price: number | null
          custom_sale_price: number | null
          id: string
          is_active: boolean
          min_sale_price: number | null
          min_stock: number | null
          name: string
          normalized_name: string
          p100_staff_price: number | null
          p250_staff_price: number | null
          p500_staff_price: number | null
          purchase_price: number | null
          sale_price: number
          scope: string
          sku: string | null
          stock: number
          store_id: string | null
          tax_percent: number | null
          unit: string
          updated_at: string
          wholesale_min_qty: number | null
          wholesale_price: number | null
          workspace_id: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          custom_p100_price?: number | null
          custom_p250_price?: number | null
          custom_p500_price?: number | null
          custom_sale_price?: number | null
          id?: string
          is_active?: boolean
          min_sale_price?: number | null
          min_stock?: number | null
          name: string
          normalized_name: string
          p100_staff_price?: number | null
          p250_staff_price?: number | null
          p500_staff_price?: number | null
          purchase_price?: number | null
          sale_price?: number
          scope?: string
          sku?: string | null
          stock?: number
          store_id?: string | null
          tax_percent?: number | null
          unit: string
          updated_at?: string
          wholesale_min_qty?: number | null
          wholesale_price?: number | null
          workspace_id: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          custom_p100_price?: number | null
          custom_p250_price?: number | null
          custom_p500_price?: number | null
          custom_sale_price?: number | null
          id?: string
          is_active?: boolean
          min_sale_price?: number | null
          min_stock?: number | null
          name?: string
          normalized_name?: string
          p100_staff_price?: number | null
          p250_staff_price?: number | null
          p500_staff_price?: number | null
          purchase_price?: number | null
          sale_price?: number
          scope?: string
          sku?: string | null
          stock?: number
          store_id?: string | null
          tax_percent?: number | null
          unit?: string
          updated_at?: string
          wholesale_min_qty?: number | null
          wholesale_price?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "pos_stores"
            referencedColumns: ["id"]
          },
        ]
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
      purchase_items: {
        Row: {
          batch: string | null
          discount: number
          expiry: string | null
          id: string
          line_total: number
          name: string
          product_id: string | null
          purchase_id: string
          qty: number
          rate: number
          tax_amount: number
          tax_percent: number
          unit: string | null
          workspace_id: string
        }
        Insert: {
          batch?: string | null
          discount?: number
          expiry?: string | null
          id?: string
          line_total: number
          name: string
          product_id?: string | null
          purchase_id: string
          qty: number
          rate: number
          tax_amount?: number
          tax_percent?: number
          unit?: string | null
          workspace_id: string
        }
        Update: {
          batch?: string | null
          discount?: number
          expiry?: string | null
          id?: string
          line_total?: number
          name?: string
          product_id?: string | null
          purchase_id?: string
          qty?: number
          rate?: number
          tax_amount?: number
          tax_percent?: number
          unit?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          balance: number
          client_ref: string | null
          created_at: string
          created_by: string | null
          discount_total: number
          doc_number: string
          doc_type: string
          grand_total: number
          id: string
          notes: string | null
          paid_total: number
          payment_status: string
          ref_purchase_id: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          supplier_name: string | null
          tax_total: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          discount_total?: number
          doc_number: string
          doc_type?: string
          grand_total?: number
          id?: string
          notes?: string | null
          paid_total?: number
          payment_status?: string
          ref_purchase_id?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          supplier_name?: string | null
          tax_total?: number
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          balance?: number
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          discount_total?: number
          doc_number?: string
          doc_type?: string
          grand_total?: number
          id?: string
          notes?: string | null
          paid_total?: number
          payment_status?: string
          ref_purchase_id?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          supplier_name?: string | null
          tax_total?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_ref_purchase_id_fkey"
            columns: ["ref_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          product_id: string
          qty: number
          ref_id: string | null
          store_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          note?: string | null
          product_id: string
          qty: number
          ref_id?: string | null
          store_id?: string | null
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          product_id?: string
          qty?: number
          ref_id?: string | null
          store_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "pos_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          opening_balance: number
          phone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number
          phone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number
          phone?: string | null
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
      acc_balances: {
        Args: { _from: string; _to: string }
        Returns: {
          account_id: string
          before_cr: number
          before_dr: number
          cr: number
          dr: number
        }[]
      }
      acc_cancel_draft: { Args: { _id: string }; Returns: undefined }
      acc_delete_account: { Args: { _id: string }; Returns: undefined }
      acc_ensure_accounts: { Args: { _ws: string }; Returns: undefined }
      acc_expense_account: {
        Args: { _cat: string; _ws: string }
        Returns: string
      }
      acc_make_journal: {
        Args: {
          _date: string
          _desc: string
          _lines: Json
          _ref: string
          _reversal_of?: string
          _sid: string
          _stype: string
          _ws: string
        }
        Returns: string
      }
      acc_post_journal: { Args: { _id: string }; Returns: undefined }
      acc_post_source: {
        Args: { _id: string; _type: string }
        Returns: undefined
      }
      acc_reverse_core: {
        Args: { _date: string; _jid: string; _why: string }
        Returns: string
      }
      acc_reverse_journal: {
        Args: { _date: string; _id: string; _reason: string }
        Returns: string
      }
      acc_save_account: { Args: { _p: Json }; Returns: string }
      acc_save_journal: { Args: { _p: Json }; Returns: string }
      acc_save_settings: { Args: { _p: Json }; Returns: undefined }
      acc_sync_all: { Args: never; Returns: number }
      acc_sys: { Args: { _key: string; _ws: string }; Returns: string }
      att_recalc_day: {
        Args: { _bio: string; _day: string; _ws: string }
        Returns: undefined
      }
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
      pos_adjust_stock: {
        Args: { _id: string; _kind: string; _note: string; _qty: number }
        Returns: undefined
      }
      pos_bulk_update_products: { Args: { _rows: Json }; Returns: Json }
      pos_can: { Args: { _perm: string }; Returns: boolean }
      pos_cancel_cash_entry: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      pos_cancel_purchase: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      pos_cancel_sale: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      pos_cancel_sale_core: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      pos_cancel_sale_pin: {
        Args: { _id: string; _pin: string; _reason: string }
        Returns: undefined
      }
      pos_cfg_prefix: {
        Args: { _cfg: Json; _def: string; _key: string }
        Returns: string
      }
      pos_close_doc: { Args: { _id: string }; Returns: undefined }
      pos_create_product: { Args: { _p: Json }; Returns: string }
      pos_default_store: { Args: { _ws: string }; Returns: string }
      pos_delete_doc: { Args: { _id: string }; Returns: undefined }
      pos_delete_products: { Args: { _ids: string[] }; Returns: number }
      pos_delete_recipe: { Args: { _product: string }; Returns: undefined }
      pos_find_customer: {
        Args: { _phone: string; _ws: string }
        Returns: string
      }
      pos_is_admin: { Args: never; Returns: boolean }
      pos_list_stores: { Args: never; Returns: Json }
      pos_log_event: {
        Args: {
          _action: string
          _details: Json
          _entity: string
          _entity_id: string
        }
        Returns: undefined
      }
      pos_manufacture: {
        Args: { _note: string; _product: string; _qty: number }
        Returns: Json
      }
      pos_mfg_status: { Args: never; Returns: Json }
      pos_move_stock: {
        Args: {
          _kind: string
          _note: string
          _product: string
          _qty: number
          _ref: string
          _ws: string
        }
        Returns: undefined
      }
      pos_my_access: { Args: never; Returns: Json }
      pos_party_payment: {
        Args: {
          _amount: number
          _kind: string
          _method: string
          _note: string
          _party: string
          _ref?: string
        }
        Returns: string
      }
      pos_perms: { Args: { _role: string }; Returns: string[] }
      pos_request_store: { Args: { _ws: string }; Returns: string }
      pos_restore_backup: {
        Args: { _data: Json; _mode: string }
        Returns: Json
      }
      pos_restore_selfref: {
        Args: { _col: string; _rows: Json; _t: string; _ws: string }
        Returns: undefined
      }
      pos_restore_table: {
        Args: {
          _rows: Json
          _strip: string[]
          _t: string
          _upsert?: boolean
          _ws: string
        }
        Returns: number
      }
      pos_role: { Args: { _uid: string }; Returns: string }
      pos_save_cash_entry: { Args: { _p: Json }; Returns: string }
      pos_save_printers: {
        Args: { _defaults: Json; _printers: Json }
        Returns: undefined
      }
      pos_save_purchase: { Args: { _p: Json }; Returns: Json }
      pos_save_recipe: { Args: { _p: Json }; Returns: string }
      pos_save_sale: { Args: { _p: Json }; Returns: Json }
      pos_save_settings: {
        Args: { _config: Json; _pin: string }
        Returns: undefined
      }
      pos_save_store: {
        Args: { _active: boolean; _id: string; _kind: string; _name: string }
        Returns: string
      }
      pos_save_unlinked_return: { Args: { _p: Json }; Returns: Json }
      pos_set_common_products: { Args: { _on: boolean }; Returns: undefined }
      pos_set_member_perms: {
        Args: { _perms: string[]; _user: string }
        Returns: undefined
      }
      pos_set_member_role: {
        Args: { _role: string; _user: string }
        Returns: undefined
      }
      pos_set_mfg_pin: { Args: { _pin: string }; Returns: undefined }
      pos_transfer_stock: {
        Args: { _from: string; _items: Json; _note: string; _to: string }
        Returns: number
      }
      pos_update_product: {
        Args: { _id: string; _p: Json }
        Returns: undefined
      }
      pos_user_perms: { Args: { _uid: string }; Returns: string[] }
      pos_verify_mfg_pin: { Args: { _pin: string }; Returns: boolean }
      pos_verify_pin: { Args: { _pin: string }; Returns: boolean }
      set_order_number_start: { Args: { _start: number }; Returns: undefined }
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
