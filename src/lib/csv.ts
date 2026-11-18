export interface CsvColumn<T> {
  label: string
  value: (row: T) => string | number | null | undefined
}

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Spreadsheet formula injection: neutralise cells that start with a formula trigger.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.label)).join(',')]
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(','))
  return `\uFEFF${lines.join('\r\n')}`
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
