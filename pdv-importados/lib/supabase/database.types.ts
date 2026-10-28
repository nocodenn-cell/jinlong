export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cadastro_produto_telemetry_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          event_name: string
          fonte_sugestao: string | null
          id: string
          known_suggestion: boolean | null
          loja_id: string | null
          meta_ok: boolean | null
          payload: Json
          surface: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          event_name: string
          fonte_sugestao?: string | null
          id?: string
          known_suggestion?: boolean | null
          loja_id?: string | null
          meta_ok?: boolean | null
          payload?: Json
          surface: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          event_name?: string
          fonte_sugestao?: string | null
          id?: string
          known_suggestion?: boolean | null
          loja_id?: string | null
          meta_ok?: boolean | null
          payload?: Json
          surface?: string
          user_id?: string
        }
        Relationships: []
      }
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
          autorizado_por: string | null
          conta_financeira_id: string | null
          data_abertura: string
          data_fechamento: string | null
          fechamento_diferenca: number | null
          fechamento_observacao: string | null
          id: string
          loja_id: string
          motivo_retomada: string | null
          operador_id: string | null
          saldo_atual: number
          status: string
          turno_anterior_id: string | null
          valor_fechamento: number | null
          valor_inicial: number
        }
        Insert: {
          autorizado_por?: string | null
          conta_financeira_id?: string | null
          data_abertura?: string
          data_fechamento?: string | null
          fechamento_diferenca?: number | null
          fechamento_observacao?: string | null
          id?: string
          loja_id: string
          motivo_retomada?: string | null
          operador_id?: string | null
          saldo_atual?: number
          status?: string
          turno_anterior_id?: string | null
          valor_fechamento?: number | null
          valor_inicial?: number
        }
        Update: {
          autorizado_por?: string | null
          conta_financeira_id?: string | null
          data_abertura?: string
          data_fechamento?: string | null
          fechamento_diferenca?: number | null
          fechamento_observacao?: string | null
          id?: string
          loja_id?: string
          motivo_retomada?: string | null
          operador_id?: string | null
          saldo_atual?: number
          status?: string
          turno_anterior_id?: string | null
          valor_fechamento?: number | null
          valor_inicial?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixas_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixas_conta_financeira_id_fkey"
            columns: ["conta_financeira_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "caixas_turno_anterior_id_fkey"
            columns: ["turno_anterior_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
        ]
      }
      caixas_fechamento_formas: {
        Row: {
          caixa_id: string
          created_at: string
          created_by: string | null
          diferenca: number | null
          forma_pagamento: string
          id: string
          metrica: string
          origem_regra: string
          valor_informado: number | null
          valor_sistema_snapshot: number
        }
        Insert: {
          caixa_id: string
          created_at?: string
          created_by?: string | null
          diferenca?: number | null
          forma_pagamento: string
          id?: string
          metrica: string
          origem_regra?: string
          valor_informado?: number | null
          valor_sistema_snapshot: number
        }
        Update: {
          caixa_id?: string
          created_at?: string
          created_by?: string | null
          diferenca?: number | null
          forma_pagamento?: string
          id?: string
          metrica?: string
          origem_regra?: string
          valor_informado?: number | null
          valor_sistema_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixas_fechamento_formas_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixas_fechamento_formas_created_by_fkey"
            columns: ["created_by"]
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
          empresa_id: string | null
          id: string
          nome: string
          nome_sem_acento: string | null
        }
        Insert: {
          ativo?: boolean
          categoria_pai_id?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          nome: string
          nome_sem_acento?: string | null
        }
        Update: {
          ativo?: boolean
          categoria_pai_id?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          nome?: string
          nome_sem_acento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorias_categoria_pai_id_fkey"
            columns: ["categoria_pai_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string | null
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["categoria_financeira_tipo"]
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string | null
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["categoria_financeira_tipo"]
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string | null
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["categoria_financeira_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean
          consentimento_privacidade_em: string | null
          created_at: string
          documento: string | null
          email: string | null
          endereco: string | null
          id: string
          limite_credito: number
          loja_id: string
          nome: string
          telefone: string | null
          termos_aceitos_em: string | null
          tipo: string
        }
        Insert: {
          ativo?: boolean
          consentimento_privacidade_em?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          limite_credito?: number
          loja_id: string
          nome: string
          telefone?: string | null
          termos_aceitos_em?: string | null
          tipo?: string
        }
        Update: {
          ativo?: boolean
          consentimento_privacidade_em?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          limite_credito?: number
          loja_id?: string
          nome?: string
          telefone?: string | null
          termos_aceitos_em?: string | null
          tipo?: string
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
      comissoes_ajustes: {
        Row: {
          comissao_id: string
          competencia: string | null
          created_at: string
          id: string
          idempotency_key: string
          loja_id: string
          operador_id: string
          origem_id: string | null
          tipo: string
          valor: number
          venda_id: string
        }
        Insert: {
          comissao_id: string
          competencia?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          loja_id: string
          operador_id: string
          origem_id?: string | null
          tipo: string
          valor: number
          venda_id: string
        }
        Update: {
          comissao_id?: string
          competencia?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          loja_id?: string
          operador_id?: string
          origem_id?: string | null
          tipo?: string
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_ajustes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_reconstrucao_auditoria"
            referencedColumns: ["comissao_id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_vendedores_liquidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_config: {
        Row: {
          base: string
          empresa_id: string
          liberacao: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base?: string
          empresa_id: string
          liberacao?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base?: string
          empresa_id?: string
          liberacao?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_divisoes: {
        Row: {
          created_at: string
          criado_por: string | null
          loja_id: string
          operador_secundario_id: string
          percentual: number
          venda_id: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          loja_id: string
          operador_secundario_id: string
          percentual: number
          venda_id: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          loja_id?: string
          operador_secundario_id?: string
          percentual?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_divisoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_divisoes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_divisoes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_divisoes_operador_secundario_id_fkey"
            columns: ["operador_secundario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_divisoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: true
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "comissoes_divisoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: true
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_falhas: {
        Row: {
          contexto: Json | null
          created_at: string
          etapa: string
          id: string
          loja_id: string | null
          motivo: string
          resolvida_em: string | null
          resolvida_por: string | null
          sqlstate: string | null
          tentativas: number
          ultima_tentativa_em: string
          venda_id: string
        }
        Insert: {
          contexto?: Json | null
          created_at?: string
          etapa: string
          id?: string
          loja_id?: string | null
          motivo: string
          resolvida_em?: string | null
          resolvida_por?: string | null
          sqlstate?: string | null
          tentativas?: number
          ultima_tentativa_em?: string
          venda_id: string
        }
        Update: {
          contexto?: Json | null
          created_at?: string
          etapa?: string
          id?: string
          loja_id?: string | null
          motivo?: string
          resolvida_em?: string | null
          resolvida_por?: string | null
          sqlstate?: string | null
          tentativas?: number
          ultima_tentativa_em?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_falhas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_falhas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_falhas_resolvida_por_fkey"
            columns: ["resolvida_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_falhas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "comissoes_falhas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_itens: {
        Row: {
          apurado_em: string
          base_elegivel: number
          canal: string | null
          comissao_id: string
          desconto_rateado: number
          id: string
          item_venda_id: string
          origem_regra: string
          percentual_aplicado: number | null
          preco_unitario: number
          produto_id: string
          quantidade: number
          regra_empresa_id: string | null
          regra_id: string | null
          tipo_calculo: string
          valor_comissao: number
          valor_unitario_fixo: number | null
          venda_id: string
        }
        Insert: {
          apurado_em?: string
          base_elegivel: number
          canal?: string | null
          comissao_id: string
          desconto_rateado?: number
          id?: string
          item_venda_id: string
          origem_regra: string
          percentual_aplicado?: number | null
          preco_unitario: number
          produto_id: string
          quantidade: number
          regra_empresa_id?: string | null
          regra_id?: string | null
          tipo_calculo: string
          valor_comissao: number
          valor_unitario_fixo?: number | null
          venda_id: string
        }
        Update: {
          apurado_em?: string
          base_elegivel?: number
          canal?: string | null
          comissao_id?: string
          desconto_rateado?: number
          id?: string
          item_venda_id?: string
          origem_regra?: string
          percentual_aplicado?: number | null
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          regra_empresa_id?: string | null
          regra_id?: string | null
          tipo_calculo?: string
          valor_comissao?: number
          valor_unitario_fixo?: number | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_itens_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_reconstrucao_auditoria"
            referencedColumns: ["comissao_id"]
          },
          {
            foreignKeyName: "comissoes_itens_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_itens_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_vendedores_liquidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_itens_item_venda_id_fkey"
            columns: ["item_venda_id"]
            isOneToOne: false
            referencedRelation: "itens_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_itens_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "comissoes_regras_funcionario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_itens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "comissoes_itens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_metas: {
        Row: {
          ativo: boolean
          cargo: string | null
          competencia_fim: string | null
          competencia_inicio: string
          created_at: string
          created_by: string | null
          descricao: string | null
          empresa_id: string
          faixas: Json
          id: string
          loja_id: string | null
          usuario_id: string | null
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          competencia_fim?: string | null
          competencia_inicio: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id: string
          faixas: Json
          id?: string
          loja_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          competencia_fim?: string | null
          competencia_inicio?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id?: string
          faixas?: Json
          id?: string
          loja_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_metas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_metas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_metas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_metas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_metas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_pagamentos: {
        Row: {
          id: string
          idempotency_key: string
          loja_id: string
          operador_id: string
          pago_em: string
          pago_por: string | null
          valor_bruto: number
          valor_compensado: number
          valor_liquido: number
        }
        Insert: {
          id?: string
          idempotency_key: string
          loja_id: string
          operador_id: string
          pago_em?: string
          pago_por?: string | null
          valor_bruto: number
          valor_compensado?: number
          valor_liquido: number
        }
        Update: {
          id?: string
          idempotency_key?: string
          loja_id?: string
          operador_id?: string
          pago_em?: string
          pago_por?: string | null
          valor_bruto?: number
          valor_compensado?: number
          valor_liquido?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_pagamentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_pagamentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_pagamentos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_pagamentos_pago_por_fkey"
            columns: ["pago_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_pagamentos_ajustes: {
        Row: {
          ajuste_id: string
          pagamento_id: string
          valor_consumido: number
        }
        Insert: {
          ajuste_id: string
          pagamento_id: string
          valor_consumido: number
        }
        Update: {
          ajuste_id?: string
          pagamento_id?: string
          valor_consumido?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_pagamentos_ajustes_ajuste_id_fkey"
            columns: ["ajuste_id"]
            isOneToOne: false
            referencedRelation: "comissoes_ajustes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_pagamentos_ajustes_ajuste_id_fkey"
            columns: ["ajuste_id"]
            isOneToOne: false
            referencedRelation: "comissoes_ajustes_auditoria"
            referencedColumns: ["ajuste_id"]
          },
          {
            foreignKeyName: "comissoes_pagamentos_ajustes_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "comissoes_pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_periodo_vendedores: {
        Row: {
          ajustes: number
          base: number
          bonus_meta: number
          comissao: number
          operador_id: string
          periodo_id: string
          total: number
          vendas: number
        }
        Insert: {
          ajustes?: number
          base?: number
          bonus_meta?: number
          comissao?: number
          operador_id: string
          periodo_id: string
          total?: number
          vendas?: number
        }
        Update: {
          ajustes?: number
          base?: number
          bonus_meta?: number
          comissao?: number
          operador_id?: string
          periodo_id?: string
          total?: number
          vendas?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_periodo_vendedores_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_periodo_vendedores_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "comissoes_periodos"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_periodos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          competencia: string
          created_at: string
          empresa_id: string
          id: string
          loja_id: string
          pago_em: string | null
          pago_por: string | null
          revisado_em: string | null
          revisado_por: string | null
          status: string
          total: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          competencia: string
          created_at?: string
          empresa_id: string
          id?: string
          loja_id: string
          pago_em?: string | null
          pago_por?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          total?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          competencia?: string
          created_at?: string
          empresa_id?: string
          id?: string
          loja_id?: string
          pago_em?: string | null
          pago_por?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_periodos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_periodos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_periodos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_periodos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_periodos_pago_por_fkey"
            columns: ["pago_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_periodos_revisado_por_fkey"
            columns: ["revisado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_regras: {
        Row: {
          ativo: boolean
          canal: string | null
          cargo: string | null
          categoria_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          empresa_id: string
          id: string
          loja_id: string | null
          produto_id: string | null
          tipo_calculo: string
          updated_at: string
          usuario_id: string | null
          valor: number
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          ativo?: boolean
          canal?: string | null
          cargo?: string | null
          categoria_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id: string
          id?: string
          loja_id?: string | null
          produto_id?: string | null
          tipo_calculo: string
          updated_at?: string
          usuario_id?: string | null
          valor: number
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          ativo?: boolean
          canal?: string | null
          cargo?: string | null
          categoria_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id?: string
          id?: string
          loja_id?: string | null
          produto_id?: string | null
          tipo_calculo?: string
          updated_at?: string
          usuario_id?: string | null
          valor?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_regras_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_regras_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_regras_funcionario: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          created_at: string
          created_by: string
          funcionario_id: string
          id: string
          loja_id: string
          margem_maxima: number | null
          margem_minima: number | null
          percentual: number
          produto_id: string | null
          tipo_regra: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          created_at?: string
          created_by: string
          funcionario_id: string
          id?: string
          loja_id: string
          margem_maxima?: number | null
          margem_minima?: number | null
          percentual: number
          produto_id?: string | null
          tipo_regra: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          created_at?: string
          created_by?: string
          funcionario_id?: string
          id?: string
          loja_id?: string
          margem_maxima?: number | null
          margem_minima?: number | null
          percentual?: number
          produto_id?: string | null
          tipo_regra?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_regras_funcionario_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_funcionario_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_funcionario_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_funcionario_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_funcionario_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_regras_funcionario_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_funcionario_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_funcionario_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_regras_historico: {
        Row: {
          acao: string
          alterado_em: string
          alterado_por: string
          dados_anteriores: Json | null
          dados_novos: Json
          funcionario_id: string
          id: string
          regra_id: string
        }
        Insert: {
          acao: string
          alterado_em?: string
          alterado_por: string
          dados_anteriores?: Json | null
          dados_novos: Json
          funcionario_id: string
          id?: string
          regra_id: string
        }
        Update: {
          acao?: string
          alterado_em?: string
          alterado_por?: string
          dados_anteriores?: Json | null
          dados_novos?: Json
          funcionario_id?: string
          id?: string
          regra_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_regras_historico_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_historico_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regras_historico_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "comissoes_regras_funcionario"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_regras_log: {
        Row: {
          acao: string
          dados: Json
          em: string
          empresa_id: string
          id: number
          por: string | null
          regra_id: string
        }
        Insert: {
          acao: string
          dados: Json
          em?: string
          empresa_id: string
          id?: number
          por?: string | null
          regra_id: string
        }
        Update: {
          acao?: string
          dados?: Json
          em?: string
          empresa_id?: string
          id?: number
          por?: string | null
          regra_id?: string
        }
        Relationships: []
      }
      comissoes_vendedores: {
        Row: {
          base_calculo: number
          competencia: string | null
          created_at: string
          id: string
          loja_id: string
          operador_id: string
          pagamento_id: string | null
          pago_em: string | null
          pago_por: string | null
          percentual_aplicado: number | null
          regra_id: string | null
          regra_mista: boolean
          status: string
          valor_comissao: number
          venda_id: string
        }
        Insert: {
          base_calculo?: number
          competencia?: string | null
          created_at?: string
          id?: string
          loja_id: string
          operador_id: string
          pagamento_id?: string | null
          pago_em?: string | null
          pago_por?: string | null
          percentual_aplicado?: number | null
          regra_id?: string | null
          regra_mista?: boolean
          status?: string
          valor_comissao?: number
          venda_id: string
        }
        Update: {
          base_calculo?: number
          competencia?: string | null
          created_at?: string
          id?: string
          loja_id?: string
          operador_id?: string
          pagamento_id?: string | null
          pago_em?: string | null
          pago_por?: string | null
          percentual_aplicado?: number | null
          regra_id?: string | null
          regra_mista?: boolean
          status?: string
          valor_comissao?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_vendedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "comissoes_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_pago_por_fkey"
            columns: ["pago_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "comissoes_regras_funcionario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      commercial_customers: {
        Row: {
          contact: string | null
          contracted_at: string
          created_at: string
          id: string
          lead_id: string | null
          monthly_value: number | null
          notes: string | null
          plan: string | null
          product: string
          store_name: string
          subscription_status: string
        }
        Insert: {
          contact?: string | null
          contracted_at?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          monthly_value?: number | null
          notes?: string | null
          plan?: string | null
          product: string
          store_name: string
          subscription_status?: string
        }
        Update: {
          contact?: string | null
          contracted_at?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          monthly_value?: number | null
          notes?: string | null
          plan?: string | null
          product?: string
          store_name?: string
          subscription_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_customers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "commercial_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_lead_events: {
        Row: {
          author: string | null
          body: string | null
          created_at: string
          from_status: string | null
          id: string
          kind: string
          lead_id: string
          to_status: string | null
        }
        Insert: {
          author?: string | null
          body?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          kind: string
          lead_id: string
          to_status?: string | null
        }
        Update: {
          author?: string | null
          body?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          kind?: string
          lead_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "commercial_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_leads: {
        Row: {
          channel: string
          city: string | null
          contact: string
          created_at: string
          id: string
          idioma: string | null
          locale: string
          name: string
          product: string
          protocol: string
          segment: string | null
          status: string
          store: string
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          wechat: string | null
        }
        Insert: {
          channel: string
          city?: string | null
          contact: string
          created_at?: string
          id?: string
          idioma?: string | null
          locale: string
          name: string
          product: string
          protocol: string
          segment?: string | null
          status?: string
          store: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          wechat?: string | null
        }
        Update: {
          channel?: string
          city?: string | null
          contact?: string
          created_at?: string
          id?: string
          idioma?: string | null
          locale?: string
          name?: string
          product?: string
          protocol?: string
          segment?: string | null
          status?: string
          store?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          wechat?: string | null
        }
        Relationships: []
      }
      conciliacoes_financeiras: {
        Row: {
          created_at: string
          criado_por: string
          desfeito_em: string | null
          desfeito_por: string | null
          extrato_id: string
          id: string
          loja_id: string
          motivo: string
          motivo_desfazer: string | null
          movimento_id: string
        }
        Insert: {
          created_at?: string
          criado_por: string
          desfeito_em?: string | null
          desfeito_por?: string | null
          extrato_id: string
          id?: string
          loja_id: string
          motivo: string
          motivo_desfazer?: string | null
          movimento_id: string
        }
        Update: {
          created_at?: string
          criado_por?: string
          desfeito_em?: string | null
          desfeito_por?: string | null
          extrato_id?: string
          id?: string
          loja_id?: string
          motivo?: string
          motivo_desfazer?: string | null
          movimento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacoes_financeiras_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacoes_financeiras_desfeito_por_fkey"
            columns: ["desfeito_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacoes_financeiras_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "extratos_financeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacoes_financeiras_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacoes_financeiras_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "conciliacoes_financeiras_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "movimentos_financeiros"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_gerais: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          criado_em: string
          descricao: string | null
          empresa_id: string
          id: string
          tipo_dado: string
          valor: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          criado_em?: string
          descricao?: string | null
          empresa_id: string
          id?: string
          tipo_dado: string
          valor: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          criado_em?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          tipo_dado?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_gerais_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_gerais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_financeiras: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string
          data_inicial: string
          id: string
          loja_id: string
          nome: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por: string
          data_inicial: string
          id?: string
          loja_id: string
          nome: string
          tipo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          data_inicial?: string
          id?: string
          loja_id?: string
          nome?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_financeiras_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_financeiras_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_financeiras_loja_id_fkey"
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
          categoria_id: string | null
          competencia: string | null
          criado_em: string
          descricao: string | null
          favorecido: string | null
          fornecedor_id: string | null
          id: string
          loja_id: string
          lote_id: string | null
          nfe_importacao_id: string | null
          nfe_numero: string | null
          observacao: string | null
          parcela: number | null
          status: string
          valor_pago: number
          valor_total: number
          vencimento: string
        }
        Insert: {
          cancelamento_em?: string | null
          cancelamento_motivo?: string | null
          categoria_id?: string | null
          competencia?: string | null
          criado_em?: string
          descricao?: string | null
          favorecido?: string | null
          fornecedor_id?: string | null
          id?: string
          loja_id: string
          lote_id?: string | null
          nfe_importacao_id?: string | null
          nfe_numero?: string | null
          observacao?: string | null
          parcela?: number | null
          status?: string
          valor_pago?: number
          valor_total: number
          vencimento: string
        }
        Update: {
          cancelamento_em?: string | null
          cancelamento_motivo?: string | null
          categoria_id?: string | null
          competencia?: string | null
          criado_em?: string
          descricao?: string | null
          favorecido?: string | null
          fornecedor_id?: string | null
          id?: string
          loja_id?: string
          lote_id?: string | null
          nfe_importacao_id?: string | null
          nfe_numero?: string | null
          observacao?: string | null
          parcela?: number | null
          status?: string
          valor_pago?: number
          valor_total?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_importacao_nfe_id_fkey"
            columns: ["nfe_importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_nfe"
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
        ]
      }
      contas_pagar_pagamentos: {
        Row: {
          caixa_id: string | null
          conta_financeira_id: string | null
          conta_id: string
          created_at: string
          data_pagamento: string
          forma_pagamento: string
          id: string
          idempotency_key: string | null
          loja_id: string | null
          movimentacao_caixa_id: string | null
          observacao: string | null
          operacao_origem_id: string | null
          operacao_tipo: string | null
          origem: string | null
          usuario_id: string | null
          valor: number
        }
        Insert: {
          caixa_id?: string | null
          conta_financeira_id?: string | null
          conta_id: string
          created_at?: string
          data_pagamento?: string
          forma_pagamento: string
          id?: string
          idempotency_key?: string | null
          loja_id?: string | null
          movimentacao_caixa_id?: string | null
          observacao?: string | null
          operacao_origem_id?: string | null
          operacao_tipo?: string | null
          origem?: string | null
          usuario_id?: string | null
          valor: number
        }
        Update: {
          caixa_id?: string | null
          conta_financeira_id?: string | null
          conta_id?: string
          created_at?: string
          data_pagamento?: string
          forma_pagamento?: string
          id?: string
          idempotency_key?: string | null
          loja_id?: string | null
          movimentacao_caixa_id?: string | null
          observacao?: string | null
          operacao_origem_id?: string | null
          operacao_tipo?: string | null
          origem?: string | null
          usuario_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_pagamentos_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_conta_financeira_id_fkey"
            columns: ["conta_financeira_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_movimentacao_caixa_id_fkey"
            columns: ["movimentacao_caixa_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_caixa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_operacao_origem_id_fkey"
            columns: ["operacao_origem_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_receber: {
        Row: {
          categoria_id: string | null
          cliente_id: string
          competencia: string | null
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
          categoria_id?: string | null
          cliente_id: string
          competencia?: string | null
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
          categoria_id?: string | null
          cliente_id?: string
          competencia?: string | null
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
            foreignKeyName: "contas_receber_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_gerente"
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
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
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
          aplicado_em: string
          desconto_percentual: number | null
          desconto_valor: number | null
          gerente_id: string | null
          motivo_desconto: Database["public"]["Enums"]["motivo_desconto_enum_tipo"]
          motivo_descricao_livre: string | null
          operador_id: string | null
          venda_id: string
        }
        Insert: {
          aplicado_em?: string
          desconto_percentual?: number | null
          desconto_valor?: number | null
          gerente_id?: string | null
          motivo_desconto?: Database["public"]["Enums"]["motivo_desconto_enum_tipo"]
          motivo_descricao_livre?: string | null
          operador_id?: string | null
          venda_id: string
        }
        Update: {
          aplicado_em?: string
          desconto_percentual?: number | null
          desconto_valor?: number | null
          gerente_id?: string | null
          motivo_desconto?: Database["public"]["Enums"]["motivo_desconto_enum_tipo"]
          motivo_descricao_livre?: string | null
          operador_id?: string | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "descontos_venda_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descontos_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: true
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
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
          caixa_desembolso_id: string | null
          created_at: string
          forma_pagamento: string
          id: string
          motivo: string
          operacao_id: string | null
          operador_id: string
          valor: number
          venda_id: string
        }
        Insert: {
          caixa_desembolso_id?: string | null
          created_at?: string
          forma_pagamento: string
          id?: string
          motivo: string
          operacao_id?: string | null
          operador_id: string
          valor: number
          venda_id: string
        }
        Update: {
          caixa_desembolso_id?: string | null
          created_at?: string
          forma_pagamento?: string
          id?: string
          motivo?: string
          operacao_id?: string | null
          operador_id?: string
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devolucoes_caixa_desembolso_id_fkey"
            columns: ["caixa_desembolso_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucoes_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "venda_pos_venda_operacoes"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
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
        Relationships: [
          {
            foreignKeyName: "documentos_fiscais_dlq_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_fiscais_pendentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscais_dlq_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_fiscal_doc_status_event_mismatch"
            referencedColumns: ["documento_id"]
          },
          {
            foreignKeyName: "documentos_fiscais_dlq_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "documentos_fiscais_dlq_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_fiscais_eventos: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          correlation_id: string
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
          correlation_id: string
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
          correlation_id?: string
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
          correlation_id: string
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
          transicao_origem: string | null
          ultima_tentativa_em: string | null
          ultima_transicao_em: string | null
          ultimo_erro: string | null
          updated_at: string
          venda_id: string
          xml_armazenado_em: string | null
          xml_lease_expires_em: string | null
          xml_lease_token: string | null
          xml_proxima_tentativa_em: string | null
          xml_sha256: string | null
          xml_status: string
          xml_storage_path: string | null
          xml_tentativas: number
          xml_ultimo_erro: string | null
        }
        Insert: {
          chave_fiscal?: string | null
          correlation_id?: string
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
          transicao_origem?: string | null
          ultima_tentativa_em?: string | null
          ultima_transicao_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          venda_id: string
          xml_armazenado_em?: string | null
          xml_lease_expires_em?: string | null
          xml_lease_token?: string | null
          xml_proxima_tentativa_em?: string | null
          xml_sha256?: string | null
          xml_status?: string
          xml_storage_path?: string | null
          xml_tentativas?: number
          xml_ultimo_erro?: string | null
        }
        Update: {
          chave_fiscal?: string | null
          correlation_id?: string
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
          transicao_origem?: string | null
          ultima_tentativa_em?: string | null
          ultima_transicao_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          venda_id?: string
          xml_armazenado_em?: string | null
          xml_lease_expires_em?: string | null
          xml_lease_token?: string | null
          xml_proxima_tentativa_em?: string | null
          xml_sha256?: string | null
          xml_status?: string
          xml_storage_path?: string | null
          xml_tentativas?: number
          xml_ultimo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_fiscais_pendentes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "documentos_fiscais_pendentes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_modulos: {
        Row: {
          alterado_em: string
          autorizado_por: string | null
          empresa_id: string
          habilitado: boolean
          modulo_codigo: string
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          alterado_em?: string
          autorizado_por?: string | null
          empresa_id: string
          habilitado?: boolean
          modulo_codigo: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          alterado_em?: string
          autorizado_por?: string | null
          empresa_id?: string
          habilitado?: boolean
          modulo_codigo?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_modulos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_modulos_modulo_codigo_fkey"
            columns: ["modulo_codigo"]
            isOneToOne: false
            referencedRelation: "modulos_catalogo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      empresa_modulos_historico: {
        Row: {
          acao: string
          autorizado_por: string | null
          empresa_id: string
          id: number
          modulo_codigo: string
          motivo: string
          origem: string
          registrado_em: string
        }
        Insert: {
          acao: string
          autorizado_por?: string | null
          empresa_id: string
          id?: number
          modulo_codigo: string
          motivo: string
          origem: string
          registrado_em?: string
        }
        Update: {
          acao?: string
          autorizado_por?: string | null
          empresa_id?: string
          id?: number
          modulo_codigo?: string
          motivo?: string
          origem?: string
          registrado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_modulos_historico_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_modulos_historico_modulo_codigo_fkey"
            columns: ["modulo_codigo"]
            isOneToOne: false
            referencedRelation: "modulos_catalogo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      empresa_parametros_importacao: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          aviso_aceito_em: string | null
          empresa_id: string
          icms_efetivo_pct: number | null
          modal_padrao: string | null
          porto_padrao: string | null
          regime_incentivo_nome: string | null
          regime_tributario: string
          uf_importador: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          aviso_aceito_em?: string | null
          empresa_id: string
          icms_efetivo_pct?: number | null
          modal_padrao?: string | null
          porto_padrao?: string | null
          regime_incentivo_nome?: string | null
          regime_tributario?: string
          uf_importador: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          aviso_aceito_em?: string | null
          empresa_id?: string
          icms_efetivo_pct?: number | null
          modal_padrao?: string | null
          porto_padrao?: string | null
          regime_incentivo_nome?: string | null
          regime_tributario?: string
          uf_importador?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_parametros_importacao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_tributos_override: {
        Row: {
          aliquota_pct: number
          atualizado_em: string
          atualizado_por: string | null
          empresa_id: string
          id: string
          ncm_prefixo: string
          nota: string | null
          tributo: string
        }
        Insert: {
          aliquota_pct: number
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id: string
          id?: string
          ncm_prefixo?: string
          nota?: string | null
          tributo: string
        }
        Update: {
          aliquota_pct?: number
          atualizado_em?: string
          atualizado_por?: string | null
          empresa_id?: string
          id?: string
          ncm_prefixo?: string
          nota?: string | null
          tributo?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_tributos_override_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          max_lojas: number | null
          max_usuarios: number | null
          nome: string
          plano: string
          razao_social: string | null
          status: string
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          max_lojas?: number | null
          max_usuarios?: number | null
          nome: string
          plano?: string
          razao_social?: string | null
          status?: string
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          max_lojas?: number | null
          max_usuarios?: number | null
          nome?: string
          plano?: string
          razao_social?: string | null
          status?: string
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: []
      }
      entrada_documentos: {
        Row: {
          created_at: string
          criado_por: string
          importacao_id: string
          loja_id: string
          remessa_id: string
        }
        Insert: {
          created_at?: string
          criado_por: string
          importacao_id: string
          loja_id: string
          remessa_id: string
        }
        Update: {
          created_at?: string
          criado_por?: string
          importacao_id?: string
          loja_id?: string
          remessa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrada_documentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrada_documentos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: true
            referencedRelation: "importacoes_nfe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrada_documentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrada_documentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "entrada_documentos_remessa_id_fkey"
            columns: ["remessa_id"]
            isOneToOne: true
            referencedRelation: "remessas"
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
        Relationships: [
          {
            foreignKeyName: "estoque_baixas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_baixas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_baixas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_baixas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "estoque_baixas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
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
      estoque_reposicoes_devolucao: {
        Row: {
          created_at: string
          operacao_id: string
          produto_id: string
          quantidade: number
        }
        Insert: {
          created_at?: string
          operacao_id: string
          produto_id: string
          quantidade: number
        }
        Update: {
          created_at?: string
          operacao_id?: string
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_reposicoes_devolucao_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "venda_pos_venda_operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_reposicoes_devolucao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_reposicoes_devolucao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_reposicoes_devolucao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      extratos_financeiros: {
        Row: {
          conta_financeira_id: string
          created_at: string
          criado_por: string
          data: string
          descricao: string
          id: string
          loja_id: string
          referencia: string
          valor: number
        }
        Insert: {
          conta_financeira_id: string
          created_at?: string
          criado_por: string
          data: string
          descricao: string
          id?: string
          loja_id: string
          referencia: string
          valor: number
        }
        Update: {
          conta_financeira_id?: string
          created_at?: string
          criado_por?: string
          data?: string
          descricao?: string
          id?: string
          loja_id?: string
          referencia?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "extratos_financeiros_conta_financeira_id_fkey"
            columns: ["conta_financeira_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_financeiros_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_financeiros_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_financeiros_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
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
      financeiro_comandos: {
        Row: {
          created_at: string
          dados: Json
          id: string
          loja_id: string
          resultado: Json
          tipo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          dados: Json
          id: string
          loja_id: string
          resultado: Json
          tipo: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          dados?: Json
          id?: string
          loja_id?: string
          resultado?: Json
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_comandos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_comandos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "financeiro_comandos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_contas_forma: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          conta_financeira_id: string | null
          forma_pagamento: string
          loja_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          conta_financeira_id?: string | null
          forma_pagamento: string
          loja_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          conta_financeira_id?: string | null
          forma_pagamento?: string
          loja_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_contas_forma_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_contas_forma_conta_financeira_id_fkey"
            columns: ["conta_financeira_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_contas_forma_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_contas_forma_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      financeiro_recebiveis_venda: {
        Row: {
          bruto: number
          conta_financeira_id: string | null
          created_at: string
          forma: string
          id: string
          loja_id: string
          operadora: string | null
          pagamento_id: string | null
          parcela: number
          parcelas: number
          previsao: string | null
          recebimento_atual_id: string | null
          status: string
          taxa: number | null
          venda_id: string
        }
        Insert: {
          bruto: number
          conta_financeira_id?: string | null
          created_at?: string
          forma: string
          id?: string
          loja_id: string
          operadora?: string | null
          pagamento_id?: string | null
          parcela?: number
          parcelas?: number
          previsao?: string | null
          recebimento_atual_id?: string | null
          status?: string
          taxa?: number | null
          venda_id: string
        }
        Update: {
          bruto?: number
          conta_financeira_id?: string | null
          created_at?: string
          forma?: string
          id?: string
          loja_id?: string
          operadora?: string | null
          pagamento_id?: string | null
          parcela?: number
          parcelas?: number
          previsao?: string | null
          recebimento_atual_id?: string | null
          status?: string
          taxa?: number | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_recebiveis_venda_conta_financeira_id_fkey"
            columns: ["conta_financeira_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_recebiveis_venda_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_recebiveis_venda_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "financeiro_recebiveis_venda_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "vendas_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_recebiveis_venda_recebimento_atual_id_fkey"
            columns: ["recebimento_atual_id"]
            isOneToOne: false
            referencedRelation: "movimentos_financeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_recebiveis_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "financeiro_recebiveis_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_provider_config: {
        Row: {
          ambiente: string
          created_at: string
          habilitado: boolean
          loja_id: string
          provider_type: string
          token_env_var: string | null
          updated_at: string
        }
        Insert: {
          ambiente: string
          created_at?: string
          habilitado?: boolean
          loja_id: string
          provider_type?: string
          token_env_var?: string | null
          updated_at?: string
        }
        Update: {
          ambiente?: string
          created_at?: string
          habilitado?: boolean
          loja_id?: string
          provider_type?: string
          token_env_var?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_provider_config_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_provider_config_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      formas_pagamento: {
        Row: {
          ativo: boolean
          codigo: string
          conta_financeira_id: string | null
          created_at: string
          id: string
          loja_id: string
          nome: string
          prazo_compensacao_dias: number
          taxa_percentual: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          conta_financeira_id?: string | null
          created_at?: string
          id?: string
          loja_id: string
          nome: string
          prazo_compensacao_dias?: number
          taxa_percentual?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          conta_financeira_id?: string | null
          created_at?: string
          id?: string
          loja_id?: string
          nome?: string
          prazo_compensacao_dias?: number
          taxa_percentual?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formas_pagamento_conta_financeira_id_fkey"
            columns: ["conta_financeira_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formas_pagamento_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formas_pagamento_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          loja_id: string
          nome: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          loja_id: string
          nome: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          loja_id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      funcionario_dados: {
        Row: {
          cargo: string | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          empresa_id: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
          usuario_id: string
        }
        Insert: {
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          empresa_id: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          usuario_id: string
        }
        Update: {
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          empresa_id?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funcionario_dados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionario_dados_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          ativo: boolean
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          loja_id: string
          nome: string
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          loja_id: string
          nome: string
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          loja_id?: string
          nome?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionarios_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      funcionarios_meta: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          cargo: string
          comissao_percentual: number | null
          comissao_tipo: string | null
          comissao_valor: number | null
          criado_em: string
          criado_por: string
          data_admissao: string
          email: string
          id: string
          loja_id: string
          nome_exibicao: string
          usuario_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cargo: string
          comissao_percentual?: number | null
          comissao_tipo?: string | null
          comissao_valor?: number | null
          criado_em?: string
          criado_por: string
          data_admissao?: string
          email: string
          id?: string
          loja_id: string
          nome_exibicao: string
          usuario_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cargo?: string
          comissao_percentual?: number | null
          comissao_tipo?: string | null
          comissao_valor?: number | null
          criado_em?: string
          criado_por?: string
          data_admissao?: string
          email?: string
          id?: string
          loja_id?: string
          nome_exibicao?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_meta_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionarios_meta_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionarios_meta_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionarios_meta_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "funcionarios_meta_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
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
      gtin_lookup_cache: {
        Row: {
          categoria_externa: string | null
          expires_at: string
          fetched_at: string
          fonte: string
          gtin: string
          marca: string | null
          ncm: string | null
          nome: string | null
          payload: Json
        }
        Insert: {
          categoria_externa?: string | null
          expires_at: string
          fetched_at?: string
          fonte: string
          gtin: string
          marca?: string | null
          ncm?: string | null
          nome?: string | null
          payload?: Json
        }
        Update: {
          categoria_externa?: string | null
          expires_at?: string
          fetched_at?: string
          fonte?: string
          gtin?: string
          marca?: string | null
          ncm?: string | null
          nome?: string | null
          payload?: Json
        }
        Relationships: []
      }
      historico_precos_produto: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          id: string
          preco_atacado_anterior: number | null
          preco_atacado_novo: number | null
          preco_custo_anterior: number | null
          preco_custo_novo: number | null
          preco_varejo_anterior: number | null
          preco_varejo_novo: number | null
          produto_id: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          id?: string
          preco_atacado_anterior?: number | null
          preco_atacado_novo?: number | null
          preco_custo_anterior?: number | null
          preco_custo_novo?: number | null
          preco_varejo_anterior?: number | null
          preco_varejo_novo?: number | null
          produto_id: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          id?: string
          preco_atacado_anterior?: number | null
          preco_atacado_novo?: number | null
          preco_custo_anterior?: number | null
          preco_custo_novo?: number | null
          preco_varejo_anterior?: number | null
          preco_varejo_novo?: number | null
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_precos_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_precos_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_precos_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_tiers_crud: {
        Row: {
          acao: string
          criado_em: string | null
          criado_por: string | null
          id: string
          preco_unitario_antes: number | null
          preco_unitario_depois: number | null
          produto_id: string
          quantidade_minima_antes: number | null
          quantidade_minima_depois: number | null
          tier_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string | null
          criado_por?: string | null
          id?: string
          preco_unitario_antes?: number | null
          preco_unitario_depois?: number | null
          produto_id: string
          quantidade_minima_antes?: number | null
          quantidade_minima_depois?: number | null
          tier_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string | null
          criado_por?: string | null
          id?: string
          preco_unitario_antes?: number | null
          preco_unitario_depois?: number | null
          produto_id?: string
          quantidade_minima_antes?: number | null
          quantidade_minima_depois?: number | null
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_tiers_crud_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_tiers_crud_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_tiers_crud_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_tiers_crud_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      implantacao_checklist_itens: {
        Row: {
          concluido_em: string | null
          id: string
          item_key: string
          loja_id: string
          observacoes: string | null
          responsavel: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          concluido_em?: string | null
          id?: string
          item_key: string
          loja_id: string
          observacoes?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          concluido_em?: string | null
          id?: string
          item_key?: string
          loja_id?: string
          observacoes?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "implantacao_checklist_itens_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implantacao_checklist_itens_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      implantacao_checklists: {
        Row: {
          created_at: string
          go_autorizado: boolean
          go_autorizado_em: string | null
          go_autorizado_por: string | null
          go_observacao: string | null
          loja_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          go_autorizado?: boolean
          go_autorizado_em?: string | null
          go_autorizado_por?: string | null
          go_observacao?: string | null
          loja_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          go_autorizado?: boolean
          go_autorizado_em?: string | null
          go_autorizado_por?: string | null
          go_observacao?: string | null
          loja_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "implantacao_checklists_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: true
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implantacao_checklists_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: true
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      import_aprovacoes: {
        Row: {
          apuracao_id: string | null
          decisao: string
          em: string
          empresa_id: string
          id: string
          motivo: string
          operacao_id: string
          por: string
          verificacao: Json
        }
        Insert: {
          apuracao_id?: string | null
          decisao: string
          em?: string
          empresa_id: string
          id?: string
          motivo: string
          operacao_id: string
          por: string
          verificacao?: Json
        }
        Update: {
          apuracao_id?: string | null
          decisao?: string
          em?: string
          empresa_id?: string
          id?: string
          motivo?: string
          operacao_id?: string
          por?: string
          verificacao?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_aprovacoes_apuracao_id_fkey"
            columns: ["apuracao_id"]
            isOneToOne: false
            referencedRelation: "import_apuracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_aprovacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_aprovacoes_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "import_operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      import_apuracao_itens: {
        Row: {
          apuracao_id: string
          componentes_brl: Json
          custo_total_brl: number
          custo_unitario_brl: number
          empresa_id: string
          item_id: string
          memoria: Json
          produto_id: string | null
          quantidade_estoque: number
          residuo_total_brl: number
          residuo_unitario_brl: number
        }
        Insert: {
          apuracao_id: string
          componentes_brl: Json
          custo_total_brl: number
          custo_unitario_brl: number
          empresa_id: string
          item_id: string
          memoria: Json
          produto_id?: string | null
          quantidade_estoque: number
          residuo_total_brl: number
          residuo_unitario_brl: number
        }
        Update: {
          apuracao_id?: string
          componentes_brl?: Json
          custo_total_brl?: number
          custo_unitario_brl?: number
          empresa_id?: string
          item_id?: string
          memoria?: Json
          produto_id?: string | null
          quantidade_estoque?: number
          residuo_total_brl?: number
          residuo_unitario_brl?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_apuracao_itens_apuracao_id_fkey"
            columns: ["apuracao_id"]
            isOneToOne: false
            referencedRelation: "import_apuracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_apuracao_itens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_apuracao_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "import_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      import_apuracao_rateios: {
        Row: {
          apuracao_id: string
          base_item: number
          base_total: number
          componente: string
          criterio: string
          empresa_id: string
          id: string
          item_id: string
          justificativa: string
          origem_id: string
          valor_alocado_brl: number
        }
        Insert: {
          apuracao_id: string
          base_item: number
          base_total: number
          componente: string
          criterio: string
          empresa_id: string
          id?: string
          item_id: string
          justificativa: string
          origem_id: string
          valor_alocado_brl: number
        }
        Update: {
          apuracao_id?: string
          base_item?: number
          base_total?: number
          componente?: string
          criterio?: string
          empresa_id?: string
          id?: string
          item_id?: string
          justificativa?: string
          origem_id?: string
          valor_alocado_brl?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_apuracao_rateios_apuracao_id_fkey"
            columns: ["apuracao_id"]
            isOneToOne: false
            referencedRelation: "import_apuracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_apuracao_rateios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      import_apuracoes: {
        Row: {
          conservacao_ok: boolean
          criado_em: string
          criado_por: string
          empresa_id: string
          engine_version: string
          entrada: Json
          entrada_sha256: string
          id: string
          operacao_id: string
          saida: Json
          saida_sha256: string
          status_calculo: string
          tipo: string
          versao: number
          versao_dados: number
        }
        Insert: {
          conservacao_ok: boolean
          criado_em?: string
          criado_por: string
          empresa_id: string
          engine_version: string
          entrada: Json
          entrada_sha256: string
          id?: string
          operacao_id: string
          saida: Json
          saida_sha256: string
          status_calculo: string
          tipo: string
          versao: number
          versao_dados: number
        }
        Update: {
          conservacao_ok?: boolean
          criado_em?: string
          criado_por?: string
          empresa_id?: string
          engine_version?: string
          entrada?: Json
          entrada_sha256?: string
          id?: string
          operacao_id?: string
          saida?: Json
          saida_sha256?: string
          status_calculo?: string
          tipo?: string
          versao?: number
          versao_dados?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_apuracoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_apuracoes_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "import_operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      import_auditoria: {
        Row: {
          acao: string
          detalhe: Json
          em: string
          empresa_id: string
          entidade: string
          entidade_id: string | null
          id: number
          operacao_id: string | null
          por: string | null
        }
        Insert: {
          acao: string
          detalhe?: Json
          em?: string
          empresa_id: string
          entidade: string
          entidade_id?: string | null
          id?: number
          operacao_id?: string | null
          por?: string | null
        }
        Update: {
          acao?: string
          detalhe?: Json
          em?: string
          empresa_id?: string
          entidade?: string
          entidade_id?: string | null
          id?: number
          operacao_id?: string | null
          por?: string | null
        }
        Relationships: []
      }
      import_cambios: {
        Row: {
          data: string
          documento_id: string | null
          empresa_id: string
          fonte: string
          id: string
          moeda: string
          operacao_id: string
          taxa: number
        }
        Insert: {
          data: string
          documento_id?: string | null
          empresa_id: string
          fonte: string
          id?: string
          moeda: string
          operacao_id: string
          taxa: number
        }
        Update: {
          data?: string
          documento_id?: string | null
          empresa_id?: string
          fonte?: string
          id?: string
          moeda?: string
          operacao_id?: string
          taxa?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_cambios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_cambios_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "import_operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      import_descontos: {
        Row: {
          criterio: string | null
          documento_id: string | null
          empresa_id: string
          escopo: string
          id: string
          item_id: string | null
          justificativa: string
          moeda: string
          operacao_id: string
          valor: number
        }
        Insert: {
          criterio?: string | null
          documento_id?: string | null
          empresa_id: string
          escopo: string
          id?: string
          item_id?: string | null
          justificativa: string
          moeda: string
          operacao_id: string
          valor: number
        }
        Update: {
          criterio?: string | null
          documento_id?: string | null
          empresa_id?: string
          escopo?: string
          id?: string
          item_id?: string | null
          justificativa?: string
          moeda?: string
          operacao_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_descontos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_descontos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "import_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_descontos_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "import_operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      import_despesas: {
        Row: {
          atribuicao_modo: string
          criterio: string | null
          documento_id: string | null
          empresa_id: string
          id: string
          incorporavel: string
          item_id: string | null
          justificativa: string
          moeda: string
          operacao_id: string
          status_conferencia: string
          tipo: string
          valor: number
        }
        Insert: {
          atribuicao_modo: string
          criterio?: string | null
          documento_id?: string | null
          empresa_id: string
          id?: string
          incorporavel: string
          item_id?: string | null
          justificativa: string
          moeda: string
          operacao_id: string
          status_conferencia?: string
          tipo: string
          valor: number
        }
        Update: {
          atribuicao_modo?: string
          criterio?: string | null
          documento_id?: string | null
          empresa_id?: string
          id?: string
          incorporavel?: string
          item_id?: string | null
          justificativa?: string
          moeda?: string
          operacao_id?: string
          status_conferencia?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_despesas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_despesas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "import_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_despesas_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "import_operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      import_divergencias: {
        Row: {
          apuracao_id: string
          codigo: string
          empresa_id: string
          id: string
          mensagem: string
          referencia: string
          severidade: string
        }
        Insert: {
          apuracao_id: string
          codigo: string
          empresa_id: string
          id?: string
          mensagem: string
          referencia: string
          severidade: string
        }
        Update: {
          apuracao_id?: string
          codigo?: string
          empresa_id?: string
          id?: string
          mensagem?: string
          referencia?: string
          severidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_divergencias_apuracao_id_fkey"
            columns: ["apuracao_id"]
            isOneToOne: false
            referencedRelation: "import_apuracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_divergencias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      import_documentos: {
        Row: {
          data_documento: string | null
          empresa_id: string
          enviado_em: string
          enviado_por: string
          id: string
          mime_type: string | null
          numero: string | null
          operacao_id: string
          sha256: string | null
          storage_bucket: string | null
          storage_path: string | null
          substitui_documento_id: string | null
          tamanho_bytes: number | null
          tipo: string
          versao: number
        }
        Insert: {
          data_documento?: string | null
          empresa_id: string
          enviado_em?: string
          enviado_por: string
          id?: string
          mime_type?: string | null
          numero?: string | null
          operacao_id: string
          sha256?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          substitui_documento_id?: string | null
          tamanho_bytes?: number | null
          tipo: string
          versao?: number
        }
        Update: {
          data_documento?: string | null
          empresa_id?: string
          enviado_em?: string
          enviado_por?: string
          id?: string
          mime_type?: string | null
          numero?: string | null
          operacao_id?: string
          sha256?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          substitui_documento_id?: string | null
          tamanho_bytes?: number | null
          tipo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_documentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_documentos_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "import_operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_documentos_substitui_documento_id_fkey"
            columns: ["substitui_documento_id"]
            isOneToOne: false
            referencedRelation: "import_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      import_itens: {
        Row: {
          codigo_fornecedor: string | null
          descricao: string
          documento_id: string | null
          empresa_id: string
          fator_para_estoque: number
          id: string
          moeda: string
          ncm: string | null
          operacao_id: string
          peso_bruto_kg: number | null
          peso_liquido_kg: number | null
          produto_id: string | null
          quantidade_comercial: number
          quantidade_estoque: number
          unidade_comercial: string
          valor_aduaneiro_brl: number | null
          valor_mercadoria_moeda: number
          volume_m3: number | null
        }
        Insert: {
          codigo_fornecedor?: string | null
          descricao: string
          documento_id?: string | null
          empresa_id: string
          fator_para_estoque: number
          id?: string
          moeda: string
          ncm?: string | null
          operacao_id: string
          peso_bruto_kg?: number | null
          peso_liquido_kg?: number | null
          produto_id?: string | null
          quantidade_comercial: number
          quantidade_estoque: number
          unidade_comercial: string
          valor_aduaneiro_brl?: number | null
          valor_mercadoria_moeda: number
          volume_m3?: number | null
        }
        Update: {
          codigo_fornecedor?: string | null
          descricao?: string
          documento_id?: string | null
          empresa_id?: string
          fator_para_estoque?: number
          id?: string
          moeda?: string
          ncm?: string | null
          operacao_id?: string
          peso_bruto_kg?: number | null
          peso_liquido_kg?: number | null
          produto_id?: string | null
          quantidade_comercial?: number
          quantidade_estoque?: number
          unidade_comercial?: string
          valor_aduaneiro_brl?: number | null
          valor_mercadoria_moeda?: number
          volume_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_itens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_itens_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "import_operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      import_operacoes: {
        Row: {
          apuracao_aprovada_id: string | null
          atualizado_em: string
          criado_em: string
          criado_por: string
          data_desembaraco: string | null
          data_embarque: string | null
          data_invoice: string | null
          descricao: string | null
          empresa_id: string
          fornecedor_id: string | null
          id: string
          loja_importadora_id: string
          moeda: string | null
          referencia: string
          status: string
          versao_dados: number
        }
        Insert: {
          apuracao_aprovada_id?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por: string
          data_desembaraco?: string | null
          data_embarque?: string | null
          data_invoice?: string | null
          descricao?: string | null
          empresa_id: string
          fornecedor_id?: string | null
          id?: string
          loja_importadora_id: string
          moeda?: string | null
          referencia: string
          status?: string
          versao_dados?: number
        }
        Update: {
          apuracao_aprovada_id?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string
          data_desembaraco?: string | null
          data_embarque?: string | null
          data_invoice?: string | null
          descricao?: string | null
          empresa_id?: string
          fornecedor_id?: string | null
          id?: string
          loja_importadora_id?: string
          moeda?: string | null
          referencia?: string
          status?: string
          versao_dados?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_operacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_operacoes_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_operacoes_loja_empresa_fk"
            columns: ["loja_importadora_id", "empresa_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id", "empresa_id"]
          },
        ]
      }
      import_tributos: {
        Row: {
          data_fato_gerador: string | null
          documento_id: string | null
          empresa_id: string
          id: string
          item_id: string | null
          operacao_id: string
          regra_id: string | null
          regra_incorpora_custo: boolean | null
          regra_vigencia_fim: string | null
          regra_vigencia_inicio: string | null
          status_conferencia: string
          status_recuperabilidade: string
          tributo_codigo: string
          validado_por: string | null
          valor_apurado_brl: number
        }
        Insert: {
          data_fato_gerador?: string | null
          documento_id?: string | null
          empresa_id: string
          id?: string
          item_id?: string | null
          operacao_id: string
          regra_id?: string | null
          regra_incorpora_custo?: boolean | null
          regra_vigencia_fim?: string | null
          regra_vigencia_inicio?: string | null
          status_conferencia?: string
          status_recuperabilidade: string
          tributo_codigo: string
          validado_por?: string | null
          valor_apurado_brl: number
        }
        Update: {
          data_fato_gerador?: string | null
          documento_id?: string | null
          empresa_id?: string
          id?: string
          item_id?: string | null
          operacao_id?: string
          regra_id?: string | null
          regra_incorpora_custo?: boolean | null
          regra_vigencia_fim?: string | null
          regra_vigencia_inicio?: string | null
          status_conferencia?: string
          status_recuperabilidade?: string
          tributo_codigo?: string
          validado_por?: string | null
          valor_apurado_brl?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_tributos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_tributos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "import_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_tributos_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "import_operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_nfe: {
        Row: {
          chave_acesso: string
          created_at: string
          fornecedor_id: string
          id: string
          loja_id: string
          numero_nf: string | null
          ordem_compra_id: string | null
          status: string
          usuario_id: string
        }
        Insert: {
          chave_acesso: string
          created_at?: string
          fornecedor_id: string
          id?: string
          loja_id: string
          numero_nf?: string | null
          ordem_compra_id?: string | null
          status?: string
          usuario_id: string
        }
        Update: {
          chave_acesso?: string
          created_at?: string
          fornecedor_id?: string
          id?: string
          loja_id?: string
          numero_nf?: string | null
          ordem_compra_id?: string | null
          status?: string
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
            foreignKeyName: "importacoes_nfe_ordem_compra_id_fkey"
            columns: ["ordem_compra_id"]
            isOneToOne: false
            referencedRelation: "ordens_compra"
            referencedColumns: ["id"]
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
      importacoes_nfe_duplicatas: {
        Row: {
          created_at: string
          data_vencimento: string
          id: string
          importacao_nfe_id: string
          numero_duplicata: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          data_vencimento: string
          id?: string
          importacao_nfe_id: string
          numero_duplicata?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          data_vencimento?: string
          id?: string
          importacao_nfe_id?: string
          numero_duplicata?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_nfe_duplicatas_importacao_nfe_id_fkey"
            columns: ["importacao_nfe_id"]
            isOneToOne: false
            referencedRelation: "importacoes_nfe"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_nfe_itens: {
        Row: {
          atualizar_custo: boolean
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          custo_unitario: number
          divergencia_obs: string | null
          id: string
          importacao_nfe_id: string
          produto_id: string
          quantidade_conferida: number | null
          quantidade_nfe: number
          status_conferencia: string
        }
        Insert: {
          atualizar_custo?: boolean
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          custo_unitario: number
          divergencia_obs?: string | null
          id?: string
          importacao_nfe_id: string
          produto_id: string
          quantidade_conferida?: number | null
          quantidade_nfe: number
          status_conferencia?: string
        }
        Update: {
          atualizar_custo?: boolean
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          custo_unitario?: number
          divergencia_obs?: string | null
          id?: string
          importacao_nfe_id?: string
          produto_id?: string
          quantidade_conferida?: number | null
          quantidade_nfe?: number
          status_conferencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_nfe_itens_conferido_por_fkey"
            columns: ["conferido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_nfe_itens_importacao_nfe_id_fkey"
            columns: ["importacao_nfe_id"]
            isOneToOne: false
            referencedRelation: "importacoes_nfe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_nfe_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_nfe_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_nfe_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
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
          pricing_version_id: string | null
          produto_id: string
          promocao_desconto_percentual: number | null
          promocao_nome_snapshot: string | null
          promocao_regra_id: string | null
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
          pricing_version_id?: string | null
          produto_id: string
          promocao_desconto_percentual?: number | null
          promocao_nome_snapshot?: string | null
          promocao_regra_id?: string | null
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
          pricing_version_id?: string | null
          produto_id?: string
          promocao_desconto_percentual?: number | null
          promocao_nome_snapshot?: string | null
          promocao_regra_id?: string | null
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
            foreignKeyName: "itens_venda_promocao_regra_id_fkey"
            columns: ["promocao_regra_id"]
            isOneToOne: false
            referencedRelation: "regras_preco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
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
          caixa_id: string | null
          conta_financeira_id: string | null
          created_at: string
          created_by: string
          data_efetiva: string | null
          forma_pagamento: string
          id: string
          idempotency_key: string | null
          loja_id: string | null
          observacao: string | null
          operacao_origem_id: string | null
          operacao_tipo: string | null
          origem: string | null
          titulo_id: string
          valor: number
        }
        Insert: {
          caixa_id?: string | null
          conta_financeira_id?: string | null
          created_at?: string
          created_by: string
          data_efetiva?: string | null
          forma_pagamento: string
          id?: string
          idempotency_key?: string | null
          loja_id?: string | null
          observacao?: string | null
          operacao_origem_id?: string | null
          operacao_tipo?: string | null
          origem?: string | null
          titulo_id: string
          valor: number
        }
        Update: {
          caixa_id?: string | null
          conta_financeira_id?: string | null
          created_at?: string
          created_by?: string
          data_efetiva?: string | null
          forma_pagamento?: string
          id?: string
          idempotency_key?: string | null
          loja_id?: string | null
          observacao?: string | null
          operacao_origem_id?: string | null
          operacao_tipo?: string | null
          origem?: string | null
          titulo_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "liquidacoes_receber_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacoes_receber_conta_financeira_id_fkey"
            columns: ["conta_financeira_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacoes_receber_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacoes_receber_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacoes_receber_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "liquidacoes_receber_operacao_origem_id_fkey"
            columns: ["operacao_origem_id"]
            isOneToOne: false
            referencedRelation: "liquidacoes_receber"
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
          empresa_id: string | null
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
          numero_serie_nfce: number
          numero_serie_nfe: number
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
          empresa_id?: string | null
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
          numero_serie_nfce?: number
          numero_serie_nfe?: number
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
          empresa_id?: string | null
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
          numero_serie_nfce?: number
          numero_serie_nfe?: number
          razao_social?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lojas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marcas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos_catalogo: {
        Row: {
          codigo: string
          created_at: string
          descricao: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string
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
      movimentos_caixa: {
        Row: {
          caixa_id: string
          created_at: string
          id: string
          observacao: string | null
          referencia_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          caixa_id: string
          created_at?: string
          id?: string
          observacao?: string | null
          referencia_id?: string | null
          tipo: string
          valor: number
        }
        Update: {
          caixa_id?: string
          created_at?: string
          id?: string
          observacao?: string | null
          referencia_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentos_caixa_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
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
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
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
      movimentos_financeiros: {
        Row: {
          categoria_id: string | null
          conta_financeira_id: string
          created_at: string
          criado_por: string | null
          data: string
          descricao: string
          estorno_de: string | null
          id: string
          loja_id: string
          origem: string
          origem_id: string
          transferencia_id: string | null
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          conta_financeira_id: string
          created_at?: string
          criado_por?: string | null
          data: string
          descricao: string
          estorno_de?: string | null
          id?: string
          loja_id: string
          origem: string
          origem_id: string
          transferencia_id?: string | null
          valor: number
        }
        Update: {
          categoria_id?: string | null
          conta_financeira_id?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          descricao?: string
          estorno_de?: string | null
          id?: string
          loja_id?: string
          origem?: string
          origem_id?: string
          transferencia_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentos_financeiros_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_conta_financeira_id_fkey"
            columns: ["conta_financeira_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_estorno_de_fkey"
            columns: ["estorno_de"]
            isOneToOne: true
            referencedRelation: "movimentos_financeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_financeiros_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      ordens_compra: {
        Row: {
          created_at: string
          created_by: string | null
          data_emissao: string
          data_prevista_chegada: string | null
          encerrada_com_falta_em: string | null
          encerrada_com_falta_por: string | null
          encerramento_motivo: string | null
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
          encerrada_com_falta_em?: string | null
          encerrada_com_falta_por?: string | null
          encerramento_motivo?: string | null
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
          encerrada_com_falta_em?: string | null
          encerrada_com_falta_por?: string | null
          encerramento_motivo?: string | null
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
            foreignKeyName: "ordens_compra_encerrada_com_falta_por_fkey"
            columns: ["encerrada_com_falta_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
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
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          descricao: string | null
          divergencia_obs: string | null
          id: string
          ordem_id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
          quantidade_conferida: number | null
          quantidade_recebida: number
          status_conferencia: string
          unidade_medida: string
        }
        Insert: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          descricao?: string | null
          divergencia_obs?: string | null
          id?: string
          ordem_id: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade: number
          quantidade_conferida?: number | null
          quantidade_recebida?: number
          status_conferencia?: string
          unidade_medida?: string
        }
        Update: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          descricao?: string | null
          divergencia_obs?: string | null
          id?: string
          ordem_id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          quantidade_conferida?: number | null
          quantidade_recebida?: number
          status_conferencia?: string
          unidade_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_compra_itens_conferido_por_fkey"
            columns: ["conferido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
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
      ordens_compra_recebimentos: {
        Row: {
          created_at: string
          created_by: string | null
          divergencia_obs: string | null
          entrada_id: string
          id: string
          idempotency_key: string | null
          importacao_nfe_id: string | null
          legado: boolean
          loja_id: string
          movimento_estoque_id: string | null
          ordem_id: string
          ordem_item_id: string
          origem: string
          payload_hash: string | null
          produto_id: string | null
          quantidade: number
          quantidade_esperada: number
          remessa_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          divergencia_obs?: string | null
          entrada_id: string
          id?: string
          idempotency_key?: string | null
          importacao_nfe_id?: string | null
          legado?: boolean
          loja_id: string
          movimento_estoque_id?: string | null
          ordem_id: string
          ordem_item_id: string
          origem: string
          payload_hash?: string | null
          produto_id?: string | null
          quantidade: number
          quantidade_esperada: number
          remessa_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          divergencia_obs?: string | null
          entrada_id?: string
          id?: string
          idempotency_key?: string | null
          importacao_nfe_id?: string | null
          legado?: boolean
          loja_id?: string
          movimento_estoque_id?: string | null
          ordem_id?: string
          ordem_item_id?: string
          origem?: string
          payload_hash?: string | null
          produto_id?: string | null
          quantidade?: number
          quantidade_esperada?: number
          remessa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_compra_recebimentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_importacao_nfe_id_fkey"
            columns: ["importacao_nfe_id"]
            isOneToOne: false
            referencedRelation: "importacoes_nfe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_movimento_estoque_id_fkey"
            columns: ["movimento_estoque_id"]
            isOneToOne: false
            referencedRelation: "movimentos_estoque_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_ordem_item_id_fkey"
            columns: ["ordem_item_id"]
            isOneToOne: false
            referencedRelation: "ordens_compra_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_recebimentos_remessa_id_fkey"
            columns: ["remessa_id"]
            isOneToOne: false
            referencedRelation: "remessas"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_ativacao_tentativas: {
        Row: {
          created_at: string
          device_fingerprint: string
          erro: string | null
          id: number
          ip: string | null
          ok: boolean
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          erro?: string | null
          id?: never
          ip?: string | null
          ok: boolean
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          erro?: string | null
          id?: never
          ip?: string | null
          ok?: boolean
        }
        Relationships: []
      }
      pdv_codigos_ativacao: {
        Row: {
          codigo_hash: string
          created_at: string
          criado_por: string | null
          dispositivo_id: string | null
          empresa_id: string
          expira_em: string
          id: string
          loja_id: string
          usado_em: string | null
        }
        Insert: {
          codigo_hash: string
          created_at?: string
          criado_por?: string | null
          dispositivo_id?: string | null
          empresa_id: string
          expira_em: string
          id?: string
          loja_id: string
          usado_em?: string | null
        }
        Update: {
          codigo_hash?: string
          created_at?: string
          criado_por?: string | null
          dispositivo_id?: string | null
          empresa_id?: string
          expira_em?: string
          id?: string
          loja_id?: string
          usado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_codigos_ativacao_dispositivo_id_fkey"
            columns: ["dispositivo_id"]
            isOneToOne: false
            referencedRelation: "pdv_dispositivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_codigos_loja_empresa_fk"
            columns: ["loja_id", "empresa_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id", "empresa_id"]
          },
        ]
      }
      pdv_config: {
        Row: {
          alertas_leves_ativos: boolean
          auto_enqueue_fiscal: boolean
          blind_closure: boolean
          bloqueio_inatividade_min: number
          cfop_padrao: string
          cst_padrao: string
          empresa_id: string | null
          exigir_pin_operador: boolean
          formato_impressao: string
          gerente_id: string
          gerente_senha_bcrypt: string | null
          gerente_senha_sha256: string | null
          id: number
          idioma_padrao: string
          imprimir_cupom_auto: boolean
          limite_sangria_sem_gerente: number
          limite_transferencia_obs: number
          loja_id: string | null
          max_desconto_gerente_percentual: number
          max_desconto_manual_item_percentual: number
          max_desconto_total_percentual: number
          modo_limite_credito: string
          quantidade_minima_atacado_padrao: number
          regime_tributario: string
          show_margin_visual: boolean
          show_preco_fonte: boolean
          show_stock_alerts: boolean
          tema_padrao: string
        }
        Insert: {
          alertas_leves_ativos?: boolean
          auto_enqueue_fiscal?: boolean
          blind_closure?: boolean
          bloqueio_inatividade_min?: number
          cfop_padrao?: string
          cst_padrao?: string
          empresa_id?: string | null
          exigir_pin_operador?: boolean
          formato_impressao?: string
          gerente_id: string
          gerente_senha_bcrypt?: string | null
          gerente_senha_sha256?: string | null
          id?: number
          idioma_padrao?: string
          imprimir_cupom_auto?: boolean
          limite_sangria_sem_gerente?: number
          limite_transferencia_obs?: number
          loja_id?: string | null
          max_desconto_gerente_percentual?: number
          max_desconto_manual_item_percentual?: number
          max_desconto_total_percentual?: number
          modo_limite_credito?: string
          quantidade_minima_atacado_padrao?: number
          regime_tributario?: string
          show_margin_visual?: boolean
          show_preco_fonte?: boolean
          show_stock_alerts?: boolean
          tema_padrao?: string
        }
        Update: {
          alertas_leves_ativos?: boolean
          auto_enqueue_fiscal?: boolean
          blind_closure?: boolean
          bloqueio_inatividade_min?: number
          cfop_padrao?: string
          cst_padrao?: string
          empresa_id?: string | null
          exigir_pin_operador?: boolean
          formato_impressao?: string
          gerente_id?: string
          gerente_senha_bcrypt?: string | null
          gerente_senha_sha256?: string | null
          id?: number
          idioma_padrao?: string
          imprimir_cupom_auto?: boolean
          limite_sangria_sem_gerente?: number
          limite_transferencia_obs?: number
          loja_id?: string | null
          max_desconto_gerente_percentual?: number
          max_desconto_manual_item_percentual?: number
          max_desconto_total_percentual?: number
          modo_limite_credito?: string
          quantidade_minima_atacado_padrao?: number
          regime_tributario?: string
          show_margin_visual?: boolean
          show_preco_fonte?: boolean
          show_stock_alerts?: boolean
          tema_padrao?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_config_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_config_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      pdv_dispositivos: {
        Row: {
          ativado_em: string
          ativo: boolean
          device_fingerprint: string
          empresa_id: string
          id: string
          loja_id: string
          nome: string | null
          revogado_em: string | null
          sync_secret: string
          ultimo_sync_em: string | null
        }
        Insert: {
          ativado_em?: string
          ativo?: boolean
          device_fingerprint: string
          empresa_id: string
          id?: string
          loja_id: string
          nome?: string | null
          revogado_em?: string | null
          sync_secret: string
          ultimo_sync_em?: string | null
        }
        Update: {
          ativado_em?: string
          ativo?: boolean
          device_fingerprint?: string
          empresa_id?: string
          id?: string
          loja_id?: string
          nome?: string | null
          revogado_em?: string | null
          sync_secret?: string
          ultimo_sync_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_dispositivos_loja_empresa_fk"
            columns: ["loja_id", "empresa_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id", "empresa_id"]
          },
        ]
      }
      pdv_operador_eventos: {
        Row: {
          detalhe: Json
          dispositivo_id: string | null
          empresa_id: string | null
          id: string
          loja_id: string
          ocorrido_em: string
          origem: string
          recebido_em: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          detalhe?: Json
          dispositivo_id?: string | null
          empresa_id?: string | null
          id: string
          loja_id: string
          ocorrido_em?: string
          origem?: string
          recebido_em?: string
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          detalhe?: Json
          dispositivo_id?: string | null
          empresa_id?: string | null
          id?: string
          loja_id?: string
          ocorrido_em?: string
          origem?: string
          recebido_em?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_operador_eventos_dispositivo_id_fkey"
            columns: ["dispositivo_id"]
            isOneToOne: false
            referencedRelation: "pdv_dispositivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_operador_eventos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_operador_eventos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "pdv_operador_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      plataforma_admins: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          motivo: string | null
          usuario_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          motivo?: string | null
          usuario_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          motivo?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plataforma_admins_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
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
      pricing_config_versions: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          empresa_id: string
          id: string
          is_active: boolean
          label: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          empresa_id: string
          id?: string
          is_active?: boolean
          label: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          empresa_id?: string
          id?: string
          is_active?: boolean
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_config_versions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_create_requests: {
        Row: {
          ator_id: string
          created_at: string
          loja_id: string
          produto_id: string
          request_id: string
        }
        Insert: {
          ator_id: string
          created_at?: string
          loja_id: string
          produto_id: string
          request_id: string
        }
        Update: {
          ator_id?: string
          created_at?: string
          loja_id?: string
          produto_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_create_requests_ator_id_fkey"
            columns: ["ator_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_create_requests_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_create_requests_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "produto_create_requests_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_create_requests_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_create_requests_produto_id_fkey"
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
          atualizado_por: string | null
          categoria_id: string | null
          cest: string | null
          cfop_produto: string | null
          codigo_barras: string | null
          codigo_interno: string | null
          comissao_tipo: string | null
          comissao_valor: number | null
          created_at: string
          criado_por: string | null
          csosn: string | null
          cst_cofins: string | null
          cst_pis: string | null
          estoque_minimo: number
          fornecedor_id: string | null
          icms_origem: string | null
          id: string
          imagem_url: string | null
          limite_transferencia_sem_observacao: number | null
          localizacao_prateleira: string | null
          loja_id: string
          marca_id: string | null
          ncm: string | null
          nome: string
          nome_reduzido_pdv: string | null
          nome_sem_acento: string | null
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
          tags: string[]
          tem_nf: boolean
          unidade_medida: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          atualizado_por?: string | null
          categoria_id?: string | null
          cest?: string | null
          cfop_produto?: string | null
          codigo_barras?: string | null
          codigo_interno?: string | null
          comissao_tipo?: string | null
          comissao_valor?: number | null
          created_at?: string
          criado_por?: string | null
          csosn?: string | null
          cst_cofins?: string | null
          cst_pis?: string | null
          estoque_minimo?: number
          fornecedor_id?: string | null
          icms_origem?: string | null
          id?: string
          imagem_url?: string | null
          limite_transferencia_sem_observacao?: number | null
          localizacao_prateleira?: string | null
          loja_id?: string
          marca_id?: string | null
          ncm?: string | null
          nome: string
          nome_reduzido_pdv?: string | null
          nome_sem_acento?: string | null
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
          tags?: string[]
          tem_nf?: boolean
          unidade_medida?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          atualizado_por?: string | null
          categoria_id?: string | null
          cest?: string | null
          cfop_produto?: string | null
          codigo_barras?: string | null
          codigo_interno?: string | null
          comissao_tipo?: string | null
          comissao_valor?: number | null
          created_at?: string
          criado_por?: string | null
          csosn?: string | null
          cst_cofins?: string | null
          cst_pis?: string | null
          estoque_minimo?: number
          fornecedor_id?: string | null
          icms_origem?: string | null
          id?: string
          imagem_url?: string | null
          limite_transferencia_sem_observacao?: number | null
          localizacao_prateleira?: string | null
          loja_id?: string
          marca_id?: string | null
          ncm?: string | null
          nome?: string
          nome_reduzido_pdv?: string | null
          nome_sem_acento?: string | null
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
          tags?: string[]
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
          empresa_id: string | null
          id: string
          nome: string | null
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
          empresa_id?: string | null
          id?: string
          nome?: string | null
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
          empresa_id?: string | null
          id?: string
          nome?: string | null
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
            foreignKeyName: "regras_preco_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
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
          empresa_id: string
          id: number
          timezone: string
        }
        Insert: {
          empresa_id: string
          id?: number
          timezone?: string
        }
        Update: {
          empresa_id?: string
          id?: number
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatorio_settings_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
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
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          created_by: string
          divergencia_motivo: string | null
          finalized_at: string | null
          id: string
          idempotency_key: string | null
          loja_id: string
          observacao: string | null
          origem_descricao: string
          origem_ref: string | null
          origem_tipo: string
          payload_hash: string | null
          status: string
        }
        Insert: {
          anexo_url?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          created_by: string
          divergencia_motivo?: string | null
          finalized_at?: string | null
          id?: string
          idempotency_key?: string | null
          loja_id: string
          observacao?: string | null
          origem_descricao: string
          origem_ref?: string | null
          origem_tipo?: string
          payload_hash?: string | null
          status?: string
        }
        Update: {
          anexo_url?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          created_by?: string
          divergencia_motivo?: string | null
          finalized_at?: string | null
          id?: string
          idempotency_key?: string | null
          loja_id?: string
          observacao?: string | null
          origem_descricao?: string
          origem_ref?: string | null
          origem_tipo?: string
          payload_hash?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "remessas_conferido_por_fkey"
            columns: ["conferido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
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
      sync_eventos_revisao: {
        Row: {
          caixa_id: string | null
          classificacao: string
          decidido_em: string | null
          decidido_por: string | null
          decisao_motivo: string | null
          device_fingerprint: string | null
          dispositivo_id: string | null
          empresa_id: string
          event_id: string
          evidencias: Json
          horario_dispositivo: string | null
          id: string
          loja_id: string
          motivo: string
          operador_id: string | null
          origem: string
          payload: Json
          payload_sha256: string
          recebido_em: string
          seq: number
          status: string
          tipo: string
          venda_id: string | null
        }
        Insert: {
          caixa_id?: string | null
          classificacao: string
          decidido_em?: string | null
          decidido_por?: string | null
          decisao_motivo?: string | null
          device_fingerprint?: string | null
          dispositivo_id?: string | null
          empresa_id: string
          event_id: string
          evidencias?: Json
          horario_dispositivo?: string | null
          id?: string
          loja_id: string
          motivo: string
          operador_id?: string | null
          origem: string
          payload: Json
          payload_sha256: string
          recebido_em?: string
          seq?: number
          status?: string
          tipo: string
          venda_id?: string | null
        }
        Update: {
          caixa_id?: string | null
          classificacao?: string
          decidido_em?: string | null
          decidido_por?: string | null
          decisao_motivo?: string | null
          device_fingerprint?: string | null
          dispositivo_id?: string | null
          empresa_id?: string
          event_id?: string
          evidencias?: Json
          horario_dispositivo?: string | null
          id?: string
          loja_id?: string
          motivo?: string
          operador_id?: string | null
          origem?: string
          payload?: Json
          payload_sha256?: string
          recebido_em?: string
          seq?: number
          status?: string
          tipo?: string
          venda_id?: string | null
        }
        Relationships: []
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
            foreignKeyName: "system_alerts_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "system_alerts_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
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
      tokens_autorizacao_operacao: {
        Row: {
          alvo_id: string
          created_at: string
          expira_em: string
          finalidade: string
          gerente_id: string
          loja_id: string
          revogado_em: string | null
          revogado_motivo: string | null
          solicitante_id: string | null
          token: string
          usado: boolean
          usado_em: string | null
        }
        Insert: {
          alvo_id: string
          created_at?: string
          expira_em: string
          finalidade: string
          gerente_id: string
          loja_id: string
          revogado_em?: string | null
          revogado_motivo?: string | null
          solicitante_id?: string | null
          token: string
          usado?: boolean
          usado_em?: string | null
        }
        Update: {
          alvo_id?: string
          created_at?: string
          expira_em?: string
          finalidade?: string
          gerente_id?: string
          loja_id?: string
          revogado_em?: string | null
          revogado_motivo?: string | null
          solicitante_id?: string | null
          token?: string
          usado?: boolean
          usado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tokens_autorizacao_operacao_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokens_autorizacao_operacao_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokens_autorizacao_operacao_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "tokens_autorizacao_operacao_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens_desconto_gerente: {
        Row: {
          aprovador_id: string | null
          created_at: string
          criado_por: string | null
          expira_em: string
          loja_id: string | null
          revogado_em: string | null
          revogado_motivo: string | null
          token: string
          usado: boolean
        }
        Insert: {
          aprovador_id?: string | null
          created_at?: string
          criado_por?: string | null
          expira_em: string
          loja_id?: string | null
          revogado_em?: string | null
          revogado_motivo?: string | null
          token: string
          usado?: boolean
        }
        Update: {
          aprovador_id?: string | null
          created_at?: string
          criado_por?: string | null
          expira_em?: string
          loja_id?: string | null
          revogado_em?: string | null
          revogado_motivo?: string | null
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
      tributos_catalogo_uf: {
        Row: {
          base_legal: string
          consultado_em: string
          criado_em: string
          fcp_geral_pct: number
          fonte_urls: string[]
          icms_modal_pct: number
          id: string
          nota: string | null
          status: string
          uf: string
          versao_catalogo: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          base_legal: string
          consultado_em: string
          criado_em?: string
          fcp_geral_pct?: number
          fonte_urls?: string[]
          icms_modal_pct: number
          id: string
          nota?: string | null
          status: string
          uf: string
          versao_catalogo: string
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          base_legal?: string
          consultado_em?: string
          criado_em?: string
          fcp_geral_pct?: number
          fonte_urls?: string[]
          icms_modal_pct?: number
          id?: string
          nota?: string | null
          status?: string
          uf?: string
          versao_catalogo?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: []
      }
      usuario_pin: {
        Row: {
          definido_em: string
          definido_por: string | null
          pin_bloqueado_ate: string | null
          pin_hash: string
          pin_iteracoes: number
          pin_salt: string
          pin_tentativas: number
          trocar_no_primeiro_uso: boolean
          usuario_id: string
        }
        Insert: {
          definido_em?: string
          definido_por?: string | null
          pin_bloqueado_ate?: string | null
          pin_hash: string
          pin_iteracoes: number
          pin_salt: string
          pin_tentativas?: number
          trocar_no_primeiro_uso?: boolean
          usuario_id: string
        }
        Update: {
          definido_em?: string
          definido_por?: string | null
          pin_bloqueado_ate?: string | null
          pin_hash?: string
          pin_iteracoes?: number
          pin_salt?: string
          pin_tentativas?: number
          trocar_no_primeiro_uso?: boolean
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_pin_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_vinculos: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          empresa_id: string
          id: string
          loja_id: string | null
          papel: string
          usuario_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          empresa_id: string
          id?: string
          loja_id?: string | null
          papel: string
          usuario_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          id?: string
          loja_id?: string | null
          papel?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_vinculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_vinculos_loja_da_empresa_fk"
            columns: ["loja_id", "empresa_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id", "empresa_id"]
          },
          {
            foreignKeyName: "usuario_vinculos_usuario_id_fkey"
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
          funcionario_id: string | null
          id: string
          idioma_preferido: string
          loja_id: string
          nome: string
          perfil: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          funcionario_id?: string | null
          id: string
          idioma_preferido?: string
          loja_id?: string
          nome: string
          perfil: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          funcionario_id?: string | null
          id?: string
          idioma_preferido?: string
          loja_id?: string
          nome?: string
          perfil?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
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
      venda_eventos: {
        Row: {
          caixa_id: string
          event_type: string
          forma_pagamento: string | null
          id: string
          idempotency_key: string
          items: Json
          loja_id: string
          occurred_at: string
          operador_id: string
          sale_id: string
          source: string
          total: number
          total_bruto: number | null
        }
        Insert: {
          caixa_id: string
          event_type: string
          forma_pagamento?: string | null
          id?: string
          idempotency_key: string
          items?: Json
          loja_id: string
          occurred_at?: string
          operador_id: string
          sale_id: string
          source: string
          total: number
          total_bruto?: number | null
        }
        Update: {
          caixa_id?: string
          event_type?: string
          forma_pagamento?: string | null
          id?: string
          idempotency_key?: string
          items?: Json
          loja_id?: string
          occurred_at?: string
          operador_id?: string
          sale_id?: string
          source?: string
          total?: number
          total_bruto?: number | null
        }
        Relationships: []
      }
      venda_pos_venda_itens: {
        Row: {
          item_venda_id: string
          operacao_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          subtotal: number
        }
        Insert: {
          item_venda_id: string
          operacao_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          subtotal: number
        }
        Update: {
          item_venda_id?: string
          operacao_id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "venda_pos_venda_itens_item_venda_id_fkey"
            columns: ["item_venda_id"]
            isOneToOne: false
            referencedRelation: "itens_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_itens_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "venda_pos_venda_operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_pos_venda_operacoes: {
        Row: {
          caixa_desembolso_id: string | null
          caixa_id: string
          contas_receber_id: string | null
          created_at: string
          forma_estorno: string
          id: string
          idempotency_key: string
          motivo: string
          operador_id: string
          tipo: string
          valor_abatido_ar: number
          valor_caixa_estornado: number
          valor_estornado: number
          venda_id: string
          venda_substituta_id: string | null
        }
        Insert: {
          caixa_desembolso_id?: string | null
          caixa_id: string
          contas_receber_id?: string | null
          created_at?: string
          forma_estorno: string
          id?: string
          idempotency_key: string
          motivo: string
          operador_id: string
          tipo: string
          valor_abatido_ar?: number
          valor_caixa_estornado?: number
          valor_estornado?: number
          venda_id: string
          venda_substituta_id?: string | null
        }
        Update: {
          caixa_desembolso_id?: string | null
          caixa_id?: string
          contas_receber_id?: string | null
          created_at?: string
          forma_estorno?: string
          id?: string
          idempotency_key?: string
          motivo?: string
          operador_id?: string
          tipo?: string
          valor_abatido_ar?: number
          valor_caixa_estornado?: number
          valor_estornado?: number
          venda_id?: string
          venda_substituta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venda_pos_venda_operacoes_caixa_desembolso_id_fkey"
            columns: ["caixa_desembolso_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_operacoes_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_operacoes_contas_receber_id_fkey"
            columns: ["contas_receber_id"]
            isOneToOne: false
            referencedRelation: "contas_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_operacoes_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_operacoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "venda_pos_venda_operacoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_operacoes_venda_substituta_id_fkey"
            columns: ["venda_substituta_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "venda_pos_venda_operacoes_venda_substituta_id_fkey"
            columns: ["venda_substituta_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          caixa_id: string | null
          chave_nf: string | null
          cliente_id: string | null
          created_at: string
          data: string
          forma_pagamento: string
          id: string
          numero_nf: string | null
          operador_id: string | null
          pricing_version_id: string | null
          status: string
          tipo_venda: string
          total_bruto: number
          total_desconto: number
          total_liquido: number
          vendedor_id: string | null
        }
        Insert: {
          caixa_id?: string | null
          chave_nf?: string | null
          cliente_id?: string | null
          created_at?: string
          data?: string
          forma_pagamento: string
          id?: string
          numero_nf?: string | null
          operador_id?: string | null
          pricing_version_id?: string | null
          status?: string
          tipo_venda?: string
          total_bruto: number
          total_desconto?: number
          total_liquido: number
          vendedor_id?: string | null
        }
        Update: {
          caixa_id?: string | null
          chave_nf?: string | null
          cliente_id?: string | null
          created_at?: string
          data?: string
          forma_pagamento?: string
          id?: string
          numero_nf?: string | null
          operador_id?: string | null
          pricing_version_id?: string | null
          status?: string
          tipo_venda?: string
          total_bruto?: number
          total_desconto?: number
          total_liquido?: number
          vendedor_id?: string | null
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
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_gerente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_vendedor_id_fkey"
            columns: ["vendedor_id"]
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
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
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
      vendas_em_espera: {
        Row: {
          atualizada_em: string
          caixa_id: string | null
          cliente_id: string | null
          criada_em: string
          descartada_motivo: string | null
          desconto_gerente_percentual: number | null
          desconto_gerente_token: string | null
          id: string
          itens: Json
          loja_id: string
          numero_local: number
          operador_id: string
          rotulo: string | null
          status: string
          totais: Json
        }
        Insert: {
          atualizada_em?: string
          caixa_id?: string | null
          cliente_id?: string | null
          criada_em?: string
          descartada_motivo?: string | null
          desconto_gerente_percentual?: number | null
          desconto_gerente_token?: string | null
          id?: string
          itens?: Json
          loja_id: string
          numero_local: number
          operador_id: string
          rotulo?: string | null
          status?: string
          totais?: Json
        }
        Update: {
          atualizada_em?: string
          caixa_id?: string | null
          cliente_id?: string | null
          criada_em?: string
          descartada_motivo?: string | null
          desconto_gerente_percentual?: number | null
          desconto_gerente_token?: string | null
          id?: string
          itens?: Json
          loja_id?: string
          numero_local?: number
          operador_id?: string
          rotulo?: string | null
          status?: string
          totais?: Json
        }
        Relationships: [
          {
            foreignKeyName: "vendas_em_espera_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_em_espera_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_em_espera_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "vendas_em_espera_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_pagamentos: {
        Row: {
          created_at: string
          forma_pagamento: string
          id: string
          parcelas: number
          valor: number
          venda_id: string
        }
        Insert: {
          created_at?: string
          forma_pagamento: string
          id?: string
          parcelas?: number
          valor: number
          venda_id: string
        }
        Update: {
          created_at?: string
          forma_pagamento?: string
          id?: string
          parcelas?: number
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_pagamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
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
            foreignKeyName: "vinculos_fornecedor_produto_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "vinculos_fornecedor_produto_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "vinculos_fornecedor_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_fornecedor_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_fornecedor_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "v_top_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      comissoes_ajustes_auditoria: {
        Row: {
          ajuste_id: string | null
          ator_id: string | null
          beneficiario_id: string | null
          comissao_id: string | null
          created_at: string | null
          idempotency_key: string | null
          loja_id: string | null
          origem_id: string | null
          origem_ocorrida_em: string | null
          origem_tipo: string | null
          tipo: string | null
          valor: number | null
          valor_consumido: number | null
          valor_pendente: number | null
          venda_id: string | null
          venda_substituta_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_ajustes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_reconstrucao_auditoria"
            referencedColumns: ["comissao_id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes_vendedores_liquidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_operador_id_fkey"
            columns: ["beneficiario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "comissoes_ajustes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pos_venda_operacoes_venda_substituta_id_fkey"
            columns: ["venda_substituta_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "venda_pos_venda_operacoes_venda_substituta_id_fkey"
            columns: ["venda_substituta_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_reconstrucao_auditoria: {
        Row: {
          comissao_id: string | null
          loja_id: string | null
          operador_id: string | null
          pagamento_id: string | null
          pagamento_valor_bruto: number | null
          pagamento_valor_compensado: number | null
          pago_em: string | null
          pago_por: string | null
          saldo_final: number | null
          status: string | null
          valor_ajustado: number | null
          valor_compensado: number | null
          valor_liquido_apurado: number | null
          valor_original: number | null
          valor_pago: number | null
          venda_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_pagamentos_pago_por_fkey"
            columns: ["pago_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "comissoes_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_saldo_operador: {
        Row: {
          ajuste_nao_compensado: number | null
          comissao_pendente: number | null
          loja_id: string | null
          operador_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_vendedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_vendedores_liquidas: {
        Row: {
          id: string | null
          loja_id: string | null
          operador_id: string | null
          pagamento_id: string | null
          pago_em: string | null
          saldo_a_compensar: number | null
          status: string | null
          total_ajustes: number | null
          valor_comissao: number | null
          valor_liquido: number | null
          venda_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_vendedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "v_estoque_baixo"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "comissoes_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "v_venda_consistencia_anomalias"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "comissoes_vendedores_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_custos: {
        Row: {
          loja_id: string | null
          preco_custo: number | null
          preco_custo_medio: number | null
          produto_id: string | null
        }
        Relationships: []
      }
      v_clientes_gerente: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          documento: string | null
          email: string | null
          endereco: string | null
          id: string | null
          limite_credito: number | null
          loja_id: string | null
          nome: string | null
          saldo_crediario: number | null
          telefone: string | null
          tipo: string | null
          ultima_compra: string | null
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
      v_estoque_ledger_divergencia: {
        Row: {
          codigo_barras: string | null
          divergencia: number | null
          loja_id: string | null
          produto_id: string | null
          produto_nome: string | null
          qtd_movimentos: number | null
          saldo_estoque: number | null
          soma_movimentos: number | null
          ultimo_movimento_em: string | null
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
      v_venda_consistencia_anomalias: {
        Row: {
          caixa_id: string | null
          created_at: string | null
          evento_count: number | null
          evento_duplicado: boolean | null
          item_count: number | null
          operador_id: string | null
          pagamento_count: number | null
          pagamentos_divergentes: boolean | null
          pagamentos_total: number | null
          sem_evento_ledger: boolean | null
          sem_itens: boolean | null
          sem_pagamento: boolean | null
          status: string | null
          total_liquido: number | null
          venda_id: string | null
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
      _fp_import_usuario_pode: {
        Args: { p_operacao: string; p_papeis: string[]; p_usuario: string }
        Returns: boolean
      }
      _import_auditar: {
        Args: {
          p_acao: string
          p_detalhe: Json
          p_empresa: string
          p_entidade: string
          p_entidade_id: string
          p_operacao: string
        }
        Returns: undefined
      }
      _import_empresa_contexto: { Args: never; Returns: string }
      _import_fornecedor_da_empresa: {
        Args: { p_empresa: string; p_fornecedor: string }
        Returns: boolean
      }
      _import_montar_entrada: { Args: { p_operacao: string }; Returns: Json }
      _import_operacao_para_escrita: {
        Args: { p_operacao: string }
        Returns: {
          apuracao_aprovada_id: string | null
          atualizado_em: string
          criado_em: string
          criado_por: string
          data_desembaraco: string | null
          data_embarque: string | null
          data_invoice: string | null
          descricao: string | null
          empresa_id: string
          fornecedor_id: string | null
          id: string
          loja_importadora_id: string
          moeda: string | null
          referencia: string
          status: string
          versao_dados: number
        }
        SetofOptions: {
          from: "*"
          to: "import_operacoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _oc_abater_por_produto: {
        Args: {
          p_entrada_id: string
          p_esperada: number
          p_estrito: boolean
          p_importacao: string
          p_loja: string
          p_mov_id: string
          p_obs: string
          p_ordem_id: string
          p_origem: string
          p_produto_id: string
          p_qtd: number
          p_remessa_id: string
          p_uid: string
        }
        Returns: number
      }
      _oc_atualizar_estado: { Args: { p_ordem_id: string }; Returns: undefined }
      _oc_creditar_item: {
        Args: {
          p_entrada_id: string
          p_esperada: number
          p_hash: string
          p_idem: string
          p_importacao: string
          p_item_id: string
          p_loja: string
          p_mov_id: string
          p_obs: string
          p_ordem_id: string
          p_origem: string
          p_qtd: number
          p_remessa_id: string
          p_uid: string
        }
        Returns: undefined
      }
      _oc_resumo_json: { Args: { p_ordem_id: string }; Returns: Json }
      _validar_documento_entrega: {
        Args: { p_importacao: string; p_loja: string; p_remessa: string }
        Returns: undefined
      }
      ajustar_estoque_manual:
        | {
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
        | {
            Args: {
              p_ator_id?: string
              p_estoque_minimo: number
              p_loja_id: string
              p_motivo_codigo: string
              p_observacao?: string
              p_produto_id: string
              p_quantidade_atual: number
            }
            Returns: undefined
          }
      ajustar_estoque_manual_seguro: {
        Args: {
          p_ator_id: string
          p_estoque_minimo: number
          p_loja_id: string
          p_minimo_esperado: number
          p_motivo_codigo: string
          p_observacao: string
          p_produto_id: string
          p_quantidade_atual: number
          p_quantidade_esperada: number
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
      associar_documento_entrada: {
        Args: { p_importacao: string; p_remessa: string }
        Returns: undefined
      }
      ativar_dispositivo_pdv: {
        Args: {
          p_codigo: string
          p_device_fingerprint: string
          p_nome?: string
        }
        Returns: Json
      }
      ativar_dispositivo_pdv_v2: {
        Args: {
          p_codigo: string
          p_device_fingerprint: string
          p_ip?: string
          p_nome?: string
        }
        Returns: Json
      }
      atualizar_preco_varejo_produto: {
        Args: { p_preco: number; p_produto_id: string }
        Returns: undefined
      }
      atualizar_produto_com_faixa_atacado: {
        Args: {
          p_ator_id?: string
          p_faixa?: Json
          p_payload: Json
          p_produto_id: string
        }
        Returns: Json
      }
      auth_pode_ver_produto_gerencial: {
        Args: { p_produto_id: string }
        Returns: boolean
      }
      auth_usuario_eh_admin: { Args: never; Returns: boolean }
      auth_usuario_eh_dono: { Args: never; Returns: boolean }
      auth_usuario_gerencial_loja: {
        Args: { p_loja_id: string }
        Returns: boolean
      }
      auth_usuario_loja_id: { Args: never; Returns: string }
      calcular_preco_produto: {
        Args: { p_loja_id?: string; p_produto_id: string; p_quantidade: number }
        Returns: Json
      }
      calcular_promocao_aplicavel: {
        Args: {
          p_categoria_id: string
          p_data_referencia?: string
          p_produto_id: string
          p_quantidade: number
        }
        Returns: {
          regra_id: string
          tipo_desconto: string
          tipo_regra: string
          valor_desconto: number
        }[]
      }
      calcular_valor_sistema_dinheiro_caixa: {
        Args: { p_caixa_id: string }
        Returns: number
      }
      calcular_valor_sistema_por_forma_caixa: {
        Args: { p_caixa_id: string }
        Returns: {
          forma_pagamento: string
          metrica: string
          valor_sistema: number
        }[]
      }
      cancelar_conta_pagar: {
        Args: {
          p_conta_id: string
          p_idempotency_key: string
          p_motivo: string
          p_origem?: string
        }
        Returns: {
          conta_id: string
          estornos_gerados: number
          idempotent_replay: boolean
          status: string
          valor_pago: number
        }[]
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
      cobranca_aplicar_evento: {
        Args: { p_evento: string; p_evento_id: string; p_payload: Json }
        Returns: Json
      }
      cobranca_assinaturas_para_conciliar: {
        Args: never
        Returns: {
          asaas_subscription_id: string
          empresa_id: string
        }[]
      }
      cobranca_cancelar: { Args: { p_empresa: string }; Returns: undefined }
      cobranca_conciliar_pagamento: { Args: { p_payment: Json }; Returns: Json }
      cobranca_estado_empresa: { Args: { p_empresa: string }; Returns: Json }
      cobranca_liberar_assinar: {
        Args: { p_empresa: string }
        Returns: undefined
      }
      cobranca_liberar_venda_offline: {
        Args: { p_dispositivo: string; p_venda_em: string; p_venda_id: string }
        Returns: Json
      }
      cobranca_processar_vencimentos: {
        Args: { p_agora?: string }
        Returns: Json
      }
      cobranca_registrar_assinatura: {
        Args: {
          p_addons: string[]
          p_asaas_customer: string
          p_asaas_subscription: string
          p_empresa: string
          p_forma: string
          p_plano: string
          p_proximo_vencimento: string
          p_qtd_caixas: number
          p_qtd_lojas: number
          p_valor_centavos: number
        }
        Returns: undefined
      }
      cobranca_reservar_assinar: {
        Args: { p_empresa: string; p_segundos?: number }
        Returns: boolean
      }
      colocar_venda_em_espera: {
        Args: {
          p_caixa_id?: string
          p_cliente_id?: string
          p_desconto_gerente_percentual?: number
          p_desconto_gerente_token?: string
          p_itens: Json
          p_rotulo?: string
          p_totais: Json
        }
        Returns: Json
      }
      comissao_export_contabil: {
        Args: { p_competencia: string; p_loja_id: string }
        Returns: {
          ajustes: number
          aprovado_em: string
          base: number
          bonus_meta: number
          comissao: number
          competencia: string
          loja_codigo: string
          loja_nome: string
          operador_id: string
          operador_nome: string
          status_periodo: string
          total: number
        }[]
      }
      comissao_periodo_transicionar: {
        Args: { p_competencia: string; p_loja_id: string; p_para: string }
        Returns: Json
      }
      comissao_relatorio_itens: {
        Args: {
          p_competencia: string
          p_loja_id: string
          p_operador_id: string
        }
        Returns: {
          base: number
          comissao: number
          data: string
          origem_regra: string
          percentual: number
          produto: string
          quantidade: number
          tipo_calculo: string
          valor_fixo: number
          venda_id: string
        }[]
      }
      comissao_relatorio_vendedores: {
        Args: { p_competencia: string; p_loja_id: string }
        Returns: {
          ajustes: number
          base: number
          bonus_meta: number
          comissao: number
          operador_id: string
          operador_nome: string
          status_periodo: string
          total: number
          vendas: number
        }[]
      }
      comissao_salvar_config: {
        Args: { p_base?: string; p_liberacao?: string; p_loja_id: string }
        Returns: Json
      }
      comissao_simular_regra: {
        Args: {
          p_canal?: string
          p_data?: string
          p_loja_id: string
          p_produto_id: string
          p_vendedor_id: string
        }
        Returns: {
          cargo: string
          nivel: number
          origem: string
          regra_id: string
          tipo_calculo: string
          valor: number
        }[]
      }
      configuracoes_para_caixa_web: { Args: never; Returns: Json }
      confirmar_importacao_nfe: {
        Args: { p_importacao_id: string }
        Returns: undefined
      }
      confirmar_remessa_entrada: {
        Args: { p_remessa_id: string }
        Returns: undefined
      }
      consumir_token_autorizacao_operacao: {
        Args: {
          p_alvo_id: string
          p_finalidade: string
          p_loja_id: string
          p_token: string
        }
        Returns: string
      }
      converter_venda_em_espera: { Args: { p_id: string }; Returns: Json }
      criar_confirmar_remessa_entrada: {
        Args: {
          p_idempotency_key: string
          p_itens: Json
          p_observacao: string
          p_ordem_compra_id?: string
          p_origem: string
        }
        Returns: string
      }
      criar_produto_com_estoque_inicial: {
        Args: {
          p_ator_id: string
          p_faixa?: Json
          p_payload: Json
          p_request_id?: string
        }
        Returns: Json
      }
      dashboard_gerente_resumo: {
        Args: { p_loja_id: string; p_tz?: string }
        Returns: Json
      }
      decrementar_estoque_seguro: {
        Args: { p_produto_id: string; p_quantidade: number; p_venda_id: string }
        Returns: {
          estoque_atual: number
          mensagem: string
          sucesso: boolean
        }[]
      }
      definir_divisao_comissao: {
        Args: {
          p_percentual?: number
          p_segundo_id: string
          p_venda_id: string
        }
        Returns: Json
      }
      definir_meu_pin_pdv: {
        Args: { p_hash: string; p_iteracoes: number; p_salt: string }
        Returns: undefined
      }
      definir_pin_operador_pdv: {
        Args: {
          p_ator: string
          p_hash: string
          p_iteracoes: number
          p_salt: string
          p_usuario: string
        }
        Returns: undefined
      }
      definir_vendedor_venda: {
        Args: { p_venda_id: string; p_vendedor_id: string }
        Returns: Json
      }
      definir_vendedor_venda_pdv: {
        Args: { p_venda_id: string; p_vendedor_id: string }
        Returns: Json
      }
      desbloquear_pin_operador_pdv: {
        Args: { p_ator: string; p_usuario: string }
        Returns: undefined
      }
      descartar_venda_em_espera: {
        Args: { p_id: string; p_motivo?: string }
        Returns: Json
      }
      detalhe_comissoes_operador: {
        Args: {
          p_ate?: string
          p_de?: string
          p_loja_id: string
          p_operador_id: string
        }
        Returns: {
          ajustes: Json
          base_calculo: number
          comissao_id: string
          created_at: string
          pagamento_id: string
          pago_em: string
          saldo_final: number
          status: string
          valor_ajustado: number
          valor_compensado: number
          valor_liquido_apurado: number
          valor_original: number
          valor_pago: number
          venda_id: string
        }[]
      }
      devolver_ou_trocar_venda: {
        Args: {
          p_caixa_id?: string
          p_forma_estorno: string
          p_idempotency_key: string
          p_itens: Json
          p_motivo: string
          p_operador_id?: string
          p_tipo: string
          p_valor_estorno: number
          p_venda_id: string
          p_venda_substituta_id?: string
        }
        Returns: {
          itens: Json
          operacao_id: string
          status_venda: string
          tipo: string
          valor_caixa_estornado: number
          valor_estornado: number
          venda_id: string
        }[]
      }
      devolver_venda_em_espera: { Args: { p_id: string }; Returns: Json }
      encerrar_ordem_compra_com_falta: {
        Args: { p_motivo: string; p_oc_id: string }
        Returns: Json
      }
      ensure_venda_evento_registrado: {
        Args: { p_sale_id: string; p_source?: string }
        Returns: string
      }
      estornar_liquidacao_receber: {
        Args: {
          p_idempotency_key: string
          p_liquidacao_id: string
          p_motivo: string
          p_origem?: string
        }
        Returns: {
          caixa_id: string
          estorno_id: string
          idempotent_replay: boolean
          liquidacao_origem_id: string
          status: string
          titulo_id: string
          valor: number
          valor_aberto: number
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
      estornar_pagamento_contas_pagar: {
        Args: {
          p_idempotency_key: string
          p_motivo: string
          p_origem?: string
          p_pagamento_id: string
        }
        Returns: {
          conta_id: string
          estorno_id: string
          idempotent_replay: boolean
          movimentacao_estorno_id: string
          pagamento_origem_id: string
          status: string
          valor: number
          valor_pago: number
        }[]
      }
      excluir_linha_estoque_produto: {
        Args: { p_ator_id?: string; p_produto_id: string }
        Returns: undefined
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
          o_ja_fechado: boolean
          o_valor_contado: number
          o_valor_sistema: number
        }[]
      }
      fechar_caixa_pdv_atomico: {
        Args: {
          p_caixa_id: string
          p_data_fechamento?: string
          p_observacao?: string
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
        | { Args: never; Returns: undefined }
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
              p_event_source?: string
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
      finalizar_venda_transacional_canonica_v3:
        | { Args: never; Returns: undefined }
        | {
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
          p_cliente_id?: string
          p_desconto_gerente_percentual?: number
          p_desconto_gerente_token?: string
          p_device_id?: string
          p_fiscal_auto_enqueue?: boolean
          p_forma_pagamento?: string
          p_ip_address?: string
          p_itens?: Json
          p_limite_credito_gerente_token?: string
          p_loja_id: string
          p_motivo_desconto?: Database["public"]["Enums"]["motivo_desconto_enum_tipo"]
          p_motivo_descricao?: string
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
          contas_receber_id: string
          dados_fiscais: Json
          estoque_baixado: Json
          event_id: string
          itens_atualizados: Json
          mensagem: string
          status: string
          venda_id: string
        }[]
      }
      finalizar_venda_transacional_canonica_v4_unscoped: {
        Args: {
          p_caixa_id: string
          p_cliente_id?: string
          p_desconto_gerente_percentual?: number
          p_desconto_gerente_token?: string
          p_device_id?: string
          p_fiscal_auto_enqueue?: boolean
          p_forma_pagamento?: string
          p_ip_address?: string
          p_itens?: Json
          p_limite_credito_gerente_token?: string
          p_loja_id: string
          p_motivo_desconto?: Database["public"]["Enums"]["motivo_desconto_enum_tipo"]
          p_motivo_descricao?: string
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
          contas_receber_id: string
          dados_fiscais: Json
          estoque_baixado: Json
          event_id: string
          itens_atualizados: Json
          mensagem: string
          status: string
          venda_id: string
        }[]
      }
      financeiro_candidatos_conciliacao: {
        Args: { p_busca?: string; p_extrato: string }
        Returns: Json
      }
      financeiro_comando: {
        Args: { p_dados: Json; p_request_id: string; p_tipo: string }
        Returns: Json
      }
      financeiro_comando_operacional: {
        Args: { p_dados: Json; p_request_id: string; p_tipo: string }
        Returns: Json
      }
      financeiro_comando_v1: {
        Args: { p_dados: Json; p_request_id: string; p_tipo: string }
        Returns: Json
      }
      financeiro_painel: {
        Args: { p_ate: string; p_de: string; p_pagina?: number }
        Returns: Json
      }
      fiscal_cancelar_documento: {
        Args: { p_documento_id: string; p_justificativa: string }
        Returns: undefined
      }
      fiscal_claim_documentos: {
        Args: { p_limit?: number }
        Returns: {
          chave_fiscal: string
          correlation_id: string
          created_at: string
          deleted_at: string
          fiscal_action_hint: string
          fiscal_error_category: string
          fiscal_error_code: string
          fiscal_error_payload: Json
          fiscal_next_step_url: string
          fiscal_retryable: boolean
          id: string
          ja_tentou_emissao_antes: boolean
          payload: Json
          processado_em: string
          protocolo: string
          provider: string
          provider_ref: string
          proxima_tentativa_em: string
          status: string
          tentativas: number
          tipo_doc: string
          transicao_origem: string
          ultima_tentativa_em: string
          ultima_transicao_em: string
          ultimo_erro: string
          updated_at: string
          venda_id: string
        }[]
      }
      fiscal_claim_documentos_xml: {
        Args: { p_lease_segundos?: number; p_limit?: number }
        Returns: {
          correlation_id: string
          id: string
          payload: Json
          provider: string
          tipo_doc: string
          venda_id: string
          xml_lease_token: string
          xml_status: string
          xml_tentativas: number
        }[]
      }
      fiscal_enfileirar_documento_venda: {
        Args: {
          p_loja_id?: string
          p_payload?: Json
          p_tipo_doc?: string
          p_venda_id: string
        }
        Returns: string
      }
      fiscal_marcar_cancelado: {
        Args: {
          p_documento_id: string
          p_motivo?: string
          p_provider_payload?: Json
        }
        Returns: undefined
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
      fiscal_marcar_erro: {
        Args: {
          p_documento_id: string
          p_erro: string
          p_transitorio?: boolean
        }
        Returns: undefined
      }
      fiscal_marcar_erro_normalizado: {
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
      fiscal_marcar_xml_armazenado: {
        Args: {
          p_documento_id: string
          p_lease_token: string
          p_sha256: string
          p_storage_path: string
        }
        Returns: boolean
      }
      fiscal_marcar_xml_bloqueado: {
        Args: {
          p_documento_id: string
          p_lease_token: string
          p_motivo: string
        }
        Returns: boolean
      }
      fiscal_marcar_xml_erro: {
        Args: { p_documento_id: string; p_erro: string; p_lease_token: string }
        Returns: boolean
      }
      fiscal_reaper_documentos: {
        Args: { p_max_tentativas?: number; p_timeout_minutos?: number }
        Returns: {
          enviados_dlq: number
          reenfileirados: number
        }[]
      }
      fiscal_registrar_evento_enqueue_erro: {
        Args: {
          p_detalhe?: Json
          p_erro_mensagem: string
          p_tipo_doc: string
          p_venda_id: string
        }
        Returns: undefined
      }
      fiscal_reprocessar_documento: {
        Args: { p_documento_id: string }
        Returns: undefined
      }
      fp_admin_legado: { Args: never; Returns: boolean }
      fp_assert_loja: {
        Args: { p_direta: boolean; p_loja: string; p_rotulo: string }
        Returns: boolean
      }
      fp_assert_mesma_empresa: {
        Args: { p_a: string; p_b: string; p_rotulo: string }
        Returns: boolean
      }
      fp_assert_produto: {
        Args: { p_produto: string; p_rotulo: string }
        Returns: boolean
      }
      fp_eh_plataforma: { Args: never; Returns: boolean }
      fp_empresa_contexto: { Args: { p_loja?: string }; Returns: string }
      fp_empresa_contexto_modulo: {
        Args: { p_empresa?: string; p_modulo: string; p_papeis?: string[] }
        Returns: string
      }
      fp_empresa_da_loja: { Args: { p_loja: string }; Returns: string }
      fp_empresa_operacional: { Args: { p_empresa: string }; Returns: boolean }
      fp_empresa_tem_recurso: {
        Args: { p_empresa: string; p_recurso: string }
        Returns: boolean
      }
      fp_empresas_arr: { Args: never; Returns: string[] }
      fp_empresas_do_usuario: { Args: never; Returns: string[] }
      fp_empresas_do_usuario_como_dono: { Args: never; Returns: string[] }
      fp_empresas_gerenciais_do_usuario: { Args: never; Returns: string[] }
      fp_import_pode_objeto: {
        Args: { p_bucket: string; p_nome: string; p_papeis?: string[] }
        Returns: boolean
      }
      fp_import_pode_operacao: {
        Args: { p_operacao: string; p_papeis?: string[] }
        Returns: boolean
      }
      fp_loja_de: { Args: { p_id: string; p_tipo: string }; Returns: string }
      fp_lojas_cerca: { Args: never; Returns: string[] }
      fp_lojas_permitidas: { Args: { p_papeis?: string[] }; Returns: string[] }
      fp_lojas_permitidas_arr: { Args: never; Returns: string[] }
      fp_mesma_empresa: {
        Args: { p_loja_a: string; p_loja_b: string }
        Returns: boolean
      }
      fp_minha_assinatura: { Args: never; Returns: Json }
      fp_minhas_faturas: { Args: { p_limite?: number }; Returns: Json }
      fp_modulo_ativo: {
        Args: { p_empresa: string; p_modulo: string }
        Returns: boolean
      }
      fp_pdv_config_id: { Args: { p_loja?: string }; Returns: number }
      fp_pode_empresa: { Args: { p_empresa: string }; Returns: boolean }
      fp_pode_loja: {
        Args: { p_loja: string; p_papeis?: string[] }
        Returns: boolean
      }
      fp_pode_loja_nula: { Args: { p_loja: string }; Returns: boolean }
      fp_pode_modulo: {
        Args: { p_empresa: string; p_modulo: string; p_papeis?: string[] }
        Returns: boolean
      }
      fp_pode_operar_loja: {
        Args: { p_loja: string; p_papeis?: string[] }
        Returns: boolean
      }
      fp_recursos_empresa: { Args: { p_empresa: string }; Returns: string[] }
      fp_sou_dono_da_empresa: { Args: { p_empresa: string }; Returns: boolean }
      fp_token_gerente_vale_na_loja: {
        Args: { p_loja_id: string; p_token: string }
        Returns: boolean
      }
      fp_usuario_ativo: { Args: never; Returns: boolean }
      fp_usuario_pode_loja: {
        Args: { p_loja: string; p_papeis?: string[]; p_usuario: string }
        Returns: boolean
      }
      garantir_formas_pagamento_padrao: {
        Args: { p_loja_id: string }
        Returns: number
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
      import_aprovar_apuracao: {
        Args: {
          p_apuracao: string
          p_ator: string
          p_motivo: string
          p_verificacao: Json
        }
        Returns: undefined
      }
      import_atualizar_operacao: {
        Args: { p_dados: Json; p_operacao: string }
        Returns: undefined
      }
      import_buscar_produtos: {
        Args: { p_ids?: string[]; p_termo?: string }
        Returns: {
          id: string
          nome: string
        }[]
      }
      import_conferir_lancamento: {
        Args: {
          p_id: string
          p_operacao: string
          p_status: string
          p_tipo: string
        }
        Returns: undefined
      }
      import_criar_operacao: {
        Args: {
          p_descricao?: string
          p_loja_importadora: string
          p_referencia: string
        }
        Returns: string
      }
      import_listar_operacoes: {
        Args: never
        Returns: {
          aprovada_custo_total: string
          atualizado_em: string
          criado_em: string
          data_invoice: string
          fornecedor_id: string
          fornecedor_nome: string
          id: string
          loja_importadora_id: string
          moeda: string
          n_itens: number
          referencia: string
          status: string
          ultima_apuracao_atual: boolean
          ultima_apuracao_bloqueantes: number
          ultima_apuracao_custo_total: string
          ultima_apuracao_id: string
          ultima_apuracao_status: string
          ultima_apuracao_tipo: string
          ultima_apuracao_versao: number
        }[]
      }
      import_montar_entrada: { Args: { p_operacao: string }; Returns: Json }
      import_mudar_estado: {
        Args: { p_acao: string; p_motivo: string; p_operacao: string }
        Returns: undefined
      }
      import_registrar_apuracao: {
        Args: {
          p_entrada_sha256: string
          p_operacao: string
          p_saida: Json
          p_saida_sha256: string
          p_tipo: string
          p_versao_dados: number
        }
        Returns: string
      }
      import_registrar_documento: {
        Args: {
          p_data: string
          p_mime: string
          p_numero: string
          p_operacao: string
          p_sha256: string
          p_storage_path: string
          p_substitui?: string
          p_tamanho: number
          p_tipo: string
        }
        Returns: string
      }
      import_remover_override_tributo: {
        Args: { p_id: string }
        Returns: undefined
      }
      import_remover_rascunho: {
        Args: { p_id: string; p_operacao: string; p_tipo: string }
        Returns: undefined
      }
      import_salvar_item: {
        Args: { p_item: Json; p_operacao: string }
        Returns: string
      }
      import_salvar_lancamento: {
        Args: { p_dados: Json; p_operacao: string; p_tipo: string }
        Returns: string
      }
      import_salvar_override_tributo: {
        Args: { p_dados: Json }
        Returns: string
      }
      import_salvar_parametros_empresa: {
        Args: { p_dados: Json }
        Returns: undefined
      }
      importar_nfe_transacao: {
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
      is_commercial_admin: { Args: never; Returns: boolean }
      is_feature_enabled: { Args: { flag_name: string }; Returns: boolean }
      kpis_venda_eventos_gerente: {
        Args: {
          p_fim?: string
          p_formas_pagamento?: string[]
          p_inicio?: string
          p_loja_id: string
        }
        Returns: {
          faturado: number
          qtd_canceladas: number
          qtd_concluidas: number
          ticket_medio: number
          valor_canceladas: number
        }[]
      }
      kpis_vendas_gerente: {
        Args: {
          p_fim?: string
          p_formas_pagamento?: string[]
          p_inicio?: string
          p_loja_id: string
        }
        Returns: {
          devolucoes: number
          faturado: number
          receita_liquida: number
          taxa_cancelamento: number
          ticket_medio: number
          valor_cancelado: number
          vendas_canceladas: number
          vendas_concluidas: number
          vendas_registradas: number
        }[]
      }
      liquidar_comissoes: {
        Args: {
          p_idempotency_key: string
          p_ids: string[]
          p_loja_id: string
          p_operador_id: string
        }
        Returns: {
          comissoes_pagas: number
          idempotent_replay: boolean
          pagamento_id: string
          valor_bruto: number
          valor_compensado: number
          valor_liquido: number
        }[]
      }
      list_produtos_gerente_filtrados: {
        Args: {
          p_busca: string
          p_categoria_id: string
          p_estoque_filtro: string
          p_fornecedor_id: string
          p_imagens_filtro: string
          p_loja_id: string
          p_marca_id: string
          p_nf_filtro: string
          p_origem_filtro: string
          p_page: number
          p_page_size: number
          p_situacao: string
          p_tags_filtro: string[]
        }
        Returns: {
          ativo: boolean
          categoria_id: string
          cest: string
          cfop_produto: string
          codigo_barras: string
          csosn: string
          cst_cofins: string
          cst_pis: string
          fornecedor_id: string
          icms_origem: string
          id: string
          imagem_url: string
          marca_id: string
          ncm: string
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
      listar_caixas_elegiveis_desembolso: {
        Args: never
        Returns: {
          id: string
          operador_nome: string
        }[]
      }
      listar_caixas_fechamento_formas: {
        Args: { p_caixa_id: string }
        Returns: {
          created_at: string
          diferenca: number
          forma_pagamento: string
          metrica: string
          origem_regra: string
          valor_informado: number
          valor_sistema_snapshot: number
        }[]
      }
      listar_venda_eventos_gerente: {
        Args: {
          p_event_types?: string[]
          p_fim?: string
          p_formas_pagamento?: string[]
          p_inicio?: string
          p_limit?: number
          p_loja_id: string
          p_offset?: number
        }
        Returns: {
          caixa_id: string
          event_id: string
          event_type: string
          forma_pagamento: string
          items: Json
          occurred_at: string
          operador_id: string
          primeiro_produto: string
          qtd_itens_distintos: number
          qtd_itens_total: number
          sale_id: string
          total: number
          total_bruto: number
        }[]
      }
      listar_vendas_em_espera: { Args: never; Returns: Json }
      listar_vendas_gerente: {
        Args: {
          p_fim?: string
          p_formas_pagamento?: string[]
          p_inicio?: string
          p_limit?: number
          p_loja_id: string
          p_offset?: number
          p_status?: string[]
        }
        Returns: {
          caixa_id: string
          data: string
          forma_pagamento: string
          operador_id: string
          primeiro_produto: string
          qtd_itens_distintos: number
          qtd_itens_total: number
          status: string
          total_bruto: number
          total_liquido: number
          venda_id: string
        }[]
      }
      listar_vendedores_loja: {
        Args: { p_loja_id: string }
        Returns: {
          id: string
          nome: string
        }[]
      }
      marcar_comissoes_pagas: {
        Args: { p_ids: string[]; p_loja_id: string; p_operador_id: string }
        Returns: number
      }
      minhas_comissoes: {
        Args: { p_meses?: number }
        Returns: {
          ajustes: number
          base: number
          bonus_meta: number
          comissao: number
          competencia: string
          loja_id: string
          loja_nome: string
          status_periodo: string
          total: number
          vendas: number
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
      obter_pricing_version_ativa: { Args: never; Returns: string }
      obter_status_caixa_operador: {
        Args: { p_operador_id?: string }
        Returns: {
          blind_closure_enabled: boolean
          caixa_id: string
          data_abertura: string
          mensagem_operador: string
          status: string
          valor_inicial: number
          valor_sistema_dinheiro: number
        }[]
      }
      ops_definir_modulo_empresa: {
        Args: {
          p_autorizado_por: string
          p_empresa: string
          p_habilitado: boolean
          p_modulo: string
          p_motivo: string
          p_origem?: string
        }
        Returns: undefined
      }
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
          max_desconto_manual_item_percentual: number
          quantidade_minima_atacado_padrao: number
        }[]
      }
      pdv_diagnostico_pre_producao: {
        Args: { p_produto_codigo?: string }
        Returns: Json
      }
      pdv_operadores_da_loja: {
        Args: { p_loja: string }
        Returns: {
          idioma: string
          nome: string
          papel: string
          pin_bloqueado_ate: string
          pin_hash: string
          pin_iteracoes: number
          pin_salt: string
          usuario_id: string
        }[]
      }
      pdv_pin_loja_gerida: {
        Args: { p_ator: string; p_usuario: string }
        Returns: string
      }
      pdv_pin_obvio: { Args: { p_pin: string }; Returns: boolean }
      pdv_pin_registrar_tentativa: {
        Args: { p_ok: boolean; p_usuario: string }
        Returns: {
          bloqueado_ate: string
          tentativas: number
        }[]
      }
      pdv_registrar_alertas_margem_venda: {
        Args: { p_venda_id: string }
        Returns: undefined
      }
      planos_catalogo: { Args: never; Returns: Json }
      plataforma_iniciar_trial: {
        Args: { p: Json; p_dias?: number }
        Returns: Json
      }
      plataforma_provisionar_empresa: {
        Args: { p: Json; p_ator?: string }
        Returns: Json
      }
      plataforma_registrar_codigo_ativacao_pdv: {
        Args: {
          p_codigo_hash: string
          p_criado_por?: string
          p_loja_id: string
          p_validade_horas?: number
        }
        Returns: Json
      }
      processar_ajuste_comissao_venda: {
        Args: { p_origem_id: string; p_tipo: string; p_venda_id: string }
        Returns: undefined
      }
      processar_comissao_venda: {
        Args: { p_venda_id: string }
        Returns: undefined
      }
      produtos_custos_autorizados: {
        Args: { p_produto_ids?: string[] }
        Returns: {
          loja_id: string
          preco_custo: number
          preco_custo_medio: number
          produto_id: string
        }[]
      }
      proximo_numero_venda_em_espera: {
        Args: { p_operador_id: string }
        Returns: number
      }
      quantidade_devolvida_item_venda: {
        Args: { p_item_venda_id: string }
        Returns: number
      }
      receber_ordem_compra: {
        Args: {
          p_idempotency_key: string
          p_itens: Json
          p_observacao?: string
          p_oc_id: string
        }
        Returns: Json
      }
      registrar_conferencia_nfe: {
        Args: { p_importacao_id: string; p_itens: Json }
        Returns: Json
      }
      registrar_conferencia_ordem_compra: {
        Args: { p_itens: Json; p_oc_id: string }
        Returns: Json
      }
      registrar_liquidacao_receber: {
        Args: {
          p_caixa_id?: string
          p_forma_pagamento: string
          p_idempotency_key?: string
          p_observacao?: string
          p_origem?: string
          p_titulo_id: string
          p_valor: number
        }
        Returns: {
          caixa_id: string
          idempotent_replay: boolean
          liquidacao_id: string
          status: string
          titulo_id: string
          valor: number
          valor_aberto: number
        }[]
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
          p_autorizacao_token?: string
          p_caixa_id?: string
          p_conta_id: string
          p_data?: string
          p_forma: string
          p_idempotency_key?: string
          p_observacao?: string
          p_origem?: string
          p_valor: number
        }
        Returns: {
          caixa_id: string
          conta_id: string
          idempotent_replay: boolean
          movimentacao_caixa_id: string
          pagamento_id: string
          status: string
          valor: number
          valor_pago: number
        }[]
      }
      registrar_pricing_version_venda: {
        Args: { p_venda_id: string; p_version_id: string }
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
          p_pagamentos?: Json
          p_total_bruto: number
          p_total_desconto: number
          p_total_liquido: number
          p_venda_id: string
        }
        Returns: undefined
      }
      registrar_venda_com_itens_v2: {
        Args: {
          p_caixa_id: string
          p_desconto_gerente_percentual?: number
          p_desconto_gerente_valor?: number
          p_forma_pagamento: string
          p_gerente_id?: string
          p_itens: Json
          p_operador_id: string
          p_pagamentos?: Json
          p_total_bruto: number
          p_total_desconto: number
          p_total_liquido: number
          p_venda_id: string
        }
        Returns: undefined
      }
      registrar_venda_evento: {
        Args: {
          p_caixa_id: string
          p_cancelled?: boolean
          p_event_type: string
          p_forma_pagamento: string
          p_items: Json
          p_loja_id: string
          p_operador_id: string
          p_sale_id: string
          p_source: string
          p_total: number
          p_total_bruto: number
        }
        Returns: string
      }
      relatorio_cobertura_estoque: {
        Args: { p_dias_janela?: number; p_limite?: number }
        Returns: {
          dias_cobertura: number
          loja_id: string
          media_diaria_vendida: number
          nome: string
          produto_id: string
          quantidade_atual: number
        }[]
      }
      relatorio_consistencia_vendas: {
        Args: {
          p_caixa_id?: string
          p_from?: string
          p_loja_id?: string
          p_to?: string
        }
        Returns: {
          evento_duplicado: number
          pagamentos_divergentes: number
          periodo_fim: string
          periodo_inicio: string
          sem_evento_ledger: number
          sem_itens: number
          sem_pagamento: number
          taxa_consistencia_pct: number
          total_vendas: number
          vendas_com_anomalia: number
          vendas_consistentes: number
        }[]
      }
      relatorio_consistencia_vendas_gerente: {
        Args: { p_caixa_id?: string; p_from?: string; p_to?: string }
        Returns: {
          evento_duplicado: number
          pagamentos_divergentes: number
          periodo_fim: string
          periodo_inicio: string
          sem_evento_ledger: number
          sem_itens: number
          sem_pagamento: number
          taxa_consistencia_pct: number
          total_vendas: number
          vendas_com_anomalia: number
          vendas_consistentes: number
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
          custo_total_estimado: number
          data: string
          margem_estimada: number
          num_itens: number
          total_desconto: number
          total_liquido: number
          venda_id: string
        }[]
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
      reprocessar_comissao_venda: {
        Args: { p_venda_id: string }
        Returns: Json
      }
      resetar_pin_operador_pdv: {
        Args: { p_usuario: string }
        Returns: undefined
      }
      resumo_comissoes_por_operador: {
        Args: {
          p_ate?: string
          p_de?: string
          p_loja_id: string
          p_status?: string
        }
        Returns: {
          operador_id: string
          operador_nome: string
          total_ajustes: number
          total_comissao_bruta: number
          total_liquido_pago: number
          total_saldo_residual: number
          total_vendas: number
        }[]
      }
      retomar_caixa_atomico: {
        Args: {
          p_caixa_fechado_id: string
          p_gerente_token: string
          p_motivo: string
        }
        Returns: {
          o_loja_id: string
          o_novo_caixa_id: string
          o_turno_anterior_id: string
        }[]
      }
      retomar_venda_em_espera: { Args: { p_id: string }; Returns: Json }
      revisar_evento_offline: {
        Args: { p_decisao: string; p_id: string; p_motivo: string }
        Returns: Json
      }
      round_abnt: {
        Args: { p_scale?: number; p_value: number }
        Returns: number
      }
      status_pin_equipe_pdv: {
        Args: never
        Returns: {
          bloqueado: boolean
          eu: boolean
          nome: string
          papel: string
          tem_pin: boolean
          usuario_id: string
        }[]
      }
      sync_avaliar_evento: { Args: { p: Json }; Returns: Json }
      sync_enfileirar_revisao: { Args: { p: Json }; Returns: Json }
      sync_registrar_recebimento: {
        Args: {
          p_dispositivo: string
          p_event_id: string
          p_fingerprint: string
          p_origem: string
          p_payload_sha256: string
          p_tipo: string
        }
        Returns: undefined
      }
      texto_sem_acento: { Args: { texto: string }; Returns: string }
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
      trial_registrar_tentativa: {
        Args: {
          p_email_hash: string
          p_ip_hash: string
          p_max_por_ip_24h?: number
        }
        Returns: boolean
      }
      venda_evento_idempotency_key: {
        Args: { p_cancelled?: boolean; p_sale_id: string; p_source: string }
        Returns: string
      }
      venda_eventos_items_from_sale: {
        Args: { p_sale_id: string }
        Returns: Json
      }
      verificar_consistencia_venda: {
        Args: { p_venda_id: string }
        Returns: {
          anomalias: string[]
          consistente: boolean
          evento_count: number
          item_count: number
          pagamento_count: number
          pagamentos_total: number
          status_venda: string
          total_liquido: number
          venda_id: string
        }[]
      }
      vincular_importacao_nfe_ordem_compra: {
        Args: { p_importacao_id: string; p_oc_id?: string }
        Returns: undefined
      }
      vincular_usuario_loja: {
        Args: {
          p_ator: string
          p_loja: string
          p_papel: string
          p_usuario: string
        }
        Returns: string
      }
    }
    Enums: {
      categoria_financeira_tipo: "RECEITA" | "DESPESA" | "AMBOS"
      motivo_desconto_enum_tipo:
        | "NAO_ESPECIFICADO"
        | "ERRO_DIGITACAO"
        | "NEGOCIACAO"
        | "CLIENTE_PREFERENCIAL"
        | "DANO_PRODUTO"
        | "AUTORIZACAO_COMERCIAL"
        | "OUTROS"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      categoria_financeira_tipo: ["RECEITA", "DESPESA", "AMBOS"],
      motivo_desconto_enum_tipo: [
        "NAO_ESPECIFICADO",
        "ERRO_DIGITACAO",
        "NEGOCIACAO",
        "CLIENTE_PREFERENCIAL",
        "DANO_PRODUTO",
        "AUTORIZACAO_COMERCIAL",
        "OUTROS",
      ],
    },
  },
} as const

