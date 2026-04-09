/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router: sem `experimental.appDir` (padrão no Next 13+) e sem `i18n` aqui
  // (i18n do Pages Router não se aplica; mensagens em `@/src/lib/i18n/getMessages`).
}

module.exports = nextConfig