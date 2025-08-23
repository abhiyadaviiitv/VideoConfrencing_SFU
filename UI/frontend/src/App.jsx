import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Lobby from './pages/Lobby'
import Room from './pages/Room'
import MeetingNotifications from './components/MeetingNotifications'

export default function App() {
  return (
    <BrowserRouter>
      <MeetingNotifications />
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </BrowserRouter>
  )
}
