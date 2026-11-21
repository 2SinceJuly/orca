import type { CodexSettingsConflict } from './config-settings-baseline'
import { normalizeCodexRegistrationValue } from '../toml/config-toml-plugin-registration-tables'

export type CodexSettingsConflictResolution =
  | { action: 'aligned' }
  | { action: 'preserve'; conflict: CodexSettingsConflict }
  | { action: 'promote-runtime'; raw: string }
  | { action: 'use-system' }

export function resolveUntrackedCodexSetting(
  runtime: string | null,
  system: string | null,
  existingConflict?: CodexSettingsConflict
): CodexSettingsConflictResolution {
  if (runtime === system) {
    return { action: 'aligned' }
  }
  if (!existingConflict) {
    return { action: 'preserve', conflict: { runtime, system } }
  }

  const runtimeChanged = runtime !== existingConflict.runtime
  const systemChanged = !sameCanonicalValue(system, existingConflict.system)
  if (runtimeChanged && !systemChanged) {
    // Runtime deletions do not propagate to the canonical config.
    return runtime === null ? { action: 'use-system' } : { action: 'promote-runtime', raw: runtime }
  }
  if (!runtimeChanged && systemChanged) {
    return { action: 'use-system' }
  }
  if (runtimeChanged && systemChanged) {
    // Keep divergent edits unresolved without blocking other keys.
    return { action: 'preserve', conflict: { runtime, system } }
  }
  return { action: 'preserve', conflict: existingConflict }
}

/** A comment or quoting change to the canonical line is not an edit that should discard a kept value. */
export function sameCanonicalValue(left: string | null, right: string | null): boolean {
  if (left === null || right === null) {
    return left === right
  }
  return normalizeCodexRegistrationValue(left) === normalizeCodexRegistrationValue(right)
}
