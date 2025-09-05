import { BrowserRouter, Route, Routes } from 'react-router-dom'
import MeetingNotifications from './components/MeetingNotifications'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Lobby from './pages/Lobby'
import Privacy from './pages/Privacy'
import Room from './pages/Room'
import Schedule from './pages/Schedule'
import SocketTest from './pages/SocketTest'
import Terms from './pages/Terms'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <MeetingNotifications />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/schedule" element={
            <ProtectedRoute>
              <Schedule />
            </ProtectedRoute>
          } />
          <Route path="/lobby" element={
            <ProtectedRoute>
              <Lobby />
            </ProtectedRoute>
          } />
          <Route path="/room/:roomId" element={
            <ProtectedRoute>
              <Room />
            </ProtectedRoute>
          } />
          <Route path="/socket-test" element={
            <ProtectedRoute>
              <SocketTest />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
