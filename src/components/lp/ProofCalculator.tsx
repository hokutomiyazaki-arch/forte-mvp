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
  const [recorded, setRecorded] = useState(0);

  const total = Math.round(years * clients * 12 * (rate / 100));

  const MAX_BAR = 160;
  const totalBarH = MAX_BAR;
  const recBarH = total > 0
    ? Math.max(2, (recorded / total) * MAX_BAR)
    : 2;

  return (
    <section className="pt-4 pb-16 px-5 bg-[#FAFAF7]">
      <div className="max-w-[520px] mx-auto">
        <div className="border border-[#E0E0E0] rounded-2xl p-6 sm:p-8 bg-white">
        <h2 className="text-xl font-medium text-[#1A1A2E] leading-relaxed mb-2 text-center">
          積み上げた実績、<br />今いくつ残ってますか？
        </h2>
        <p className="text-sm text-[#888] text-center mb-10">
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
        <div className="mb-10">
          <Slider
            label="そのうち、記録として残っている数"
            value={recorded}
            min={0}
            max={50}
            step={1}
            display={`${recorded}件`}
            onChange={setRecorded}
          />
        </div>

        {/* 棒グラフ */}
        <div className="border-t border-[#E0E0E0] pt-8">
          <div className="flex items-end justify-center gap-12 h-[220px]">
            {/* 左バー: 力になれた人 */}
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-[28px] font-medium text-[#1A1A2E] mb-2"
                    style={{ transition: 'opacity 0.2s ease' }}>
                {total.toLocaleString()}
              </span>
              <div
                style={{
                  width: 80,
                  height: totalBarH,
                  background: '#C4A35A',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.4s ease',
                }}
              />
              <span className="text-[12px] text-[#888] mt-2 text-center">
                力になれた人
              </span>
            </div>

            {/* 右バー: 証明された実績 */}
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-[28px] font-medium text-[#E24B4A] mb-2"
                    style={{ transition: 'opacity 0.2s ease' }}>
                {recorded.toLocaleString()}
              </span>
              <div
                style={{
                  width: 80,
                  height: recBarH,
                  minHeight: 2,
                  background: '#E24B4A',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.4s ease',
                }}
              />
              <span className="text-[12px] text-[#888] mt-2 text-center">
                証明された実績
              </span>
            </div>
          </div>
        </div>

        {/* 締めコピー */}
        <p className="text-[15px] text-[#888] text-center mt-8">
          でも、誰もそれを知らない。
        </p>
        </div>
      </div>
    </section>
  );
}
