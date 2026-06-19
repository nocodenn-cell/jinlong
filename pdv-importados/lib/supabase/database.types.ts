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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      caixa_scan_telemetry_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          cupom_session_id: string | null
          event_name: string
          id: string
          payload: Json
          scan_id: string
          schema_version: number
          sequence_number: number | null
          user_id: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          cupom_session_id?: string | null
          event_name: string
          id?: string
          payload: Json
          scan_id: string
          schema_version?: number
          sequence_number?: number | null
          user_id: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          cupom_session_id?: string | null
          event_name?: string
          id?: string
          payload?: Json
          scan_id?: string
          schema_version?: number
          sequence_number?: number | null
          user_id?: string
        }
        Relationships: []
      }
      caixas: {
        Row: {
          data_abertura: string
          data_fechamento: string | null
          fechamento_diferenca: number | null
          fechamento_observacao: string | null
          id: string
          loja_id: string
          operador_id: string | null
          saldo_atual: number
          status: string
          valor_fechamento: number | null
          valor_inicial: number
        }
        Insert: {
          data_abertura?: string
          data_fechamento?: string | null
          fechamento_diferenca?: number | null
          fechamento_observacao?: string | null
          id?: string
          loja_id?: string
          operador_id?: string | null
          saldo_atual?: number
          status?: string
          valor_fechamento?: number | null
          valor_inicial?: number
        }
        Update: {
          data_abertura?: string
          data_fechamento?: string | null
          fechamento_diferenca?: number | null
          fechamento_observacao?: string | null
          id?: string
          loja_id?: string
          operador_id?: string | null
          saldo_atual?: number
          status?: string
          valor_fechamento?: number | null
          valor_inicial?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "caixas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          ativo: boolean
          categoria_pai_id: string | null
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          categoria_pai_id?: string | null
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          categoria_pai_id?: string | null
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_categoria_pai_id_fkey"
            columns: ["categoria_pai_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["categoria_financeira_tipo"]
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["categoria_financeira_tipo"]
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["categoria_financeira_tipo"]
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ativo: boolean
          consentimento_privacidade_em: string | null
          created_at: string
          documento: string | null
          email: string | null
          id: string
          limite_credito: number
          loja_id: string
          nome: string
          telefone: string | null
          termos_aceitos_em: string | null
        }
        Insert: {
          ativo?: boolean
          consentimento_privacidade_em?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
          id?: string
          limite_credito?: number
          loja_id: string
          nome: string
          telefone?: string | null
          termos_aceitos_em?: string | null
        }
        Update: {
          ativo?: boolean
          consentimento_privacidade_em?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
          id?: string
          limite_credito?: number
          loja_id?: string
          nome?: string
          telefone?: string | null
          termos_aceitos_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      contas_pagar: {
        Row: {
          cancelamento_em: string | null
          cancelamento_motivo: string | null
          criado_em: string
          descricao: string | null
          fornecedor_id: string
          id: string
          loja_id: string
          nfe_importacao_id: string | null
          nfe_numero: string | null
          observacao: string | null
          status: string
          valor_pago: number
          valor_total: number
          vencimento: string
        }
        Insert: {
          cancelamento_em?: string | null
          cancelamento_motivo?: string | null
          criado_em?: string
          descricao?: string | null
          fornecedor_id: string
          id?: string
          loja_id: string
          nfe_importacao_id?: string | null
          nfe_numero?: string | null
          observacao?: string | null
          status?: string
          valor_pago?: number
          valor_total: number
          vencimento: string
        }
        Update: {
          cancelamento_em?: string | null
          cancelamento_motivo?: string | null
          criado_em?: string
          descricao?: string | null
          fornecedor_id?: string
          id?: string
          loja_id?: string
          nfe_importacao_id?: string | null
          nfe_numero?: string | null
          observacao?: string | null
          status?: string
          valor_pago?: number
          valor_total?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "contas_pagar_nfe_importacao_id_fkey"
            columns: ["nfe_importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_nfe"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_pagamentos: {
        Row: {
          conta_id: string
          created_at: string
          data_pagamento: string
          forma_pagamento: string
          id: string
          observacao: string | null
          usuario_id: string | null
          valor: number
        }
        Insert: {
          conta_id: string
          created_at?: string
          data_pagamento?: string
          forma_pagamento: string
          id?: string
          observacao?: string | null
          usuario_id?: string | null
          valor: number
        }
        Update: {
          conta_id?: string
          created_at?: string
          data_pagamento?: string
          forma_pagamento?: string
          id?: string
          observacao?: string | null
          usuario_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_pagamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_receber: {
        Row: {
          cliente_id: string
          created_at: string
          descricao: string | null
          id: string
          loja_id: string
          status: string
          valor_aberto: number
          valor_total: number
          vencimento: string | null
          venda_id: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          loja_id: string
          status?: string
          valor_aberto: number
          valor_total: number
          vencimento?: string | null
          venda_id?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          loja_id?: string
          status?: string
          valor_aberto?: number
          valor_total?: number
          vencimento?: string | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "contas_receber_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      descontos_venda: {
        Row: {
          desconto_percentual: number | null
          desconto_valor: number | null
          gerente_id: string | null
          venda_id: string
        }
        Insert: {
          desconto_percentual?: number | null
          desconto_valor?: number | null
          gerente_id?: string | null
          venda_id: string
        }
        Update: {
          desconto_percentual?: number | null
          desconto_valor?: number | null
          gerente_id?: string | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "descontos_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: true
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      devolucoes: {
        Row: {
          created_at: string
          forma_pagamento: string
          id: string
          motivo: string
          operador_id: string
          valor: number
          venda_id: string
        }
        Insert: {
          created_at?: string
          forma_pagamento: string
          id?: string
          motivo: string
          operador_id: string
          valor: number
          venda_id: string
        }
        Update: {
          created_at?: string
          forma_pagamento?: string
          id?: string
          motivo?: string
          operador_id?: string
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devolucoes_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_fiscais_dlq: {
        Row: {
          correlation_id: string | null
          criado_em: string | null
          documento_id: string
          id: string
          motivo: string | null
          original_status: string | null
          original_tentativas: number | null
          payload: Json | null
          tipo_doc: string
          venda_id: string
        }
        Insert: {
          correlation_id?: string | null
          criado_em?: string | null
          documento_id: string
          id?: string
          motivo?: string | null
          original_status?: string | null
          original_tentativas?: number | null
          payload?: Json | null
          tipo_doc: string
          venda_id: string
        }
        Update: {
          correlation_id?: string | null
          criado_em?: string | null
          documento_id?: string
          id?: string
          motivo?: string | null
          original_status?: string | null
          original_tentativas?: number | null
          payload?: Json | null
          tipo_doc?: string
          venda_id?: string
        }
        Relationships: []
      }
      documentos_fiscais_eventos: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          documento_id: string
          evento_tipo: string
          id: string
          origem_acao: string
          payload: Json
          status_antes: string | null
          status_depois: string | null
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          documento_id: string
          evento_tipo: string
          id?: string
          origem_acao: string
          payload?: Json
          status_antes?: string | null
          status_depois?: string | null
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          documento_id?: string
          evento_tipo?: string
          id?: string
          origem_acao?: string
          payload?: Json
          status_antes?: string | null
          status_depois?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_fiscais_eventos_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscais_eventos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_fiscais_pendentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscais_eventos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_doc_status_event_mismatch"
            referencedColumns: ["documento_id"]
          },
        ]
      }
      documentos_fiscais_pendentes: {
        Row: {
          chave_fiscal: string | null
          created_at: string
          deleted_at: string | null
          fiscal_action_hint: string | null
          fiscal_error_category: string | null
          fiscal_error_code: string | null
          fiscal_error_payload: Json | null
          fiscal_next_step_url: string | null
          fiscal_retryable: boolean | null
          id: string
          payload: Json | null
          processado_em: string | null
          protocolo: string | null
          provider: string | null
          provider_ref: string | null
          proxima_tentativa_em: string | null
          status: string
          tentativas: number
          tipo_doc: string
          ultima_tentativa_em: string | null
          ultimo_erro: string | null
          updated_at: string
          venda_id: string
        }
        Insert: {
          chave_fiscal?: string | null
          created_at?: string
          deleted_at?: string | null
          fiscal_action_hint?: string | null
          fiscal_error_category?: string | null
          fiscal_error_code?: string | null
          fiscal_error_payload?: Json | null
          fiscal_next_step_url?: string | null
          fiscal_retryable?: boolean | null
          id?: string
          payload?: Json | null
          processado_em?: string | null
          protocolo?: string | null
          provider?: string | null
          provider_ref?: string | null
          proxima_tentativa_em?: string | null
          status?: string
          tentativas?: number
          tipo_doc?: string
          ultima_tentativa_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          venda_id: string
        }
        Update: {
          chave_fiscal?: string | null
          created_at?: string
          deleted_at?: string | null
          fiscal_action_hint?: string | null
          fiscal_error_category?: string | null
          fiscal_error_code?: string | null
          fiscal_error_payload?: Json | null
          fiscal_next_step_url?: string | null
          fiscal_retryable?: boolean | null
          id?: string
          payload?: Json | null
          processado_em?: string | null
          protocolo?: string | null
          provider?: string | null
          provider_ref?: string | null
          proxima_tentativa_em?: string | null
          status?: string
          tentativas?: number
          tipo_doc?: string
          ultima_tentativa_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_fiscais_pendentes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque: {
        Row: {
          estoque_minimo: number
          id: string
          loja_id: string
          produto_id: string
          quantidade_atual: number
          updated_at: string
          version: number | null
        }
        Insert: {
          estoque_minimo?: number
          id?: string
          loja_id?: string
          produto_id: string
          quantidade_atual?: number
          updated_at?: string
          version?: number | null
        }
        Update: {
          estoque_minimo?: number
          id?: string
          loja_id?: string
          produto_id?: string
          quantidade_atual?: number
          updated_at?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_baixas: {
        Row: {
          created_at: string
          produto_id: string
          quantidade: number | null
          venda_id: string
        }
        Insert: {
          created_at?: string
          produto_id: string
          quantidade?: number | null
          venda_id: string
        }
        Update: {
          created_at?: string
          produto_id?: string
          quantidade?: number | null
          venda_id?: string
        }
        Relationships: []
      }
      estoque_reposicoes_cancelamento: {
        Row: {
          created_at: string
          produto_id: string
          quantidade: number
          venda_id: string
        }
        Insert: {
          created_at?: string
          produto_id: string
          quantidade: number
          venda_id: string
        }
        Update: {
          created_at?: string
          produto_id?: string
          quantidade?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_reposicoes_cancelamento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_reposicoes_cancelamento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_reposicoes_cancelamento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_reposicoes_cancelamento_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          cnpj: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      gerente_auth_attempts: {
        Row: {
          failed_count: number
          lock_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          failed_count?: number
          lock_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          failed_count?: number
          lock_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gerente_auth_rate_limits: {
        Row: {
          failed_count: number
          first_attempt_at: string
          identifier: string
          lock_until: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          failed_count?: number
          first_attempt_at?: string
          identifier: string
          lock_until?: string | null
          scope: string
          updated_at?: string
        }
        Update: {
          failed_count?: number
          first_attempt_at?: string
          identifier?: string
          lock_until?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      importacoes_nfe: {
        Row: {
          chave_acesso: string
          created_at: string
          fornecedor_id: string
          id: string
          loja_id: string
          numero_nf: string | null
          usuario_id: string
        }
        Insert: {
          chave_acesso: string
          created_at?: string
          fornecedor_id: string
          id?: string
          loja_id: string
          numero_nf?: string | null
          usuario_id: string
        }
        Update: {
          chave_acesso?: string
          created_at?: string
          fornecedor_id?: string
          id?: string
          loja_id?: string
          numero_nf?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_nfe_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_nfe_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_nfe_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "importacoes_nfe_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_venda: {
        Row: {
          custo_unitario_snap: number | null
          desconto_unitario: number
          id: string
          preco_unitario: number
          preco_unitario_original: number
          produto_id: string
          quantidade: number
          regra_aplicada_id: string | null
          tipo_preco: string
          tipo_preco_fonte: string | null
          venda_id: string
        }
        Insert: {
          custo_unitario_snap?: number | null
          desconto_unitario?: number
          id?: string
          preco_unitario: number
          preco_unitario_original: number
          produto_id: string
          quantidade: number
          regra_aplicada_id?: string | null
          tipo_preco: string
          tipo_preco_fonte?: string | null
          venda_id: string
        }
        Update: {
          custo_unitario_snap?: number | null
          desconto_unitario?: number
          id?: string
          preco_unitario?: number
          preco_unitario_original?: number
          produto_id?: string
          quantidade?: number
          regra_aplicada_id?: string | null
          tipo_preco?: string
          tipo_preco_fonte?: string | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidacoes_receber: {
        Row: {
          created_at: string
          created_by: string
          forma_pagamento: string
          id: string
          observacao: string | null
          titulo_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by: string
          forma_pagamento: string
          id?: string
          observacao?: string | null
          titulo_id: string
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string
          forma_pagamento?: string
          id?: string
          observacao?: string | null
          titulo_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "liquidacoes_receber_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacoes_receber_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "contas_receber"
            referencedColumns: ["id"]
          },
        ]
      }
      lojas: {
        Row: {
          ativo: boolean
          cnae: string | null
          cnpj: string | null
          codigo: string | null
          created_at: string
          email: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_cidade: string | null
          endereco_complemento: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          endereco_uf: string | null
          id: string
          inscricao_estadual: string | null
          logo_url: string | null
          nome: string
          nome_fantasia: string | null
          numero_serie_nfe: number
          numero_serie_nfce: number
          razao_social: string | null
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          cnae?: string | null
          cnpj?: string | null
          codigo?: string | null
          created_at?: string
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string
          inscricao_estadual?: string | null
          logo_url?: string | null
          nome: string
          nome_fantasia?: string | null
          numero_serie_nfe?: number
          numero_serie_nfce?: number
          razao_social?: string | null
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          cnae?: string | null
          cnpj?: string | null
          codigo?: string | null
          created_at?: string
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string
          inscricao_estadual?: string | null
          logo_url?: string | null
          nome?: string
          nome_fantasia?: string | null
          numero_serie_nfe?: number
          numero_serie_nfce?: number
          razao_social?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      marcas: {
        Row: {
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      movimentacoes_caixa: {
        Row: {
          caixa_id: string
          created_at: string
          deleted_at: string | null
          device_id: string | null
          forma_pagamento: string
          gerente_id: string | null
          id: string
          idempotency_key: string
          ip_address: unknown
          loja_id: string | null
          motivo: string
          motivo_codigo: string
          movimentacao_origem_id: string | null
          numero_sequencial: number
          operador_id: string
          saldo_antes: number
          saldo_depois: number
          status: string
          terminal_id: string | null
          tipo: string
          updated_at: string
          user_agent: string | null
          valor: number
        }
        Insert: {
          caixa_id: string
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          forma_pagamento: string
          gerente_id?: string | null
          id?: string
          idempotency_key: string
          ip_address?: unknown
          loja_id?: string | null
          motivo: string
          motivo_codigo?: string
          movimentacao_origem_id?: string | null
          numero_sequencial?: number
          operador_id: string
          saldo_antes?: number
          saldo_depois?: number
          status?: string
          terminal_id?: string | null
          tipo: string
          updated_at?: string
          user_agent?: string | null
          valor: number
        }
        Update: {
          caixa_id?: string
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          forma_pagamento?: string
          gerente_id?: string | null
          id?: string
          idempotency_key?: string
          ip_address?: unknown
          loja_id?: string | null
          motivo?: string
          motivo_codigo?: string
          movimentacao_origem_id?: string | null
          numero_sequencial?: number
          operador_id?: string
          saldo_antes?: number
          saldo_depois?: number
          status?: string
          terminal_id?: string | null
          tipo?: string
          updated_at?: string
          user_agent?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_caixa_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_caixa_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_caixa_movimentacao_origem_id_fkey"
            columns: ["movimentacao_origem_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_caixa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_caixa_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentos_estoque_log: {
        Row: {
          anexo_url: string | null
          created_at: string
          id: string
          loja_id: string
          observacao: string | null
          produto_id: string
          quantidade_delta: number
          remessa_id: string | null
          tipo_codigo: string
          usuario_id: string
          venda_id: string | null
        }
        Insert: {
          anexo_url?: string | null
          created_at?: string
          id?: string
          loja_id: string
          observacao?: string | null
          produto_id: string
          quantidade_delta: number
          remessa_id?: string | null
          tipo_codigo: string
          usuario_id: string
          venda_id?: string | null
        }
        Update: {
          anexo_url?: string | null
          created_at?: string
          id?: string
          loja_id?: string
          observacao?: string | null
          produto_id?: string
          quantidade_delta?: number
          remessa_id?: string | null
          tipo_codigo?: string
          usuario_id?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentos_estoque_log_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_log_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "movimentos_estoque_log_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_log_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_log_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_log_remessa_id_fkey"
            columns: ["remessa_id"]
            isOneToOne: false
            referencedRelation: "remessas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_log_tipo_codigo_fkey"
            columns: ["tipo_codigo"]
            isOneToOne: false
            referencedRelation: "tipos_movimento_estoque"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "movimentos_estoque_log_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_log_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_compra: {
        Row: {
          created_at: string
          created_by: string | null
          data_emissao: string
          data_prevista_chegada: string | null
          fornecedor_id: string | null
          fornecedor_nome: string | null
          id: string
          loja_id: string
          observacao: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          data_prevista_chegada?: string | null
          fornecedor_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          loja_id: string
          observacao?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          data_prevista_chegada?: string | null
          fornecedor_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          loja_id?: string
          observacao?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_compra_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      ordens_compra_itens: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          ordem_id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
          quantidade_recebida: number
          unidade_medida: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          ordem_id: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade: number
          quantidade_recebida?: number
          unidade_medida?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          ordem_id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          quantidade_recebida?: number
          unidade_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_compra_itens_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_config: {
        Row: {
          alertas_leves_ativos: boolean
          blind_closure: boolean
          gerente_id: string
          gerente_senha_bcrypt: string | null
          id: number
          limite_sangria_sem_gerente: number
          limite_transferencia_obs: number
          max_desconto_gerente_percentual: number
          max_desconto_manual_item_percentual: number
          quantidade_minima_atacado_padrao: number
          show_margin_visual: boolean
          show_preco_fonte: boolean
          show_stock_alerts: boolean
        }
        Insert: {
          alertas_leves_ativos?: boolean
          blind_closure?: boolean
          gerente_id: string
          gerente_senha_bcrypt?: string | null
          id?: number
          limite_sangria_sem_gerente?: number
          limite_transferencia_obs?: number
          max_desconto_gerente_percentual?: number
          max_desconto_manual_item_percentual?: number
          quantidade_minima_atacado_padrao?: number
          show_margin_visual?: boolean
          show_preco_fonte?: boolean
          show_stock_alerts?: boolean
        }
        Update: {
          alertas_leves_ativos?: boolean
          blind_closure?: boolean
          gerente_id?: string
          gerente_senha_bcrypt?: string | null
          id?: number
          limite_sangria_sem_gerente?: number
          limite_transferencia_obs?: number
          max_desconto_gerente_percentual?: number
          max_desconto_manual_item_percentual?: number
          quantidade_minima_atacado_padrao?: number
          show_margin_visual?: boolean
          show_preco_fonte?: boolean
          show_stock_alerts?: boolean
        }
        Relationships: []
      }
      perfis: {
        Row: {
          created_at: string | null
          id: string
          loja_id: string | null
          perfil: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          loja_id?: string | null
          perfil: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          loja_id?: string | null
          perfil?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfis_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      precos_atacado: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          loja_id: string | null
          permitir_abaixo_custo: boolean
          preco_unitario: number
          produto_id: string
          quantidade_minima: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          loja_id?: string | null
          permitir_abaixo_custo?: boolean
          preco_unitario: number
          produto_id: string
          quantidade_minima: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          loja_id?: string | null
          permitir_abaixo_custo?: boolean
          preco_unitario?: number
          produto_id?: string
          quantidade_minima?: number
        }
        Relationships: [
          {
            foreignKeyName: "precos_atacado_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_atacado_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "precos_atacado_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_atacado_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_atacado_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          cest: string | null
          cfop_produto: string | null
          codigo_barras: string | null
          codigo_interno: string | null
          created_at: string
          csosn: string | null
          cst_cofins: string | null
          cst_pis: string | null
          estoque_minimo: number
          fornecedor_id: string | null
          id: string
          imagem_url: string | null
          limite_transferencia_sem_observacao: number | null
          loja_id: string
          marca_id: string | null
          ncm: string | null
          nome: string
          observacao: string | null
          origem: string
          permitir_abaixo_custo: boolean
          preco_atacado: number | null
          preco_custo: number | null
          preco_custo_medio: number
          preco_varejo: number
          quantidade_gatilho_atacado: number | null
          referencia_fornecedor: string | null
          status_publicacao: string
          tags: string[] | null
          tem_nf: boolean
          unidade_medida: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          cest?: string | null
          cfop_produto?: string | null
          codigo_barras?: string | null
          codigo_interno?: string | null
          created_at?: string
          csosn?: string | null
          cst_cofins?: string | null
          cst_pis?: string | null
          estoque_minimo?: number
          fornecedor_id?: string | null
          id?: string
          imagem_url?: string | null
          limite_transferencia_sem_observacao?: number | null
          loja_id: string
          marca_id?: string | null
          ncm?: string | null
          nome: string
          observacao?: string | null
          origem: string
          permitir_abaixo_custo?: boolean
          preco_atacado?: number | null
          preco_custo?: number | null
          preco_custo_medio?: number
          preco_varejo: number
          quantidade_gatilho_atacado?: number | null
          referencia_fornecedor?: string | null
          status_publicacao?: string
          tags?: string[] | null
          tem_nf?: boolean
          unidade_medida?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          cest?: string | null
          cfop_produto?: string | null
          codigo_barras?: string | null
          codigo_interno?: string | null
          created_at?: string
          csosn?: string | null
          cst_cofins?: string | null
          cst_pis?: string | null
          estoque_minimo?: number
          fornecedor_id?: string | null
          id?: string
          imagem_url?: string | null
          limite_transferencia_sem_observacao?: number | null
          loja_id?: string
          marca_id?: string | null
          ncm?: string | null
          nome?: string
          observacao?: string | null
          origem?: string
          permitir_abaixo_custo?: boolean
          preco_atacado?: number | null
          preco_custo?: number | null
          preco_custo_medio?: number
          preco_varejo?: number
          quantidade_gatilho_atacado?: number | null
          referencia_fornecedor?: string | null
          status_publicacao?: string
          tags?: string[] | null
          tem_nf?: boolean
          unidade_medida?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "produtos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
        ]
      }
      regras_preco: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          created_at: string
          created_by: string | null
          data_validade: string | null
          id: string
          permitir_abaixo_custo: boolean
          produto_id: string | null
          quantidade_maxima: number | null
          quantidade_minima: number
          tipo_desconto: string
          tipo_regra: string
          valor_desconto: number
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          created_at?: string
          created_by?: string | null
          data_validade?: string | null
          id?: string
          permitir_abaixo_custo?: boolean
          produto_id?: string | null
          quantidade_maxima?: number | null
          quantidade_minima: number
          tipo_desconto: string
          tipo_regra: string
          valor_desconto: number
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          created_at?: string
          created_by?: string | null
          data_validade?: string | null
          id?: string
          permitir_abaixo_custo?: boolean
          produto_id?: string | null
          quantidade_maxima?: number | null
          quantidade_minima?: number
          tipo_desconto?: string
          tipo_regra?: string
          valor_desconto?: number
        }
        Relationships: [
          {
            foreignKeyName: "regras_preco_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_preco_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_preco_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_preco_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_preco_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      relatorio_settings: {
        Row: {
          id: number
          timezone: string
        }
        Insert: {
          id?: number
          timezone?: string
        }
        Update: {
          id?: number
          timezone?: string
        }
        Relationships: []
      }
      remessa_itens: {
        Row: {
          divergencia_obs: string | null
          id: string
          produto_id: string
          quantidade_conferida: number | null
          quantidade_esperada: number
          remessa_id: string
        }
        Insert: {
          divergencia_obs?: string | null
          id?: string
          produto_id: string
          quantidade_conferida?: number | null
          quantidade_esperada: number
          remessa_id: string
        }
        Update: {
          divergencia_obs?: string | null
          id?: string
          produto_id?: string
          quantidade_conferida?: number | null
          quantidade_esperada?: number
          remessa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remessa_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remessa_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remessa_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remessa_itens_remessa_id_fkey"
            columns: ["remessa_id"]
            isOneToOne: false
            referencedRelation: "remessas"
            referencedColumns: ["id"]
          },
        ]
      }
      remessas: {
        Row: {
          anexo_url: string | null
          created_at: string
          created_by: string
          finalized_at: string | null
          id: string
          loja_id: string
          observacao: string | null
          origem_descricao: string
          status: string
        }
        Insert: {
          anexo_url?: string | null
          created_at?: string
          created_by: string
          finalized_at?: string | null
          id?: string
          loja_id: string
          observacao?: string | null
          origem_descricao: string
          status?: string
        }
        Update: {
          anexo_url?: string | null
          created_at?: string
          created_by?: string
          finalized_at?: string | null
          id?: string
          loja_id?: string
          observacao?: string | null
          origem_descricao?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "remessas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remessas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remessas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      sync_request_nonces: {
        Row: {
          created_at: string
          device_fingerprint: string
          expires_at: string
          nonce: string
          request_ts: number
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          expires_at: string
          nonce: string
          request_ts: number
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          expires_at?: string
          nonce?: string
          request_ts?: number
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          criado_em: string
          detalhe: Json | null
          id: string
          loja_id: string | null
          produto_id: string | null
          tipo: string
          venda_id: string | null
        }
        Insert: {
          criado_em?: string
          detalhe?: Json | null
          id?: string
          loja_id?: string | null
          produto_id?: string | null
          tipo: string
          venda_id?: string | null
        }
        Update: {
          criado_em?: string
          detalhe?: Json | null
          id?: string
          loja_id?: string | null
          produto_id?: string | null
          tipo?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_movimento_estoque: {
        Row: {
          codigo: string
          exige_gerente: boolean
          permite_entrada: boolean
          permite_saida: boolean
          rotulo: string
        }
        Insert: {
          codigo: string
          exige_gerente?: boolean
          permite_entrada?: boolean
          permite_saida?: boolean
          rotulo: string
        }
        Update: {
          codigo?: string
          exige_gerente?: boolean
          permite_entrada?: boolean
          permite_saida?: boolean
          rotulo?: string
        }
        Relationships: []
      }
      tokens_desconto_gerente: {
        Row: {
          created_at: string
          criado_por: string | null
          expira_em: string
          loja_id: string | null
          token: string
          usado: boolean
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          expira_em: string
          loja_id?: string | null
          token: string
          usado?: boolean
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          expira_em?: string
          loja_id?: string | null
          token?: string
          usado?: boolean
        }
        Relationships: []
      }
      transferencias_idempotencia: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          transferencia_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          transferencia_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          transferencia_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_idempotencia_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "movimentos_estoque_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_idempotencia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          idioma_preferido: string
          loja_id: string
          nome: string
          perfil: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id: string
          idioma_preferido?: string
          loja_id?: string
          nome: string
          perfil: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          idioma_preferido?: string
          loja_id?: string
          nome?: string
          perfil?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      venda_finance_context: {
        Row: {
          atualizado_em: string
          cliente_id: string | null
          conta_referencia: string | null
          loja_id: string | null
          origem_pagamento: string
          status_pagamento: string
          venda_id: string
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
          conta_referencia?: string | null
          loja_id?: string | null
          origem_pagamento?: string
          status_pagamento?: string
          venda_id: string
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
          conta_referencia?: string | null
          loja_id?: string | null
          origem_pagamento?: string
          status_pagamento?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_finance_context_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_finance_context_conta_referencia_fkey"
            columns: ["conta_referencia"]
            isOneToOne: false
            referencedRelation: "contas_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_finance_context_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_finance_context_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: true
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          caixa_id: string | null
          chave_nf: string | null
          created_at: string
          data: string
          forma_pagamento: string
          id: string
          idempotency_key: string | null
          numero_nf: string | null
          operador_id: string | null
          status: string
          tipo_venda: string
          total_bruto: number
          total_desconto: number
          total_liquido: number
        }
        Insert: {
          caixa_id?: string | null
          chave_nf?: string | null
          created_at?: string
          data?: string
          forma_pagamento: string
          id?: string
          idempotency_key?: string | null
          numero_nf?: string | null
          operador_id?: string | null
          status?: string
          tipo_venda?: string
          total_bruto: number
          total_desconto?: number
          total_liquido: number
        }
        Update: {
          caixa_id?: string | null
          chave_nf?: string | null
          created_at?: string
          data?: string
          forma_pagamento?: string
          id?: string
          idempotency_key?: string | null
          numero_nf?: string | null
          operador_id?: string | null
          status?: string
          tipo_venda?: string
          total_bruto?: number
          total_desconto?: number
          total_liquido?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_canceladas_auditoria: {
        Row: {
          caixa_id: string
          created_at: string
          forma_pagamento: string
          id: string
          motivo: string
          operador_id: string
          valor_estornado: number
          venda_id: string
        }
        Insert: {
          caixa_id: string
          created_at?: string
          forma_pagamento: string
          id?: string
          motivo: string
          operador_id: string
          valor_estornado?: number
          venda_id: string
        }
        Update: {
          caixa_id?: string
          created_at?: string
          forma_pagamento?: string
          id?: string
          motivo?: string
          operador_id?: string
          valor_estornado?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_canceladas_auditoria_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_canceladas_auditoria_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_canceladas_auditoria_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: true
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_pagamentos: {
        Row: {
          created_at: string
          forma_pagamento: string
          id: string
          valor: number
          venda_id: string
        }
        Insert: {
          created_at?: string
          forma_pagamento: string
          id?: string
          valor: number
          venda_id: string
        }
        Update: {
          created_at?: string
          forma_pagamento?: string
          id?: string
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_pagamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vinculos_fornecedor_produto: {
        Row: {
          created_at: string
          criado_por: string | null
          fornecedor_id: string
          gtin_origem: string | null
          id: string
          loja_id: string
          produto_id: string
          ref_fornecedor: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          fornecedor_id: string
          gtin_origem?: string | null
          id?: string
          loja_id: string
          produto_id: string
          ref_fornecedor: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          fornecedor_id?: string
          gtin_origem?: string | null
          id?: string
          loja_id?: string
          produto_id?: string
          ref_fornecedor?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_fornecedor_produto_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_fornecedor_produto_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_fornecedor_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_estoque_baixo: {
        Row: {
          codigo_barras: string | null
          deficit: number | null
          estoque_minimo: number | null
          id: string | null
          loja_id: string | null
          loja_nome: string | null
          nome: string | null
          origem: string | null
          quantidade_atual: number | null
        }
        Relationships: []
      }
      v_fiscal_doc_status_event_mismatch: {
        Row: {
          documento_id: string | null
          status_atual: string | null
          ultimo_erro: string | null
          ultimo_evento_em: string | null
          ultimo_evento_tipo: string | null
        }
        Relationships: []
      }
      v_kardex_unificado: {
        Row: {
          evento_id: string | null
          loja_id: string | null
          observacao: string | null
          ocorrido_em: string | null
          origem: string | null
          produto_id: string | null
          quantidade_delta: number | null
          referencia_id: string | null
          tipo_codigo: string | null
          usuario_id: string | null
        }
        Relationships: []
      }
      v_top_produtos: {
        Row: {
          id: string | null
          nome: string | null
          num_vendas: number | null
          origem: string | null
          qtde_atacado: number | null
          qtde_varejo: number | null
          total_quantidade: number | null
          total_valor: number | null
        }
        Relationships: []
      }
      v_vendas_dia: {
        Row: {
          dia: string | null
          num_vendas: number | null
          ticket_medio: number | null
          total_desconto: number | null
          total_liquido: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      ajustar_estoque_manual: {
        Args: {
          p_estoque_minimo: number
          p_loja_id: string
          p_motivo_codigo: string
          p_observacao?: string
          p_produto_id: string
          p_quantidade_atual: number
        }
        Returns: undefined
      }
      aprovar_movimentacao: {
        Args: {
          p_autorizacao_token?: string
          p_device_id?: string
          p_gerente_id?: string
          p_ip_address?: unknown
          p_movimentacao_id: string
          p_terminal_id?: string
          p_user_agent?: string
        }
        Returns: {
          movimentacao_id: string
          saldo_atual: number
          status_movimentacao: string
        }[]
      }
      auth_usuario_eh_dono: { Args: never; Returns: boolean }
      baixar_estoque_venda: {
        Args: { p_itens: Json; p_loja_id: string }
        Returns: undefined
      }
      calcular_preco_produto: {
        Args: { p_loja_id?: string; p_produto_id: string; p_quantidade: number }
        Returns: Json
      }
      calcular_valor_sistema_dinheiro_caixa: {
        Args: { p_caixa_id: string }
        Returns: number
      }
      cancelar_movimentacao: {
        Args: { p_motivo_cancelamento?: string; p_movimentacao_id: string }
        Returns: {
          movimentacao_id: string
          status_movimentacao: string
        }[]
      }
      cancelar_venda_transacional: {
        Args: { p_motivo: string; p_operador_id?: string; p_venda_id: string }
        Returns: {
          status_venda: string
          valor_estornado: number
          venda_id: string
        }[]
      }
      confirmar_remessa_entrada: {
        Args: { p_remessa_id: string }
        Returns: undefined
      }
      dashboard_gerente_resumo: {
        Args: { p_loja_id: string; p_tz?: string }
        Returns: Json
      }
      decrementar_estoque_idempotente: {
        Args: { p_produto_id: string; p_quantidade: number; p_venda_id: string }
        Returns: undefined
      }
      decrementar_estoque_seguro: {
        Args: { p_produto_id: string; p_quantidade: number; p_venda_id: string }
        Returns: {
          estoque_atual: number
          mensagem: string
          sucesso: boolean
        }[]
      }
      estornar_movimentacao: {
        Args: {
          p_device_id?: string
          p_idempotency_key?: string
          p_ip_address?: unknown
          p_motivo: string
          p_movimentacao_origem_id: string
          p_operador_id?: string
          p_terminal_id?: string
          p_user_agent?: string
        }
        Returns: {
          movimentacao_id: string
          saldo_atual: number
          status_movimentacao: string
        }[]
      }
      fechar_caixa_atomico: {
        Args: {
          p_motivo?: string
          p_operador_id: string
          p_valor_contado: number
        }
        Returns: {
          o_caixa_id: string
          o_diferenca: number
          o_valor_contado: number
          o_valor_sistema: number
        }[]
      }
      finalizar_venda_transacional: {
        Args: {
          p_caixa_id: string
          p_desconto_gerente_percentual?: number
          p_desconto_gerente_token?: string
          p_forma_pagamento: string
          p_itens: Json
          p_total_bruto: number
          p_total_desconto: number
          p_total_liquido: number
          p_venda_id: string
        }
        Returns: undefined
      }
      finalizar_venda_transacional_canonica_v2:
        | {
            Args: {
              p_caixa_id: string
              p_desconto_gerente_percentual?: number
              p_desconto_gerente_token?: string
              p_itens: Json
              p_loja_id: string
              p_operador_id: string
              p_pagamentos: Json
              p_tipo_venda?: string
              p_total_bruto: number
              p_total_desconto: number
              p_total_liquido: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_caixa_id: string
              p_desconto_gerente_percentual?: number
              p_desconto_gerente_token?: string
              p_forma_pagamento?: string
              p_itens?: Json
              p_operador_id?: string
              p_pagamentos?: Json
              p_strict_manager_discount_auth?: boolean
              p_total_bruto?: number
              p_total_desconto?: number
              p_total_liquido?: number
              p_venda_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_caixa_id: string
              p_desconto_gerente_percentual: number
              p_desconto_gerente_token: string
              p_forma_pagamento: string
              p_idempotency_key: string
              p_itens: Json
              p_operador_id: string
              p_pagamentos: Json
              p_strict_manager_discount_auth: boolean
              p_total_bruto: number
              p_total_desconto: number
              p_total_liquido: number
              p_venda_id: string
            }
            Returns: Json
          }
      finalizar_venda_transacional_canonica_v3: {
        Args: {
          p_caixa_id: string
          p_desconto_gerente_percentual?: number
          p_desconto_gerente_token?: string
          p_device_id?: string
          p_fiscal_auto_enqueue?: boolean
          p_forma_pagamento?: string
          p_ip_address?: string
          p_itens?: Json
          p_loja_id: string
          p_operador_id: string
          p_pagamentos?: Json
          p_strict_manager_discount_auth?: boolean
          p_terminal_id?: string
          p_total_bruto?: number
          p_total_desconto?: number
          p_total_liquido?: number
          p_user_agent?: string
          p_venda_id: string
        }
        Returns: {
          dados_fiscais: Json
          estoque_baixado: Json
          event_id: string
          itens_atualizados: Json
          mensagem: string
          status: string
          venda_id: string
        }[]
      }
      finalizar_venda_transacional_canonica_v4: {
        Args: {
          p_caixa_id: string
          p_desconto_gerente_percentual?: number
          p_desconto_gerente_token?: string
          p_device_id?: string
          p_fiscal_auto_enqueue?: boolean
          p_forma_pagamento?: string
          p_ip_address?: string
          p_itens?: Json
          p_loja_id: string
          p_operador_id: string
          p_pagamentos?: Json
          p_strict_manager_discount_auth?: boolean
          p_terminal_id?: string
          p_total_bruto?: number
          p_total_desconto?: number
          p_total_liquido?: number
          p_user_agent?: string
          p_venda_id: string
        }
        Returns: {
          dados_fiscais: Json
          estoque_baixado: Json
          event_id: string
          itens_atualizados: Json
          mensagem: string
          status: string
          venda_id: string
        }[]
      }
      fiscal_claim_documentos: {
        Args: { p_limit?: number }
        Returns: {
          chave_fiscal: string | null
          created_at: string
          deleted_at: string | null
          fiscal_action_hint: string | null
          fiscal_error_category: string | null
          fiscal_error_code: string | null
          fiscal_error_payload: Json | null
          fiscal_next_step_url: string | null
          fiscal_retryable: boolean | null
          id: string
          payload: Json | null
          processado_em: string | null
          protocolo: string | null
          provider: string | null
          provider_ref: string | null
          proxima_tentativa_em: string | null
          status: string
          tentativas: number
          tipo_doc: string
          ultima_tentativa_em: string | null
          ultimo_erro: string | null
          updated_at: string
          venda_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "documentos_fiscais_pendentes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fiscal_enfileirar_documento_venda: {
        Args: { p_payload?: Json; p_tipo_doc?: string; p_venda_id: string }
        Returns: string
      }
      fiscal_marcar_emitido: {
        Args: {
          p_chave_fiscal: string
          p_documento_id: string
          p_payload?: Json
          p_protocolo: string
          p_provider_ref?: string
        }
        Returns: undefined
      }
      fiscal_marcar_erro:
        | {
            Args: {
              p_documento_id: string
              p_erro: string
              p_transitorio?: boolean
            }
            Returns: undefined
          }
        | {
            Args: {
              p_documento_id: string
              p_erro: string
              p_erro_detalhe?: Json
              p_erro_normalizado?: string
              p_retryable?: boolean
              p_transitorio: boolean
            }
            Returns: undefined
          }
      fiscal_marcar_erro_normalizado:
        | {
            Args: {
              p_action_hint?: string
              p_documento_id: string
              p_erro: string
              p_error_category?: string
              p_error_code?: string
              p_error_payload?: Json
              p_next_step_url?: string
              p_retryable?: boolean
              p_transitorio?: boolean
            }
            Returns: undefined
          }
        | {
            Args: {
              p_documento_id: string
              p_erro: string
              p_erro_detalhe?: Json
              p_erro_normalizado: string
              p_retryable?: boolean
              p_transitorio: boolean
            }
            Returns: undefined
          }
      fiscal_reprocessar_documento:
        | { Args: { p_documento_id: string }; Returns: undefined }
        | {
            Args: { p_documento_id: string; p_observacao?: string }
            Returns: undefined
          }
      gerente_estoque_list_page: {
        Args: {
          p_busca?: string
          p_categoria_id?: string
          p_dir_asc?: boolean
          p_limite?: number
          p_loja_id: string
          p_offset?: number
          p_ordem?: string
          p_origem?: string
          p_visao?: string
        }
        Returns: Json
      }
      importar_nfe_transacao:
        | {
            Args: {
              p_atualizar_custo?: boolean
              p_chave_acesso: string
              p_fornecedor_cnpj: string
              p_fornecedor_nome: string
              p_itens: Json
              p_loja_id: string
              p_numero_nf: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_atualizar_custo?: boolean
              p_chave_acesso: string
              p_duplicatas?: Json
              p_fornecedor_cnpj: string
              p_fornecedor_nome: string
              p_itens: Json
              p_loja_id: string
              p_numero_nf: string
            }
            Returns: Json
          }
      is_feature_enabled: { Args: { flag_name: string }; Returns: boolean }
      list_produtos_gerente_filtrados: {
        Args: {
          p_busca?: string
          p_categoria_id?: string
          p_estoque_filtro?: string
          p_fornecedor_id?: string
          p_imagens_filtro?: string
          p_loja_id: string
          p_marca_id?: string
          p_nf_filtro?: string
          p_origem_filtro?: string
          p_page?: number
          p_page_size?: number
          p_situacao?: string
          p_tags_filtro?: string[]
        }
        Returns: {
          ativo: boolean
          categoria_id: string
          codigo_barras: string
          fornecedor_id: string
          id: string
          imagem_url: string
          marca_id: string
          nome: string
          observacao: string
          origem: string
          preco_atacado: number
          preco_varejo: number
          quantidade_gatilho_atacado: number
          tags: string[]
          tem_nf: boolean
          total_count: number
          unidade_medida: string
        }[]
      }
      listar_valores_sistema_dinheiro_caixas: {
        Args: { p_caixa_ids: string[] }
        Returns: {
          caixa_id: string
          valor: number
        }[]
      }
      obter_estoque_disponivel_transferencia: {
        Args: { p_loja_id: string; p_produto_id: string }
        Returns: {
          limite_observacao: number
          quantidade_disponivel: number
          unidade_medida: string
        }[]
      }
      obter_limite_sangria_sem_gerente: { Args: never; Returns: number }
      pdv_config_flags_visuais: {
        Args: never
        Returns: {
          alertas_leves_ativos: boolean
          show_margin_visual: boolean
          show_preco_fonte: boolean
          show_stock_alerts: boolean
        }[]
      }
      pdv_config_para_caixa_web: {
        Args: never
        Returns: {
          blind_closure: boolean
          quantidade_minima_atacado_padrao: number
        }[]
      }
      recalcular_saldo_caixa: {
        Args: { p_caixa_id: string }
        Returns: {
          caixa_id: string
          divergencia: number
          saldo_anterior: number
          saldo_recalculado: number
        }[]
      }
      receber_ordem_compra: {
        Args: { p_itens: Json; p_oc_id: string }
        Returns: undefined
      }
      registrar_liquidacao_receber: {
        Args: {
          p_forma_pagamento: string
          p_observacao?: string
          p_titulo_id: string
          p_valor: number
        }
        Returns: undefined
      }
      registrar_movimentacao: {
        Args: {
          p_caixa_id: string
          p_device_id?: string
          p_forma_pagamento: string
          p_gerente_id?: string
          p_idempotency_key?: string
          p_ip_address?: unknown
          p_motivo: string
          p_motivo_codigo?: string
          p_movimentacao_origem_id?: string
          p_operador_id?: string
          p_status?: string
          p_terminal_id?: string
          p_tipo: string
          p_user_agent?: string
          p_valor: number
        }
        Returns: {
          movimentacao_id: string
          saldo_atual: number
          status_movimentacao: string
        }[]
      }
      registrar_pagamento_contas_pagar: {
        Args: {
          p_conta_id: string
          p_data?: string
          p_forma: string
          p_observacao?: string
          p_valor: number
        }
        Returns: undefined
      }
      registrar_system_alert: {
        Args: {
          p_detalhe?: Json
          p_loja_id?: string
          p_produto_id?: string
          p_tipo: string
          p_venda_id?: string
        }
        Returns: undefined
      }
      registrar_venda_com_itens: {
        Args: {
          p_caixa_id: string
          p_desconto_gerente_percentual?: number
          p_desconto_gerente_valor?: number
          p_forma_pagamento: string
          p_gerente_id?: string
          p_itens: Json
          p_operador_id: string
          p_total_bruto: number
          p_total_desconto: number
          p_total_liquido: number
          p_venda_id: string
        }
        Returns: undefined
      }
      relatorio_produtos_sem_giro_periodo: {
        Args: { p_data_fim: string; p_data_inicio: string; p_loja_id: string }
        Returns: {
          codigo_barras: string
          estoque_minimo: number
          nome: string
          preco_custo: number
          produto_id: string
          quantidade_atual: number
          ultima_venda: string
          valor_imobilizado: number
        }[]
      }
      relatorio_curva_abc_periodo: {
        Args: { p_ate: string; p_de: string; p_limite?: number; p_tz?: string }
        Returns: {
          classe_abc: string
          nome: string
          percentual_acumulado: number
          percentual_valor: number
          produto_id: string
          total_quantidade: number
          total_valor: number
        }[]
      }
      relatorio_margem_por_venda_periodo: {
        Args: { p_ate: string; p_de: string; p_limite?: number; p_tz?: string }
        Returns: {
          custo_confiavel: boolean
          custo_total_estimado: number | null
          data: string
          margem_estimada: number | null
          num_itens: number
          total_desconto: number
          total_liquido: number
          venda_id: string
        }[]
      }
      relatorio_cobertura_estoque: {
        Args: { p_dias_janela?: number; p_limite?: number }
        Returns: {
          dias_cobertura: number | null
          loja_id: string
          media_diaria_vendida: number
          nome: string
          produto_id: string
          quantidade_atual: number
        }[]
      }
      relatorio_resumo_executivo_periodo: {
        Args: { p_ate: string; p_de: string; p_tz?: string }
        Returns: {
          cobertura_custo: number
          custo_confiavel: boolean
          itens_vendidos: number
          margem_bruta_estimada: number
          taxa_cancelamento: number
          vendas_canceladas: number
          vendas_concluidas: number
        }[]
      }
      relatorio_top_produtos_periodo: {
        Args: { p_ate: string; p_de: string; p_limite?: number; p_tz?: string }
        Returns: {
          id: string
          nome: string
          num_vendas: number
          origem: string
          qtde_atacado: number
          qtde_varejo: number
          total_quantidade: number
          total_valor: number
        }[]
      }
      relatorio_tz_validado: { Args: { p_tz: string }; Returns: string }
      relatorio_vendas_por_dia_periodo: {
        Args: { p_ate: string; p_de: string; p_tz?: string }
        Returns: {
          dia: string
          num_vendas: number
          ticket_medio: number
          total_desconto: number
          total_liquido: number
        }[]
      }
      round_abnt: {
        Args: { p_scale?: number; p_value: number }
        Returns: number
      }
      transferir_estoque_entre_lojas: {
        Args: {
          p_loja_destino: string
          p_loja_origem: string
          p_observacao?: string
          p_produto_id: string
          p_quantidade: number
        }
        Returns: undefined
      }
      transferir_estoque_seguro: {
        Args: {
          p_idempotency_key?: string
          p_loja_destino: string
          p_loja_origem: string
          p_observacao?: string
          p_produto_id: string
          p_quantidade: number
          p_saldo_esperado?: number
        }
        Returns: string
      }
    }
    Enums: {
      categoria_financeira_tipo: "RECEITA" | "DESPESA" | "AMBOS"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      categoria_financeira_tipo: ["RECEITA", "DESPESA", "AMBOS"],
    },
  },
} as const
