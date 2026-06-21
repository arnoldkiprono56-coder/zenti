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
            <p>Zenti ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use our platform. By using Zenti, you consent to the practices described here. This policy complies with Kenya's Data Protection Act, 2019.</p>
          </Section>

          <Section title="2. Information We Collect">
            <p>We collect the following categories of personal data:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Account Information:</strong> Your full name, email address, phone number, and password (stored hashed).</li>
              <li><strong>Financial Information:</strong> Transaction history, wallet balance, investment history, withdrawal requests, and M-Pesa payment references.</li>
              <li><strong>Identity Verification:</strong> National ID information where required for AML compliance.</li>
              <li><strong>Device &amp; Usage Data:</strong> IP addresses, browser/app type, pages visited, and session logs for security and fraud detection.</li>
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
              <li>Detect and prevent fraud, money laundering, and security threats.</li>
              <li>Comply with Kenyan legal and regulatory obligations.</li>
              <li>Improve our platform features and user experience.</li>
              <li>Send daily earning claim reminders to help you avoid losing earnings.</li>
            </ul>
          </Section>

          <Section title="4. Legal Basis for Processing">
            <p>We process your data based on: (a) your consent at registration; (b) the necessity to perform our contractual obligations to you; (c) compliance with legal obligations under Kenyan law; and (d) our legitimate interests in preventing fraud and improving our services.</p>
          </Section>

          <Section title="5. Data Sharing">
            <p>We do <strong>not</strong> sell your personal data. We may share your data with:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Payment Processors:</strong> PayHero and M-Pesa/Safaricom for payment processing only.</li>
              <li><strong>Communication Services:</strong> SMTP providers and WhatsApp Business API for account notifications.</li>
              <li><strong>Regulators &amp; Law Enforcement:</strong> Where required by Kenyan law, court order, or to report fraud to the DCI or Central Bank of Kenya.</li>
              <li><strong>Cloud Infrastructure:</strong> Neon (PostgreSQL database) and Vercel (hosting), under data processing agreements.</li>
            </ul>
          </Section>

          <Section title="6. Data Security">
            <p>We implement industry-standard security measures including:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Passwords stored using bcrypt hashing (irreversible).</li>
              <li>All data transmitted over HTTPS/TLS encryption.</li>
              <li>Two-factor authentication (OTP) for sensitive account actions.</li>
              <li>Automated fraud detection and IP-based rate limiting.</li>
              <li>Audit logs for all account activity.</li>
              <li>Database access restricted to authorized systems only.</li>
            </ul>
            <p className="mt-3">Despite these measures, no system is 100% secure. You are responsible for keeping your credentials confidential.</p>
          </Section>

          <Section title="7. Data Retention">
            <p>We retain your personal data for as long as your account is active and for a minimum of 7 years after account closure to comply with Kenya Revenue Authority and AML record-keeping requirements. You may request deletion subject to these legal obligations.</p>
          </Section>

          <Section title="8. Your Rights (Kenya Data Protection Act, 2019)">
            <p>As a data subject under Kenyan law, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Access:</strong> Request a copy of your personal data.</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information.</li>
              <li><strong>Deletion:</strong> Request deletion of your data (subject to legal retention requirements).</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent for non-essential communications at any time.</li>
              <li><strong>Complaint:</strong> Lodge a complaint with the Office of the Data Protection Commissioner of Kenya.</li>
            </ul>
            <p className="mt-3">To exercise these rights, contact us at <a href="mailto:support@zenti.app" className="text-primary underline">support@zenti.app</a>.</p>
          </Section>

          <Section title="9. Cookies &amp; Analytics">
            <p>Our platform uses browser local storage for session management (authentication tokens only). We do not use third-party tracking cookies. Basic analytics are collected via server-side logs only.</p>
          </Section>

          <Section title="10. WhatsApp &amp; Email Notifications">
            <p>By registering, you consent to receive transactional WhatsApp messages and emails related to your account — including deposit confirmations, withdrawal updates, daily earning claim reminders, and security alerts. These are essential to the service. Contact support to opt out of non-essential communications.</p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>We may update this Privacy Policy periodically. Significant changes will be communicated via email or an in-app notice. Continued use of Zenti after changes are published constitutes acceptance of the updated Policy.</p>
          </Section>

          <Section title="12. Contact &amp; Data Controller">
            <p>Zenti is the data controller for all personal data processed through this platform.</p>
            <div className="mt-2 p-3 bg-muted/50 rounded-lg">
              <p className="font-medium text-foreground">Zenti Investment Platform</p>
              <p>Email: <a href="mailto:support@zenti.app" className="text-primary underline">support@zenti.app</a></p>
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
