// gerente-screens-3.jsx — Relatórios fiscais, Usuários e permissões, Configurações.

// ————————————————————————————————————————————————————
// Relatórios fiscais (livros, SPED)
// ————————————————————————————————————————————————————
function ScreenFiscal() {
  const [periodo, setPeriodo] = React.useState('mai-2026');

  return (
    <div className="proto-page" data-screen-label="fiscal">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Obrigações acessórias · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>税务</span></p>
          <h1 className="proto-page-title">Relatórios fiscais</h1>
          <p className="proto-page-sub">Livros fiscais, SPED Fiscal e Contribuições · regime <b style={{color:'var(--fg-2)'}}>Simples Nacional</b>.</p>
        </div>
        <div className="proto-page-actions">
          <select value={periodo} onChange={(e)=>setPeriodo(e.target.value)} className="app-chip" style={{height:34, padding:'0 14px'}}>
            <option value="mai-2026">Mai/2026</option>
            <option value="abr-2026">Abr/2026</option>
            <option value="mar-2026">Mar/2026</option>
          </select>
        </div>
      </div>

      {/* Banner status do mês */}
      <div style={{
        display:'grid', gridTemplateColumns:'auto 1fr auto', gap:18, alignItems:'center',
        padding:'18px 22px', borderRadius:14, marginBottom:22,
        background:'color-mix(in srgb, var(--accent-strong) 14%, transparent)',
        border:'1px solid color-mix(in srgb, var(--accent) 45%, var(--border-1))',
      }}>
        <div className="imperial-seal" style={{transform:'rotate(-4deg)', width:60, height:60, fontSize:42, borderRadius:10}}>印</div>
        <div>
          <div style={{fontSize:11, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.14em', fontWeight:600}}>Maio · em apuração</div>
          <h2 style={{margin:'4px 0 0', fontSize:18, color:'var(--fg-1)'}}>14 dias úteis · 1 432 cupons emitidos</h2>
          <p style={{margin:'4px 0 0', fontSize:12, color:'var(--fg-2)'}}>Prazo do SPED Fiscal: <b style={{color:'var(--fg-1)'}}>até 15/06/2026</b>. Última transmissão de Abril: ok.</p>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>Base de cálculo</div>
          <div className="num" style={{fontSize:22, fontWeight:700, marginTop:4, color:'var(--accent)'}}>{window.fmtBRL(174060)}</div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:18}}>
        <div className="proto-panel">
          <h2 className="proto-panel-title">Livros fiscais</h2>
          <p className="proto-panel-sub">Pré-visualização e geração de PDF / TXT.</p>
          <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:14}}>
            {[
              { id:'lre', label:'Livro Registro de Entradas',  desc:'48 lançamentos · 4 fornecedores' },
              { id:'lrs', label:'Livro Registro de Saídas',    desc:'1 432 NFC-e + 23 NF-e' },
              { id:'lai', label:'Livro Apuração ICMS',         desc:'Simples Nacional · DAS recolhido' },
              { id:'lap', label:'Livro Apuração PIS/COFINS',   desc:'Cumulativo · regime Simples' },
              { id:'lr',  label:'Livro Inventário',            desc:'Posição em 31/12 · atualizar até 31/01' },
            ].map((l) => (
              <div key={l.id} style={{
                display:'grid', gridTemplateColumns:'1fr auto auto', gap:12, alignItems:'center',
                padding:'12px 14px', borderRadius:10,
                background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)',
              }}>
                <div>
                  <div style={{fontWeight:600, fontSize:13}}>{l.label}</div>
                  <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>{l.desc}</div>
                </div>
                <button className="app-btn app-btn-neutral app-btn-sm">Ver</button>
                <button className="app-btn app-btn-accent app-btn-sm">↓ Gerar</button>
              </div>
            ))}
          </div>
        </div>

        <div className="proto-panel">
          <h2 className="proto-panel-title">Arquivos digitais</h2>
          <p className="proto-panel-sub">SPED + arquivo SAT/NFC-e.</p>
          <div style={{display:'flex', flexDirection:'column', gap:14, marginTop:14}}>
            {[
              { sigla:'SPED ICMS/IPI', label:'EFD-ICMS/IPI',  prazo:'15/06/2026', status:'em apuração', n:1455 },
              { sigla:'SPED Contrib', label:'EFD-Contribuições', prazo:'até 15/07', status:'pendente',   n:1455 },
              { sigla:'NFC-e',         label:'Arquivos NFC-e mês', prazo:'permanente', status:'1 432 ok', n:1432 },
              { sigla:'SAT',           label:'Backup CF-e (SAT)',   prazo:'permanente', status:'última: 14/05',n:0 },
            ].map((f, i) => (
              <div key={i} style={{
                display:'grid', gridTemplateColumns:'90px 1fr auto', gap:14, alignItems:'center',
                padding:'12px 14px', borderRadius:10,
                background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)',
              }}>
                <div style={{
                  padding:'6px 8px', borderRadius:6,
                  background:'rgba(15,23,42,0.6)', border:'1px solid var(--border-1)',
                  fontSize:10, fontWeight:700, color:'var(--accent)',
                  textAlign:'center', letterSpacing:'0.04em',
                }}>{f.sigla}</div>
                <div>
                  <div style={{fontWeight:600, fontSize:13}}>{f.label}</div>
                  <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>
                    Prazo: <b style={{color:'var(--fg-2)'}}>{f.prazo}</b> · {f.status}{f.n ? ` · ${f.n} registros` : ''}
                  </div>
                </div>
                <button className="app-btn app-btn-accent app-btn-sm">↓ Gerar TXT</button>
              </div>
            ))}
          </div>

          <hr className="app-divider" style={{margin:'18px 0 14px'}} />
          <div style={{
            padding:'10px 14px', borderRadius:10,
            background:'rgba(127,29,29,0.18)', border:'1px solid rgba(239,68,68,0.32)',
            fontSize:12, color:'#fecaca', display:'flex', gap:10,
          }}>
            <span style={{fontFamily:'var(--font-serif-han)', fontSize:18, color:'#fca5a5'}}>⚠</span>
            <span>2 cupons rejeitados pela SEFAZ aguardam reemissão. <b style={{color:'#fecaca', textDecoration:'underline', cursor:'pointer'}}>Resolver →</b></span>
          </div>
        </div>
      </div>

      <div className="proto-panel" style={{marginTop:18}}>
        <h2 className="proto-panel-title">Cronograma fiscal · próximos 30 dias</h2>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14, marginTop:14}}>
          {[
            { data:'20/05', label:'DAS — Simples Nacional', valor: window.fmtBRL(4820), status:'pago' },
            { data:'15/06', label:'SPED Fiscal — Mai/2026',   valor:'arquivo',           status:'aguardando' },
            { data:'25/05', label:'GIA-ST · NF-e importação',  valor:window.fmtBRL(1244), status:'aguardando' },
            { data:'31/05', label:'DCTFWeb · contribuições',   valor:'envio',             status:'futuro' },
          ].map((e, i) => (
            <div key={i} style={{
              padding:'12px 14px', borderRadius:10,
              background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)',
            }}>
              <div className="num" style={{fontSize:11, color:'var(--accent)', fontWeight:700, letterSpacing:'0.06em'}}>{e.data}</div>
              <div style={{fontSize:13, fontWeight:600, marginTop:4}}>{e.label}</div>
              <div style={{fontSize:11, color:'var(--fg-3)', marginTop:6, display:'flex', justifyContent:'space-between'}}>
                <span>{e.valor}</span>
                <span className={'proto-pill ' + (e.status === 'pago' ? 'ok' : e.status === 'aguardando' ? 'warn' : 'muted')} style={{fontSize:9}}>{e.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————
// Usuários e permissões
// ————————————————————————————————————————————————————
function ScreenUsuarios() {
  const [tab, setTab] = React.useState('usuarios');
  const usuarios = window.USUARIOS;
  const papeis = window.PAPEIS;

  return (
    <div className="proto-page" data-screen-label="usuarios">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Acesso · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>用户</span></p>
          <h1 className="proto-page-title">Usuários e permissões</h1>
          <p className="proto-page-sub">{usuarios.filter(u=>u.ativo).length} ativos · {papeis.length} papéis configurados.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">Auditoria de acessos</button>
          <button className="app-btn app-btn-accent">+ Convidar usuário</button>
        </div>
      </div>

      <div className="proto-tabs">
        <button className={'proto-tab' + (tab==='usuarios'?' active':'')} onClick={()=>setTab('usuarios')}>Usuários</button>
        <button className={'proto-tab' + (tab==='papeis'?' active':'')} onClick={()=>setTab('papeis')}>Papéis e permissões</button>
        <button className={'proto-tab' + (tab==='dispositivos'?' active':'')} onClick={()=>setTab('dispositivos')}>Dispositivos autorizados</button>
      </div>

      {tab === 'usuarios' && (
        <div className="proto-panel" style={{padding:0}}>
          <table className="proto-table">
            <thead><tr><th>Usuário</th><th>E-mail</th><th>Papel</th><th>Último acesso</th><th style={{textAlign:'right'}}>IPs únicos</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <span className="proto-avatar" style={{width:32, height:32, fontSize:11}}>
                        {u.nome.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase()}
                      </span>
                      <b>{u.nome}</b>
                    </div>
                  </td>
                  <td style={{fontSize:12, color:'var(--fg-3)'}}>{u.email}</td>
                  <td>
                    <span className="proto-pill" style={{
                      borderColor: u.papel === 'Admin' ? 'rgba(239,68,68,0.5)' : u.papel === 'Gerente' ? 'rgba(251,191,36,0.45)' : 'var(--border-1)',
                      background: u.papel === 'Admin' ? 'rgba(127,29,29,0.25)' : u.papel === 'Gerente' ? 'color-mix(in srgb, var(--accent-strong) 18%, transparent)' : 'rgba(15,23,42,0.55)',
                      color: u.papel === 'Admin' ? '#fca5a5' : u.papel === 'Gerente' ? 'var(--accent)' : 'var(--fg-2)',
                    }}>{u.papel}</span>
                  </td>
                  <td className="num" style={{color:'var(--fg-3)'}}>{window.fmtDateTime(u.ultimo)}</td>
                  <td className="num" style={{textAlign:'right'}}>{u.ips}</td>
                  <td>{u.ativo ? <span className="proto-pill ok">ativo</span> : <span className="proto-pill muted">inativo</span>}</td>
                  <td><button className="app-btn app-btn-neutral app-btn-sm">Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'papeis' && (
        <div className="proto-panel" style={{padding:0, overflow:'hidden'}}>
          <table className="proto-table">
            <thead>
              <tr>
                <th style={{width:'40%'}}>Permissão</th>
                {papeis.map(p => <th key={p} style={{textAlign:'center'}}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {window.PERMISSOES.map((perm) => (
                <tr key={perm.chave} style={{cursor:'default'}}>
                  <td>
                    <div style={{fontWeight:600, fontSize:13}}>{perm.label}</div>
                    <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.10em', marginTop:2}}>{perm.grupo} · <span style={{textTransform:'none', letterSpacing:0, color:'var(--fg-3)', fontFamily:'var(--font-numeric)'}}>{perm.chave}</span></div>
                  </td>
                  {papeis.map((p) => (
                    <td key={p} style={{textAlign:'center'}}>
                      {perm.acesso[p]
                        ? <span style={{
                            width:24, height:24, display:'inline-flex', alignItems:'center', justifyContent:'center',
                            background:'rgba(16,185,129,0.18)', border:'1px solid rgba(16,185,129,0.4)', borderRadius:6,
                            color:'#6ee7b7', fontWeight:700, fontSize:14,
                          }}>✓</span>
                        : <span style={{
                            width:24, height:24, display:'inline-flex', alignItems:'center', justifyContent:'center',
                            background:'rgba(15,23,42,0.4)', border:'1px solid var(--border-1)', borderRadius:6,
                            color:'var(--fg-3)', fontSize:13,
                          }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'dispositivos' && (
        <div className="proto-panel" style={{padding:0}}>
          <table className="proto-table">
            <thead><tr><th>Dispositivo</th><th>Tipo</th><th>Sistema</th><th>IP / rede</th><th>Último uso</th><th>Status</th></tr></thead>
            <tbody>
              {[
                { nome:'PDV-Caixa-01',    tipo:'Tauri desktop', sys:'Windows 10 LTSC', ip:'192.168.1.21',  uso: window.minutosAtras(8),    status:'online' },
                { nome:'PDV-Caixa-02',    tipo:'Tauri desktop', sys:'Windows 10 LTSC', ip:'192.168.1.22',  uso: window.minutosAtras(82),   status:'online' },
                { nome:'iPad Gerente',    tipo:'Web browser',   sys:'iPadOS 17 · Safari', ip:'192.168.1.45', uso: window.minutosAtras(24),  status:'online' },
                { nome:'Notebook escritório', tipo:'Web browser', sys:'macOS · Chrome', ip:'179.214.62.118', uso: window.minutosAtras(1440), status:'offline' },
                { nome:'PDV-Liberdade',   tipo:'Tauri desktop', sys:'Windows 11', ip:'IP externo · 200.168.40.x', uso: window.minutosAtras(2880), status:'pendente' },
              ].map((d, i) => (
                <tr key={i}>
                  <td><b>{d.nome}</b></td>
                  <td><span style={{fontSize:12, color:'var(--fg-2)'}}>{d.tipo}</span></td>
                  <td style={{fontSize:12, color:'var(--fg-3)'}}>{d.sys}</td>
                  <td className="num" style={{color:'var(--fg-3)'}}>{d.ip}</td>
                  <td className="num" style={{color:'var(--fg-3)'}}>{window.fmtDateTime(d.uso)}</td>
                  <td>
                    {d.status === 'online' && <span className="proto-pill ok">online</span>}
                    {d.status === 'offline' && <span className="proto-pill muted">offline</span>}
                    {d.status === 'pendente' && <span className="proto-pill warn">aprovar</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ————————————————————————————————————————————————————
// Configurações
// ————————————————————————————————————————————————————
function ScreenConfig() {
  const [tab, setTab] = React.useState('loja');

  const renderToggle = (label, desc, on) => (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px dashed var(--border-1)', gap:18}}>
      <div style={{flex:1}}>
        <div style={{fontSize:13, fontWeight:600, color:'var(--fg-1)'}}>{label}</div>
        {desc && <div style={{fontSize:12, color:'var(--fg-3)', marginTop:2}}>{desc}</div>}
      </div>
      <span style={{
        display:'inline-flex', alignItems:'center',
        width:42, height:24, borderRadius:999, padding:3, flexShrink:0,
        background: on ? 'var(--accent)' : 'rgba(148,163,184,0.3)',
        cursor:'pointer', transition:'all 150ms',
      }}>
        <span style={{
          width:18, height:18, borderRadius:'50%', background:'#fff',
          marginLeft: on ? 18 : 0, transition:'margin 150ms',
        }} />
      </span>
    </div>
  );

  return (
    <div className="proto-page" data-screen-label="configuracoes">
      <div className="proto-page-header">
        <div>
          <p className="proto-eyebrow">Sistema · <span style={{fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em', color:'var(--accent)'}}>设置</span></p>
          <h1 className="proto-page-title">Configurações</h1>
          <p className="proto-page-sub">Loja, fiscal, integração e tema.</p>
        </div>
        <div className="proto-page-actions">
          <button className="app-btn app-btn-neutral">Restaurar padrão</button>
          <button className="app-btn app-btn-accent">Salvar alterações</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'220px minmax(0, 1fr)', gap:24}}>
        {/* Tabs verticais */}
        <div style={{display:'flex', flexDirection:'column', gap:4}}>
          {[
            ['loja',        'Loja',          '门店'],
            ['fiscal',      'Fiscal',        '税务'],
            ['integracoes', 'Integrações',   '集成'],
            ['impressao',   'Impressão',     '打印'],
            ['idioma',      'Idioma e tema', '主题'],
            ['backup',      'Backup',        '备份'],
          ].map(([id, label, han]) => (
            <button key={id} onClick={()=>setTab(id)}
              className={'proto-nav-link' + (tab === id ? ' active' : '')}
              style={{padding:'10px 14px'}}>
              <div style={{display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2}}>
                <span>{label}</span>
                <span style={{fontSize:10, color:'var(--fg-3)', fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em'}}>{han}</span>
              </div>
            </button>
          ))}
        </div>

        <div>
          {tab === 'loja' && (
            <div className="proto-panel">
              <h2 className="proto-panel-title">Dados da loja</h2>
              <p className="proto-panel-sub">Aparecem no cupom, nas NFC-e e nos relatórios.</p>

              <div style={{display:'grid', gap:14, marginTop:14}}>
                <div className="proto-field-row">
                  <div className="proto-field"><label>Razão social</label><input defaultValue="Jin Long Importados Ltda." /></div>
                  <div className="proto-field"><label>Nome fantasia</label><input defaultValue="Jīn Lóng · 金龍" /></div>
                </div>
                <div className="proto-field-row">
                  <div className="proto-field"><label>CNPJ</label><input defaultValue="12.448.901/0001-22" /></div>
                  <div className="proto-field"><label>Inscrição estadual</label><input defaultValue="195.448.221.110" /></div>
                </div>
                <div className="proto-field"><label>Endereço</label><input defaultValue="R. Padre João Manuel, 998 · Cerqueira César · São Paulo / SP" /></div>
                <div className="proto-field-row-3">
                  <div className="proto-field"><label>CEP</label><input defaultValue="01411-001" /></div>
                  <div className="proto-field"><label>Telefone</label><input defaultValue="(11) 3814-9988" /></div>
                  <div className="proto-field"><label>WhatsApp</label><input defaultValue="(11) 9 9214-7711" /></div>
                </div>
                <div className="proto-field-row">
                  <div className="proto-field"><label>Horário de funcionamento</label><input defaultValue="seg-sáb · 09h-19h" /></div>
                  <div className="proto-field"><label>Frase de rodapé do cupom</label><input defaultValue="谢谢光临 · Obrigado!" /></div>
                </div>
              </div>
            </div>
          )}

          {tab === 'fiscal' && (
            <div className="proto-panel">
              <h2 className="proto-panel-title">Configuração fiscal</h2>
              <p className="proto-panel-sub">Regime tributário e dados de NFC-e/NF-e.</p>

              <div style={{display:'grid', gap:14, marginTop:14}}>
                <div className="proto-field-row">
                  <div className="proto-field"><label>Regime tributário</label><select defaultValue="simples"><option value="simples">Simples Nacional</option><option>Lucro Presumido</option><option>Lucro Real</option></select></div>
                  <div className="proto-field"><label>CFOP padrão (saída)</label><input defaultValue="5102" /></div>
                </div>
                <div className="proto-field-row">
                  <div className="proto-field"><label>CSOSN padrão</label><input defaultValue="102" /></div>
                  <div className="proto-field"><label>Próximo nº NFC-e</label><input defaultValue="001 234" /></div>
                </div>
                <div className="proto-field"><label>Certificado digital A1</label>
                  <div style={{display:'flex', gap:10, alignItems:'center'}}>
                    <input defaultValue="CERT_JINLONG_2026.pfx · expira 03/12/2026" disabled style={{flex:1}} />
                    <button className="app-btn app-btn-neutral app-btn-sm">Trocar</button>
                  </div>
                </div>
                <hr className="app-divider" style={{margin:'8px 0'}} />
                {renderToggle('Emitir NFC-e automaticamente', 'Toda venda no caixa gera NFC-e assim que é paga.', true)}
                {renderToggle('Contingência offline', 'Se a SEFAZ cair, emite em modo contingência e regulariza depois.', true)}
                {renderToggle('Validar CPF/CNPJ do cliente', 'Bloqueia a venda se o documento for inválido.', false)}
              </div>
            </div>
          )}

          {tab === 'integracoes' && (
            <div className="proto-panel">
              <h2 className="proto-panel-title">Integrações</h2>
              <p className="proto-panel-sub">Adquirentes, ERP, marketplaces.</p>

              <div style={{display:'grid', gap:10, marginTop:14}}>
                {[
                  { nome:'Stone TEF',          desc:'Cartão · maquininha 0142',     status:'conectada', cor:'#34d399' },
                  { nome:'Cielo Lio',          desc:'TEF para caixa 02',            status:'conectada', cor:'#34d399' },
                  { nome:'PIX · Sicoob',       desc:'Conta principal',              status:'conectada', cor:'#34d399' },
                  { nome:'Bling ERP',          desc:'Sincroniza produtos + estoque',status:'erro',      cor:'#fca5a5' },
                  { nome:'Mercado Livre',      desc:'Anúncios sincronizados',       status:'pendente',  cor:'#fde68a' },
                  { nome:'Google Business',    desc:'Avaliações pós-venda',         status:'desligada', cor:'var(--fg-3)' },
                ].map((i) => (
                  <div key={i.nome} style={{
                    display:'grid', gridTemplateColumns:'40px 1fr auto', gap:14, alignItems:'center',
                    padding:'14px 16px', borderRadius:10,
                    background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)',
                  }}>
                    <span style={{
                      width:36, height:36, borderRadius:8,
                      background:'rgba(15,23,42,0.6)',
                      border:'1px solid var(--border-1)',
                      display:'inline-flex', alignItems:'center', justifyContent:'center',
                      color: i.cor, fontSize:14, fontWeight:700,
                    }}>{i.nome[0]}</span>
                    <div>
                      <div style={{fontWeight:600, fontSize:13}}>{i.nome}</div>
                      <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>{i.desc}</div>
                    </div>
                    <div style={{display:'flex', gap:10, alignItems:'center'}}>
                      <span style={{fontSize:12, color:i.cor, fontWeight:500}}>{i.status}</span>
                      <button className="app-btn app-btn-neutral app-btn-sm">Configurar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'impressao' && (
            <div className="proto-panel">
              <h2 className="proto-panel-title">Impressão de cupom</h2>
              <p className="proto-panel-sub">Configurações da impressora térmica.</p>

              <div style={{display:'grid', gap:14, marginTop:14}}>
                <div className="proto-field-row">
                  <div className="proto-field"><label>Impressora padrão</label><select><option>Bematech MP-4200 TH · USB</option><option>Epson TM-T20X · serial</option></select></div>
                  <div className="proto-field"><label>Largura do papel</label><select><option>80 mm (padrão)</option><option>58 mm</option></select></div>
                </div>
                <div className="proto-field"><label>Cópias automáticas</label>
                  <div style={{display:'flex', gap:8}}>
                    {['Nenhuma','1','2','3'].map((c, i) => (
                      <button key={c} className={'money-chip' + (i === 1 ? ' active' : '')}>{c}</button>
                    ))}
                  </div>
                </div>
                <hr className="app-divider" style={{margin:'8px 0'}} />
                {renderToggle('Imprimir selo 印 (carimbo imperial)', 'Marca o cupom com selo carimbado.', true)}
                {renderToggle('Imprimir marca d\'água', 'Dragão duplo em transparência.', true)}
                {renderToggle('Cortar papel após cupom', 'Guilhotina automática.', true)}
                {renderToggle('Beep ao imprimir', '', false)}
              </div>
            </div>
          )}

          {tab === 'idioma' && (
            <div className="proto-panel">
              <h2 className="proto-panel-title">Idioma e tema</h2>
              <p className="proto-panel-sub">Aparece nos cupons, telas e relatórios.</p>

              <div style={{display:'grid', gap:18, marginTop:14}}>
                <div>
                  <label style={{fontSize:13, color:'var(--fg-2)', display:'block', marginBottom:8}}>Idioma da interface</label>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                    {[
                      { id:'pt', label:'Português (BR)',  han:'葡萄牙语', active:true },
                      { id:'zh', label:'简体中文',         han:'Chinês',  active:false },
                    ].map((o) => (
                      <button key={o.id} className={'money-chip' + (o.active ? ' active' : '')} style={{justifyContent:'flex-start', padding:'12px 14px'}}>
                        <span style={{
                          width:14, height:14, borderRadius:'50%',
                          border:'2px solid ' + (o.active ? 'var(--accent)' : 'var(--border-1)'),
                          background: o.active ? 'radial-gradient(circle, var(--accent) 40%, transparent 45%)' : 'transparent',
                        }} />
                        <span>{o.label}</span>
                        <span style={{marginLeft:'auto', color:'var(--fg-3)', fontSize:11, fontFamily:'var(--font-serif-han)'}}>{o.han}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{fontSize:13, color:'var(--fg-2)', display:'block', marginBottom:8}}>Tema</label>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                    {[
                      { id:'noturno', label:'Noturno (slate + amber)', han:'夜', active:true,
                        sample:'linear-gradient(135deg, #0b1220 60%, rgba(251,191,36,0.4))' },
                      { id:'novem',   label:'Diurno · novem (cream)',   han:'昼', active:false,
                        sample:'linear-gradient(135deg, #fff8eb 60%, rgba(245,158,11,0.45))' },
                    ].map((o) => (
                      <div key={o.id} style={{
                        display:'flex', gap:14, alignItems:'center', padding:'14px',
                        borderRadius:10, cursor:'pointer',
                        border:'1px solid ' + (o.active ? 'var(--accent)' : 'var(--border-1)'),
                        background: o.active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'rgba(2,6,23,0.45)',
                      }}>
                        <div style={{
                          width:48, height:48, borderRadius:10, flexShrink:0,
                          background: o.sample,
                          border:'1px solid var(--border-1)',
                        }} />
                        <div>
                          <div style={{fontWeight:600, fontSize:13}}>{o.label}</div>
                          <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2, fontFamily:'var(--font-serif-han)', letterSpacing:'0.08em'}}>{o.han}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <hr className="app-divider" />
                {renderToggle('Mostrar 中文 em paralelo nos rótulos do caixa', '', true)}
                {renderToggle('Animações brand (dragão · 印)', 'Respeita prefers-reduced-motion.', true)}
              </div>
            </div>
          )}

          {tab === 'backup' && (
            <div className="proto-panel">
              <h2 className="proto-panel-title">Backup e sincronização</h2>
              <p className="proto-panel-sub">Banco local SQLite (pdv-local) → Supabase (pdv-importados).</p>

              <div style={{display:'grid', gap:14, marginTop:14}}>
                <div style={{
                  padding:'14px 16px', borderRadius:10,
                  background:'rgba(2,6,23,0.45)', border:'1px solid var(--border-1)',
                }}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                    <div>
                      <div style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.12em'}}>Último backup</div>
                      <div style={{fontSize:14, fontWeight:600, marginTop:4}}>hoje · 18:18</div>
                    </div>
                    <span className="proto-pill ok">sincronizado</span>
                  </div>
                  <div style={{height:6, background:'rgba(2,6,23,0.7)', borderRadius:3, marginTop:14, overflow:'hidden'}}>
                    <div style={{width:'92%', height:'100%', background:'linear-gradient(90deg, #10b981, #059669)'}}></div>
                  </div>
                  <div style={{fontSize:11, color:'var(--fg-3)', marginTop:8}}>2 movimentações pendentes no outbox · próximo flush em 1 min.</div>
                </div>

                {renderToggle('Backup automático', 'A cada 15 minutos ou ao fechar o caixa.', true)}
                {renderToggle('Espelho na nuvem (Supabase)', '', true)}
                {renderToggle('Backup local diário (.db)', 'Salva em C:\\jinlong\\backups\\', true)}

                <div style={{display:'flex', gap:10, marginTop:8}}>
                  <button className="app-btn app-btn-neutral" style={{flex:1}}>Forçar sincronização agora</button>
                  <button className="app-btn app-btn-neutral" style={{flex:1}}>↓ Exportar backup local</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.ScreenFiscal = ScreenFiscal;
window.ScreenUsuarios = ScreenUsuarios;
window.ScreenConfig = ScreenConfig;
