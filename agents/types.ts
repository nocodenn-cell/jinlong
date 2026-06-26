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

// ── CI Execution Tracer ───────────────────────────────────────────────────────

export interface CIStepTrace {
  name: string
  hasTimestamp: boolean
  hasExitCapture: boolean
  hasOutputSample: boolean
  instrumented: boolean
}

export interface CIExecutionTracerResult {
  agent: 'ci-execution-tracer'
  timestamp: string
  workflowFile: string
  jobs: string[]
  hasCompletionMarker: boolean
  criticalSteps: CIStepTrace[]
  instrumentedCount: number
  totalCritical: number
  score: number
}

// ── CI Failure Classifier ─────────────────────────────────────────────────────

export type CIFailureCategory =
  | 'PASS'
  | 'REAL_CODE_BUG'
  | 'DEPENDENCY_FAILURE'
  | 'ENVIRONMENT_FAILURE'
  | 'PIPELINE_ABORT'

export interface CICheckReport {
  command: string
  category: CIFailureCategory
  exitCode: number
  durationMs: number
  evidence: string
}

export interface CIFailureClassifierResult {
  agent: 'ci-failure-classifier'
  timestamp: string
  sha: string
  checks: CICheckReport[]
  categorySummary: Record<CIFailureCategory, number>
  canMerge: boolean
}

// ── Aggregate Report ──────────────────────────────────────────────────────────

export interface AgentReport {
  generated: string
  themeAudit: ThemeAuditResult
  tokenMigration: TokenMigrationResult
  migrationCheck: MigrationCheckResult
  designBaseline: DesignBaselineResult
  ciTracer: CIExecutionTracerResult
  ciClassifier: CIFailureClassifierResult
}
