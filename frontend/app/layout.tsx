import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { NavBar } from "@/lib/shared/components/NavBar"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning className={cn("antialiased")}>
      <body>
        <ThemeProvider>
          <NavBar />
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
