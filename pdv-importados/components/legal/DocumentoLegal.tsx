import Link from 'next/link'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'

/**
 * Conteúdo canônico dos Termos de Serviço e Política de Privacidade.
 * Fonte: docs/TERMOS_E_PRIVACIDADE.md (v1.0 — vigência 27/05/2026).
 *
 * Renderizado pelas rotas /termos e /privacidade. O documento é unificado
 * (cobre Termos + LGPD), então ambas as rotas exibem o texto integral,
 * apenas com âncora inicial distinta.
 */

type Props = {
  /** Âncora destacada no topo conforme a rota de origem. */
  destaque?: 'termos' | 'privacidade'
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 mb-3 text-lg font-semibold text-[#bfa76a]">
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 leading-relaxed text-white/70">{children}</p>
}

export function DocumentoLegal({ destaque }: Props) {
  return (
    <main className="login-premium-root min-h-[100dvh] bg-black px-4 py-12 text-sm text-white/70">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 border-b border-white/10 pb-6">
          <div className="mb-4 flex items-center gap-3">
            <DragonOuroLoader iconClassName="h-6 w-6" />
            <span className="text-xs uppercase tracking-[0.2em] text-[#bfa76a]/70">
              Jīn Lóng · 金龍
            </span>
          </div>
          <h1 className="text-xl font-semibold text-white">
            Termos de Serviço e Política de Privacidade
          </h1>
          <p className="mt-2 text-xs text-white/40">
            Versão 1.0 · Vigência: 27 de maio de 2026 · Operadora: Naturecode
            Tecnologia
          </p>
          {destaque ? (
            <p className="mt-3 text-xs text-[#bfa76a]/80">
              {destaque === 'termos'
                ? 'Você acessou os Termos de Serviço. O documento abaixo cobre também a Política de Privacidade.'
                : 'Você acessou a Política de Privacidade. O documento abaixo cobre também os Termos de Serviço.'}
            </p>
          ) : null}
        </header>

        <article>
          <H>1. Definições</H>
          <P>
            <strong>Lojista:</strong> pessoa física ou jurídica titular de conta
            ativa na Plataforma. <strong>Usuário:</strong> qualquer pessoa
            (operador, gerente ou dono) autorizada pelo Lojista a acessar o
            sistema. <strong>Dados Operacionais:</strong> registros de vendas,
            estoques, movimentos de caixa e demais transações gerados dentro da
            Plataforma. <strong>Dados Pessoais:</strong> informações que
            identifiquem ou possam identificar uma pessoa natural, conforme a
            LGPD (Lei 13.709/2018). <strong>LGPD:</strong> Lei Geral de Proteção
            de Dados Pessoais (Lei Federal 13.709/2018).
          </P>

          <H>2. Objeto e Elegibilidade</H>
          <P>
            2.1 A Plataforma disponibiliza ao Lojista um sistema SaaS de gestão
            de ponto de venda (PDV), controle de estoque, emissão de documentos
            fiscais e relatórios gerenciais.
          </P>
          <P>
            2.2 O acesso é permitido somente a Lojistas com CNPJ ou CPF válido,
            em situação regular, com capacidade legal para contratar. É vedado o
            uso por menores de 18 anos sem representação legal.
          </P>
          <P>
            2.3 O cadastro implica leitura, compreensão e aceite integral destes
            Termos.
          </P>

          <H>3. Cadastro, Conta e Segurança</H>
          <P>
            3.1 O Lojista é responsável pela exatidão dos dados cadastrais
            fornecidos e pela guarda de credenciais de acesso.
          </P>
          <P>
            3.2 Qualquer acesso realizado com as credenciais do Lojista é
            presumido como autorizado por ele, independentemente de quem o
            executou.
          </P>
          <P>
            3.3 Suspeitas de acesso não autorizado devem ser comunicadas
            imediatamente ao suporte técnico da Plataforma.
          </P>

          <H>4. Deveres e Responsabilidades do Lojista</H>
          <P>4.1 O Lojista é o único e exclusivo responsável por:</P>
          <ul className="mb-3 ml-5 list-disc space-y-1 text-white/70">
            <li>
              (a) a veracidade, exatidão e licitude dos produtos, preços,
              descrições e imagens por ele cadastrados;
            </li>
            <li>
              (b) a emissão correta de notas fiscais, cupons fiscais e quaisquer
              documentos tributários gerados a partir dos dados que ele inseriu;
            </li>
            <li>
              (c) o cumprimento das obrigações fiscais, trabalhistas e
              sanitárias aplicáveis ao seu negócio;
            </li>
            <li>
              (d) a obtenção de consentimento dos titulares de dados pessoais
              antes de inseri-los na Plataforma (clientes, fornecedores,
              funcionários).
            </li>
          </ul>
          <P>
            4.2 É vedado ao Lojista utilizar a Plataforma para fins ilícitos,
            incluindo lavagem de dinheiro, fraude fiscal ou violação de direitos
            de terceiros.
          </P>

          <H>5. Isenção de Responsabilidade da Plataforma</H>
          <P>
            <strong>5.1 Conteúdo cadastrado pelo Lojista.</strong> A Plataforma
            atua como mero provedor de infraestrutura tecnológica. Não valida,
            audita, certifica ou endossa os produtos, preços, imagens,
            descrições, quantidades, tributações ou quaisquer notas fiscais
            cadastrados ou emitidos pelo Lojista. Erros, fraudes, penalidades
            fiscais ou reclamações de consumidores decorrentes de informações
            inseridas pelo Lojista são de responsabilidade exclusiva do Lojista,
            sem qualquer solidariedade da Plataforma.
          </P>
          <P>
            <strong>5.2 Disponibilidade.</strong> A Plataforma envidará esforços
            razoáveis para manter o serviço disponível, mas não garante
            disponibilidade ininterrupta. Falhas de infraestrutura de terceiros
            (Supabase, Vercel, provedores de nuvem) estão fora do controle da
            Plataforma.
          </P>
          <P>
            <strong>5.3 Integrações de terceiros.</strong> Integrações com
            SEFAZ, sistemas SAT, gateways de pagamento ou outros serviços
            externos seguem as condições dos respectivos provedores. A
            Plataforma não responde por recusas, indisponibilidades ou falhas
            nesses serviços.
          </P>
          <P>
            <strong>5.4 Limitação de danos.</strong> Em nenhuma hipótese a
            Plataforma será responsabilizada por danos indiretos, lucros
            cessantes, perda de dados ou danos à reputação do Lojista
            decorrentes do uso ou da impossibilidade de uso do serviço.
          </P>

          <H>6. Proteção de Dados Pessoais (LGPD)</H>
          <P>
            <strong>6.1 Papel das partes.</strong> Na relação com os dados dos
            clientes do Lojista, o Lojista é o Controlador e a Plataforma é a
            Operadora, nos termos do Art. 39 da LGPD. A Plataforma trata tais
            dados exclusivamente segundo as instruções do Lojista e para a
            finalidade de prestação do serviço contratado.
          </P>
          <P>
            <strong>6.2 Dados coletados dos Usuários da Plataforma.</strong> A
            Plataforma coleta, na qualidade de Controladora: nome, e-mail e
            perfil de acesso dos Usuários cadastrados pelo Lojista; dados de
            autenticação (gerenciados pelo provedor Supabase Auth); e logs de
            auditoria das operações realizadas. Base legal: execução de contrato
            (Art. 7, V) e legítimo interesse para segurança e auditoria (Art. 7,
            IX).
          </P>
          <P>
            <strong>6.3 Retenção e Exclusão.</strong> Dados pessoais são retidos
            enquanto a conta estiver ativa e pelo prazo mínimo exigido pela
            legislação fiscal e tributária aplicável (em geral, 5 anos após o
            encerramento). Clientes do Lojista com histórico financeiro são
            anonimizados (Art. 16, I) em vez de deletados, para preservar a
            integridade dos registros contábeis obrigatórios.
          </P>
          <P>
            <strong>6.4 Direitos do Titular.</strong> O titular pode, a qualquer
            tempo, solicitar: confirmação de tratamento; acesso; correção;
            anonimização, bloqueio ou eliminação; portabilidade; e revogação de
            consentimento. Solicitações ao DPO pelo e-mail{' '}
            <a
              href="mailto:privacidade@fastproduct.app"
              className="text-[#bfa76a] underline underline-offset-2"
            >
              privacidade@fastproduct.app
            </a>
            .
          </P>

          <H>7. Inteligência Comercial e Dados Agregados</H>
          <P>
            <strong>7.1 Finalidade.</strong> A Plataforma poderá utilizar os
            Dados Operacionais do Lojista — estritamente anonimizados e
            agregados, sem qualquer identificação individual — para gerar
            indicadores estatísticos de mercado com fins de pesquisa, melhoria do
            produto e eventual compartilhamento com parceiros de negócios.
          </P>
          <P>
            <strong>7.2 Garantia de anonimização.</strong> Nenhum relatório ou
            dado compartilhado com terceiros permitirá a identificação do
            Lojista, de seus Usuários ou de seus clientes.
          </P>
          <P>
            <strong>7.3 Base legal.</strong> Consentimento explícito do Lojista
            no aceite destes Termos (Art. 7, I) e legítimo interesse da
            Plataforma (Art. 7, IX), nos limites da expectativa razoável do
            titular.
          </P>
          <P>
            <strong>7.4 Opt-out.</strong> O Lojista pode revogar este
            consentimento a qualquer tempo, sem prejuízo ao acesso ao serviço,
            pelo e-mail privacidade@fastproduct.app. A revogação não retroage
            sobre dados já anonimizados e incorporados em séries históricas.
          </P>

          <H>8. Propriedade Intelectual</H>
          <P>
            8.1 Todo o software, design, interfaces, marcas e documentação da
            Plataforma são de titularidade exclusiva da Operadora ou de seus
            licenciantes. O Lojista recebe licença não exclusiva, intransferível
            e revogável para uso da Plataforma durante a vigência do contrato.
          </P>
          <P>
            8.2 O Lojista declara possuir os direitos ou as autorizações
            necessárias para as imagens, logotipos e demais conteúdos que inserir
            na Plataforma.
          </P>

          <H>9. Rescisão, Suspensão e Banimento</H>
          <P>
            <strong>9.1 Rescisão pelo Lojista.</strong> O Lojista pode encerrar
            sua conta a qualquer momento, observado o prazo de aviso prévio
            previsto no plano contratado.
          </P>
          <P>
            <strong>9.2 Suspensão ou rescisão pela Plataforma.</strong> A
            Plataforma reserva-se o direito soberano e unilateral de, a seu
            exclusivo critério: (a) suspender temporariamente o acesso em caso de
            inadimplência, uso suspeito ou investigação de violação; (b)
            rescindir definitivamente a conta em caso de inadimplência superior a
            30 dias, violação confirmada, atos ilícitos, fraude fiscal ou
            atividade que coloque em risco a infraestrutura; (c) banir
            permanentemente o Lojista quando houver reincidência ou gravidade
            excepcional.
          </P>
          <P>
            <strong>9.3 Efeitos da rescisão.</strong> Após a rescisão, a
            Plataforma manterá os dados pelo prazo legal aplicável. Não há
            direito à devolução de valores já pagos, exceto quando expressamente
            previsto no plano contratado.
          </P>

          <H>10. Disposições Gerais</H>
          <P>
            10.1 Legislação aplicável: legislação brasileira. 10.2 Foro: comarca
            de São Paulo/SP, com renúncia a qualquer outro. 10.3 Alterações: a
            Plataforma pode alterar estes Termos a qualquer tempo, comunicando o
            Lojista com antecedência mínima de 15 dias; o uso continuado implica
            aceite. 10.4 Integralidade: este documento constitui o acordo
            integral entre as partes sobre o objeto descrito.
          </P>
          <P>
            <strong>Contato DPO:</strong> privacidade@fastproduct.app ·{' '}
            <strong>Suporte:</strong> suporte@fastproduct.app
          </P>
        </article>

        <footer className="mt-10 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-white/40">
          <span>Última atualização: 27/05/2026</span>
          <Link
            href="/login"
            className="text-[#bfa76a]/80 underline underline-offset-2 transition-colors hover:text-[#bfa76a]"
          >
            ← Voltar ao login
          </Link>
        </footer>
      </div>
    </main>
  )
}
