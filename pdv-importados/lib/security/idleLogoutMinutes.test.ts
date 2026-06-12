import { afterEach, describe, expect, it } from 'vitest'
import { getIdleLogoutMinutes } from './idleLogoutMinutes'

describe('getIdleLogoutMinutes', () => {
  const original = process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES
    } else {
      process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES = original
    }
  })

  it('returns 0 when env var is not set', () => {
    delete process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES
    expect(getIdleLogoutMinutes()).toBe(0)
  })

  it('returns 0 for empty string', () => {
    process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES = ''
    expect(getIdleLogoutMinutes()).toBe(0)
  })

  it('returns parsed integer for valid value', () => {
    process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES = '15'
    expect(getIdleLogoutMinutes()).toBe(15)
  })

  it('returns 0 for non-numeric value', () => {
    process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES = 'abc'
    expect(getIdleLogoutMinutes()).toBe(0)
  })

  it('returns 0 for zero', () => {
    process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES = '0'
    expect(getIdleLogoutMinutes()).toBe(0)
  })

  it('returns 0 for negative value', () => {
    process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES = '-10'
    expect(getIdleLogoutMinutes()).toBe(0)
  })

  it('caps at 24 hours (1440 minutes)', () => {
    process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES = '9999'
    expect(getIdleLogoutMinutes()).toBe(1440)
  })
})
