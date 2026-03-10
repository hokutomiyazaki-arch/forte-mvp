import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// 公開ルート（認証不要）
const isPublicMyProof = createRouteMatcher(['/myproof/p/(.*)'])

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
  if (isPublicMyProof(req)) return
  if (isProtectedRoute(req)) await auth.protect()
}, (req) => {
  const proxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL
  return proxyUrl ? { proxyUrl } : {}
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
