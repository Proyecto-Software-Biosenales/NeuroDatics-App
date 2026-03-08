import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { NavBar } from '../shared/components/NavBar'

function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <main className="max-w-7xl mx-auto px-8 py-6">
        <Routes>
          <Route path="/" element={<div className="text-gray-700">Inicio</div>} />
          <Route path="/proyectos" element={<div className="text-gray-700">Proyectos</div>} />
          <Route path="/dashboard" element={<div className="text-gray-700">Dashboard</div>} />
          <Route path="/reportes" element={<div className="text-gray-700">Reportes</div>} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App
