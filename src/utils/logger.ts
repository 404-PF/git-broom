import chalk from 'chalk'

export const logger = {
  info(msg: string) {
    console.log(chalk.blue('ℹ'), msg)
  },

  success(msg: string) {
    console.log(chalk.green('✓'), msg)
  },

  warn(msg: string) {
    console.log(chalk.yellow('⚠'), msg)
  },

  error(msg: string) {
    console.error(chalk.red('✗'), msg)
  },

  debug(msg: string) {
    console.log(chalk.gray('▸'), msg)
  },

  header(title: string) {
    console.log()
    console.log(chalk.bold.cyan(`🧹 ${title}`))
    console.log(chalk.gray('─'.repeat(40)))
  },

  table(rows: string[][]) {
    const colWidths: number[] = []
    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        colWidths[i] = Math.max(colWidths[i] ?? 0, row[i].length)
      }
    }
    for (const row of rows) {
      const padded = row.map((cell, i) => cell.padEnd(colWidths[i] ?? 0)).join('  ')
      console.log(padded)
    }
  },

  summary(deleted: number, reclaimed: number) {
    console.log()
    console.log(chalk.bold.green('─'.repeat(40)))
    console.log(chalk.bold.green(`✓ Cleaned ${deleted} branches, reclaimed ${formatBytes(reclaimed)}`))
  },

  json(data: unknown) {
    console.log(JSON.stringify(data, null, 2))
  },
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}
