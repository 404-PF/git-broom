export function parsePositiveInteger(value: string, label = 'value'): number {
  const trimmed = value.trim()
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new Error(`${label} must be a positive integer`)
  }
  return assertPositiveInteger(Number(trimmed), label)
}

export function assertPositiveInteger(value: number, label = 'value'): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}
