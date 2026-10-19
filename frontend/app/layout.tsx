import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { NavBar } from "@/components/layout/NavBar"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from '@/lib/providers/AuthProvider'
import { ScreenSettingsNotice } from "@/features/settings/components/ScreenSettingsNotice"

// The icon is app/favicon.ico, the NeuroDatics logo.
export const metadata: Metadata = {
  title: "NeuroDatics",
}

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
            <ScreenSettingsNotice />
            <main>{children}</main>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}

