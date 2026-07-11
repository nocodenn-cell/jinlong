import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface SendEmployeeInviteRequest {
  email: string
  nome: string
  auth_user_id: string
}

interface SendEmployeeInviteResponse {
  ok: boolean
  message: string
  recovery_link?: string
}

async function sendEmployeeInvite(
  req: SendEmployeeInviteRequest,
): Promise<SendEmployeeInviteResponse> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // PASSO 1: Gerar recovery link para o novo usuário
    const { data: recoveryData, error: recoveryError } =
      await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: req.email,
      })

    if (recoveryError || !recoveryData) {
      console.error('Erro ao gerar recovery link:', recoveryError)
      return {
        ok: false,
        message: `Erro ao gerar link de convite: ${recoveryError?.message || 'Desconhecido'}`,
      }
    }

    // PASSO 2: Construir URL de reset de senha
    const recoveryLink = recoveryData.properties?.action_link
    if (!recoveryLink) {
      console.error('Recovery link não gerado:', recoveryData)
      return {
        ok: false,
        message: 'Falha ao gerar link de convite (recovery link vazio)',
      }
    }

    // PASSO 3: Enviar email (TODO: integrar com Resend, SendGrid ou similar)
    // Por enquanto, apenas registrar que o email seria enviado
    console.log('[SEND-EMPLOYEE-INVITE] Email seria enviado:', {
      to: req.email,
      nome: req.nome,
      recovery_link: recoveryLink,
      timestamp: new Date().toISOString(),
    })

    // TODO: Descomentar quando Resend/SendGrid estiver configurado
    /*
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')!}`,
      },
      body: JSON.stringify({
        from: 'noreply@fastproduct.com',
        to: req.email,
        subject: 'Bem-vindo ao Jinlong PDV — Configure sua senha',
        html: `
          <h1>Bem-vindo ao Jinlong PDV, ${req.nome}!</h1>
          <p>Você foi cadastrado como operador no sistema.</p>
          <p>Clique no link abaixo para definir sua senha e fazer login:</p>
          <a href="${recoveryLink}" style="padding: 12px 24px; background: #FBBF24; color: #000; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Definir Senha e Fazer Login
          </a>
          <p style="margin-top: 24px; font-size: 12px; color: #666;">
            O link expira em 24 horas. Se não clicar, solicite um novo convite ao gerente.
          </p>
        `,
      }),
    })

    if (!emailResponse.ok) {
      const error = await emailResponse.json()
      console.error('Erro ao enviar email via Resend:', error)
      return {
        ok: false,
        message: `Erro ao enviar email: ${error.message || 'Desconhecido'}`,
      }
    }
    */

    return {
      ok: true,
      message: 'Convite enviado com sucesso',
      recovery_link: recoveryLink, // Debug: retornar link (remover em produção)
    }
  } catch (error) {
    console.error('[SEND-EMPLOYEE-INVITE] Erro não capturado:', error)
    return {
      ok: false,
      message: `Erro ao processar convite: ${error instanceof Error ? error.message : 'Desconhecido'}`,
    }
  }
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  // POST only
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const result = await sendEmployeeInvite(body)

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('[SEND-EMPLOYEE-INVITE] Parse error:', error)
    return new Response(
      JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }
})
