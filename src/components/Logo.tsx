'use client';

import React from 'react';

interface LogoProps {
  size?: number;
  dark?: boolean;
  showTagline?: boolean;
}

export default function Logo({ size = 1, dark = false, showTagline = true }: LogoProps) {
  const textColor = dark ? '#FFFFFF' : '#1A1A2E';
  const gold = '#C4A35A';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      {/* ロゴ本体: サークル + ワードマーク */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 * size }}>
        {/* SVGサークル */}
        <svg
          width={44 * size}
          height={44 * size}
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 外円 */}
          <circle cx="22" cy="22" r="20" stroke={gold} strokeWidth="1.5" fill="none" />
          {/* 内円 */}
          <circle cx="22" cy="22" r="16" stroke={gold} strokeWidth="0.5" fill="none" opacity="0.4" />
          {/* R */}
          <text
            x="22"
            y="22"
            textAnchor="middle"
            dominantBaseline="central"
            fill={gold}
            fontSize="20"
            fontWeight="700"
            fontFamily="'Inter', sans-serif"
          >
            R
          </text>
        </svg>

        {/* ワードマーク */}
        <div style={{ letterSpacing: 5, fontFamily: "'Inter', sans-serif", fontSize: 18 * size }}>
          <span style={{ fontWeight: 300, color: textColor }}>REAL</span>
          <span style={{ fontWeight: 700, color: gold }}>PROOF</span>
        </div>
      </div>

      {/* キャッチフレーズ */}
      {showTagline && (
        <div
          style={{
            fontSize: 8 * size,
            fontWeight: 500,
            opacity: 0.7,
            color: gold,
            letterSpacing: 3,
            fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
            marginTop: 4 * size,
            paddingLeft: (44 + 10) * size,
          }}
        >
          強みが、あなたを定義する。
        </div>
      )}
    </div>
  );
}
