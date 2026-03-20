'use client';

import { useState } from 'react';

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[14px] text-[#888] whitespace-pre-line">{label}</span>
        <span className="text-[15px] font-medium text-[#1A1A2E]">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-[#DDD] rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-[18px]
                   [&::-webkit-slider-thumb]:h-[18px]
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-[#C4A35A]
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-moz-range-thumb]:w-[18px]
                   [&::-moz-range-thumb]:h-[18px]
                   [&::-moz-range-thumb]:rounded-full
                   [&::-moz-range-thumb]:bg-[#C4A35A]
                   [&::-moz-range-thumb]:border-0
                   [&::-moz-range-thumb]:cursor-pointer"
      />
    </div>
  );
}

export default function ProofCalculator() {
  const [years, setYears] = useState(10);
  const [clients, setClients] = useState(30);
  const [rate, setRate] = useState(30);

  const total = Math.round(years * clients * 12 * (rate / 100));

  return (
    <section className="pt-4 pb-16 px-5 bg-[#FAFAF7]">
      <div className="max-w-[520px] mx-auto bg-white rounded-2xl px-6 py-10 sm:px-10 shadow-sm border border-[#E8E8E8]">
        <h2 className="text-xl font-medium text-[#1A1A2E] leading-relaxed mb-1">
          実績簡単チェック
        </h2>
        <p className="text-[14px] text-[#888] mb-10">
          〜あなたのプロとしての実績を入力して下さい〜
        </p>

        {/* スライダー群 */}
        <Slider
          label="経験年数"
          value={years}
          min={1}
          max={30}
          step={1}
          display={`${years}年`}
          onChange={setYears}
        />
        <Slider
          label="月の平均クライアント数"
          value={clients}
          min={5}
          max={150}
          step={5}
          display={`${clients}人`}
          onChange={setClients}
        />
        <Slider
          label={`「この人の力になれた」\nと思える割合`}
          value={rate}
          min={5}
          max={80}
          step={5}
          display={`${rate}%`}
          onChange={setRate}
        />

        {/* 結果表示 — コピー変更禁止 */}
        <div className="border-t border-[#E0E0E0] pt-8 text-center mt-10">
          <p className="text-[13px] text-[#888] mb-1">
            あなたが力になれた人
          </p>
          <p className="text-[48px] font-medium text-[#1A1A2E] leading-tight">
            {total.toLocaleString()}人
          </p>

          <div className="mt-8 bg-[#FFF5F5] rounded-xl py-5 px-4">
            <p className="text-[13px] font-medium text-[#E24B4A] mb-1">
              証明された実績の数
            </p>
            <p className="text-[48px] font-bold text-[#E24B4A] leading-tight">
              0
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
