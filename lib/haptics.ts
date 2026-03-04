/**
 * Trigger haptic feedback on supported devices (Android browsers).
 * Silently no-ops on unsupported platforms (iOS Safari, desktop).
 */
export function triggerHaptic(pattern: number | number[] = 50) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    // Silently ignore -- vibrate may throw in restricted contexts
  }
}

export const HAPTIC_LIGHT = 30
export const HAPTIC_MEDIUM = 50
export const HAPTIC_HEAVY = 80
export const HAPTIC_SUCCESS = [30, 50, 80]
export const HAPTIC_ERROR = [80, 30, 80]
