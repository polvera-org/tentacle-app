import { type NextRequest } from 'next/server'
import { updateSession } from './lib/auth/supabase-middleware'

// Public routes that don't require authentication
const publicRoutes = ['/', '/login', '/signup', '/reset-password', '/auth/callback']

export async function proxy(request: NextRequest) {
  const { user, response } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Check if the route is public
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  )

  // Allow public routes
  if (isPublicRoute) {
    // If user is logged in and tries to access login/signup, redirect to app
    if (user && (pathname === '/login' || pathname === '/signup')) {
      return Response.redirect(new URL('/app', request.url))
    }
    return response
  }

  // Protected route - redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('returnUrl', pathname)
    return Response.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
