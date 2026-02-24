// src/app/api/auth/line/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildLineAuthUrl, type LineAuthContext } from '@/lib/line-auth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const contextType = searchParams.get('context');

  let context: LineAuthContext;

  switch (contextType) {
    case 'vote': {
      const professional_id = searchParams.get('professional_id');
      const qr_token = searchParams.get('qr_token');
      if (!professional_id || !qr_token) {
        return NextResponse.json({ error: 'Missing professional_id or qr_token' }, { status: 400 });
      }
      context = { type: 'vote', professional_id, qr_token };
      break;
    }
    case 'pro_register':
      context = { type: 'pro_register' };
      break;
    case 'pro_login':
      context = { type: 'pro_login' };
      break;
    default:
      return NextResponse.json({ error: 'Invalid context' }, { status: 400 });
  }

  try {
    const authUrl = buildLineAuthUrl(context);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('LINE auth URL build error:', error);
    return NextResponse.json({ error: 'Failed to build auth URL' }, { status: 500 });
  }
}
