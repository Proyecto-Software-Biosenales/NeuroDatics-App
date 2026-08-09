import { RegisterForm } from '@/features/auth/components/RegisterForm'

export function RegisterPage() {
  return (
    <section className="app-page-shell px-4 py-8 sm:px-6 lg:px-8 2xl:py-12">
      <div className="mx-auto flex min-h-[calc(100svh-var(--app-nav-height)-4rem)] max-w-6xl items-center justify-center">
        <RegisterForm />
      </div>
    </section>
  )
}
