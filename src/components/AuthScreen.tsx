import { useEffect, useState } from 'react';
import { Eye, EyeOff, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Sign-in / sign-up screen with extended fields.
// Sign-up collects: first name, last name, email, phone, password, confirm password.
// Includes password visibility toggle (eye icon).
interface Props {
  initialMode?: 'signin' | 'signup';
  onHome?: () => void;
  onModeChange?: (mode: 'signin' | 'signup') => void;
}

export default function AuthScreen({ initialMode = 'signin', onHome, onModeChange }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordStrong = password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

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
      if (!passwordStrong) {
        setError('Password must be at least 12 characters and include uppercase, lowercase, and a number.');
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
        setNotice('Account created successfully. You can now sign in.');
      }
    }
    setLoading(false);
  };

  const toggleMode = () => {
    const nextMode = mode === 'signin' ? 'signup' : 'signin';
    setMode(nextMode);
    onModeChange?.(nextMode);
    setError(null);
    setNotice(null);
  };

  const inputClass = "w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors pr-10";

  return (
    <main className="auth-screen">
      <aside className="auth-story">
        <a className="auth-back-home" href="/" onClick={(event) => { event.preventDefault(); onHome?.(); }}><span>←</span> Back to overview</a>
        <div className="auth-story-content">
          <div className="auth-story-kicker"><Activity aria-hidden="true" /> MARKET INTELLIGENCE, IN CONTEXT</div>
          <h1>Bring your market workflow into focus.</h1>
          <p>Price action, supporting evidence, and risk oversight—connected in one workspace.</p>
          <div className="auth-story-visual" aria-hidden="true"><div /><div /><div /><div /><div /><div /><div /><div /><div /><div /><div /><div /></div>
          <div className="auth-story-foot"><span>01 / 03</span><span>Understand the full picture</span></div>
        </div>
      </aside>
      <section className="auth-form-column">
      <div className="auth-form-card animate-fade-in">
        <a className="auth-mobile-brand" href="/" onClick={(event) => { event.preventDefault(); onHome?.(); }}><span><Activity aria-hidden="true" /></span><strong>Quantum <small>INTELLIGENCE</small></strong></a>
        <div className="auth-form-heading"><span>{mode === 'signin' ? 'WELCOME BACK' : 'GET STARTED'}</span><h2>{mode === 'signin' ? 'Sign in to your workspace' : 'Create your account'}</h2><p>{mode === 'signin' ? 'Pick up where your market research left off.' : 'Set up your secure workspace in a few steps.'}</p></div>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <>
              {/* First name + Last name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="signup-first-name" className="block text-xs text-muted mb-1.5">First Name</label>
                  <input
                    id="signup-first-name"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label htmlFor="signup-last-name" className="block text-xs text-muted mb-1.5">Last Name</label>
                  <input
                    id="signup-last-name"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                    placeholder="Doe"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-xs text-muted mb-1.5">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="signup-phone" className="block text-xs text-muted mb-1.5">Phone</label>
                <input
                  id="signup-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Password with eye toggle */}
              <div>
                <label htmlFor="password" className="block text-xs text-muted mb-1.5">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={12}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="12+ chars, upper/lowercase and a number"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password with eye toggle */}
              <div>
                <label htmlFor="confirm-password" className="block text-xs text-muted mb-1.5">Confirm Password</label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={12}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    placeholder="12+ chars, upper/lowercase and a number"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
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
                <label htmlFor="email" className="block text-xs text-muted mb-1.5">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              {/* Password with eye toggle */}
              <div>
                <label htmlFor="password" className="block text-xs text-muted mb-1.5">Password</label>
                <div className="relative">
                  <input
                    id="password"
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
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div role="alert" className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {notice && <div role="status" className="text-sm text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2">{notice}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-black font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={toggleMode}
          className="w-full mt-4 text-sm text-muted hover:text-text transition-colors"
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
      </section>
    </main>
  );
}
