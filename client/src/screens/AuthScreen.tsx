import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { registerPlayer, getProfile } from '../api';
import { useAuth } from '../auth';

export default function AuthScreen() {
  const { login } = useAuth();
  const [mode, setMode] = useState<'register' | 'login'>('register');

  // Register form
  const [username, setUsername] = useState('');

  // Manual login (paste existing credentials)
  const [loginPlayerId, setLoginPlayerId] = useState('');
  const [loginApiKey, setLoginApiKey] = useState('');
  const [loginCityId, setLoginCityId] = useState('');
  const [loginUsername, setLoginUsername] = useState('');

  const register = useMutation({
    mutationFn: async () => {
      const data = await registerPlayer(username.trim());
      // Temporarily set the key so getProfile() can authenticate
      localStorage.setItem('api_key', data.api_key);
      const profile = await getProfile();
      return { ...data, city_id: profile.city_id, username: profile.username };
    },
    onSuccess: (data) => {
      login({ player_id: data.player_id, api_key: data.api_key, city_id: data.city_id, username: data.username });
    },
    onError: () => {
      localStorage.removeItem('api_key');
    },
  });

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    login({ player_id: loginPlayerId.trim(), api_key: loginApiKey.trim(), city_id: loginCityId.trim(), username: loginUsername.trim() });
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-widest">
            <span className="text-indigo-400">TRADE</span>
            <span className="text-gray-600">MMO</span>
          </h1>
          <p className="text-gray-600 text-xs mt-2 tracking-widest uppercase">Open World Economy</p>
        </div>

        {/* Tab toggle */}
        <div className="flex border border-gray-200 rounded mb-6 text-sm">
          {(['register', 'login'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded transition-colors capitalize ${mode === m ? 'bg-indigo-600 text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {m === 'register' ? 'New Player' : 'Returning Player'}
            </button>
          ))}
        </div>

        {mode === 'register' ? (
          <form onSubmit={(e) => { e.preventDefault(); register.mutate(); }} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1 uppercase tracking-wider">Username</label>
              <input
                className="w-full bg-white border border-gray-200 rounded px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-indigo-500"
                placeholder="your_handle"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <p className="text-gray-600 text-xs">You'll be placed in a random city to start.</p>

            {register.isError && (
              <p className="text-rose-400 text-xs bg-rose-900/20 border border-rose-800 rounded px-3 py-2">
                {(register.error as Error).message}
              </p>
            )}

            <button
              type="submit"
              disabled={register.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-gray-900 py-2.5 rounded text-sm font-semibold transition-colors"
            >
              {register.isPending ? 'Registering…' : 'Create Character'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            {[
              { label: 'Username',  val: loginUsername,  set: setLoginUsername  },
              { label: 'Player ID', val: loginPlayerId,  set: setLoginPlayerId  },
              { label: 'API Key',   val: loginApiKey,    set: setLoginApiKey    },
              { label: 'City ID',   val: loginCityId,    set: setLoginCityId    },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <label className="block text-xs text-gray-600 mb-1 uppercase tracking-wider">{label}</label>
                <input
                  className="w-full bg-white border border-gray-200 rounded px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-indigo-500 font-mono"
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  required
                />
              </div>
            ))}
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-gray-900 py-2.5 rounded text-sm font-semibold transition-colors"
            >
              Enter Game
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

