-- Prova de privilegio. Falha se a role puder escrever ou furar RLS no catalogo.
DO $prova$
DECLARE
  v_super boolean;
  v_bypass boolean;
  v_create_db boolean;
  v_create_role boolean;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
    INTO v_super, v_bypass, v_create_db, v_create_role
  FROM pg_roles WHERE rolname = 'backup_ro';
  IF v_super OR v_bypass OR v_create_db OR v_create_role THEN
    RAISE EXCEPTION 'BACKUP_RO_PRIVILEGIO_DEMAIS';
  END IF;
  IF has_table_privilege('backup_ro', 'public.vendas', 'INSERT')
     OR has_table_privilege('backup_ro', 'public.vendas', 'UPDATE')
     OR has_table_privilege('backup_ro', 'public.vendas', 'DELETE') THEN
    RAISE EXCEPTION 'BACKUP_RO_ESCRITA';
  END IF;
  IF NOT has_table_privilege('backup_ro', 'public.vendas', 'SELECT') THEN
    RAISE EXCEPTION 'BACKUP_RO_SEM_SELECT';
  END IF;
END
$prova$;
