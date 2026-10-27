import { Activity, ArrowRight, BarChart3, Brain, Moon, ShieldCheck, Sun, TrendingUp } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface Props {
  onSignIn: () => void;
  onSignUp: () => void;
}

export default function LandingPage({ onSignIn, onSignUp }: Props) {
  const { theme, toggle } = useTheme();

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" onClick={(event) => { event.preventDefault(); window.history.pushState({}, '', '/'); }}>
          <span className="landing-brand-mark"><Activity aria-hidden="true" /></span>
          <span>Quantum <small>INTELLIGENCE</small></span>
        </a>
        <nav className="landing-nav-links" aria-label="Landing page">
          <a href="#platform">Platform</a>
          <a href="#principles">Principles</a>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="landing-theme-toggle" onClick={toggle} aria-label="Toggle theme" title="Toggle theme">
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <button type="button" className="landing-sign-in" onClick={onSignIn}>Sign in</button>
          <button type="button" className="landing-nav-cta" onClick={onSignUp}>Get started <ArrowRight aria-hidden="true" /></button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <div className="landing-eyebrow"><span /> CRYPTO &amp; COMMODITY MARKET RESEARCH</div>
          <h1>Make every market decision <em>make sense.</em></h1>
          <p className="landing-lede">Research crypto and commodity markets with explainable analysis and a paper-trading workflow. Every decision stays reviewable: no live orders or real-money execution.</p>
          <div className="landing-hero-actions">
            <button type="button" className="landing-primary-cta" onClick={onSignUp}>Create your workspace <ArrowRight aria-hidden="true" /></button>
            <button type="button" className="landing-secondary-cta" onClick={onSignIn}>Sign in <span>Already have an account?</span></button>
          </div>
          <div className="landing-proof-row">
            <span><Activity aria-hidden="true" /> Crypto &amp; commodity markets</span>
            <span><Brain aria-hidden="true" /> Evidence you can inspect</span>
            <span><ShieldCheck aria-hidden="true" /> Paper trading only</span>
          </div>
        </div>

        <div className="landing-preview" aria-label="Illustrative preview of the market intelligence workspace">
          <div className="preview-window-bar"><div className="preview-brand"><span className="preview-mark"><Activity aria-hidden="true" /></span><span>Market workspace</span></div><span className="preview-label">ILLUSTRATIVE PREVIEW</span></div>
          <div className="preview-market-row"><div><small>MARKET STRUCTURE</small><strong>Price action</strong></div><span className="preview-status"><i /> Context view</span></div>
          <div className="preview-chart-wrap">
            <div className="preview-chart-labels"><span>Trend context</span><span>Signal map</span></div>
            <svg className="preview-chart" viewBox="0 0 720 250" role="img" aria-label="Illustrative market chart with trend and signal overlays" preserveAspectRatio="none">
              <defs><linearGradient id="preview-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".22" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
              {[38, 88, 138, 188, 238].map((y) => <line key={y} x1="0" y1={y} x2="720" y2={y} className="preview-gridline" />)}
              <path d="M0 188 C38 176 46 153 79 164 S126 137 155 150 S201 120 232 139 S281 108 312 126 S355 95 386 112 S428 123 455 100 S502 111 531 76 S573 92 602 60 S652 79 680 38 S706 50 720 28 L720 250 L0 250Z" fill="url(#preview-fill)" />
              <path d="M0 188 C38 176 46 153 79 164 S126 137 155 150 S201 120 232 139 S281 108 312 126 S355 95 386 112 S428 123 455 100 S502 111 531 76 S573 92 602 60 S652 79 680 38 S706 50 720 28" className="preview-line" />
              <path d="M0 204 C46 194 62 187 100 184 S162 168 195 165 S251 156 287 151 S345 145 378 139 S433 134 469 126 S522 120 559 108 S613 98 650 86 S693 76 720 70" className="preview-average" />
              <circle cx="531" cy="76" r="5" className="preview-point" /><circle cx="531" cy="76" r="12" className="preview-point-halo" />
            </svg>
            <div className="preview-axis"><span>Structure</span><span>Momentum</span><span>Risk review</span><span>Decision</span></div>
          </div>
          <div className="preview-insights">
            <div className="preview-insight"><span className="preview-insight-icon"><TrendingUp aria-hidden="true" /></span><div><small>MARKET CONTEXT</small><strong>Trend & momentum</strong></div><span className="preview-insight-state">IN VIEW</span></div>
            <div className="preview-insight"><span className="preview-insight-icon"><Brain aria-hidden="true" /></span><div><small>SUPPORTING EVIDENCE</small><strong>Signals with reasoning</strong></div><span className="preview-insight-state">TRACEABLE</span></div>
            <div className="preview-insight"><span className="preview-insight-icon"><ShieldCheck aria-hidden="true" /></span><div><small>RISK OVERSIGHT</small><strong>Review before action</strong></div><span className="preview-insight-state">BUILT IN</span></div>
          </div>
        </div>
      </section>

      <section id="platform" className="landing-platform">
        <div className="landing-section-heading"><span>THE WORKSPACE</span><h2>Research with the reasoning in view.</h2><p>Explore market context, inspect the evidence, and review risk without live execution.</p></div>
        <div className="landing-feature-grid">
          <article><span className="landing-feature-icon"><BarChart3 aria-hidden="true" /></span><h3>Explore market context</h3><p>Review crypto and commodity price action alongside timeframe context.</p></article>
          <article><span className="landing-feature-icon"><Brain aria-hidden="true" /></span><h3>Inspect the reasoning</h3><p>See supporting evidence and uncertainty instead of relying on a black box.</p></article>
          <article><span className="landing-feature-icon"><ShieldCheck aria-hidden="true" /></span><h3>Keep it paper-only</h3><p>Evaluate ideas in a paper-trading workflow without live broker execution.</p></article>
        </div>
      </section>

      <footer id="principles" className="landing-footer"><span>Quantum Intelligence</span><span>Built for deliberate, evidence-led market research.</span><button type="button" onClick={onSignIn}>Open workspace <ArrowRight aria-hidden="true" /></button></footer>
    </main>
  );
}
