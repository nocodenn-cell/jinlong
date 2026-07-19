/**
 * Imutabilidade efetiva dos snapshots DI (hardening v1.0).
 * Deep freeze + clones rasos de Facts — sem compartilhar refs do provider.
 */

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (Object.isFrozen(value)) return value as Readonly<T>

  const obj = value as object & { [key: string]: unknown }
  if (Array.isArray(obj)) {
    for (const item of obj) deepFreeze(item)
  } else {
    for (const key of Object.keys(obj)) {
      deepFreeze(obj[key])
    }
  }
  return Object.freeze(obj) as Readonly<T>
}

/** Clone raso do envelope (+ clone raso de payload se objeto). */
export function cloneFactEnvelope<T>(
  fact: import('./contracts/fact').FactEnvelope<T>,
): import('./contracts/fact').FactEnvelope<T> {
  const payload =
    fact.payload !== null &&
    typeof fact.payload === 'object' &&
    !Array.isArray(fact.payload)
      ? ({ ...(fact.payload as object) } as T)
      : Array.isArray(fact.payload)
        ? ([...(fact.payload as unknown[])] as T)
        : fact.payload

  return {
    ...fact,
    affectedByGateIds: fact.affectedByGateIds
      ? [...fact.affectedByGateIds]
      : undefined,
    payload,
  }
}
