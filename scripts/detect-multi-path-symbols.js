#!/usr/bin/env node
/**
 * VALIDATION: Multi-path Symbol Detection
 *
 * Detects when the same symbol is importable from multiple locations.
 * This indicates either:
 * 1. Type duplication (should consolidate to one source)
 * 2. Re-export chains (should simplify)
 * 3. Hidden coupling (should eliminate)
 *
 * For domain concepts, there should be exactly ONE primary source.
 */

const fs = require('fs')
const path = require('path')

// Simple recursive file finder
function findFiles(dir, pattern, ignore = []) {
  const files = []

  function walk(currentPath) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)
        const relativePath = path.relative(process.cwd(), fullPath)

        if (ignore.some(ig => relativePath.includes(ig))) {
          continue
        }

        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (entry.isFile() && entry.name.match(pattern)) {
          files.push(relativePath)
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }

  walk(dir)
  return files
}

// Define domain symbols and their allowed import paths
// Format: { symbolName: { canonical: 'path/to/source', allowed: ['path1', 'path2'] } }
const DOMAIN_SYMBOLS = {
  StatusPublicacao: {
    canonical: 'shared-core/src/domain/product/types',
    allowed: [
      'shared-core/src/domain/product/types',
      'pdv-importados/core/ports/produto', // Port adapter is ok
    ],
  },
  ProdutoOrigem: {
    canonical: 'shared-core/src/domain/product/types',
    allowed: [
      'shared-core/src/domain/product/types',
      'pdv-importados/core/ports/produto',
    ],
  },
  OrigemProduto: {
    canonical: 'shared-core/src/domain/product/types',
    allowed: [
      'shared-core/src/domain/product/types',
      'pdv-importados/core/ports/produto',
    ],
  },
  UnidadeMedida: {
    canonical: 'shared-core/src/domain/product/types',
    allowed: [
      'shared-core/src/domain/product/types',
      'pdv-importados/core/ports/produto',
    ],
  },
  CadastroData: {
    canonical: 'shared-core/src/domain/product/requests/CadastroData',
    allowed: [
      'shared-core/src/domain/product/requests/CadastroData',
    ],
  },
  ContextoApp: {
    canonical: 'shared-core/src/domain/product/requests/ContextoApp',
    allowed: [
      'shared-core/src/domain/product/requests/ContextoApp',
    ],
  },
}

let violationCount = 0

// For each symbol, find all import paths
Object.entries(DOMAIN_SYMBOLS).forEach(([symbol, config]) => {
  const importPaths = new Set()

  // Find all files that have this symbol in their exports
  const files = findFiles('.', /\.tsx?$/, ['node_modules', '.next', 'dist', '.git'])

  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8')

    // Check if this file exports the symbol
    const exportRegex = new RegExp(
      `^export\\s+(type\\s+)?${symbol}\\s*[=|{|:]`,
      'm'
    )
    const reExportRegex = new RegExp(
      `^export\\s+(type\\s+)?\\{[^}]*${symbol}[^}]*\\}\\s+from`,
      'm'
    )

    if (exportRegex.test(content) || reExportRegex.test(content)) {
      // Normalize path for comparison
      const normalizedPath = file
        .replace(/\.ts$/, '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')

      importPaths.add(normalizedPath)
    }
  })

  // Check if violations exist
  if (importPaths.size > config.allowed.length) {
    console.error(
      `❌ VIOLATION: '${symbol}' exportable from ${importPaths.size} paths (allowed: ${config.allowed.length})`
    )
    console.error(`   Canonical source: ${config.canonical}`)
    console.error(`   Allowed paths: ${config.allowed.join(', ')}`)
    console.error(`   Found at:`)
    Array.from(importPaths).forEach((p) => {
      const isAllowed = config.allowed.some((allowed) => p.includes(allowed))
      const marker = isAllowed ? '  ✓' : '  ✗'
      console.error(`     ${marker} ${p}`)
    })
    console.error()
    violationCount++
  } else {
    console.log(`✓ ${symbol}: ${importPaths.size} path(s) (within limits)`)
  }
})

if (violationCount > 0) {
  console.error(`🛑 FAIL: Found ${violationCount} multi-path symbol violations`)
  process.exit(1)
}

console.log('✅ PASS: All symbols have controlled import paths')
process.exit(0)
