import {
  createTomlLineScanState,
  getTomlTableHeader,
  isTomlStructuralLine,
  joinPreservingTrailingNewline,
  updateTomlLineScanState,
  withTrailingCr
} from '../toml/config-toml-line-scan'
import { parseTomlTableHeaderPath } from '../toml/config-toml-key-path'

export const CODEX_DAEMON_OVERRIDE_MARKER = '# orca: CODEX_HOME too long for the daemon socket'
// Older builds strip any line ending in the marker, so the kept value sits before it.
const KEPT_VALUE_PREFIX = '# was: '

/** The override records the value it replaced, so a crash or a later strip can't lose it. */
export function formatCodexDaemonOverrideRaw(replacedRaw: string | null): string {
  return replacedRaw === null
    ? `false ${CODEX_DAEMON_OVERRIDE_MARKER}`
    : `false ${KEPT_VALUE_PREFIX}${replacedRaw} ${CODEX_DAEMON_OVERRIDE_MARKER}`
}

function readKeptValue(line: string): string | null {
  const trimmed = line.trimEnd()
  const markerStart = trimmed.length - CODEX_DAEMON_OVERRIDE_MARKER.length
  const keptStart = trimmed.indexOf(KEPT_VALUE_PREFIX)
  if (keptStart === -1 || keptStart >= markerStart) {
    return null
  }
  const kept = trimmed.slice(keptStart + KEPT_VALUE_PREFIX.length, markerStart).trim()
  return kept === '' ? null : kept
}

export function isOnlyCodexDaemonOverride(config: string): boolean {
  return (
    config.includes(CODEX_DAEMON_OVERRIDE_MARKER) && stripCodexDaemonOverride(config).trim() === ''
  )
}

/** Restore the value each marked line replaced, or drop it (and an emptied features table). */
export function stripCodexDaemonOverride(config: string): string {
  if (!config.includes(CODEX_DAEMON_OVERRIDE_MARKER)) {
    return config
  }
  const usesCrlf = config.includes('\r\n')
  const lines = config.split('\n')
  const kept: string[] = []
  let featuresHeaderIndex = -1
  let removedFromFeatures = false
  const dropEmptyFeaturesTable = (): void => {
    // Why: copying the kept lines at every header made large configs quadratic.
    if (featuresHeaderIndex === -1 || !removedFromFeatures) {
      return
    }
    if (kept.slice(featuresHeaderIndex + 1).every((l) => l.trim() === '')) {
      kept.length = featuresHeaderIndex
      while (kept.at(-1)?.trim() === '') {
        kept.pop()
      }
      if (kept.length > 0) {
        kept.push(usesCrlf ? '\r' : '')
      }
    }
  }
  let scan = createTomlLineScanState()
  for (const line of lines) {
    const structural = isTomlStructuralLine(scan)
    scan = updateTomlLineScanState(scan, line)
    if (structural && line.trimEnd().endsWith(CODEX_DAEMON_OVERRIDE_MARKER)) {
      const keptValue = readKeptValue(line)
      const equals = line.indexOf('=')
      if (keptValue !== null && equals !== -1) {
        kept.push(withTrailingCr(line, `${line.slice(0, equals).trimEnd()} = ${keptValue}`))
        continue
      }
      removedFromFeatures ||= featuresHeaderIndex !== -1
      continue
    }
    const header = structural ? getTomlTableHeader(line) : null
    if (header) {
      dropEmptyFeaturesTable()
      const table = parseTomlTableHeaderPath(header)
      const isFeatures = table?.isArray === false && table.segments.join('.') === 'features'
      featuresHeaderIndex = isFeatures ? kept.length : -1
      removedFromFeatures = false
    }
    kept.push(line)
  }
  dropEmptyFeaturesTable()
  while (kept.at(-1)?.trim() === '') {
    kept.pop()
  }
  return kept.length === 0 ? '' : joinPreservingTrailingNewline(kept, usesCrlf)
}
