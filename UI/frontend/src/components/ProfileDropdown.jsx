import { useEffect, useRef, useState } from 'react';
import defaultAvatar from '../assets/default-avatar.png';
import { useAuth } from '../contexts/AuthContext';
import './ProfileDropdown.css';

// Modern UI Icons
const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16,17 21,12 16,7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const CameraIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const SaveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17,21 17,13 7,13 7,21" />
    <polyline points="7,3 7,8 15,8" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function ProfileDropdown() {
  const { user, logout, updateProfile, uploadAvatar } = useAuth();
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!user) return null;

  const avatarUrl = user.avatar_url
    ? (process.env.NODE_ENV === 'production' ? user.avatar_url : `https://10.37.80.42:4000${user.avatar_url}`)
    : defaultAvatar;

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setAvatarFile(file);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (editName && editName !== user.name) {
        await updateProfile({ name: editName });
      }
      if (avatarFile) {
        await uploadAvatar(avatarFile);
        setAvatarFile(null);
      }
      setEditMode(false);
    } catch (e) {
      // Optionally show error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={dropdownRef} className="profile-dropdown-container">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`profile-avatar-button ${open ? 'active' : ''}`}
        aria-label="Open profile menu"
      >
        <img
          src={avatarUrl}
          alt={user.name}
          className="profile-avatar-image"
        />
        <div className="profile-status-indicator"></div>
      </button>
      {open && (
        <div className="profile-dropdown-menu">
          <div className="profile-dropdown-backdrop" onClick={() => setOpen(false)}></div>
          <div className="profile-dropdown-content">
            {!editMode ? (
              <>
                <div className="profile-header">
                  <div className="profile-avatar-large">
                    <img
                      src={avatarUrl}
                      alt={user.name}
                      className="profile-avatar-large-image"
                    />
                    <div className="profile-avatar-ring"></div>
                  </div>
                  <div className="profile-info">
                    <div className="profile-name">{user.name}</div>
                    <div className="profile-email">{user.email}</div>
                    <div className="profile-status">
                      <span className="status-dot"></span>
                      <span>Online</span>
                    </div>
                  </div>
                </div>

                <div className="profile-actions">
                  <button
                    className="profile-btn primary"
                    onClick={() => {
                      setEditMode(true);
                      setEditName(user.name);
                    }}
                  >
                    <EditIcon />
                    <span>Edit Profile</span>
                  </button>
                  <button
                    className="profile-btn secondary"
                    onClick={logout}
                  >
                    <LogoutIcon />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="profile-edit-header">
                  <h3>Edit Profile</h3>
                  <button
                    className="close-edit-btn"
                    onClick={() => setEditMode(false)}
                    disabled={loading}
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="profile-edit-content">
                  <div className="avatar-upload-section">
                    <label htmlFor="avatar-upload" className="avatar-upload-label">
                      <div className="avatar-upload-container">
                        <img
                          src={avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl}
                          alt="Avatar preview"
                          className="avatar-upload-preview"
                        />
                        <div className="avatar-upload-overlay">
                          <CameraIcon />
                          <span className="upload-text">Change</span>
                        </div>
                      </div>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="avatar-upload-input"
                        onChange={handleAvatarChange}
                      />
                    </label>
                    <div className="avatar-upload-hint">Click to change your avatar</div>
                  </div>

                  <div className="name-input-section">
                    <label className="input-label">Display Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="name-input"
                      placeholder="Enter your name"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="profile-edit-actions">
                  <button
                    className={`profile-btn save ${loading ? 'loading' : ''}`}
                    onClick={handleSave}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="loading-spinner"></span>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <SaveIcon />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                  <button
                    className="profile-btn cancel"
                    onClick={() => setEditMode(false)}
                    disabled={loading}
                  >
                    <span>Cancel</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
