import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "backup-age-postgres.sh"),
  "utf8",
);

assert.match(script, /set -euo pipefail/);
assert.match(script, /pg_dump/);
assert.match(script, /pg_restore/);
assert.match(script, /age -r/);
assert.match(script, /age -d/);
assert.equal(script.includes("AGE-SECRET-KEY-1"), false);
assert.equal(script.includes("supabase.co"), false);
assert.equal(script.includes("--publish"), false);
assert.equal(script.includes("service_role"), false);
assert.match(script, /banco_ausente/);
assert.match(script, /backup\.dump\.age/);
