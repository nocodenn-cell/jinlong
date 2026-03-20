/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router é padrão no Next 15; `experimental.appDir` foi removido (obsoleto).
  // Sem bloco `i18n`: no App Router ele é legado do Pages Router; idiomas via getMessages + src/lib/i18n (URLs sem prefixo de locale).
}

module.exports = nextConfig