SELECT coalesce(column_default,'NULL') FROM information_schema.columns WHERE table_schema='public' AND table_name='caixas' AND column_name='loja_id'
