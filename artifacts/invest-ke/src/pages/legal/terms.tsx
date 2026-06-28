import { Layout } from "@/components/layout";

export default function Terms() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground text-sm">Effective: June 21, 2026 &nbsp;|&nbsp; Last Updated: June 21, 2026</p>
        </div>

        <div className="space-y-7 text-sm leading-7 text-muted-foreground">

          <Section title="1. Acceptance of Terms">
            <p>By creating an account on Zenti ("Platform", "we", "us") at <strong>zenti-investment-kenya.vercel.app</strong> and using our services, you ("User") agree to be bound by these Terms of Service. If you do not agree, do not use the Platform. We reserve the right to update these Terms; continued use constitutes acceptance of any changes.</p>
          </Section>

          <Section title="2. Eligibility">
            <p>You must be at least 18 years of age and a resident of Kenya. By registering, you confirm all information provided is accurate and complete. Zenti reserves the right to suspend accounts that violate eligibility requirements.</p>
            <p className="mt-2 font-medium text-foreground">One account per person: You may only operate a single Zenti account. Creation of multiple accounts for any reason — including to access the Internship Package more than once or to abuse referral bonuses — is a material violation of these Terms and will result in immediate account suspension.</p>
          </Section>

          <Section title="3. Investment Plans">
            <p>Zenti offers investment packages including a free 2-Day Internship Package for new users and premium paid plans. By investing you agree that:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Invested funds are deducted from your Zenti wallet upon plan activation.</li>
              <li>Daily return rates and expected totals are fixed and displayed before you invest.</li>
              <li>Minimum deposit amounts apply per plan as shown at the time of selection.</li>
              <li>All plans have a defined duration, after which your principal and earnings become available for withdrawal.</li>
            </ul>
          </Section>

          <Section title="4. Daily Claiming — CRITICAL RULE">
            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
              <p className="text-orange-800 font-bold mb-2">⚠️ You MUST claim your earnings every day</p>
              <ul className="list-disc pl-4 space-y-1 text-orange-700">
                <li>Daily earnings are <strong>NOT automatically credited</strong> to your wallet.</li>
                <li>You must log in and click <strong>"Claim Earnings"</strong> on your dashboard every day.</li>
                <li>Earnings must be claimed before <strong>11:59 PM Kenya Time (EAT)</strong>.</li>
                <li>Unclaimed earnings <strong>expire permanently at midnight</strong> and cannot be recovered.</li>
                <li>Zenti bears no liability for earnings lost due to failure to claim on time.</li>
              </ul>
            </div>
          </Section>

          <Section title="5. Withdrawal Policy">
            <p>Withdrawals are subject to the following rules:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Last Day Only:</strong> Withdrawals are permitted <em>only on the last calendar day</em> of your active investment plan.</li>
              <li><strong>Active Plan Required:</strong> You must have an active investment plan to be eligible for a withdrawal.</li>
              <li><strong>Processing Fee:</strong> Up to 10% fee applies on all withdrawals.</li>
              <li><strong>Minimum Withdrawal:</strong> KES 200 minimum applies.</li>
              <li><strong>Cooldown:</strong> A minimum waiting period between withdrawal requests may apply.</li>
              <li><strong>Processing Time:</strong> Approved withdrawals are processed within 24 hours (M-Pesa/Airtel) or 1–3 business days (bank).</li>
            </ul>
          </Section>

          <Section title="6. Referral Program">
            <p>Zenti's referral program allows you to earn bonuses for bringing in new users. Referral bonuses are credited automatically and subject to withdrawal rules. Fraudulent referrals (self-referrals, fake accounts, systematic abuse) result in account termination and forfeiture of all bonuses and balances.</p>
          </Section>

          <Section title="7. M-Pesa Deposits">
            <p>Deposits are processed via M-Pesa STK Push through our licensed payment partner. You authorize Zenti to initiate payment requests to your registered phone. Deposits are credited instantly on confirmation. Zenti is not liable for delays caused by M-Pesa network issues.</p>
          </Section>

          <Section title="8. Account Security">
            <p>You are responsible for the security of your account credentials. Never share your password or OTP with anyone — Zenti staff will never ask for these. Report suspected unauthorized access to us immediately. Zenti is not liable for losses caused by your own negligence in protecting your credentials.</p>
          </Section>

          <Section title="9. Prohibited Activities">
            <p>You may not: use bots or scripts to interact with the platform; create multiple accounts to abuse the Internship Package or referral bonuses; attempt to hack or manipulate platform features; use Zenti for money laundering or any illegal activity; or provide false information. Violations result in immediate account suspension, forfeiture of balances, and referral to Kenyan authorities.</p>
          </Section>

          <Section title="10. Appeal Approval & Account Reset Policy">
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-3">
              <p className="text-amber-900 font-bold mb-1">⚠️ Approved appeals result in a full account reset</p>
              <p className="text-amber-800 text-sm">If your ban appeal is approved — whether by our automated system or a human reviewer — your account will be reinstated in a <strong>clean starting state</strong>. This is a mandatory, non-negotiable part of the reinstatement process.</p>
            </div>
            <p>The following will happen automatically when an appeal is approved:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>All active investment plans are cancelled</strong> — any plans running at the time of the ban will not be restored.</li>
              <li><strong>Wallet balance is reset to KES 0</strong> — any remaining balance at the time of the ban is forfeited.</li>
              <li><strong>Referral progress is reset</strong> — your referral tier, countdown, and program status return to the initial state. Your referral code remains usable.</li>
              <li><strong>Internship Package eligibility is restored</strong> — you may use the free 2-day Internship Package once again as a fresh user.</li>
              <li><strong>Unclaimed earnings are expired</strong> — any pending claimable earnings are cleared.</li>
            </ul>
            <p className="mt-3">This reset policy exists to ensure accountability and a fair starting point for reinstated accounts. <strong>No exceptions or partial resets are available.</strong> By submitting an appeal you acknowledge and accept these terms.</p>
          </Section>

          <Section title="11. Fraud Detection & Automatic Account Suspension">
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-3">
              <p className="text-red-800 font-bold mb-2">🚫 Our automated system detects and bans fraudulent accounts</p>
              <p className="text-red-700">Zenti operates a real-time fraud detection system that monitors all registrations and activities. Accounts may be <strong>automatically suspended without prior notice</strong> if the system detects any of the following:</p>
            </div>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <strong>Duplicate Phone Number:</strong> If your phone number is already associated with another Zenti account — whether that account was created by you or someone else — the newer account will be automatically suspended. Only one account is permitted per phone number.
              </li>
              <li>
                <strong>IP Address Pattern:</strong> If more than two accounts are registered from the same public IP address within a 60-minute window, all accounts from that IP may be suspended. This applies to shared networks (offices, internet cafés, etc.). We track IP addresses of all registrations.
              </li>
              <li>
                <strong>Device Fingerprint:</strong> We collect and analyse unique device identifiers including your browser type, operating system, device model, screen resolution, installed fonts, and other technical characteristics. If more than two accounts are created from the same device within a 24-hour period, all accounts may be suspended.
              </li>
              <li>
                <strong>Behavioral Patterns:</strong> Unusual registration patterns, abnormal referral activity, atypical login behaviour, or other signals consistent with automated account creation may trigger automatic suspension.
              </li>
              <li>
                <strong>SIM-Card or Phone Hardware Identifiers:</strong> Where technically available, we may collect device hardware identifiers to confirm device uniqueness.
              </li>
            </ul>
            <p className="mt-3">
              <strong>Important:</strong> These checks are performed automatically by our system. Suspension happens silently — you will not be denied at the point of registration, but your account may be suspended shortly after. You will receive a suspension email with instructions.
            </p>
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 font-medium">📬 How to Appeal a Suspension</p>
              <p className="text-blue-700 mt-1">If you believe your account was suspended in error, you may submit an appeal via <a href="/support" className="underline font-medium">our support page</a>. Include your full name, registered email, phone number, and a brief explanation. Appeals are reviewed within 24–48 business hours. Accounts confirmed to be fraudulent will not be reinstated.</p>
            </div>
          </Section>

          <Section title="11. Platform Disclosure">
            <p>Zenti is a digital investment platform offering fixed daily returns to registered users. It is not a licensed bank or regulated financial institution under the Central Bank of Kenya Act and is not covered by the Kenya Deposit Protection Fund. All plan returns and durations are displayed transparently before you invest. Zenti processes all payments through licensed payment partners and operates in compliance with applicable Kenyan laws.</p>
          </Section>

          <Section title="12. Limitation of Liability">
            <p>To the maximum extent permitted by law, Zenti and its directors, employees, and agents are not liable for any indirect, incidental, or consequential damages arising from your use of the platform, including earnings lost due to failure to claim on time, network outages, or technical failures.</p>
          </Section>

          <Section title="13. Governing Law">
            <p>These Terms are governed by the laws of Kenya. Disputes are subject to the exclusive jurisdiction of the courts of Nairobi, Kenya.</p>
          </Section>

          <Section title="14. Contact">
            <p>Questions about these Terms? Contact our support team via <a href="/support" className="text-primary underline">our support page</a>.</p>
          </Section>
        </div>
      </div>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-bold text-foreground mb-2">{title}</h2>
      {children}
    </div>
  );
}
