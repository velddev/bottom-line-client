import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AuthProvider, useAuth } from '../auth';

// Helper component that exposes auth context for testing
function AuthConsumer({ onAuth }: { onAuth: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth();
  React.useEffect(() => { onAuth(ctx); }, [ctx.auth]);
  return (
    <div>
      <span data-testid="status">{ctx.auth ? `logged-in:${ctx.auth.username}` : 'logged-out'}</span>
      <button data-testid="login" onClick={() => ctx.login({
        player_id: 'p1', api_key: 'key1', city_id: 'c1', username: 'alice',
      })}>Login</button>
      <button data-testid="logout" onClick={ctx.logout}>Logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts logged out when nothing is persisted', () => {
    let auth: ReturnType<typeof useAuth> | undefined;
    render(
      <AuthProvider>
        <AuthConsumer onAuth={(ctx) => { auth = ctx; }} />
      </AuthProvider>
    );
    expect(screen.getByTestId('status').textContent).toBe('logged-out');
    expect(auth!.auth).toBeNull();
  });

  it('login() sets auth and persists to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AuthConsumer onAuth={() => {}} />
      </AuthProvider>
    );

    await user.click(screen.getByTestId('login'));

    expect(screen.getByTestId('status').textContent).toBe('logged-in:alice');
    expect(localStorage.getItem('bottomline_auth')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('bottomline_auth')!).username).toBe('alice');
    expect(localStorage.getItem('api_key')).toBe('key1');
  });

  it('logout() clears auth and localStorage', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AuthConsumer onAuth={() => {}} />
      </AuthProvider>
    );

    await user.click(screen.getByTestId('login'));
    expect(screen.getByTestId('status').textContent).toBe('logged-in:alice');

    await user.click(screen.getByTestId('logout'));
    expect(screen.getByTestId('status').textContent).toBe('logged-out');
    expect(localStorage.getItem('bottomline_auth')).toBeNull();
    expect(localStorage.getItem('api_key')).toBeNull();
  });

  it('restores auth from localStorage on mount', () => {
    const stored = { player_id: 'p2', api_key: 'key2', city_id: 'c2', username: 'bob' };
    localStorage.setItem('bottomline_auth', JSON.stringify(stored));

    render(
      <AuthProvider>
        <AuthConsumer onAuth={() => {}} />
      </AuthProvider>
    );

    expect(screen.getByTestId('status').textContent).toBe('logged-in:bob');
    expect(localStorage.getItem('api_key')).toBe('key2');
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('bottomline_auth', 'not-json{{{');

    render(
      <AuthProvider>
        <AuthConsumer onAuth={() => {}} />
      </AuthProvider>
    );

    expect(screen.getByTestId('status').textContent).toBe('logged-out');
  });

  it('useAuth throws when used outside AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<AuthConsumer onAuth={() => {}} />)).toThrow(
      'useAuth must be within AuthProvider'
    );
    consoleError.mockRestore();
  });
});
