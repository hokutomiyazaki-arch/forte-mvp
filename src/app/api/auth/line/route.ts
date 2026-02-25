// src/app/api/auth/line/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildLineAuthUrl, type LineAuthContext } from '@/lib/line-auth';

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';
  const searchParams = request.nextUrl.searchParams;
  const contextType = searchParams.get('context');

  console.log('=== LINE Auth Debug ===');
  console.log('User-Agent:', userAgent);
  console.log('Context:', contextType);
  console.log('Full URL:', request.url);
  console.log('LINE_CHANNEL_ID:', process.env.LINE_CHANNEL_ID ? 'SET' : 'MISSING');
  console.log('LINE_REDIRECT_URI:', process.env.LINE_REDIRECT_URI);

  let context: LineAuthContext;

  switch (contextType) {
    case 'vote': {
      const professional_id = searchParams.get('professional_id');
      const qr_token = searchParams.get('qr_token');
      const vote_data_str = searchParams.get('vote_data');
      if (!professional_id || !qr_token || !vote_data_str) {
        return NextResponse.json({ error: 'Missing professional_id, qr_token or vote_data' }, { status: 400 });
      }
      try {
        const vote_data = JSON.parse(decodeURIComponent(vote_data_str));
        context = { type: 'vote', professional_id, qr_token, vote_data };
      } catch {
        return NextResponse.json({ error: 'Invalid vote_data' }, { status: 400 });
      }
      break;
    }
    case 'pro_register':
      context = { type: 'pro_register' };
      break;
    case 'pro_login':
      context = { type: 'pro_login' };
      break;
    case 'client_login':
      context = { type: 'client_login' };
      break;
    default:
      return NextResponse.json({ error: 'Invalid context' }, { status: 400 });
  }

  try {
    const authUrl = buildLineAuthUrl(context);
    console.log('Generated LINE Auth URL length:', authUrl.length);
    console.log('Generated LINE Auth URL:', authUrl);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('LINE auth URL build error:', error);
    return NextResponse.json({ error: 'Failed to build auth URL' }, { status: 500 });
  }
}
