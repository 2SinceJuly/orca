import { realpathSync } from 'node:fs'
import {
  observeResolvedFilePath,
  observeResolvedFilePathError
} from '../../../filesystem/file-content-observation'
import { parseWslUncPath } from '../../../../shared/file-access/wsl-paths'
import { unixSocketPathFits } from '../../../../shared/network/unix-socket-path-limit'
import {
  tableStructuredKey,
  upsertTableSettingsInContent
} from '../settings/codex-config-settings-upsert'
import { readPromotedSettingValuesFromContent } from '../toml/config-toml-promoted-setting-values'
import {
  CODEX_DAEMON_OVERRIDE_MARKER,
  formatCodexDaemonOverrideRaw,
  stripCodexDaemonOverride
} from './codex-daemon-override-marker'

// Codex >=0.157 auto-starts a daemon; long managed homes exceed its socket's sun_path limit.
const DAEMON_SOCKET_SEGMENTS = ['app-server-control', 'app-server-control.sock']
const DAEMON_KEY = tableStructuredKey('features', 'daemon_auto_start')

export function codexDaemonSocketPath(homePath: string, platform = process.platform): string {
  const wsl = parseWslUncPath(homePath)
  if (wsl) {
    return [wsl.linuxPath.replace(/\/+$/, ''), ...DAEMON_SOCKET_SEGMENTS].join('/')
  }
  // Codex canonicalizes CODEX_HOME, so short symlink aliases still use the long real path.
  // Its AbsolutePathBuf strips the Windows extended-path prefix before measuring.
  let canonical = homePath
  try {
    canonical = realpathSync.native(homePath)
  } catch (error) {
    observeResolvedFilePathError('daemon-home', homePath, error)
    // Unresolvable homes are measured as spelled.
  }
  canonical = observeResolvedFilePath('daemon-home', homePath, canonical)
  const separator = platform === 'win32' ? '\\' : '/'
  return [canonical.replace(/[\\/]+$/, ''), ...DAEMON_SOCKET_SEGMENTS].join(separator)
}

export function codexDaemonSocketPathExceedsLimit(
  homePath: string,
  platform = process.platform
): boolean {
  // WSL uses Linux limits; native Windows uds_windows also has a 108-byte sun_path.
  const os = platform === 'darwin' && !parseWslUncPath(homePath) ? 'darwin' : 'linux'
  return !unixSocketPathFits(codexDaemonSocketPath(homePath, platform), os)
}

const unguardableHomesWarned = new Set<string>()

/** Applies (or removes) Orca's daemon override so it tracks the home's current path. */
export function applyCodexDaemonOverride(
  config: string,
  homePath: string,
  socketPathExceedsLimit: boolean
): string {
  if (!socketPathExceedsLimit) {
    return stripCodexDaemonOverride(config)
  }
  // Reading through the strip yields what an earlier override replaced, so reapplying keeps it.
  const replaced = readPromotedSettingValuesFromContent(config).get(DAEMON_KEY)
  const guarded = upsertTableSettingsInContent(
    config,
    'features',
    new Map([
      [
        'daemon_auto_start',
        formatCodexDaemonOverrideRaw(replaced && !replaced.multiline ? replaced.raw : null)
      ]
    ])
  )
  if (
    !guarded.includes(CODEX_DAEMON_OVERRIDE_MARKER) &&
    !/\bdaemon_auto_start\s*=\s*false\b/.test(guarded) &&
    !unguardableHomesWarned.has(homePath)
  ) {
    // Inline/array features tables block upsert; warn once so an ineffective guard is visible.
    unguardableHomesWarned.add(homePath)
    console.warn(
      `[codex-config] Could not turn off Codex daemon auto-start in ${homePath}: its config defines features in a form Orca cannot extend. Codex may fail with "path must be shorter than SUN_LEN"; add daemon_auto_start = false to features in ~/.codex/config.toml.`
    )
  }
  return guarded
}
