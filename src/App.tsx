import { AuthProvider, useAuth } from './context/AuthContext';
import { useEffect, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import LandingPage from './components/LandingPage';
import ErrorBoundary from './components/ErrorBoundary';
import MfaChallenge from './components/MfaChallenge';

function Gate() {
  const { session, loading, mfaChallengeRequired } = useAuth();
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  const navigate = (path: '/login' | '/signup' | '/') => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setPathname(path);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-muted text-sm">
        Loading…
      </div>
    );
  }
  if (mfaChallengeRequired) return <MfaChallenge />;
  if (session) return <Dashboard />;
  if (pathname === '/login' || pathname === '/signup') {
    return <AuthScreen initialMode={pathname === '/signup' ? 'signup' : 'signin'} onHome={() => navigate('/')} onModeChange={(mode) => navigate(mode === 'signup' ? '/signup' : '/login')} />;
  }
  return <LandingPage onSignIn={() => navigate('/login')} onSignUp={() => navigate('/signup')} />;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <Gate />
        </ErrorBoundary>
      </ThemeProvider>
    </AuthProvider>
  );
}
