import Link from 'next/link'
import styles from './LandingPage.module.css'

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <h2 className={styles.srOnly}>Pulsed — trading journal landing page</h2>

      <nav className={styles.nav}>
        <div className={styles.logo}>
          <span>pulsed</span>
        </div>
        <div className={styles.navLinks}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link href="/auth?mode=login">Log in</Link>
        </div>
        <Link href="/auth?mode=signup" className={styles.navCta}>
          Get started
        </Link>
      </nav>

      <div className={styles.hero}>
        <div className={styles.heroBadge}>Built for serious traders</div>
        <h1>
          Your trading journal,
          <br />
          <em>finally done right</em>
        </h1>
        <p>Pulsed gives you deep insights into your trades — without the bloated price tag. Track, analyze, and grow your edge.</p>
        <div className={styles.heroBtns}>
          <Link href="/auth?mode=signup" className={styles.btnPrimary}>
            Start for free
          </Link>
          <a href="#features" className={styles.btnSecondary}>
            See features
          </a>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statNum}>10k+</div>
          <div className={styles.statLabel}>trades logged</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>500+</div>
          <div className={styles.statLabel}>active traders</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>4.9</div>
          <div className={styles.statLabel}>avg rating</div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>The problem</div>
        <div className={styles.sectionTitle}>Most trading journals miss the point</div>
        <div className={styles.sectionSub}>Traders deserve real analytics — not spreadsheets or overpriced tools that barely scratch the surface.</div>
        <div className={styles.problemCards}>
          <div className={styles.probCard}>
            <div className={styles.probIcon}>📊</div>
            <h3>Shallow analytics</h3>
            <p>Basic win/loss ratios don't help you understand why you're losing.</p>
          </div>
          <div className={styles.probCard}>
            <div className={styles.probIcon}>💸</div>
            <h3>Overpriced tools</h3>
            <p>Enterprise pricing for tools most retail traders don't need.</p>
          </div>
          <div className={styles.probCard}>
            <div className={styles.probIcon}>🧩</div>
            <h3>Clunky experience</h3>
            <p>Outdated UIs that make logging trades a chore, not a habit.</p>
          </div>
        </div>
      </div>

      <div className={styles.section} id="features">
        <div className={styles.sectionLabel}>Features</div>
        <div className={styles.sectionTitle}>Everything you need to trade smarter</div>
        <div className={styles.sectionSub}>Pulsed is built from the ground up with traders in mind — from day one entry to deep performance breakdowns.</div>
        <div className={styles.featuresGrid}>
          <div className={styles.featCard}>
            <div className={styles.featDot}></div>
            <h3>In-depth trade analytics</h3>
            <p>Go beyond win rate. Track R-multiples, drawdowns, hold time, and more across every session.</p>
          </div>
          <div className={styles.featCard}>
            <div className={styles.featDot}></div>
            <h3>Trade tagging & filtering</h3>
            <p>Tag trades by strategy, setup, or session. Filter your journal to surface what's actually working.</p>
          </div>
          <div className={styles.featCard}>
            <div className={styles.featDot}></div>
            <h3>Performance calendar</h3>
            <p>Visualize your daily P&L on a heatmap calendar. Spot your best days, worst days, and patterns.</p>
          </div>
          <div className={styles.featCard}>
            <div className={styles.featDot}></div>
            <h3>Notebook & reflections</h3>
            <p>Write notes, attach screenshots, and build a library of lessons from your trading history.</p>
          </div>
          <div className={styles.featCard}>
            <div className={styles.featDot}></div>
            <h3>Risk & psychology tracking</h3>
            <p>Log your mindset before each session. Discover how emotion affects your execution.</p>
          </div>
          <div className={styles.featCard}>
            <div className={styles.featDot}></div>
            <h3>Affordable by design</h3>
            <p>No tiered feature locks. Everything is included — for a fraction of what competitors charge.</p>
          </div>
        </div>
      </div>

      <div className={styles.section} id="pricing">
        <div className={styles.sectionLabel}>Pricing</div>
        <div className={styles.sectionTitle}>Simple, honest pricing</div>
        <div className={styles.sectionSub}>No hidden fees. No feature gating. Just full access at a price that makes sense.</div>
        <div className={styles.pricingWrap}>
          <div className={styles.priceCard}>
            <div className={styles.pricePlan}>Monthly</div>
            <div className={styles.priceAmount}>
              $9.99<span>/mo</span>
            </div>
            <div className={styles.priceSave}>&nbsp;</div>
            <ul className={styles.priceFeatures}>
              <li>
                <span className={styles.check}></span>Unlimited trade logs
              </li>
              <li>
                <span className={styles.check}></span>Full analytics suite
              </li>
              <li>
                <span className={styles.check}></span>Trade tagging & filtering
              </li>
              <li>
                <span className={styles.check}></span>Performance calendar
              </li>
              <li>
                <span className={styles.check}></span>Notebook & reflections
              </li>
            </ul>
            <Link href="/auth?mode=signup" className={styles.priceBtn}>
              Get started
            </Link>
          </div>
          <div className={`${styles.priceCard} ${styles.featured}`}>
            <div className={styles.bestBadge}>Best value</div>
            <div className={styles.pricePlan}>Yearly</div>
            <div className={styles.priceAmount}>
              $99.99<span>/yr</span>
            </div>
            <div className={styles.priceSave}>Save ~$20 vs monthly</div>
            <ul className={styles.priceFeatures}>
              <li>
                <span className={styles.check}></span>Unlimited trade logs
              </li>
              <li>
                <span className={styles.check}></span>Full analytics suite
              </li>
              <li>
                <span className={styles.check}></span>Trade tagging & filtering
              </li>
              <li>
                <span className={styles.check}></span>Performance calendar
              </li>
              <li>
                <span className={styles.check}></span>Notebook & reflections
              </li>
            </ul>
            <Link href="/auth?mode=signup" className={`${styles.priceBtn} ${styles.filled}`}>
              Get started
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Testimonials</div>
        <div className={styles.sectionTitle}>Traders love Pulsed</div>
        <div className={styles.testimonials}>
          <div className={styles.testiCard}>
            <div className={styles.stars}>★★★★★</div>
            <div className={styles.testiText}>"Finally a journal that shows me where I'm actually leaking money. The analytics are incredibly detailed for the price."</div>
            <div className={styles.testiName}>Marcus T.</div>
            <div className={styles.testiRole}>Forex trader, 3 years</div>
          </div>
          <div className={styles.testiCard}>
            <div className={styles.stars}>★★★★★</div>
            <div className={styles.testiText}>"I switched from a $60/month tool to Pulsed and honestly get more out of it. The tagging system alone changed how I review my trades."</div>
            <div className={styles.testiName}>Aisha K.</div>
            <div className={styles.testiRole}>Stocks & options trader</div>
          </div>
          <div className={styles.testiCard}>
            <div className={styles.stars}>★★★★★</div>
            <div className={styles.testiText}>"The psychology tracking feature is underrated. Logging my mindset before sessions helped me realize I was overtrading on Mondays."</div>
            <div className={styles.testiName}>Dev R.</div>
            <div className={styles.testiRole}>Crypto day trader</div>
          </div>
        </div>
      </div>

      <div className={styles.ctaBlock}>
        <h2>Start building your edge today</h2>
        <p>Join hundreds of traders using Pulsed to trade smarter, not harder.</p>
        <Link href="/auth?mode=signup" className={styles.btnPrimary} style={{ fontSize: '16px', padding: '14px 36px' }}>
          Get started for free
        </Link>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerLogo}>pulsed</div>
        <div className={styles.footerLinks}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
        </div>
        <div className={styles.footerCopy}>© 2026 Pulsed. All rights reserved.</div>
      </footer>
    </div>
  )
}
