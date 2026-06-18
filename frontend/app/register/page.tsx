"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { useAuth } from '@/lib/providers/AuthProvider'

export default function Page() {
	const { currentUser, loading } = useAuth()
	const router = useRouter()

	useEffect(() => {
		if (!loading && currentUser) {
			router.replace('/dashboard')
		}
	}, [currentUser, loading, router])

	if (loading) {
		return null
	}

	if (currentUser) {
		return null
	}

	return <RegisterPage />
}

