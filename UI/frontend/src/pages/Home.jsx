import { Link } from 'react-router-dom'
import ProfileDropdown from '../components/ProfileDropdown'
import { useAuth } from '../contexts/AuthContext'
import './Home.css'

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth()

  return (
    <div className="min-h-screen bg-background" style={{ background: '#f8f9fa', color: '#111' }}>
      <header style={{ borderBottom: '1px solid #e5e7eb', background: '#ffffffcc', backdropFilter: 'blur(6px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img
                src="src/assets/connective.jpg"
                alt="Connective Logo"
                style={{ height: 64, width: 64 }}
              />
              <span style={{ fontSize: 28, fontWeight: 700, color: '#1a73e8' }}>Connective</span>
            </div>
            <nav className="hidden md:flex" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <a href="#features" style={{ color: '#6b7280', textDecoration: 'none' }}>Features</a>
              <a href="#security" style={{ color: '#6b7280', textDecoration: 'none' }}>Security</a>
              <a href="#pricing" style={{ color: '#6b7280', textDecoration: 'none' }}>Pricing</a>
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {loading ? (
                <div style={{ padding: '8px 12px' }}>Loading...</div>
              ) : isAuthenticated ? (
                <ProfileDropdown />
              ) : (
                <>
                  <Link to="/auth" style={{ padding: '8px 12px', borderRadius: 8, color: '#111', textDecoration: 'none' }}>Sign In</Link>
                  <Link to="/auth" style={{ background: '#1a73e8', color: 'white', padding: '10px 14px', borderRadius: 8, textDecoration: 'none' }}>Get Started</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <section style={{ padding: '80px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }} className="hero-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <h1 style={{ fontSize: 48, lineHeight: 1.1, marginBottom: 12, fontWeight: 800 }}>
                  Connect with <span style={{ color: '#10b981' }}>anyone</span>, <span style={{ color: '#10b981' }}>anywhere</span>
                </h1>
                <p style={{ fontSize: 18, color: '#4b5563' }}>
                  Experience crystal-clear video calls with our next-generation conferencing platform. Built for teams
                  that value seamless collaboration and meaningful connections.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {isAuthenticated ? (
                  <>
                    <Link to="/lobby" style={{ background: '#10b981', color: 'white', padding: '14px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>
                      Start New Meeting
                    </Link>
                    <Link to="/schedule" style={{ padding: '14px 24px', borderRadius: 10, textDecoration: 'none', border: '1px solid #e5e7eb', background: 'transparent' }}>
                      Schedule Meeting
                    </Link>
                  </>
                ) : (
                  <>
                    <Link to="/auth?mode=signup" style={{ background: '#10b981', color: 'white', padding: '14px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>
                      Sign Up
                    </Link>
                    <Link to="/auth" style={{ padding: '14px 24px', borderRadius: 10, textDecoration: 'none', border: '1px solid #e5e7eb', background: 'transparent' }}>
                      Sign In
                    </Link>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 24, color: '#6b7280', fontSize: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ height: 8, width: 8, background: '#22c55e', borderRadius: 9999 }} />
                  <span>99.9% Uptime</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⏺</span>
                  <span>HD Recording</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>👥</span>
                  <span>Up to 1000 Participants</span>
                </div>
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
                <div style={{ aspectRatio: '16/9', background: '#f3f4f6', borderRadius: 12, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
                  <img
                    src="/src/assets/cartoonish home page 2.png"
                    alt="Video Conference Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.2), transparent)' }} />
                  <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 10px', borderRadius: 9999, fontSize: 12 }}>
                    Preview Mode
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <button style={{ padding: '8px 12px', borderRadius: 9999, border: '1px solid #e5e7eb', background: 'transparent' }}>▶</button>
                  <button style={{ padding: '8px 12px', borderRadius: 9999, border: '1px solid #e5e7eb', background: 'transparent' }}>🔊</button>
                  <Link to="/lobby" style={{ padding: '8px 18px', borderRadius: 9999, background: '#1a73e8', color: 'white', textDecoration: 'none' }}>Join Meeting</Link>
                </div>
              </div>

              <div style={{ position: 'absolute', top: -12, right: -12, background: '#10b981', color: 'white', padding: 10, borderRadius: 9999, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>⚡</div>
              <div style={{ position: 'absolute', bottom: -12, left: -12, background: '#1a73e8', color: 'white', padding: 10, borderRadius: 9999, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>🌐</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" style={{ padding: '80px 0', background: 'white' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Everything you need for seamless collaboration</h2>
            <p style={{ fontSize: 18, color: '#6b7280' }}>Powerful features designed to bring teams together, no matter where they are</p>
          </div>

          <div className="features-section">
            <div className="feature-card">
              <div className="feature-icon">🎥</div>
              <h4>HD Video & Audio</h4>
              <p>Crystal-clear quality with adaptive bitrate</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">💻</div>
              <h4>Screen Sharing</h4>
              <p>Share your screen with HD quality</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">⏺️</div>
              <h4>Meeting Recording</h4>
              <p>HD quality recordings</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h4>Polls & Surveys</h4>
              <p>Interactive engagement tools</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">💬</div>
              <h4>Real-time Chat</h4>
              <p>Built-in messaging</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h4>Team Rooms</h4>
              <p>Dedicated spaces for your team</p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features Section */}
      <section id="security" style={{ padding: '80px 0', background: '#f3f4f6' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Your Security & Privacy</h2>
            <p style={{ fontSize: 18, color: '#6b7280' }}>Enterprise-grade security to protect your conversations</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32 }}>
            <div style={{ background: 'white', padding: 32, borderRadius: 16, boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ width: 48, height: 48, background: '#10b981', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>🔐</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>End-to-End Encryption</h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>All video, audio, and chat data is encrypted using WebRTC's built-in encryption protocols. Your conversations remain private and secure.</p>
            </div>

            <div style={{ background: 'white', padding: 32, borderRadius: 16, boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ width: 48, height: 48, background: '#3b82f6', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>🛡️</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Secure Meeting Rooms</h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>Each meeting room has a unique, randomly generated ID. Only participants with the correct room code can join.</p>
            </div>

            <div style={{ background: 'white', padding: 32, borderRadius: 16, boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ width: 48, height: 48, background: '#8b5cf6', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>🚫</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>No Data Storage</h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>We don't store your video, audio, or chat content. All data is transmitted directly between participants.</p>
            </div>

            <div style={{ background: 'white', padding: 32, borderRadius: 16, boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ width: 48, height: 48, background: '#f59e0b', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>🔒</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Host Controls</h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>Meeting hosts can mute participants, remove users, and control access to ensure meeting security.</p>
            </div>
          </div>
        </div>
      </section>

      {!isAuthenticated ? (
        <section style={{ padding: '80px 0', background: 'white' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>Ready to start your first meeting?</h2>
            <p style={{ fontSize: 18, color: '#6b7280', marginBottom: 32 }}>Join millions of users who trust Connective for their video conferencing needs</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/auth?mode=signup" style={{ background: '#10b981', color: 'white', padding: '16px 32px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>
                Sign Up Free
              </Link>
              <Link to="/auth" style={{ padding: '16px 32px', borderRadius: 10, textDecoration: 'none', border: '1px solid #e5e7eb', background: 'transparent' }}>
                Sign In
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section style={{ padding: '80px 0', background: 'white' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>Welcome back, {user?.name}!</h2>
            <p style={{ fontSize: 18, color: '#6b7280', marginBottom: 32 }}>Ready to connect with your team?</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/lobby" style={{ background: '#10b981', color: 'white', padding: '16px 32px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>
                Start New Meeting
              </Link>
              <Link to="/schedule" style={{ padding: '16px 32px', borderRadius: 10, textDecoration: 'none', border: '1px solid #e5e7eb', background: 'transparent' }}>
                Schedule Meeting
              </Link>
            </div>
          </div>
        </section>
      )}

      <footer style={{ background: '#1f2937', color: 'white', padding: '48px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 32 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/connective.jpg-PBlOuDu7PyDeHhj0QKFzOBHbrtt7j5.jpeg"
                  alt="Connective Logo"
                  style={{ height: 40, width: 40 }}
                />
                <span style={{ fontSize: 20, fontWeight: 700 }}>Connective</span>
              </div>
              <p style={{ color: '#9ca3af', lineHeight: 1.6 }}>
                Connect with anyone, anywhere with our next-generation video conferencing platform.
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Product</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li style={{ marginBottom: 8 }}><a href="#features" style={{ color: '#9ca3af', textDecoration: 'none' }}>Features</a></li>
                <li style={{ marginBottom: 8 }}><a href="#security" style={{ color: '#9ca3af', textDecoration: 'none' }}>Security</a></li>
                <li style={{ marginBottom: 8 }}><a href="#pricing" style={{ color: '#9ca3af', textDecoration: 'none' }}>Pricing</a></li>
              </ul>
            </div>

            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Company</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li style={{ marginBottom: 8 }}><a href="#" style={{ color: '#9ca3af', textDecoration: 'none' }}>About</a></li>
                <li style={{ marginBottom: 8 }}><a href="#" style={{ color: '#9ca3af', textDecoration: 'none' }}>Blog</a></li>
                <li style={{ marginBottom: 8 }}><a href="#" style={{ color: '#9ca3af', textDecoration: 'none' }}>Careers</a></li>
              </ul>
            </div>

            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Support</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li style={{ marginBottom: 8 }}><a href="#" style={{ color: '#9ca3af', textDecoration: 'none' }}>Help Center</a></li>
                <li style={{ marginBottom: 8 }}><a href="#" style={{ color: '#9ca3af', textDecoration: 'none' }}>Contact</a></li>
                <li style={{ marginBottom: 8 }}><a href="#" style={{ color: '#9ca3af', textDecoration: 'none' }}>Status</a></li>
              </ul>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #374151', marginTop: 32, paddingTop: 32, textAlign: 'center', color: '#9ca3af' }}>
            <p>&copy; 2024 Connective. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}