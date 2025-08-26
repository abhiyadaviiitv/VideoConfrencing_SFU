import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', color: '#111' }}>
      <header style={{ borderBottom: '1px solid #e5e7eb', background: '#ffffffcc', backdropFilter: 'blur(6px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/connective.jpg-PBlOuDu7PyDeHhj0QKFzOBHbrtt7j5.jpeg"
                alt="Connective Logo"
                style={{ height: 40, width: 40 }}
              />
              <span style={{ fontSize: 20, fontWeight: 700, color: '#1a73e8' }}>Connective</span>
            </Link>
            <Link to="/" style={{ color: '#6b7280', textDecoration: 'none' }}>← Back to Home</Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 24 }}>Privacy Policy</h1>
        
        <div style={{ background: 'white', padding: 32, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            <strong>Last updated:</strong> December 2024
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>1. Information We Collect</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            We collect information you provide directly to us, such as when you create an account, participate in meetings, or contact us for support.
          </p>
          <ul style={{ marginBottom: 16, paddingLeft: 24, lineHeight: 1.6 }}>
            <li>Account information (name, email, profile picture)</li>
            <li>Meeting data (participants, duration, recordings if enabled)</li>
            <li>Device information and usage analytics</li>
            <li>Communications with our support team</li>
          </ul>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>2. How We Use Your Information</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            We use the information we collect to:
          </p>
          <ul style={{ marginBottom: 16, paddingLeft: 24, lineHeight: 1.6 }}>
            <li>Provide and maintain our video conferencing service</li>
            <li>Process your transactions and send related information</li>
            <li>Send technical notices, updates, and support messages</li>
            <li>Respond to your comments and questions</li>
            <li>Improve our services and develop new features</li>
          </ul>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>3. Information Sharing</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>4. Data Security</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>5. Cookies and Tracking</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            We use cookies and similar tracking technologies to enhance your experience and collect usage information. You can control cookie settings through your browser.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>6. Third-Party Services</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            Our service may integrate with third-party services (like Google and GitHub for authentication). These services have their own privacy policies.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>7. Data Retention</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            We retain your personal information for as long as necessary to provide our services and comply with legal obligations.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>8. Your Rights</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            You have the right to:
          </p>
          <ul style={{ marginBottom: 16, paddingLeft: 24, lineHeight: 1.6 }}>
            <li>Access and update your personal information</li>
            <li>Delete your account and associated data</li>
            <li>Opt out of marketing communications</li>
            <li>Request data portability</li>
          </ul>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>9. Children's Privacy</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>10. Changes to This Policy</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>11. Contact Us</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            If you have questions about this privacy policy, please contact us at privacy@connective.com
          </p>
        </div>
      </main>
    </div>
  )
}



