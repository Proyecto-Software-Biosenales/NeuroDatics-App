'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export const NavBar = () => {
  const pathname = usePathname()

  const navItems = [
    { path: '/dashboard', label: 'Inicio' },
    { path: '/proyectos', label: 'Proyectos' },
    { path: '/reportes', label: 'Reportes' },
  ]

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <div className="max-w-7xl mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center gap-3 group">
              <img
                src="assets/NeuroDatics-logo.svg"
                alt="NeuroDatics Logo"
                className="h-12 w-auto transition-transform group-hover:scale-105"
              />
              <span className="text-xl font-semibold text-gray-900 tracking-tight">
                NeuroDatics
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`px-4 py-2 text-base font-medium rounded-lg transition-all duration-200 ${
                    pathname === item.path
                      ? 'text-gray-900 bg-gray-100'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </header>
  )
}
