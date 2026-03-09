import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import logoSvg from '../../assets/NeuroDatics-logo.svg'
import { useAuth } from '../../app/providers/AuthProvider'

export const NavBar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const navItems = [
    { path: '/dashboard', label: 'Inicio' },
    { path: '/proyectos', label: 'Proyectos' },
    { path: '/reportes', label: 'Reportes' },
  ]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const fullName = user?.user_metadata?.full_name as string | undefined
  const firstName = fullName?.split(' ')[0]
  const initials = fullName
    ? fullName
        .split(' ')
        .map((n: string) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : (user?.email?.[0]?.toUpperCase() ?? '?')

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <div className="max-w-7xl mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link to="/" className="flex items-center gap-3 group">
              <img
                src={logoSvg}
                alt="NeuroDatics Logo"
                className="h-12 w-auto transition-transform group-hover:scale-105"
              />
              <span className="text-xl font-semibold text-gray-900 tracking-tight">
                NeuroDatics
              </span>
            </Link>

            {user && (
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-4 py-2 text-base font-medium rounded-lg transition-all duration-200 ${
                      location.pathname === item.path
                        ? 'text-gray-900 bg-gray-100'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName ?? 'User avatar'}
                    className="h-9 w-9 rounded-full object-cover ring-2 ring-gray-200"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold select-none">
                    {initials}
                  </div>
                )}
                {firstName && (
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">
                    {firstName}
                  </span>
                )}
              </div>

              <button
                onClick={handleSignOut}
                title="Salir"
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut size={16} />
                <span className="hidden sm:block">Salir</span>
              </button>
            </div>
          ) : (
            <button className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors">
              <User size={20} className="text-gray-700" />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
