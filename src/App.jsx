import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import VibeSync from './pages/VibeSync'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <Routes>
        <Route path="/" element={
          <div>
            <h1>Home</h1>
            <p>Go to <a href="/vibesync">VibeSync</a></p>
          </div>
        } />
        <Route path="/vibesync" element={<VibeSync />} />
      </Routes>
    </>
  )
}

export default App
