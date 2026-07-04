/**
 * Custom ESLint Rules for Architecture Enforcement
 *
 * These rules prevent common architectural violations:
 * 1. Direct re-export pattern (must use import-then-export)
 * 2. Forbidden import paths (layer violations)
 * 3. Type vs value mixing in exports
 */

module.exports = {
  rules: {
    'no-direct-re-export-types': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Enforce import-then-export pattern for types. Prevents: export { type X } from "source"',
          category: 'Architectural',
          recommended: 'error',
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          ExportNamedDeclaration(node) {
            // Detect: export { type X } from 'source'
            // This pattern fails TypeScript in some contexts
            if (node.source && node.specifiers && node.specifiers.length > 0) {
              const hasTypeSpecifier = node.specifiers.some(
                (spec) =>
                  spec.type === 'ExportSpecifier' &&
                  spec.exportKind === 'type'
              )

              if (hasTypeSpecifier && node.source) {
                context.report({
                  node,
                  message:
                    'Use import-then-export pattern for types: import type { X } from "./source"; export type { X }. Direct re-export pattern causes TypeScript resolution issues.',
                })
              }
            }

            // Detect: mixing type and value exports from same source
            // This is confusing and error-prone
            if (node.source && node.specifiers && node.specifiers.length > 1) {
              const typeSpecs = node.specifiers.filter(
                (s) => s.exportKind === 'type'
              )
              const valueSpecs = node.specifiers.filter(
                (s) => s.exportKind !== 'type'
              )

              if (typeSpecs.length > 0 && valueSpecs.length > 0) {
                context.report({
                  node,
                  message:
                    'Separate type and value re-exports: export type { X } and export { Y } on separate lines',
                })
              }
            }
          },
        }
      },
    },

    'no-forbidden-layer-imports': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent imports that violate layer boundaries',
          category: 'Architectural',
          recommended: 'error',
        },
        fixable: null,
        schema: [
          {
            type: 'object',
            properties: {
              rules: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    forbidden: { type: 'array', items: { type: 'string' } },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        ],
      },
      create(context) {
        const options = context.options[0] || {}
        const rules = options.rules || []

        return {
          ImportDeclaration(node) {
            const filename = context.getFilename()
            const source = node.source.value

            for (const rule of rules) {
              // Check if current file is in the source directory
              if (!filename.includes(rule.source)) continue

              // Check if import matches forbidden pattern
              for (const forbiddenPattern of rule.forbidden) {
                if (source.includes(forbiddenPattern)) {
                  context.report({
                    node,
                    message: rule.message || `Import from ${forbiddenPattern} is forbidden in ${rule.source}`,
                  })
                  break
                }
              }
            }
          },
        }
      },
    },
  },
}
