import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function Schedule() {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    duration: '60',
    participants: ''
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleInputChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    // Simulate API call
    setTimeout(() => {
      setSuccess(true)
      setLoading(false)
    }, 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', color: '#111' }}>
      <header style={{ borderBottom: '1px solid #e5e7eb', background: '#ffffffcc', backdropFilter: 'blur(6px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/connective.jpg-PBlOuDu7PyDeHhj0QKFzOBHbrtt7j5.jpeg"
                alt="Connective Logo"
                style={{ height: 40, width: 40 }}
              />
              <span style={{ fontSize: 20, fontWeight: 700, color: '#1a73e8' }}>Connective</span>
            </Link>
            <Link to="/" style={{ color: '#6b7280', textDecoration: 'none' }}>← Back to Home</Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 24, textAlign: 'center' }}>Schedule a Meeting</h1>
        
        <div style={{ background: 'white', padding: 32, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Meeting Scheduled!</h2>
              <p style={{ color: '#6b7280', marginBottom: 24 }}>
                Your meeting has been scheduled successfully. You'll receive a confirmation email shortly.
              </p>
              <Link to="/" style={{ background: '#1a73e8', color: 'white', padding: '12px 24px', borderRadius: 8, textDecoration: 'none' }}>
                Back to Home
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
              <div>
                <label htmlFor="title" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                  Meeting Title *
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="Enter meeting title"
                  style={{ width: '100%', height: 48, borderRadius: 8, border: '1px solid #e5e7eb', padding: '0 12px' }}
                />
              </div>

              <div>
                <label htmlFor="description" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Enter meeting description"
                  rows={4}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb', padding: '12px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label htmlFor="date" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                    Date *
                  </label>
                  <input
                    id="date"
                    name="date"
                    type="date"
                    required
                    value={formData.date}
                    onChange={handleInputChange}
                    style={{ width: '100%', height: 48, borderRadius: 8, border: '1px solid #e5e7eb', padding: '0 12px' }}
                  />
                </div>

                <div>
                  <label htmlFor="time" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                    Time *
                  </label>
                  <input
                    id="time"
                    name="time"
                    type="time"
                    required
                    value={formData.time}
                    onChange={handleInputChange}
                    style={{ width: '100%', height: 48, borderRadius: 8, border: '1px solid #e5e7eb', padding: '0 12px' }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="duration" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                  Duration
                </label>
                <select
                  id="duration"
                  name="duration"
                  value={formData.duration}
                  onChange={handleInputChange}
                  style={{ width: '100%', height: 48, borderRadius: 8, border: '1px solid #e5e7eb', padding: '0 12px' }}
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                </select>
              </div>

              <div>
                <label htmlFor="participants" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                  Participants (email addresses, separated by commas)
                </label>
                <textarea
                  id="participants"
                  name="participants"
                  value={formData.participants}
                  onChange={handleInputChange}
                  placeholder="Enter participant email addresses"
                  rows={3}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb', padding: '12px', resize: 'vertical' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  height: 48,
                  borderRadius: 10,
                  border: 'none',
                  background: '#1a73e8',
                  color: 'white',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Scheduling...' : 'Schedule Meeting'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}



