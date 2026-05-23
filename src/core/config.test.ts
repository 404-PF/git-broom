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
})
