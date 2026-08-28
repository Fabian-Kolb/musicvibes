import { Routes, Route } from 'react-router-dom'
import VibeSync from './pages/VibeSync'
import Home from './pages/Home'
import './App.css'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/vibesync" element={<VibeSync />} />
      </Routes>
    </>
  )
}

export default App
