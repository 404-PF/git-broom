import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from './config.js'

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'git-broom-config-'))
}

describe('resolveConfig', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('warns and falls back to defaults when .gitbroomrc contains invalid JSON', () => {
    const cwd = makeTempDir()
    const configPath = join(cwd, '.gitbroomrc')
    writeFileSync(configPath, '{ invalid json')

    const config = resolveConfig(cwd, {})

    expect(config.staleDays).toBe(90)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`Ignoring invalid config file at ${configPath}`)
    )
  })

  it('warns and falls back to defaults when .gitbroomrc fails validation', () => {
    const cwd = makeTempDir()
    const configPath = join(cwd, '.gitbroomrc')
    writeFileSync(configPath, JSON.stringify({ staleDays: -5 }))

    const config = resolveConfig(cwd, {})

    expect(config.staleDays).toBe(90)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`Ignoring invalid config file at ${configPath}`)
    )
  })

  it('uses valid config values without warning', () => {
    const cwd = makeTempDir()
    writeFileSync(join(cwd, '.gitbroomrc'), JSON.stringify({ staleDays: 30, verbose: true }))

    const config = resolveConfig(cwd, {})

    expect(config.staleDays).toBe(30)
    expect(config.verbose).toBe(true)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not share default branch naming state between resolutions', () => {
    const cwd = makeTempDir()
    const firstConfig = resolveConfig(cwd, {})
    const secondConfig = resolveConfig(cwd, {})

    firstConfig.branchNaming!.allowedPrefixes.push('custom')
    firstConfig.branchNaming!.ignorePatterns.push('generated/*')

    expect(secondConfig.branchNaming).toEqual({
      requireTicket: true,
      requirePrefix: true,
      ticketPattern: '[A-Z]+-\\d+',
      allowedPrefixes: ['feature', 'fix', 'bugfix', 'chore', 'docs', 'refactor', 'test'],
      ignorePatterns: [],
    })
  })

  it('allows CLI overrides to omit json so config-backed JSON stays enabled', () => {
    const cwd = makeTempDir()
    writeFileSync(join(cwd, '.gitbroomrc'), JSON.stringify({ json: true }))

    const config = resolveConfig(cwd, { verbose: true })

    expect(config.json).toBe(true)
    expect(config.verbose).toBe(true)
  })

  it('parses schedule configuration with interval and log file', () => {
    const cwd = makeTempDir()
    writeFileSync(
      join(cwd, '.gitbroomrc'),
      JSON.stringify({
        schedule: {
          interval: 'daily',
          logFile: 'logs/git-broom.log',
        },
      }),
    )

    const config = resolveConfig(cwd, {})

    expect(config.schedule).toEqual({
      interval: 'daily',
      logFile: 'logs/git-broom.log',
    })
  })

  it('parses configurable branch naming rules', () => {
    const cwd = makeTempDir()
    writeFileSync(
      join(cwd, '.gitbroomrc'),
      JSON.stringify({
        branchNaming: {
          requireTicket: false,
          requirePrefix: true,
          allowedPrefixes: ['work'],
          ignorePatterns: ['dependabot/*'],
        },
      }),
    )

    const config = resolveConfig(cwd, {})

    expect(config.branchNaming).toEqual({
      requireTicket: false,
      requirePrefix: true,
      ticketPattern: '[A-Z]+-\\d+',
      allowedPrefixes: ['work'],
      ignorePatterns: ['dependabot/*'],
    })
  })

  it('falls back to default branch naming when ticketPattern is invalid', () => {
    const cwd = makeTempDir()
    const configPath = join(cwd, '.gitbroomrc')
    writeFileSync(
      configPath,
      JSON.stringify({
        branchNaming: {
          ticketPattern: '[',
        },
      }),
    )

    const config = resolveConfig(cwd, {})

    expect(config.branchNaming).toEqual({
      requireTicket: true,
      requirePrefix: true,
      ticketPattern: '[A-Z]+-\\d+',
      allowedPrefixes: ['feature', 'fix', 'bugfix', 'chore', 'docs', 'refactor', 'test'],
      ignorePatterns: [],
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`Ignoring invalid config file at ${configPath}`),
    )
  })

  it('ignores config with an unsafe ticketPattern', () => {
    const cwd = makeTempDir()
    const configPath = join(cwd, '.gitbroomrc')
    writeFileSync(
      configPath,
      JSON.stringify({ branchNaming: { ticketPattern: '(a+)+$' } }),
    )

    const config = resolveConfig(cwd, {})

    expect(config.branchNaming?.ticketPattern).toBe('[A-Z]+-\\d+')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`Ignoring invalid config file at ${configPath}`),
    )
  })

  it('ignores invalid schedule configuration and falls back safely', () => {
    const cwd = makeTempDir()
    const configPath = join(cwd, '.gitbroomrc')
    writeFileSync(configPath, JSON.stringify({ schedule: { interval: 'hourly' } }))

    const config = resolveConfig(cwd, {})

    expect(config.schedule).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`Ignoring invalid config file at ${configPath}`),
    )
  })
})
