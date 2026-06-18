import { RegisterForm } from '@/features/auth/components/RegisterForm'

export function RegisterPage() {
  return (
    <section className="min-h-[calc(100vh-81px)] bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-177px)] max-w-6xl items-center justify-center">
        <RegisterForm />
      </div>
    </section>
  )
}