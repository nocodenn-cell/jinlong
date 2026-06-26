export type RiskLevel = 'low' | 'medium' | 'high'

export interface ThemeFinding {
  file: string
  line: number
  col: number
  type: 'hex-color' | 'tailwind-color' | 'root-scope'
  value: string
  suggestion: string | null
}

export interface ThemeAuditResult {
  agent: 'theme-audit'
  timestamp: string
  risk: RiskLevel
  totalFindings: number
  findings: ThemeFinding[]
  affectedFiles: string[]
}

export interface TokenMigration {
  file: string
  line: number
  original: string
  suggested: string
}

export interface TokenMigrationResult {
  agent: 'token-migration'
  timestamp: string
  totalMigrations: number
  migrations: TokenMigration[]
  patchPreview: string
}

export interface ModuleStatus {
  module: string
  path: string
  routeAdded: boolean
  themeScopeApplied: boolean
  tokensOnly: boolean
  noHardcodedColors: boolean
  visualValidated: boolean
  score: number
}

export interface MigrationCheckResult {
  agent: 'migration-check'
  timestamp: string
  modules: ModuleStatus[]
  compliantCount: number
  totalCount: number
}

export interface BaselineDivergence {
  type: 'missing-class' | 'missing-component' | 'missing-token' | 'token-changed'
  description: string
  severity: RiskLevel
}

export interface DesignBaselineResult {
  agent: 'design-baseline'
  timestamp: string
  match: boolean
  diff: string[]
  divergences: BaselineDivergence[]
}

export interface AgentReport {
  generated: string
  themeAudit: ThemeAuditResult
  tokenMigration: TokenMigrationResult
  migrationCheck: MigrationCheckResult
  designBaseline: DesignBaselineResult
}
