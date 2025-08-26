import express from 'express'
import passport from 'passport'
import { User } from '../models/User.js'

const router = express.Router()

// Middleware to check JWT token
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  const user = User.verifyToken(token)
  if (!user) {
    return res.status(403).json({ error: 'Invalid or expired token' })
  }

  req.user = user
  next()
}

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' })
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email)
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' })
    }

    // Create new user
    const user = await User.create({ email, password, name })
    
    // Generate JWT token
    const token = User.generateToken(user)

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token
    })
  } catch (error) {
    console.error('Signup error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Find user
    const user = await User.findByEmail(email)
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Verify password
    const isValid = await User.verifyPassword(password, user.password_hash)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Generate JWT token
    const token = User.generateToken(user)

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url
      },
      token
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        provider: user.provider
      }
    })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' })
})

// Google OAuth
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
)

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth' }),
  (req, res) => {
    const token = User.generateToken(req.user)
    res.redirect(`http://localhost:5173/auth?token=${token}`)
  }
)

// GitHub OAuth
router.get('/github',
  passport.authenticate('github', { scope: ['user:email'] })
)

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/auth' }),
  (req, res) => {
    const token = User.generateToken(req.user)
    res.redirect(`http://localhost:5173/auth?token=${token}`)
  }
)

export default router
