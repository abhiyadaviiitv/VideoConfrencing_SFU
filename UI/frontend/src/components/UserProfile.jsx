import { Camera, Edit3, Save, User, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function UserProfile() {
  const { user, logout, updateProfile, uploadAvatar } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({ name: user?.name || '' })
  const [avatarFile, setAvatarFile] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    try {
      // Update profile if name changed
      if (editData.name !== user.name) {
        await updateProfile({ name: editData.name })
      }
      
      // Upload avatar if selected
      if (avatarFile) {
        await uploadAvatar(avatarFile)
        setAvatarFile(null)
      }
      
      setIsEditing(false)
    } catch (error) {
      console.error('Error updating profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setEditData({ name: user?.name || '' })
    setAvatarFile(null)
    setIsEditing(false)
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (file && file.type.startsWith('image/')) {
      setAvatarFile(file)
    }
  }

  if (!user) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: 20,
      padding: 28,
      color: 'white',
      boxShadow: '0 20px 40px rgba(0,0,0,0.15), 0 8px 16px rgba(0,0,0,0.1)',
      border: '1px solid rgba(255,255,255,0.15)',
      backdropFilter: 'blur(20px)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'absolute',
        top: -50,
        right: -50,
        width: 100,
        height: 100,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.1)',
        filter: 'blur(20px)'
      }} />
      <div style={{
        position: 'absolute',
        bottom: -30,
        left: -30,
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.08)',
        filter: 'blur(15px)'
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Avatar Section */}
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: user.avatar_url 
              ? `url(${process.env.NODE_ENV === 'production' ? user.avatar_url : `http://localhost:4000${user.avatar_url}`}) center/cover` 
              : 'linear-gradient(135deg, #ff6b6b, #4ecdc4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '3px solid rgba(255,255,255,0.3)',
            fontSize: 24,
            fontWeight: 'bold',
            overflow: 'hidden'
          }}>
            {!user.avatar_url ? (
              <User size={32} color="white" />
            ) : (
              <img 
                src={process.env.NODE_ENV === 'production' ? user.avatar_url : `http://localhost:4000${user.avatar_url}`}
                alt={user.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
                onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextSibling.style.display = 'flex'
                }}
              />
            )}
            {user.avatar_url && (
              <div style={{
                display: 'none',
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #ff6b6b, #4ecdc4)'
              }}>
                <User size={32} color="white" />
              </div>
            )}
          </div>
          
          {isEditing && (
            <>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: 'none' }}
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                style={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#1a73e8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: '2px solid white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
              >
                <Camera size={14} color="white" />
              </label>
            </>
          )}
        </div>

        {/* Profile Info */}
        <div style={{ flex: 1 }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: 'white',
                  fontSize: 18,
                  fontWeight: 600
                }}
                placeholder="Your name"
              />
              {avatarFile && (
                <div style={{
                  fontSize: 12,
                  opacity: 0.8,
                  background: 'rgba(255,255,255,0.1)',
                  padding: '4px 8px',
                  borderRadius: 4
                }}>
                  New avatar: {avatarFile.name}
                </div>
              )}
            </div>
          ) : (
            <div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                {user.name}
              </h3>
              <p style={{ margin: '4px 0 0 0', opacity: 0.8, fontSize: 14 }}>
                {user.email}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  borderRadius: 12,
                  padding: '10px 16px',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.target.style.transform = 'translateY(-1px)'
                    e.target.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }
                }}
              >
                <Save size={16} />
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 12,
                  padding: '10px 16px',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(10px)'
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.target.style.background = 'rgba(255,255,255,0.25)'
                    e.target.style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.target.style.background = 'rgba(255,255,255,0.15)'
                    e.target.style.transform = 'translateY(0)'
                  }
                }}
              >
                <X size={16} />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 12,
                  padding: '10px 16px',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(10px)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255,255,255,0.25)'
                  e.target.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(255,255,255,0.15)'
                  e.target.style.transform = 'translateY(0)'
                }}
              >
                <Edit3 size={16} />
                Edit
              </button>
              <button
                onClick={logout}
                style={{
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none',
                  borderRadius: 12,
                  padding: '10px 16px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-1px)'
                  e.target.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)'
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)'
                }}
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}