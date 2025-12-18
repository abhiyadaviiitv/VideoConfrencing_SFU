import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Check for token in URL (from OAuth redirect)
  const [token, setToken] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      localStorage.setItem('token', urlToken)
      localStorage.setItem('jwt', urlToken) // Store under both keys for compatibility
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname)
      return urlToken
    }
    return localStorage.getItem('token') || localStorage.getItem('jwt')
  })

  const apiBase = 'https://192.168.2.105:4000'

  // Check if we have cached user data to reduce loading time
  const getCachedUser = () => {
    try {
      const cachedUser = localStorage.getItem('cachedUser')
      const cacheTimestamp = localStorage.getItem('userCacheTimestamp')

      if (cachedUser && cacheTimestamp) {
        const cacheAge = Date.now() - parseInt(cacheTimestamp)
        // Use cache if less than 5 minutes old
        if (cacheAge < 5 * 60 * 1000) {
          return JSON.parse(cachedUser)
        }
      }
    } catch (error) {
      console.error('Error reading cached user:', error)
    }
    return null
  }

  // Cache user data for faster subsequent loads
  const setCachedUser = (userData) => {
    try {
      localStorage.setItem('cachedUser', JSON.stringify(userData))
      localStorage.setItem('userCacheTimestamp', Date.now().toString())
    } catch (error) {
      console.error('Error caching user data:', error)
    }
  }

  // Clear cached user data
  const clearCachedUser = () => {
    localStorage.removeItem('cachedUser')
    localStorage.removeItem('userCacheTimestamp')
  }

  // Fetch user profile
  const fetchUser = async () => {
    if (!token) {
      setLoading(false)
      return
    }

    // Try to use cached user data first for faster loading
    const cachedUser = getCachedUser()
    if (cachedUser) {
      setUser(cachedUser)
      setLoading(false)
      // Still fetch fresh data in background but don't show loading
      fetchUserInBackground()
      return
    }

    try {
      const response = await fetch(`${apiBase}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
        setCachedUser(data.user)
      } else {
        // Token is invalid, remove it
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
        clearCachedUser()
      }
    } catch (error) {
      console.error('Error fetching user:', error)
      localStorage.removeItem('token')
      setToken(null)
      setUser(null)
      clearCachedUser()
    } finally {
      setLoading(false)
    }
  }

  // Background fetch for fresh user data (when using cache)
  const fetchUserInBackground = async () => {
    try {
      const response = await fetch(`${apiBase}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
        setCachedUser(data.user)
      } else {
        // Token is invalid, remove it
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
        clearCachedUser()
      }
    } catch (error) {
      console.error('Background user fetch error:', error)
    }
  }

  // Update user profile
  const updateProfile = async (profileData) => {
    if (!token) return false

    try {
      const response = await fetch(`${apiBase}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profileData)
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
        return true
      }
      return false
    } catch (error) {
      console.error('Error updating profile:', error)
      return false
    }
  }

  // Upload avatar
  const uploadAvatar = async (file) => {
    if (!token) return false

    try {
      const formData = new FormData()
      formData.append('avatar', file)

      const response = await fetch(`${apiBase}/auth/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setUser(prev => ({ ...prev, avatar_url: data.avatar_url }))
        return true
      }
      return false
    } catch (error) {
      console.error('Error uploading avatar:', error)
      return false
    }
  }

  // Login function
  const login = (newToken, userData) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('jwt', newToken) // Store under both keys for compatibility
    setToken(newToken)
    setUser(userData)
    setCachedUser(userData)

    // Reconnect socket with new token
    if (window.socketReconnect) {
      window.socketReconnect(newToken)
    }
  }

  // Logout function
  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('jwt') // Remove both keys
    setToken(null)
    setUser(null)
    clearCachedUser()
  }

  useEffect(() => {
    fetchUser()
    // Explicitly connect socket when token changes/is ready
    if (token && window.connectSocket) {
      window.connectSocket(token)
    }
  }, [token])

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    updateProfile,
    uploadAvatar,
    refreshUser: fetchUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}