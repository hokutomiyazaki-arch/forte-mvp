// src/components/AuthMethodSelector.tsx
'use client';

import { useState } from 'react';

interface AuthMethodSelectorProps {
  // 投票用 or プロ登録/ログイン用
  mode: 'vote' | 'pro_auth';
  // 投票用パラメータ（mode='vote'の時のみ）
  professionalId?: string;
  qrToken?: string;
  // メール送信時のコールバック（mode='vote'でメール選択時）
  onEmailSubmit?: (email: string) => void;
  // プロ認証時のメール+パスワード送信コールバック
  onEmailPasswordSubmit?: (email: string, password: string) => void;
  // Google認証コールバック
  onGoogleAuth?: () => void;
  // ローディング状態
  isLoading?: boolean;
  // ボタンテキストのカスタマイズ
  lineButtonText?: string;
  googleButtonText?: string;
  emailButtonText?: string;
}

export default function AuthMethodSelector({
  mode,
  professionalId,
  qrToken,
  onEmailSubmit,
  onEmailPasswordSubmit,
  onGoogleAuth,
  isLoading = false,
  lineButtonText,
  googleButtonText,
  emailButtonText,
}: AuthMethodSelectorProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  // LINE認証開始
  const handleLineAuth = () => {
    if (mode === 'vote' && professionalId && qrToken) {
      // 投票データをsessionStorageに保存してからリダイレクト
      window.location.href = `/api/auth/line?context=vote&professional_id=${professionalId}&qr_token=${qrToken}`;
    } else if (mode === 'pro_auth') {
      window.location.href = '/api/auth/line?context=pro_login';
    }
  };

  // Google認証
  const handleGoogleAuth = () => {
    if (onGoogleAuth) {
      onGoogleAuth();
    }
  };

  // メール送信
  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'vote' && onEmailSubmit) {
      onEmailSubmit(email);
    } else if (mode === 'pro_auth' && onEmailPasswordSubmit) {
      onEmailPasswordSubmit(email, password);
    }
  };

  const defaultLineText = mode === 'vote' ? 'LINEで送信する' : 'LINEで登録 / ログイン';
  const defaultGoogleText = mode === 'vote' ? 'Googleで送信する' : 'Googleで登録 / ログイン';
  const defaultEmailText = mode === 'vote' ? '送信する' : '登録する';

  return (
    <div className="w-full space-y-3">
      {/* LINE Button — Primary, Most Prominent */}
      <button
        onClick={handleLineAuth}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl text-white font-bold text-base transition-all hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: '#06C755' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
        {lineButtonText || defaultLineText}
      </button>

      {/* Google Button */}
      <button
        onClick={handleGoogleAuth}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold text-base border-2 border-gray-300 bg-white text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {googleButtonText || defaultGoogleText}
      </button>

      {/* Divider */}
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-[#FAFAF7] text-gray-400">または</span>
        </div>
      </div>

      {/* Email Form Toggle */}
      {!showEmailForm ? (
        <button
          onClick={() => setShowEmailForm(true)}
          className="w-full text-center text-gray-400 text-sm underline hover:text-gray-600"
        >
          メールアドレスで{mode === 'vote' ? '送信' : '登録 / ログイン'}する
        </button>
      ) : (
        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            required
            className="w-full px-4 py-3 rounded-lg bg-white text-[#1A1A2E] border border-gray-300 focus:border-[#C4A35A] focus:ring-2 focus:ring-[#C4A35A] outline-none text-sm"
          />
          {mode === 'pro_auth' && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワード（6文字以上）"
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-lg bg-white text-[#1A1A2E] border border-gray-300 focus:border-[#C4A35A] focus:ring-2 focus:ring-[#C4A35A] outline-none text-sm"
            />
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-6 py-3 rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 bg-[#C4A35A]"
          >
            {emailButtonText || defaultEmailText}
          </button>
        </form>
      )}

      {/* Privacy notice */}
      <p className="text-center text-gray-400 text-xs mt-3">
        {mode === 'vote'
          ? '※ 投票は匿名です。プロにメールアドレスは公開されません。'
          : '※ 登録することで利用規約に同意したものとみなします。'}
      </p>
    </div>
  );
}
