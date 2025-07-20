import passport from 'passport'
import { Strategy as GitHubStrategy } from 'passport-github2'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as LocalStrategy } from 'passport-local'
import { User } from '../models/User.js'

import dotenv from 'dotenv'
dotenv.config()          // loads the variables from .env into process.env

// Local Strategy
passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email, password, done) => {
    try {
      const user = await User.findByEmail(email)
      if (!user) {
        return done(null, false, { message: 'Invalid email or password' })
      }

      if (!user.password_hash) {
        return done(null, false, { message: 'Please sign in with your OAuth provider' })
      }

      const isValid = await User.verifyPassword(password, user.password_hash)
      if (!isValid) {
        return done(null, false, { message: 'Invalid email or password' })
      }

      return done(null, user)
    } catch (error) {
      return done(error)
    }
  }
))

// Google Strategy
const requiredGoogleVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
const missingGoogle = requiredGoogleVars.filter(varName => !process.env[varName]);

if (missingGoogle.length === 0) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/auth/google/callback',
      scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findByProvider('google', profile.id)
        if (!user) {
          const email = profile.emails[0].value
          user = await User.findByEmail(email)
          if (user) {
            user = await User.update(user.id, {
              provider: 'google',
              provider_id: profile.id,
              avatar_url: user.avatar_url || profile.photos[0]?.value
            })
          } else {
            user = await User.create({
              email: email,
              name: profile.displayName,
              avatar_url: profile.photos[0]?.value,
              provider: 'google',
              provider_id: profile.id
            })
          }
        }
        return done(null, user)
      } catch (error) {
        return done(error)
      }
    }
  ))
  console.log('✅ Google OAuth Strategy initialized');
} else {
  console.warn(`⚠️ Google OAuth Strategy disabled. Missing env vars: ${missingGoogle.join(', ')}`);
}

// GitHub Strategy
const requiredGitHubVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
const missingGitHub = requiredGitHubVars.filter(varName => !process.env[varName]);

if (missingGitHub.length === 0) {
  passport.use(new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/auth/github/callback',
      scope: ['user:email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findByProvider('github', profile.id)
        if (!user) {
          const email = profile.emails[0]?.value || `${profile.username}@github.com`
          user = await User.findByEmail(email)
          if (user) {
            user = await User.update(user.id, {
              provider: 'github',
              provider_id: profile.id,
              avatar_url: user.avatar_url || profile.photos[0]?.value
            })
          } else {
            user = await User.create({
              email: email,
              name: profile.displayName || profile.username,
              avatar_url: profile.photos[0]?.value,
              provider: 'github',
              provider_id: profile.id
            })
          }
        }
        return done(null, user)
      } catch (error) {
        return done(error)
      }
    }
  ))
  console.log('✅ GitHub OAuth Strategy initialized');
} else {
  console.warn(`⚠️ GitHub OAuth Strategy disabled. Missing env vars: ${missingGitHub.join(', ')}`);
}

// Serialize user for the session
passport.serializeUser((user, done) => {
  done(null, user.id)
})

// Deserialize user from the session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id)
    done(null, user)
  } catch (error) {
    done(error)
  }
})

export default passport
