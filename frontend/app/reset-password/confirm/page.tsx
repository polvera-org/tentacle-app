import Link from 'next/link'
import { PasswordResetConfirm } from '@/components/auth/password-reset-confirm'

export default function ResetPasswordConfirmPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Set new password</h1>
          <p className="mt-2 text-sm text-gray-500">
            Create a new password for your account
          </p>
        </div>

        <div className="p-6 sm:p-8">
          <PasswordResetConfirm />
        </div>

        <p className="text-center text-sm text-gray-600">
          Need help?{' '}
          <Link
            href="/login"
            className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            Contact support
          </Link>
        </p>
      </div>
    </div>
  )
}
