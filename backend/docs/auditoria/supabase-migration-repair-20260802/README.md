\# Supabase Migration Repair - 2026-08-02



\## Objetivo



Registrar a reconciliação do histórico de migrations entre o repositório local e o banco remoto Jinlong.



\## Diagnóstico



O banco remoto possuía o schema esperado e objetos críticos funcionais, porém o histórico interno de migrations (`supabase\_migrations.schema\_migrations`) estava parcialmente desalinhado com os arquivos locais.



\## Validações realizadas



Objetos confirmados:



\- `public.vendas\_em\_espera`

\- `public.vendas\_pagamentos`

\- `public.contas\_receber`



RPCs confirmadas:



\- `finalizar\_venda\_transacional\_canonica\_v4`

\- `registrar\_venda\_com\_itens`

\- `cancelar\_venda\_transacional`



\## Procedimento executado



\- Backup do histórico de migrations:

&#x20; - `\_backup\_schema\_migrations\_20260802`

\- Reparo do status de migrations divergentes usando `supabase migration repair`

\- Validação com `supabase migration list`

\- Validação final com:



