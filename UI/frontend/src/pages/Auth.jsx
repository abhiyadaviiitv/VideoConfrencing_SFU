import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Auth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, isAuthenticated } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({ name: '', email: '', password: '' })

  // Check if user came from sign up button or has a redirect
  useEffect(() => {
    const isFromSignUp = searchParams.get('mode') === 'signup'
    const redirectTo = searchParams.get('redirect')

    if (isFromSignUp) {
      setIsSignUp(true)
    }

    // Store redirect path for after authentication
    if (redirectTo) {
      localStorage.setItem('authRedirect', redirectTo)
    }
  }, [searchParams])

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const redirectPath = localStorage.getItem('authRedirect')
      if (redirectPath) {
        localStorage.removeItem('authRedirect')
        navigate(redirectPath)
      } else {
        navigate('/lobby')
      }
    }
  }, [isAuthenticated, navigate])

  const handleInputChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'https://192.168.2.105:4000'
  const googleAuthUrl = `${apiBase}/auth/google`
  const githubAuthUrl = `${apiBase}/auth/github`

  // Handle OAuth callback
  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      // For OAuth, we need to fetch user info from the token
      const fetchUserInfo = async () => {
        try {
          const response = await fetch(`${apiBase}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })

          if (response.ok) {
            const data = await response.json()
            // Use the login function from AuthContext
            login(token, data.user)

            // Check if there's a redirect path stored
            const redirectPath = localStorage.getItem('authRedirect')
            if (redirectPath) {
              localStorage.removeItem('authRedirect')
              navigate(redirectPath)
            } else {
              navigate('/lobby')
            }
          }
        } catch (error) {
          console.error('Error fetching user info:', error)
        }
      }

      fetchUserInfo()
    }
  }, [searchParams, navigate, apiBase, login])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const endpoint = isSignUp ? '/auth/signup' : '/auth/login'
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed')
      }

      // Use the login function from AuthContext
      login(data.token, data.user)

      // Check if there's a redirect path stored
      const redirectPath = localStorage.getItem('authRedirect')
      if (redirectPath) {
        localStorage.removeItem('authRedirect')
        navigate(redirectPath)
      } else {
        navigate('/lobby')
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSocialAuth = (provider) => {
    const url = provider === 'google' ? googleAuthUrl : githubAuthUrl
    window.location.href = url
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Link to="/" style={{ color: '#6b7280', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            ← Back to Home
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12 }}>
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/connective.jpg-PBlOuDu7PyDeHhj0QKFzOBHbrtt7j5.jpeg"
              alt="Connective Logo"
              style={{ height: 48, width: 48 }}
            />
            <span style={{ fontSize: 28, fontWeight: 800, color: '#1a73e8' }}>Connective</span>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
          <div style={{ textAlign: 'center', paddingTop: 20 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
            <p style={{ color: '#6b7280', marginTop: 6 }}>
              {isSignUp ? 'Sign up to start connecting with your team' : 'Sign in to join your meetings'}
            </p>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <button onClick={() => handleSocialAuth('google')} style={{ height: 48, borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>
                Continue with Google
              </button>
              <button onClick={() => handleSocialAuth('github')} style={{ height: 48, borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>
                Continue with GitHub
              </button>
            </div>

            <div style={{ position: 'relative', margin: '16px 0' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%', height: 1, background: '#e5e7eb' }} />
              </div>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', fontSize: 12, textTransform: 'uppercase' }}>
                <span style={{ background: 'white', padding: '0 8px', color: '#6b7280' }}>Or continue with email</span>
              </div>
            </div>

            {error && (
              <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
              {isSignUp && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="name" style={{ fontSize: 14, fontWeight: 500 }}>Full Name</label>
                  <input id="name" name="name" type="text" placeholder="Enter your full name" value={formData.name} onChange={handleInputChange} required={isSignUp} style={{ height: 48, borderRadius: 8, border: '1px solid #e5e7eb', padding: '0 12px' }} />
                </div>
              )}

              <div style={{ display: 'grid', gap: 6 }}>
                <label htmlFor="email" style={{ fontSize: 14, fontWeight: 500 }}>Email</label>
                <input id="email" name="email" type="email" placeholder="Enter your email" value={formData.email} onChange={handleInputChange} required style={{ height: 48, borderRadius: 8, border: '1px solid #e5e7eb', padding: '0 12px' }} />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label htmlFor="password" style={{ fontSize: 14, fontWeight: 500 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={formData.password} onChange={handleInputChange} required style={{ height: 48, borderRadius: 8, border: '1px solid #e5e7eb', padding: '0 40px 0 12px', width: '100%' }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 6, top: 6, height: 36, width: 36, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button disabled={loading} type="submit" style={{ height: 48, borderRadius: 10, border: 'none', background: '#1a73e8', color: 'white', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Please wait…' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button onClick={() => setIsSignUp(!isSignUp)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>

            {!isSignUp && (
              <div style={{ textAlign: 'center' }}>
                <button style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                  Forgot your password?
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', color: '#6b7280', marginTop: 12, fontSize: 12 }}>
          By continuing, you agree to our <Link to="/terms" style={{ textDecoration: 'underline', color: '#6b7280' }}>Terms of Service</Link> and <Link to="/privacy" style={{ textDecoration: 'underline', color: '#6b7280' }}>Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}