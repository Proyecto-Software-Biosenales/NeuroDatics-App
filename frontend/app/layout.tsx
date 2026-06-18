import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { NavBar } from "@/components/layout/NavBar"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from '@/lib/providers/AuthProvider'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning className={cn("antialiased")}>
      <body>
        <ThemeProvider defaultTheme="light">
          <AuthProvider>
            <NavBar />
            <main>{children}</main>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}

