import { Layout } from "@/components/layout";

export default function Privacy() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">Effective: June 21, 2026 &nbsp;|&nbsp; Last Updated: June 21, 2026</p>
        </div>

        <div className="space-y-7 text-sm leading-7 text-muted-foreground">

          <Section title="1. Introduction">
            <p>Zenti ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use our platform at <strong>zenti-investment-kenya.vercel.app</strong>. By using Zenti, you consent to the practices described here. This policy complies with Kenya's Data Protection Act, 2019.</p>
          </Section>

          <Section title="2. Information We Collect">
            <p>We collect the following categories of personal data:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Account Information:</strong> Your full name, email address, phone number, and password (stored hashed and irreversible).</li>
              <li><strong>Financial Information:</strong> Transaction history, wallet balance, investment history, withdrawal requests, and M-Pesa payment references.</li>
              <li><strong>Identity Verification:</strong> National ID information where required for AML compliance.</li>
              <li>
                <strong>Device & Technical Identifiers (for fraud detection):</strong> We collect and store the following at the time of account registration and during use of our platform:
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-muted-foreground">
                  <li>IP address (both IPv4 and IPv6)</li>
                  <li>Browser type, version, and user-agent string</li>
                  <li>Operating system and device type</li>
                  <li>Screen resolution and timezone</li>
                  <li>Accepted language settings</li>
                  <li>Device fingerprint (a unique hash derived from technical device characteristics)</li>
                  <li>Session logs and login timestamps</li>
                </ul>
                <p className="mt-1">This data is used exclusively for fraud prevention, duplicate account detection, and platform security. It is <strong>not</strong> shared with advertisers.</p>
              </li>
              <li><strong>Communication Data:</strong> Support tickets and correspondence you send us.</li>
              <li><strong>Referral Data:</strong> Referral codes used, referrals made, and bonus history.</li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>Your data is used to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Provide and manage your account and investment portfolio.</li>
              <li>Process deposits, withdrawals, and earnings.</li>
              <li>Send transactional emails, OTP codes, and WhatsApp notifications related to your account.</li>
              <li>Detect and prevent fraud, money laundering, duplicate accounts, and security threats — including automated suspension of accounts that violate our one-account-per-person policy.</li>
              <li>Comply with Kenyan legal and regulatory obligations.</li>
              <li>Improve our platform features and user experience.</li>
              <li>Send daily earning claim reminders to help you avoid losing earnings.</li>
            </ul>
          </Section>

          <Section title="4. Fraud Detection & Device Fingerprinting">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-3">
              <p className="text-yellow-800 font-semibold mb-1">🔍 How our fraud detection works</p>
              <p className="text-yellow-700">Zenti uses automated fraud detection to protect the platform and genuine users from abuse. This system is active at all times.</p>
            </div>
            <p className="mt-2">When you register, we record your <strong>IP address</strong>, <strong>device fingerprint</strong> (a unique identifier derived from your device's technical characteristics), and your Kenyan <strong>phone number</strong>. Our system then checks:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Whether any other account has been registered with your phone number</li>
              <li>Whether more than 2 accounts have been registered from your IP address in the past 60 minutes</li>
              <li>Whether more than 2 accounts have been registered from your device in the past 24 hours</li>
            </ul>
            <p className="mt-3">If any of these checks identify a violation, the account(s) may be <strong>automatically suspended</strong>. You will receive a notification email explaining the reason and how to appeal.</p>
            <p className="mt-2">The legal basis for this processing is our <strong>legitimate interest</strong> in preventing fraud and protecting the financial integrity of the platform, as permitted under Section 30 of Kenya's Data Protection Act, 2019.</p>
          </Section>

          <Section title="5. Legal Basis for Processing">
            <p>We process your data based on: (a) your consent at registration; (b) the necessity to perform our contractual obligations to you; (c) compliance with legal obligations under Kenyan law; and (d) our legitimate interests in preventing fraud, duplicate accounts, and improving our services.</p>
          </Section>

          <Section title="6. Data Sharing">
            <p>We do <strong>not</strong> sell your personal data. We may share your data with:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Payment Processors:</strong> PayHero and M-Pesa/Safaricom for payment processing only.</li>
              <li><strong>Communication Services:</strong> SMTP providers and WhatsApp Business API for account notifications.</li>
              <li><strong>Regulators &amp; Law Enforcement:</strong> Where required by Kenyan law, court order, or to report fraud to the DCI or Central Bank of Kenya.</li>
              <li><strong>Cloud Infrastructure:</strong> Neon (PostgreSQL database) and hosting providers, under data processing agreements.</li>
            </ul>
          </Section>

          <Section title="7. Data Security">
            <p>We implement industry-standard security measures including:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Passwords stored using bcrypt hashing (irreversible).</li>
              <li>All data transmitted over HTTPS/TLS encryption.</li>
              <li>Two-factor authentication (OTP) for sensitive account actions.</li>
              <li>Automated fraud detection, device fingerprinting, and IP-based rate limiting.</li>
              <li>Audit logs for all account activity.</li>
              <li>Database access restricted to authorized systems only.</li>
            </ul>
            <p className="mt-3">Despite these measures, no system is 100% secure. You are responsible for keeping your credentials confidential.</p>
          </Section>

          <Section title="8. Data Retention">
            <p>We retain your personal data for as long as your account is active and for a minimum of 7 years after account closure to comply with Kenya Revenue Authority and AML record-keeping requirements. Device fingerprint and IP data collected for fraud prevention is retained for 2 years. You may request deletion subject to these legal obligations.</p>
          </Section>

          <Section title="9. Your Rights (Kenya Data Protection Act, 2019)">
            <p>As a data subject under Kenyan law, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Access:</strong> Request a copy of your personal data.</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information.</li>
              <li><strong>Deletion:</strong> Request deletion of your data (subject to legal retention requirements).</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent for non-essential communications at any time.</li>
              <li><strong>Complaint:</strong> Lodge a complaint with the Office of the Data Protection Commissioner of Kenya.</li>
            </ul>
            <p className="mt-3">To exercise these rights, contact us via <a href="/support" className="text-primary underline">our support page</a>.</p>
          </Section>

          <Section title="10. Cookies &amp; Analytics">
            <p>Our platform uses browser local storage for session management (authentication tokens only). We do not use third-party tracking cookies. Basic analytics are collected via server-side logs only. Device fingerprinting data is collected server-side and is not stored in your browser.</p>
          </Section>

          <Section title="11. WhatsApp &amp; Email Notifications">
            <p>By registering, you consent to receive transactional WhatsApp messages and emails related to your account — including deposit confirmations, withdrawal updates, daily earning claim reminders, security alerts, and account suspension notices. These are essential to the service. Contact support to opt out of non-essential communications.</p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>We may update this Privacy Policy periodically. Significant changes will be communicated via email or an in-app notice. Continued use of Zenti after changes are published constitutes acceptance of the updated Policy.</p>
          </Section>

          <Section title="13. Contact &amp; Data Controller">
            <p>Zenti is the data controller for all personal data processed through this platform.</p>
            <div className="mt-2 p-3 bg-muted/50 rounded-lg">
              <p className="font-medium text-foreground">Zenti Investment Platform</p>
              <p>Support: <a href="/support" className="text-primary underline">support page</a></p>
              <p>Website: <a href="https://zenti-investment-kenya.vercel.app" className="text-primary underline">zenti-investment-kenya.vercel.app</a></p>
              <p>Location: Nairobi, Kenya</p>
            </div>
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
