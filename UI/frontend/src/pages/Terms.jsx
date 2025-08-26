import { Link } from 'react-router-dom'

export default function Terms() {
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
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 24 }}>Terms of Service</h1>
        
        <div style={{ background: 'white', padding: 32, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            <strong>Last updated:</strong> December 2024
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>1. Acceptance of Terms</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            By accessing and using Connective, you accept and agree to be bound by the terms and provision of this agreement.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>2. Use License</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            Permission is granted to temporarily use Connective for personal, non-commercial transitory viewing only.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>3. User Conduct</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            You agree not to use the service to:
          </p>
          <ul style={{ marginBottom: 16, paddingLeft: 24, lineHeight: 1.6 }}>
            <li>Transmit any unlawful, harmful, threatening, abusive, or harassing content</li>
            <li>Impersonate any person or entity</li>
            <li>Interfere with or disrupt the service</li>
            <li>Violate any applicable laws or regulations</li>
          </ul>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>4. Privacy</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            Your privacy is important to us. Please review our <Link to="/privacy" style={{ color: '#1a73e8' }}>Privacy Policy</Link>, which also governs your use of the service.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>5. Disclaimer</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            The materials on Connective are provided on an 'as is' basis. Connective makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>6. Limitations</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            In no event shall Connective or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Connective.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>7. Revisions and Errata</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            The materials appearing on Connective could include technical, typographical, or photographic errors. Connective does not warrant that any of the materials on its website are accurate, complete or current.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>8. Links</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            Connective has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by Connective of the site.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>9. Modifications</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            Connective may revise these terms of service for its website at any time without notice. By using this website you are agreeing to be bound by the then current version of these Terms and Conditions of Use.
          </p>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>10. Contact Information</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            If you have any questions about these Terms of Service, please contact us at support@connective.com
          </p>
        </div>
      </main>
    </div>
  )
}



