import { useState } from 'react';
import { Eye, EyeOff, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Sign-in / sign-up screen with extended fields.
// Sign-up collects: first name, last name, email, phone, password, confirm password.
// Includes password visibility toggle (eye icon).
export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      // Validate fields
      if (!firstName.trim() || !lastName.trim()) {
        setError('First name and last name are required.');
        return;
      }
      if (!email.trim()) {
        setError('Email is required.');
        return;
      }
      if (!phone.trim()) {
        setError('Phone number is required.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    if (mode === 'signin') {
      const { error } = await signIn(email.trim(), password);
      if (error) setError(error);
    } else {
      const { error } = await signUp(
        email.trim(),
        password,
        'user',
        { first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() },
      );
      if (error) {
        setError(error);
      } else {
        setError('Account created successfully. You can now sign in.');
      }
    }
    setLoading(false);
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
  };

  const inputClass = "w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors pr-10";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg text-text">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Quantum Intelligence</h1>
            <p className="text-xs text-muted">AI Trading Intelligence Platform</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <>
              {/* First name + Last name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1.5">First Name</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Last Name</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                    placeholder="Doe"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs text-muted mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs text-muted mb-1.5">Phone</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Password with eye toggle */}
              <div>
                <label className="block text-xs text-muted mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password with eye toggle */}
              <div>
                <label className="block text-xs text-muted mb-1.5">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {mode === 'signin' && (
            <>
              {/* Email */}
              <div>
                <label className="block text-xs text-muted mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              {/* Password with eye toggle */}
              <div>
                <label className="block text-xs text-muted mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-black dark:text-black font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={toggleMode}
          className="w-full mt-4 text-sm text-muted hover:text-text transition-colors"
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}

