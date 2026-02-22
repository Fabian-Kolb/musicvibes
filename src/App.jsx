import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import VibeSync from './pages/VibeSync'
import Home from './pages/Home'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

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
