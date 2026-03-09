import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { NavBar } from '../shared/components/NavBar'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { LoginPage } from '../features/auth/LoginPage'
import { AuthCallback } from '../features/auth/AuthCallback'
import { useAuth } from './providers/AuthProvider'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-8 py-6">
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
          />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route
            path="/"
            element={<Navigate to={user ? '/dashboard' : '/login'} replace />}
          />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div className="text-gray-700">Dashboard</div>} />
            <Route path="/proyectos" element={<div className="text-gray-700">Proyectos</div>} />
            <Route path="/reportes" element={<div className="text-gray-700">Reportes</div>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
