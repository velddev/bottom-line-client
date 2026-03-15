import type { AuthStrategy } from './auth-strategy';
import { DiscordActivityStrategy } from './discord-activity-strategy';
import { ElectronStrategy } from './electron-strategy';
import { WebStrategy } from './web-strategy';

/** Detect the current runtime and return the appropriate auth strategy. */
export function detectAuthStrategy(): AuthStrategy {
  // Discord Activity: running inside Discord's Activity iframe
  if (new URLSearchParams(window.location.search).has('frame_id')) {
    return new DiscordActivityStrategy();
  }

  // Electron: has the electronAPI bridge injected
  if (window.electron?.isElectron) {
    return new ElectronStrategy();
  }

  // Fallback: web browser
  return new WebStrategy();
}
