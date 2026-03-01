import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// 認証が必要なルート
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/mycard(.*)',
  '/myproof(.*)',
  '/admin(.*)',
  '/org/dashboard(.*)',
  '/org/register(.*)',
  '/onboarding(.*)',
  '/auth-redirect(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
