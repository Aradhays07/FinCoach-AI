import { createContext, useContext, useState, useEffect } from 'react';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('fc_token'));
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    const s = localStorage.getItem('fc_user');
    if (s && token) { try { setUser(JSON.parse(s)); } catch {} }
    setLoading(false);
  }, [token]);
  const login = (u, t) => {
    setUser(u); setToken(t);
    setSessionExpired(false);
    localStorage.setItem('fc_token', t);
    localStorage.setItem('fc_user', JSON.stringify(u));
  };
  const logout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem('fc_token');
    localStorage.removeItem('fc_user');
  };
  // FIX (bug #3): JWTs expire after 7 days and the frontend had no refresh
  // logic — every protected call would then silently 401 and dashboards
  // showed blank '—' everywhere with no explanation. Now any 401 anywhere
  // in the app logs the user out and the login screen tells them why.
  useEffect(() => {
    const onUnauthorized = () => {
      if (localStorage.getItem('fc_token')) {
        setSessionExpired(true);
        logout();
      }
    };
    window.addEventListener('fc:unauthorized', onUnauthorized);
    return () => window.removeEventListener('fc:unauthorized', onUnauthorized);
  }, []);
  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, isAuthenticated: !!user, sessionExpired, clearSessionExpired: () => setSessionExpired(false) }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
