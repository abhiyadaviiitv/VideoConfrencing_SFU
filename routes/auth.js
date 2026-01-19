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
      // If user exists but has no password, allow them to set one (SSO flow)
      if (!existingUser.password_hash) {
        // Update password for existing user
        const bcrypt = await import('bcryptjs')
        const password_hash = await bcrypt.default.hash(password, 12)
        
        // Update user with password
        const updatedUser = await User.update(existingUser.id, { 
          password_hash,
          name: name || existingUser.name // Update name if provided
        })

        // Generate JWT token
        const token = User.generateToken(updatedUser)

        return res.status(200).json({
          message: 'Password set successfully',
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name
          },
          token
        })
      }
      
      // User exists and has password - cannot create duplicate
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
    console.log(email, password);
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
    const frontend = process.env.FRONTEND_URL || 'https://192.168.2.105.nip.io:5173'
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
    const frontend = process.env.FRONTEND_URL || 'https://192.168.2.105.nip.io:5173'
    const redirectUrl = req.session.oauthRedirect || '/lobby'

    // Clear the redirect from session
    delete req.session.oauthRedirect

    res.redirect(`${frontend}${redirectUrl}?token=${token}`)
  }
)

// API endpoint to create room programmatically (for Learnsphere integration)
// This creates a room and returns the room ID without requiring socket connection
router.post('/api/create-room', authenticateToken, async (req, res) => {
  try {
    const { v4: uuidv4 } = await import('uuid')
    const mediasoup = await import('mediasoup')
    
    // Get user info
    const userId = req.user.id
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Generate room ID
    const roomId = uuidv4()
    
    // Note: Actual room creation with mediasoup router happens when first user joins via socket
    // This endpoint just reserves the room ID and returns it
    // The room will be created when the teacher joins via socket
    
    res.json({
      success: true,
      roomId: roomId,
      message: 'Room ID reserved. Room will be created when first participant joins.'
    })
  } catch (error) {
    console.error('Error creating room:', error)
    res.status(500).json({ error: 'Failed to create room: ' + error.message })
  }
})

// SSO endpoint for Learnsphere integration
// Accepts a short-lived JWT token from Learnsphere and creates/authenticates user
router.post('/sso/learnsphere', async (req, res) => {
  try {
    const { token, roomId, returnUrl } = req.body

    if (!token || !roomId) {
      return res.status(400).json({ error: 'Token and roomId are required' })
    }

    // Verify the SSO token
    // Note: In production, both apps should share the same JWT_SECRET
    // or use a token exchange service
    let decoded
    try {
      const jwt = await import('jsonwebtoken')
      // Try LEARNSPHERE_JWT_SECRET first, then fall back to JWT_SECRET
      const secret = process.env.LEARNSPHERE_JWT_SECRET || process.env.JWT_SECRET
      
      if (!secret) {
        console.error('SSO: No JWT_SECRET configured')
        throw new Error('JWT_SECRET not configured in Connective')
      }

      console.log('SSO: Verifying token...')
      decoded = jwt.default.verify(token, secret)
      console.log('SSO: Token verified successfully. Decoded:', {
        id: decoded.id,
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
        roomId: decoded.roomId
      })
    } catch (error) {
      console.error('SSO token verification failed:', error.message)
      console.error('Token (first 50 chars):', token.substring(0, 50))
      console.error('Available secrets:', {
        hasJWT_SECRET: !!process.env.JWT_SECRET,
        hasLEARNSPHERE_JWT_SECRET: !!process.env.LEARNSPHERE_JWT_SECRET,
        JWT_SECRET_length: process.env.JWT_SECRET?.length || 0,
        LEARNSPHERE_JWT_SECRET_length: process.env.LEARNSPHERE_JWT_SECRET?.length || 0
      })
      return res.status(401).json({ 
        error: 'Invalid or expired SSO token',
        details: error.message,
        hint: 'Make sure both apps use the same JWT_SECRET. Set LEARNSPHERE_JWT_SECRET in Connective to match Learnsphere\'s jwt.secret'
      })
    }

    // Extract user information from token
    // The token should contain userId, roomId, classId
    const userId = decoded.id || decoded.userId
    const username = decoded.username || decoded.email || `user_${userId}`
    const email = decoded.email || `${username}@learnsphere.local`
    const name = decoded.name || username

    if (!userId) {
      return res.status(400).json({ error: 'Invalid token: missing user ID' })
    }

    // Find or create user in Connective database
    let user = await User.findByEmail(email)
    
    if (!user) {
      // Create new user from Learnsphere profile
      user = await User.create({
        email: email,
        name: name,
        provider: 'learnsphere',
        provider_id: userId.toString()
      })
      console.log(`Created new Connective user from Learnsphere: ${user.id}`)
    } else {
      // Update existing user profile if needed
      if (user.name !== name) {
        await User.updateProfile(user.id, { name: name })
      }
    }

    // Generate Connective JWT token for this session
    const connectiveToken = User.generateToken(user)

    // Store user info in localStorage format for Connective frontend
    // This will be used when the user joins the room
    const userInfoForRoom = {
      name: user.name,
      email: user.email,
      userId: user.id.toString()
    }

    // Return token and redirect URL
    // For teacher (host): use autoJoined=true to skip joinRoom call
    // For student: use autoJoined=false to trigger joinRoom call
    const frontend = process.env.FRONTEND_URL || 'https://localhost:5173'
    const isHost = req.body.isHost || false // Can be passed from Learnsphere
    const autoJoined = isHost // Teacher auto-joins, students need to join
    const redirectPath = returnUrl || `/room/${roomId}?token=${connectiveToken}&autoJoined=${autoJoined}`

    res.json({
      success: true,
      token: connectiveToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url
      },
      userInfo: userInfoForRoom, // For socket joinRoom call
      redirectUrl: `${frontend}${redirectPath}`,
      roomId: roomId,
      isHost: isHost
    })
  } catch (error) {
    console.error('SSO error:', error)
    res.status(500).json({ error: 'SSO authentication failed: ' + error.message })
  }
})

// GET endpoint for SSO (for URL-based token passing)
router.get('/sso/learnsphere', async (req, res) => {
  try {
    const { token, roomId, returnUrl, isHost } = req.query

    if (!token || !roomId) {
      console.error('SSO: Missing token or roomId')
      return res.status(400).send(`
        <html>
          <body>
            <h1>SSO Error</h1>
            <p>Token and roomId are required</p>
            <script>setTimeout(() => window.close(), 3000)</script>
          </body>
        </html>
      `)
    }

    // Verify the SSO token
    let decoded
    try {
      const jwt = await import('jsonwebtoken')
      const crypto = await import('crypto')
      
      // Try both JWT secrets - Learnsphere might use a different one
      let secret = process.env.LEARNSPHERE_JWT_SECRET || process.env.JWT_SECRET
      
      if (!secret) {
        console.error('SSO: No JWT_SECRET configured')
        throw new Error('JWT_SECRET not configured in Connective. Set LEARNSPHERE_JWT_SECRET to match Learnsphere\'s jwt.secret')
      }

      // Learnsphere's JwtService decodes the secret using Base64.decode() in getKey()
      // If the secret is not valid Base64, Java will throw an exception
      // We need to match the exact byte sequence that Java uses
      
      console.log('SSO: Verifying token...')
      console.log('SSO: Secret length:', secret.length, 'First 10 chars:', secret.substring(0, 10))
      
      // Java's Base64.decode() converts Base64 string to byte array
      // We need to decode the Base64 secret to Buffer to match Java's byte array
      let secretToUse
      try {
        // Try to decode as Base64 first (matching Java's Base64.decode approach)
        const secretBuffer = Buffer.from(secret, 'base64')
        console.log('SSO: Secret decoded from Base64, length:', secretBuffer.length)
        secretToUse = secretBuffer
      } catch (decodeError) {
        // If Base64 decode fails, use the secret as-is
        console.log('SSO: Secret is not Base64, using as plain string')
        secretToUse = secret
      }
      
      try {
        decoded = jwt.default.verify(token, secretToUse)
        console.log('SSO: Token verified successfully')
      } catch (verifyError) {
        console.error('SSO: Token verification failed:', verifyError.message)
        console.error('SSO: Secret type used:', typeof secretToUse)
        if (Buffer.isBuffer(secretToUse)) {
          console.error('SSO: Secret buffer length:', secretToUse.length)
        }
        throw verifyError
      }
      
      console.log('SSO: Token decoded successfully:', { 
        id: decoded.id, 
        userId: decoded.userId, 
        roomId: decoded.roomId,
        email: decoded.email,
        exp: decoded.exp,
        iat: decoded.iat
      })
    } catch (error) {
      console.error('SSO token verification failed:', error.message)
      console.error('Token:', token.substring(0, 50) + '...')
      console.error('Available env vars:', {
        hasJWT_SECRET: !!process.env.JWT_SECRET,
        hasLEARNSPHERE_JWT_SECRET: !!process.env.LEARNSPHERE_JWT_SECRET
      })
      
      // Return a user-friendly error page instead of redirecting
      return res.status(401).send(`
        <html>
          <head><title>SSO Authentication Failed</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1>Authentication Failed</h1>
            <p>The SSO token is invalid or expired. Please try again.</p>
            <p style="color: #666; font-size: 12px;">Error: ${error.message}</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
            <script>
              // Try to redirect back to Learnsphere after 3 seconds
              setTimeout(() => {
                const learnsphereUrl = '${process.env.LEARNSPHERE_URL || 'http://localhost:8080'}'
                window.location.href = learnsphereUrl + '/teacher/class/${req.query.classId || ''}'
              }, 3000)
            </script>
          </body>
        </html>
      `)
    }

    // Extract user information from token
    // Token should have: id, userId, username, email, name (from Learnsphere)
    const userId = decoded.id || decoded.userId
    const username = decoded.username || decoded.email || decoded.sub || `user_${userId}`
    const email = decoded.email || `${username}@learnsphere.local`
    const name = decoded.name || username

    console.log('SSO: Extracted user info:', { userId, username, email, name })

    if (!userId) {
      console.error('SSO: No user ID found in token')
      return res.status(400).send(`
        <html>
          <body>
            <h1>SSO Error</h1>
            <p>Invalid token: missing user ID</p>
            <p>Token payload: ${JSON.stringify(decoded, null, 2)}</p>
            <script>setTimeout(() => window.close(), 3000)</script>
          </body>
        </html>
      `)
    }

    // Find user - don't auto-create, redirect to login/register instead
    let user = await User.findByEmail(email)
    const frontend = process.env.CONNECTIVE_FRONTEND_URL || process.env.FRONTEND_URL || 'https://localhost:5173'
    const isHostFlag = isHost === 'true' || isHost === true
    const autoJoined = isHostFlag
    // Build room path with all necessary query params
    const roomPath = returnUrl || `/room/${roomId}?autoJoined=${autoJoined}&isHost=${isHostFlag}`
    
    // If user doesn't exist, redirect to register with pre-filled data
    if (!user) {
      console.log(`SSO: User ${email} not found, redirecting to register...`)
      
      // Redirect to register page with pre-filled data
      const registerUrl = `${frontend}/auth?mode=sso-register&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&returnUrl=${encodeURIComponent(roomPath)}`
      
      console.log(`SSO: Redirecting to register: ${registerUrl}`)
      return res.redirect(registerUrl)
    }
    
    // Check if user has a password (local account) or is OAuth-only
    // If user exists but has no password_hash, they need to set one
    if (!user.password_hash) {
      console.log(`SSO: User ${email} exists but has no password, redirecting to set password...`)
      
      // Redirect to register page to set password (pre-filled with existing data)
      const registerUrl = `${frontend}/auth?mode=sso-register&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name || user.name)}&returnUrl=${encodeURIComponent(roomPath)}`
      
      console.log(`SSO: Redirecting to set password: ${registerUrl}`)
      return res.redirect(registerUrl)
    }
    
    // User exists and has password - redirect to login with pre-filled email
    // After login, they'll be redirected to the room using the returnUrl
    console.log(`SSO: User ${email} exists, redirecting to login...`)
    
    const loginUrl = `${frontend}/auth?email=${encodeURIComponent(email)}&returnUrl=${encodeURIComponent(roomPath)}`
    
    console.log(`SSO: Redirecting to login: ${loginUrl}`)
    return res.redirect(loginUrl)
  } catch (error) {
    console.error('SSO GET error:', error)
    const learnsphereUrl = process.env.LEARNSPHERE_URL || 'http://localhost:8080'
    res.redirect(`${learnsphereUrl}/error?message=SSO+failed`)
  }
})

export default router
