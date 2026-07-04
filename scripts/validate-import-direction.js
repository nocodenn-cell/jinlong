#!/usr/bin/env node
/**
 * VALIDATION: Import Direction Rules
 *
 * Enforces that dependencies flow in correct direction:
 * Domain ← Pricing ← App
 * App → Shared-core (any module)
 * App → Infrastructure
 *
 * This script detects violations like:
 * - App importing from core/catalog (legacy business logic)
 * - Core/services being imported by app layer
 * - Domain importing from pdv-importados
 */

const fs = require('fs')
const path = require('path')

// Simple recursive file finder (no external dependency)
function findFiles(dir, pattern, ignore = []) {
  const files = []

  function walk(currentPath) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)
        const relativePath = path.relative(process.cwd(), fullPath)

        // Skip ignored directories
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
      // Ignore read errors
    }
  }

  walk(dir)
  return files
}

// Define forbidden import patterns
// Format: [sourceDir, forbiddenTargetPattern, message]
const FORBIDDEN_PATTERNS = [
  // Application layer cannot import from core business logic
  [
    'pdv-importados/app/aplicacao',
    '@/core/catalog',
    'Application layer cannot import business logic from core/catalog (legacy)',
  ],
  [
    'pdv-importados/app/aplicacao',
    '@/core/services',
    'Application layer must not import core services directly (use domain)',
  ],
  [
    'pdv-importados/app/aplicacao',
    '/core/services',
    'Application layer must not import core services (use domain)',
  ],
  // Shared-core cannot depend on pdv-importados
  [
    'shared-core/src',
    'pdv-importados',
    'shared-core cannot depend on pdv-importados (reverse dependency)',
  ],
  [
    'shared-core/src',
    '@/',
    'shared-core cannot use @/ alias (would reference pdv-importados)',
  ],
  // Domain/product cannot import from anything outside itself
  [
    'shared-core/src/domain/product',
    'pdv-importados',
    'Domain layer cannot depend on application layer',
  ],
]

const ALLOWED_PATTERNS = [
  'import type', // Type-only imports are safe
  '@shared-core', // App can import from shared-core
  '../shared-core', // Relative import to shared-core is ok
  '@shared', // Shared imports are ok
]

let violationCount = 0

// Find all TypeScript files
const files = findFiles('.', /\.tsx?$/, ['node_modules', '.next', 'dist', 'coverage', '.git'])

files.forEach((file) => {
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split('\n')

  let inForbiddenDir = false
  let forbiddenDirInfo = null

  // Check if this file is in a forbidden source directory
  for (const [sourceDir, target, message] of FORBIDDEN_PATTERNS) {
    if (file.includes(sourceDir)) {
      inForbiddenDir = true
      forbiddenDirInfo = { target, message }
      break
    }
  }

  if (!inForbiddenDir) return // Skip if not in forbidden source directory

  // Check each import line
  lines.forEach((line, lineNum) => {
    const trimmed = line.trim()

    // Skip comments, non-import lines, and multiline comment blocks
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || !trimmed.includes('import ')) {
      return
    }

    // Check if this is an actual import statement (not in a comment/string)
    if (!trimmed.match(/^import\s+/)) {
      return
    }

    // Check if this import violates direction
    if (line.includes(forbiddenDirInfo.target)) {
      // Exception: type-only imports might be ok
      if (line.includes('import type')) {
        // Some type-only imports from legacy are ok for compatibility
        // but this is still worth flagging
      }

      console.error(`❌ VIOLATION: ${file}:${lineNum + 1}`)
      console.error(`   ${forbiddenDirInfo.message}`)
      console.error(`   Found: ${line.trim()}`)
      console.error()
      violationCount++
    }
  })
})

if (violationCount > 0) {
  console.error(`🛑 FAIL: Found ${violationCount} import direction violations`)
  process.exit(1)
}

console.log('✅ PASS: All imports follow dependency direction rules')
process.exit(0)
