import { Activity, ArrowRight, BarChart3, Brain, Moon, ShieldCheck, Sun } from 'lucide-react';
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

        <div className="landing-review" aria-labelledby="landing-review-title">
          <p className="landing-review-label">A clear review process</p>
          <h2 id="landing-review-title">From market data to a decision you can inspect.</h2>
          <ol>
            <li><span>01</span><div><strong>Read the context</strong><p>Compare price action across supported markets and timeframes.</p></div></li>
            <li><span>02</span><div><strong>Check the evidence</strong><p>Review the signals and uncertainty behind an analysis.</p></div></li>
            <li><span>03</span><div><strong>Evaluate on paper</strong><p>Track a hypothetical decision without placing a live order.</p></div></li>
          </ol>
          <p className="landing-review-note"><ShieldCheck aria-hidden="true" /> Paper trading only. No broker execution.</p>
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
