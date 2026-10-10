CREATE ROLE anon NOINHERIT;
CREATE ROLE authenticator SUPERUSER NOINHERIT;
CREATE ROLE authenticated NOINHERIT;
CREATE ROLE service_role NOINHERIT;
GRANT anon, authenticated, service_role TO authenticator;
