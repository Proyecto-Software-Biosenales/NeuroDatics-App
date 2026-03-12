"use client"

import { AuthGuard } from "@/features/auth/components/AuthGuard"

export  default function DashboardPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-8 py-10">
          <h1 className="text-3xl font-semibold text-gray-900 mb-4">
            Dashboard
          </h1>
          <p className="text-gray-600">
            Visualiza tus estadísticas
          </p>
        </div>
      </div>
    </AuthGuard>
    
  );
};
