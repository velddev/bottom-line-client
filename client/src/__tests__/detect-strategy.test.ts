import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectAuthStrategy } from '../auth/detect-strategy';

describe('detectAuthStrategy', () => {
  const originalLocation = window.location;
  const originalElectron = window.electron;
  const originalElectronAPI = window.electronAPI;

  beforeEach(() => {
    // Reset globals
    delete (window as any).electron;
    delete (window as any).electronAPI;
  });

  afterEach(() => {
    // Restore
    if (originalElectron) (window as any).electron = originalElectron;
    if (originalElectronAPI) (window as any).electronAPI = originalElectronAPI;
    // Restore location search
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('detects Discord Activity when frame_id is in URL', () => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '?frame_id=abc123' },
      writable: true,
    });
    const strategy = detectAuthStrategy();
    expect(strategy.name).toBe('discord-activity');
    expect(strategy.autoLogin).toBe(true);
  });

  it('detects Electron when window.electron.isElectron is true', () => {
    (window as any).electron = { isElectron: true };
    (window as any).electronAPI = {
      invoke: () => Promise.resolve(),
      onDiscordAuth: () => () => {},
    };
    const strategy = detectAuthStrategy();
    expect(strategy.name).toBe('electron');
    expect(strategy.autoLogin).toBe(false);
  });

  it('falls back to web when no special environment is present', () => {
    const strategy = detectAuthStrategy();
    expect(strategy.name).toBe('web');
    expect(strategy.autoLogin).toBe(false);
  });

  it('prefers Discord Activity over Electron when both present', () => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '?frame_id=abc123' },
      writable: true,
    });
    (window as any).electron = { isElectron: true };

    const strategy = detectAuthStrategy();
    expect(strategy.name).toBe('discord-activity');
  });
});
