import { BrowserRouter, Route, Routes } from 'react-router-dom'
import MeetingNotifications from './components/MeetingNotifications'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Privacy from './pages/Privacy'
import Room from './pages/Room'
import Schedule from './pages/Schedule'
import Terms from './pages/Terms'
import Lobby from './pages/Lobby'

export default function App() {
  return (
    <BrowserRouter>
      <MeetingNotifications />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </BrowserRouter>
  )
}
