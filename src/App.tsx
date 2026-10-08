import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import MfaChallenge from './components/MfaChallenge';

// Root: providers wrap the app. Auth gate shows AuthScreen or Dashboard.
function Gate() {
  const { session, loading, mfaChallengeRequired } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-muted text-sm">
        Loading…
      </div>
    );
  }
  if (mfaChallengeRequired) return <MfaChallenge />;
  return session ? <Dashboard /> : <AuthScreen />;
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
