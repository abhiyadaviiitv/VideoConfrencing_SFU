import express from 'express'
import multer from 'multer'
import passport from 'passport'
import path from 'path'
import { User } from '../models/User.js'

const router = express.Router()

// Token cache to reduce database lookups
const tokenCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Middleware to check JWT token with caching
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  // Check cache first
  const cached = tokenCache.get(token)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    req.user = cached.user
    return next()
  }

  const user = User.verifyToken(token)
  if (!user) {
    // Remove from cache if invalid
    tokenCache.delete(token)
    return res.status(403).json({ error: 'Invalid or expired token' })
  }

  // Cache the verified user
  tokenCache.set(token, {
    user,
    timestamp: Date.now()
  })

  // Clean up expired cache entries periodically
  if (tokenCache.size > 1000) {
    const now = Date.now()
    for (const [key, value] of tokenCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        tokenCache.delete(key)
      }
    }
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
    console.log(email , password);
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

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body
    const userId = req.user.id

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' })
    }

    const updatedUser = await User.updateProfile(userId, { name: name.trim() })
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        avatar_url: updatedUser.avatar_url,
        provider: updatedUser.provider
      }
    })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Configure multer for avatar upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/avatars/')
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`)
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'), false)
    }
  }
})

// Upload avatar
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`
    const userId = req.user.id

    const updatedUser = await User.updateProfile(userId, { avatar_url: avatarUrl })
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      message: 'Avatar uploaded successfully',
      avatar_url: avatarUrl
    })
  } catch (error) {
    console.error('Avatar upload error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' })
})

// Google OAuth
router.get('/google',
  (req, res, next) => {
    // Store redirect URL in session for after OAuth
    const redirectUrl = req.query.redirect || '/lobby'
    req.session.oauthRedirect = redirectUrl
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next)
  }
)

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth' }),
  (req, res) => {
    const token = User.generateToken(req.user)
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173'
    const redirectUrl = req.session.oauthRedirect || '/lobby'
    
    // Clear the redirect from session
    delete req.session.oauthRedirect
    
    res.redirect(`${frontend}${redirectUrl}?token=${token}`)
  }
)

// GitHub OAuth
router.get('/github',
  (req, res, next) => {
    // Store redirect URL in session for after OAuth
    const redirectUrl = req.query.redirect || '/lobby'
    req.session.oauthRedirect = redirectUrl
    passport.authenticate('github', { scope: ['user:email'] })(req, res, next)
  }
)

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/auth' }),
  (req, res) => {
    const token = User.generateToken(req.user)
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173'
    const redirectUrl = req.session.oauthRedirect || '/lobby'
    
    // Clear the redirect from session
    delete req.session.oauthRedirect
    
    res.redirect(`${frontend}${redirectUrl}?token=${token}`)
  }
)

export default router
