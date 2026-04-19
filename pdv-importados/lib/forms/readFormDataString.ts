'use client'

export function readFormDataString(
  formData: FormData,
  key: string,
  fallback = '',
): string {
  const value = formData.get(key)
  if (value == null) return fallback
  if (typeof value === 'string') return value
  if (typeof File !== 'undefined' && value instanceof File) return value.name || fallback
  return value.toString() || fallback
}
