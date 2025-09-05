import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, redirectTo = '/auth' }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  
  // Create redirect URL with current path as redirect parameter
  const redirectUrl = `${redirectTo}?redirect=${encodeURIComponent(location.pathname)}`

  // Show loading while checking authentication
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#fff'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          border: '4px solid rgba(255, 255, 255, 0.3)',
          borderTop: '4px solid #fff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '600' }}>Connective</h3>
          <p style={{ margin: 0, fontSize: '16px', opacity: 0.9 }}>Preparing your experience...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // Redirect to sign in if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={redirectUrl} replace />
  }

  // Render protected content if authenticated
  return children
}
