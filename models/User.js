import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import { Pool } from 'pg'
dotenv.config() // loads .env variables

const pool = new Pool({
  connectionString: process.env.PG_SESSION_CONSTRING,
  ssl: {
    rejectUnauthorized: false
  }
})

export class User {
  static async createTable() {
    const client = await pool.connect()
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255),
          name VARCHAR(255),
          avatar_url TEXT,
          provider VARCHAR(50),
          provider_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid VARCHAR PRIMARY KEY NOT NULL COLLATE "default",
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        )
        WITH (OIDS=FALSE)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS IDX_sessions_expire ON sessions (expire)
      `)
    } finally {
      client.release()
    }
  }

  static async findByEmail(email) {
    const client = await pool.connect()
    try {
      const result = await client.query('SELECT * FROM users WHERE email = $1', [email])
      return result.rows[0]
    } finally {
      client.release()
    }
  }

  static async findById(id) {
    const client = await pool.connect()
    try {
      const result = await client.query('SELECT * FROM users WHERE id = $1', [id])
      return result.rows[0]
    } finally {
      client.release()
    }
  }

  static async findByProvider(provider, providerId) {
    const client = await pool.connect()
    try {
      const result = await client.query(
        'SELECT * FROM users WHERE provider = $1 AND provider_id = $2',
        [provider, providerId]
      )
      return result.rows[0]
    } finally {
      client.release()
    }
  }

  static async create(userData) {
    const client = await pool.connect()
    try {
      const { email, password, name, avatar_url, provider, provider_id } = userData

      let password_hash = null
      if (password) {
        password_hash = await bcrypt.hash(password, 12)
      }

      const result = await client.query(
        `INSERT INTO users (email, password_hash, name, avatar_url, provider, provider_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [email, password_hash, name, avatar_url, provider, provider_id]
      )

      return result.rows[0]
    } finally {
      client.release()
    }
  }

  static async update(id, updates) {
    const client = await pool.connect()
    try {
      const fields = Object.keys(updates)
      const values = Object.values(updates)
      const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ')

      const result = await client.query(
        `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [id, ...values]
      )

      return result.rows[0]
    } finally {
      client.release()
    }
  }

  static async updateProfile(id, profileData) {
    const client = await pool.connect()
    try {
      const allowedFields = ['name', 'avatar_url']
      const updates = {}

      // Only allow specific fields to be updated
      for (const field of allowedFields) {
        if (profileData[field] !== undefined) {
          updates[field] = profileData[field]
        }
      }

      if (Object.keys(updates).length === 0) {
        return await this.findById(id)
      }

      const fields = Object.keys(updates)
      const values = Object.values(updates)
      const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ')

      const result = await client.query(
        `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [id, ...values]
      )

      return result.rows[0]
    } finally {
      client.release()
    }
  }

  static async verifyPassword(password, hash) {
    if (!hash) return false
    return bcrypt.compare(password, hash)
  }

  static generateToken(user) {
    return jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET)
    } catch (error) {
      return null
    }
  }
}
