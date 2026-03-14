import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// 公開ルート（認証不要）
const isPublicMyProof = createRouteMatcher(['/myproof/p/(.*)'])

// 認証が必要なルート（Clerk認証）
// ※ /admin/* は Clerk ではなくパスワード保護なので除外
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/mycard(.*)',
  '/myproof(.*)',
  '/org/dashboard(.*)',
  '/org/register(.*)',
  '/onboarding(.*)',
  '/setup(.*)',
  '/auth-redirect(.*)',
])

// パスワード保護ルート
const PASSWORD_ROUTES = [
  {
    path: '/admin',
    cookieName: 'rp_admin_auth',
    loginPath: '/admin/login',
  },
  {
    path: '/org-register',
    cookieName: 'rp_org_auth',
    loginPath: '/org-register/login',
  },
]

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl

  // パスワード保護チェック（Clerk認証より先に処理）
  for (const route of PASSWORD_ROUTES) {
    if (pathname.startsWith(route.path)) {
      // ログインページ自体は公開
      if (pathname === route.loginPath) return

      // Cookie チェック
      const cookie = req.cookies.get(route.cookieName)
      if (!cookie || cookie.value !== 'authenticated') {
        const loginUrl = new URL(route.loginPath, req.url)
        loginUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(loginUrl)
      }
      return // パスワード認証OK → アクセス許可
    }
  }

  // /myproof/p/[token] は公開ページなので認証スキップ
  if (isPublicMyProof(req)) {
    return
  }
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
