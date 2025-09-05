import dotenv from 'dotenv'
import { Pool } from 'pg'
dotenv.config()

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false,
    ca: process.env.DB_CA_CERT || undefined
  }
})

export class Poll {
  static async createTables() {
    const client = await pool.connect()
    try {
      // Create polls table
      await client.query(`
        CREATE TABLE IF NOT EXISTS polls (
          id VARCHAR(255) PRIMARY KEY,
          room_id VARCHAR(255) NOT NULL,
          question TEXT NOT NULL,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          closed_at TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          total_votes INTEGER DEFAULT 0,
          duration INTEGER DEFAULT 0,
          is_anonymous BOOLEAN DEFAULT false,
          allow_multiple BOOLEAN DEFAULT false
        )
      `)

      // Create poll_options table
      await client.query(`
        CREATE TABLE IF NOT EXISTS poll_options (
          id SERIAL PRIMARY KEY,
          poll_id VARCHAR(255) REFERENCES polls(id) ON DELETE CASCADE,
          option_text TEXT NOT NULL,
          option_index INTEGER NOT NULL,
          vote_count INTEGER DEFAULT 0
        )
      `)

      // Create poll_votes table
      await client.query(`
        CREATE TABLE IF NOT EXISTS poll_votes (
          id SERIAL PRIMARY KEY,
          poll_id VARCHAR(255) REFERENCES polls(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id),
          socket_id VARCHAR(255),
          option_index INTEGER NOT NULL,
          voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(poll_id, user_id),
          UNIQUE(poll_id, socket_id)
        )
      `)

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_polls_room_id ON polls(room_id)
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_polls_created_at ON polls(created_at)
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id)
      `)
    } finally {
      client.release()
    }
  }

  static async create(pollData) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      console.log('Creating poll with data:', pollData);

      // Insert poll - handle createdBy being null or socket ID
      const pollResult = await client.query(
        `INSERT INTO polls (id, room_id, question, created_by, is_active, total_votes, duration, is_anonymous, allow_multiple)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          pollData.id, 
          pollData.roomId, 
          pollData.question, 
          pollData.createdBy || null, // Allow null for anonymous users
          pollData.isActive, 
          0, 
          pollData.duration || 0, 
          pollData.isAnonymous || false, 
          pollData.allowMultiple || false
        ]
      )

      console.log('Poll inserted successfully:', pollResult.rows[0]);

      // Insert poll options
      for (let i = 0; i < pollData.options.length; i++) {
        await client.query(
          `INSERT INTO poll_options (poll_id, option_text, option_index, vote_count)
           VALUES ($1, $2, $3, $4)`,
          [pollData.id, pollData.options[i], i, 0]
        )
      }

      console.log('Poll options inserted successfully');

      await client.query('COMMIT')
      
      // Return the created poll with options
      const createdPoll = pollResult.rows[0]
      const optionsResult = await client.query(
        'SELECT option_text, vote_count FROM poll_options WHERE poll_id = $1 ORDER BY option_index',
        [pollData.id]
      )
      
      return {
        id: createdPoll.id,
        roomId: createdPoll.room_id,
        question: createdPoll.question,
        createdBy: createdPoll.created_by,
        createdAt: createdPoll.created_at,
        isActive: createdPoll.is_active,
        totalVotes: createdPoll.total_votes,
        options: optionsResult.rows.map(opt => opt.option_text),
        votes: optionsResult.rows.map(opt => opt.vote_count),
        duration: createdPoll.duration,
        isAnonymous: createdPoll.is_anonymous,
        allowMultiple: createdPoll.allow_multiple,
        userVotes: {}
      }
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Error creating poll:', error);
      throw error;
    } finally {
      client.release()
    }
  }

  static async createPoll(roomId, question, options, createdBy, duration = 0, isAnonymous = false, allowMultiple = false) {
    try {
      const result = await pool.query(
        'INSERT INTO polls (room_id, question, options, created_by, duration, is_anonymous, allow_multiple) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [roomId, question, JSON.stringify(options), createdBy, duration, isAnonymous, allowMultiple]
      )
      
      const poll = result.rows[0]
      
      // Initialize poll options in poll_options table
      for (let i = 0; i < options.length; i++) {
        await pool.query(
          'INSERT INTO poll_options (poll_id, option_index, option_text) VALUES ($1, $2, $3)',
          [poll.id, i, options[i]]
        )
      }
      
      return poll
    } catch (error) {
      console.error('Error creating poll:', error)
      throw error
    }
  }

  static async findByRoomId(roomId) {
    const client = await pool.connect()
    try {
      const pollsResult = await client.query(
        `SELECT p.*, u.name as creator_name
         FROM polls p
         LEFT JOIN users u ON p.created_by = u.id
         WHERE p.room_id = $1
         ORDER BY p.created_at DESC`,
        [roomId]
      )

      const polls = []
      for (const poll of pollsResult.rows) {
        // Get options for this poll
        const optionsResult = await client.query(
          `SELECT option_text, option_index, vote_count
           FROM poll_options
           WHERE poll_id = $1
           ORDER BY option_index`,
          [poll.id]
        )

        // Get votes for this poll
        const votesResult = await client.query(
          `SELECT user_id, socket_id, option_index
           FROM poll_votes
           WHERE poll_id = $1`,
          [poll.id]
        )

        polls.push({
          id: poll.id,
          roomId: poll.room_id,
          question: poll.question,
          createdBy: poll.created_by,
          creatorName: poll.creator_name,
          createdAt: poll.created_at.toISOString(),
          closedAt: poll.closed_at ? poll.closed_at.toISOString() : null,
          isActive: poll.is_active,
          totalVotes: poll.total_votes,
          duration: poll.duration || 0,
          isAnonymous: poll.is_anonymous || false,
          allowMultiple: poll.allow_multiple || false,
          options: optionsResult.rows.map(opt => opt.option_text),
          votes: optionsResult.rows.map(opt => opt.vote_count),
          userVotes: (() => {
            const votes = {};
            votesResult.rows.forEach(vote => {
              const key = vote.socket_id || (vote.user_id ? vote.user_id.toString() : null);
              if (key) {
                votes[key] = vote.option_index;
              }
            });
            return votes;
          })()
        })
      }

      return polls
    } finally {
      client.release()
    }
  }

  static async findById(pollId) {
    const client = await pool.connect()
    try {
      const pollResult = await client.query(
        `SELECT p.*, u.name as creator_name
         FROM polls p
         LEFT JOIN users u ON p.created_by = u.id
         WHERE p.id = $1`,
        [pollId]
      )

      if (pollResult.rows.length === 0) {
        return null
      }

      const poll = pollResult.rows[0]

      // Get options
      const optionsResult = await client.query(
        `SELECT option_text, option_index, vote_count
         FROM poll_options
         WHERE poll_id = $1
         ORDER BY option_index`,
        [pollId]
      )

      // Get votes
      const votesResult = await client.query(
        `SELECT user_id, socket_id, option_index
         FROM poll_votes
         WHERE poll_id = $1`,
        [pollId]
      )

      return {
        id: poll.id,
        roomId: poll.room_id,
        question: poll.question,
        createdBy: poll.created_by,
        creatorName: poll.creator_name,
        createdAt: poll.created_at.toISOString(),
        closedAt: poll.closed_at ? poll.closed_at.toISOString() : null,
        isActive: poll.is_active,
        totalVotes: poll.total_votes,
        options: optionsResult.rows.map(opt => opt.option_text),
        votes: optionsResult.rows.map(opt => opt.vote_count),
        userVotes: (() => {
          const votes = {};
          votesResult.rows.forEach(vote => {
            const key = vote.socket_id || (vote.user_id ? vote.user_id.toString() : null);
            if (key) {
              votes[key] = vote.option_index;
            }
          });
          return votes;
        })()
      }
    } finally {
      client.release()
    }
  }

  static async vote(pollId, userId, socketId, optionIndex) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Check if user has already voted
      const existingVote = await client.query(
        `SELECT option_index FROM poll_votes
         WHERE poll_id = $1 AND (user_id = $2 OR socket_id = $3)`,
        [pollId, userId, socketId]
      )

      if (existingVote.rows.length > 0) {
        // User has already voted, update their vote
        const oldOptionIndex = existingVote.rows[0].option_index

        // Update vote record
        await client.query(
          `UPDATE poll_votes
           SET option_index = $1, voted_at = CURRENT_TIMESTAMP
           WHERE poll_id = $2 AND (user_id = $3 OR socket_id = $4)`,
          [optionIndex, pollId, userId, socketId]
        )

        // Update option vote counts
        await client.query(
          `UPDATE poll_options
           SET vote_count = vote_count - 1
           WHERE poll_id = $1 AND option_index = $2`,
          [pollId, oldOptionIndex]
        )

        await client.query(
          `UPDATE poll_options
           SET vote_count = vote_count + 1
           WHERE poll_id = $1 AND option_index = $2`,
          [pollId, optionIndex]
        )
      } else {
        // New vote
        await client.query(
          `INSERT INTO poll_votes (poll_id, user_id, socket_id, option_index)
           VALUES ($1, $2, $3, $4)`,
          [pollId, userId, socketId, optionIndex]
        )

        // Update option vote count
        await client.query(
          `UPDATE poll_options
           SET vote_count = vote_count + 1
           WHERE poll_id = $1 AND option_index = $2`,
          [pollId, optionIndex]
        )

        // Update total votes
        await client.query(
          `UPDATE polls
           SET total_votes = total_votes + 1
           WHERE id = $1`,
          [pollId]
        )
      }

      await client.query('COMMIT')

      // Return updated poll data
      return await this.findById(pollId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  static async removeVote(pollId, userId, socketId) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Get the vote to remove
      const voteResult = await client.query(
        `SELECT option_index FROM poll_votes
         WHERE poll_id = $1 AND (user_id = $2 OR socket_id = $3)`,
        [pollId, userId, socketId]
      )

      if (voteResult.rows.length === 0) {
        await client.query('ROLLBACK')
        return null // No vote to remove
      }

      const optionIndex = voteResult.rows[0].option_index

      // Remove the vote
      await client.query(
        `DELETE FROM poll_votes
         WHERE poll_id = $1 AND (user_id = $2 OR socket_id = $3)`,
        [pollId, userId, socketId]
      )

      // Update option vote count
      await client.query(
        `UPDATE poll_options
         SET vote_count = vote_count - 1
         WHERE poll_id = $1 AND option_index = $2`,
        [pollId, optionIndex]
      )

      // Update total votes
      await client.query(
        `UPDATE polls
         SET total_votes = total_votes - 1
         WHERE id = $1`,
        [pollId]
      )

      await client.query('COMMIT')

      // Return updated poll data
      return await this.findById(pollId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  static async close(pollId) {
    const client = await pool.connect()
    try {
      const result = await client.query(
        `UPDATE polls
         SET is_active = false, closed_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [pollId]
      )

      return result.rows[0]
    } finally {
      client.release()
    }
  }

  static async getActivePolls(roomId) {
    const client = await pool.connect()
    try {
      const polls = await this.findByRoomId(roomId)
      return polls.filter(poll => poll.isActive)
    } finally {
      client.release()
    }
  }

  static async getPollHistory(roomId) {
    const client = await pool.connect()
    try {
      const polls = await this.findByRoomId(roomId)
      return polls.filter(poll => !poll.isActive)
    } finally {
      client.release()
    }
  }
}