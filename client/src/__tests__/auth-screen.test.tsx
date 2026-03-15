import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AuthProvider } from '../auth';
import AuthScreen from '../screens/AuthScreen';
import type { AuthStrategy, OAuthResult } from '../auth/auth-strategy';
import type { IApiService } from '../api-interface';

// ── Mock api module ──────────────────────────────────────────────────────────
const mockApi: Partial<IApiService> = {
  getAuthMethods: vi.fn(),
  exchangeOAuthCode: vi.fn(),
  openDiscordOAuth: vi.fn(),
  getOAuthClientId: vi.fn(),
};
const mockGetProfile = vi.fn();

vi.mock('../api', () => ({
  useApi: () => mockApi as IApiService,
  getProfile: (...args: any[]) => mockGetProfile(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
function createMockStrategy(overrides: Partial<AuthStrategy> = {}): AuthStrategy {
  return {
    name: 'web',
    autoLogin: false,
    startOAuth: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function renderAuthScreen(strategy?: AuthStrategy) {
  return render(
    <AuthProvider>
      <AuthScreen strategyOverride={strategy} />
    </AuthProvider>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('AuthScreen', () => {
  let capturedLogin: any;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    capturedLogin = undefined;

    (mockApi.getAuthMethods as any).mockResolvedValue({
      methods: [{ provider: 'discord', client_id: 'test-client-id' }],
    });
    (mockApi.exchangeOAuthCode as any).mockResolvedValue({
      player_id: 'p1', api_key: 'key1',
    });
    mockGetProfile.mockResolvedValue({
      username: 'testuser', city_id: 'c1',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Idle state ──────────────────────────────────────────────────────────
  describe('idle state', () => {
    it('shows Discord login button', () => {
      const strategy = createMockStrategy();
      renderAuthScreen(strategy);
      expect(screen.getByText('Login with Discord')).toBeInTheDocument();
    });

    it('shows manual login option', () => {
      const strategy = createMockStrategy();
      renderAuthScreen(strategy);
      expect(screen.getByText('Enter credentials manually')).toBeInTheDocument();
    });
  });

  // ── Web/sync OAuth flow ─────────────────────────────────────────────────
  describe('synchronous OAuth flow (web)', () => {
    it('exchanges code immediately when strategy returns code', async () => {
      const user = userEvent.setup();
      const strategy = createMockStrategy({
        startOAuth: vi.fn().mockResolvedValue({ code: 'abc123', redirectUri: 'https://example.com/callback' }),
      });
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Login with Discord'));

      await waitFor(() => {
        expect(mockApi.exchangeOAuthCode).toHaveBeenCalledWith(
          'DISCORD', 'abc123', 'https://example.com/callback'
        );
      });
      await waitFor(() => {
        expect(mockGetProfile).toHaveBeenCalled();
      });
    });

    it('shows "Signing in…" during exchange', async () => {
      const user = userEvent.setup();
      let resolveExchange: (value: any) => void;
      (mockApi.exchangeOAuthCode as any).mockReturnValue(
        new Promise((r) => { resolveExchange = r; })
      );

      const strategy = createMockStrategy({
        startOAuth: vi.fn().mockResolvedValue({ code: 'abc', redirectUri: 'https://x.com/cb' }),
      });
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Login with Discord'));

      await waitFor(() => {
        expect(screen.getByText('Signing in…')).toBeInTheDocument();
      });

      // Resolve to clean up
      resolveExchange!({ player_id: 'p1', api_key: 'k1' });
    });

    it('shows error and returns to idle on exchange failure', async () => {
      const user = userEvent.setup();
      (mockApi.exchangeOAuthCode as any).mockRejectedValue(new Error('Invalid code'));

      const strategy = createMockStrategy({
        startOAuth: vi.fn().mockResolvedValue({ code: 'bad', redirectUri: 'https://x.com/cb' }),
      });
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Login with Discord'));

      await waitFor(() => {
        expect(screen.getByText('Invalid code')).toBeInTheDocument();
      });
      // Should be back at idle — Discord button visible
      expect(screen.getByText('Login with Discord')).toBeInTheDocument();
    });
  });

  // ── Electron/async OAuth flow ───────────────────────────────────────────
  describe('asynchronous OAuth flow (Electron)', () => {
    it('shows waiting state when strategy returns null', async () => {
      const user = userEvent.setup();
      const strategy = createMockStrategy({
        startOAuth: vi.fn().mockResolvedValue(null),
      });
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Login with Discord'));

      await waitFor(() => {
        expect(screen.getByText(/Waiting for Discord/)).toBeInTheDocument();
      });
    });

    it('exchanges code when onCodeReceived fires', async () => {
      let codeCallback: ((code: string, redirectUri: string) => void) | undefined;
      const strategy = createMockStrategy({
        startOAuth: vi.fn().mockResolvedValue(null),
        onCodeReceived: vi.fn().mockImplementation((cb) => {
          codeCallback = cb;
          return () => {};
        }),
      });

      renderAuthScreen(strategy);

      // Simulate receiving the code via deep link
      codeCallback!('deep-link-code', 'https://api.ventured.gg/v1/auth/callback');

      await waitFor(() => {
        expect(mockApi.exchangeOAuthCode).toHaveBeenCalledWith(
          'DISCORD', 'deep-link-code', 'https://api.ventured.gg/v1/auth/callback'
        );
      });
    });

    it('cancel button returns to idle from waiting state', async () => {
      const user = userEvent.setup();
      const strategy = createMockStrategy({
        startOAuth: vi.fn().mockResolvedValue(null),
      });
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Login with Discord'));
      await waitFor(() => {
        expect(screen.getByText(/Waiting for Discord/)).toBeInTheDocument();
      });

      await user.click(screen.getByText('Cancel'));
      expect(screen.getByText('Login with Discord')).toBeInTheDocument();
    });
  });

  // ── Auto-login (Discord Activity) ───────────────────────────────────────
  describe('auto-login (Discord Activity)', () => {
    it('immediately starts exchanging when strategy.autoLogin is true', async () => {
      const strategy = createMockStrategy({
        autoLogin: true,
        startOAuth: vi.fn().mockResolvedValue({ code: 'activity-code', redirectUri: 'https://discord.com/games/cid' }),
      });
      renderAuthScreen(strategy);

      await waitFor(() => {
        expect(screen.getByText('Signing in…')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(mockApi.exchangeOAuthCode).toHaveBeenCalledWith(
          'DISCORD', 'activity-code', 'https://discord.com/games/cid'
        );
      });
    });

    it('shows error and falls back to idle on auto-login failure', async () => {
      (mockApi.getAuthMethods as any).mockRejectedValue(new Error('Network error'));
      const strategy = createMockStrategy({
        autoLogin: true,
      });
      renderAuthScreen(strategy);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
      expect(screen.getByText('Login with Discord')).toBeInTheDocument();
    });
  });

  // ── Manual login ────────────────────────────────────────────────────────
  describe('manual login', () => {
    it('shows manual form when "Enter credentials manually" is clicked', async () => {
      const user = userEvent.setup();
      const strategy = createMockStrategy();
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Enter credentials manually'));

      expect(screen.getByText('Username')).toBeInTheDocument();
      expect(screen.getByText('Player ID')).toBeInTheDocument();
      expect(screen.getByText('API Key')).toBeInTheDocument();
      expect(screen.getByText('City ID')).toBeInTheDocument();
    });

    it('back button returns to idle from manual form', async () => {
      const user = userEvent.setup();
      const strategy = createMockStrategy();
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Enter credentials manually'));
      await user.click(screen.getByText('← Back'));

      expect(screen.getByText('Login with Discord')).toBeInTheDocument();
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────
  describe('error handling', () => {
    it('shows error when Discord auth is not configured', async () => {
      const user = userEvent.setup();
      (mockApi.getAuthMethods as any).mockResolvedValue({ methods: [] });
      const strategy = createMockStrategy();
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Login with Discord'));

      await waitFor(() => {
        expect(screen.getByText('Discord login is not configured on this server.')).toBeInTheDocument();
      });
    });

    it('shows error when getAuthMethods fails', async () => {
      const user = userEvent.setup();
      (mockApi.getAuthMethods as any).mockRejectedValue(new Error('Server unavailable'));
      const strategy = createMockStrategy();
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Login with Discord'));

      await waitFor(() => {
        expect(screen.getByText('Server unavailable')).toBeInTheDocument();
      });
    });

    it('shows error when strategy.startOAuth fails', async () => {
      const user = userEvent.setup();
      const strategy = createMockStrategy({
        startOAuth: vi.fn().mockRejectedValue(new Error('Popup blocked')),
      });
      renderAuthScreen(strategy);

      await user.click(screen.getByText('Login with Discord'));

      await waitFor(() => {
        expect(screen.getByText('Popup blocked')).toBeInTheDocument();
      });
    });
  });
});
