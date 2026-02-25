export type VoiceCardTheme = {
  name: string;
  bg: string;
  bg2: string;
  text: string;
  accent: string;
  sub: string;
};

export const VOICE_CARD_PRESETS: VoiceCardTheme[] = [
  // ── Light (5) ──
  { name: "Cream", bg: "#FAF8F4", bg2: "#F3EFE7", text: "#1A1A2E", accent: "#C4A35A", sub: "#999999" },
  { name: "Blush", bg: "#FDE8E4", bg2: "#F8D5CE", text: "#3D1A14", accent: "#D4665A", sub: "#A07068" },
  { name: "Lavender", bg: "#EDE5F5", bg2: "#DDD2ED", text: "#2A1E3D", accent: "#8B6BB5", sub: "#8878A0" },
  { name: "Mint", bg: "#E2F5EE", bg2: "#CEEDDF", text: "#153028", accent: "#3A9B72", sub: "#6A9A84" },
  { name: "Sky", bg: "#E4F0FA", bg2: "#D0E4F5", text: "#142840", accent: "#3A82C4", sub: "#6A90B0" },

  // ── Dark (5) ──
  { name: "Midnight", bg: "#1A1A2E", bg2: "#12122A", text: "#F0ECE4", accent: "#C4A35A", sub: "#7A7780" },
  { name: "Charcoal", bg: "#2C2C2C", bg2: "#1E1E1E", text: "#F5F5F0", accent: "#E8E0D0", sub: "#888888" },
  { name: "Forest", bg: "#1B3A2D", bg2: "#112A1E", text: "#E8F0E5", accent: "#7ED4A0", sub: "#6A9A7A" },
  { name: "Navy", bg: "#162040", bg2: "#0E1630", text: "#E8ECF5", accent: "#5EA8E8", sub: "#6880A8" },
  { name: "Wine", bg: "#3D1828", bg2: "#2A0E1C", text: "#F5E8EC", accent: "#E87A9A", sub: "#A06878" },

  // ── Vibrant (5) ──
  { name: "Sunset", bg: "#F97316", bg2: "#EA6A10", text: "#FFFFFF", accent: "#FFF3C4", sub: "#FFD4A0" },
  { name: "Electric", bg: "#4F46E5", bg2: "#4338CA", text: "#FFFFFF", accent: "#C4B5FD", sub: "#A0A0D0" },
  { name: "Rose", bg: "#E11D48", bg2: "#BE123C", text: "#FFFFFF", accent: "#FFD6E0", sub: "#FFB0C4" },
  { name: "Emerald", bg: "#059669", bg2: "#047857", text: "#FFFFFF", accent: "#A7F3D0", sub: "#86EFAC" },
  { name: "Cyan", bg: "#0891B2", bg2: "#0E7490", text: "#FFFFFF", accent: "#CFFAFE", sub: "#A5F3FC" },
];

// hexをrgbaに変換するユーティリティ
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// hex を少し暗くする（カスタムカラーの bg2 生成用）
export function darkenHex(hex: string, amount = 0.1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const d = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return `#${d(r).toString(16).padStart(2, "0")}${d(g).toString(16).padStart(2, "0")}${d(b).toString(16).padStart(2, "0")}`;
}

// カスタムカラーからテーマを生成
export function buildCustomTheme(bg: string, text: string, accent: string): VoiceCardTheme {
  return {
    name: "Custom",
    bg,
    bg2: darkenHex(bg, 0.1),
    text,
    accent,
    sub: hexToRgba(text, 0.45),
  };
}

// DB保存データからテーマを復元
export function resolveTheme(saved: any): { theme: VoiceCardTheme; isCustom: boolean; presetIndex: number } {
  if (!saved) {
    return { theme: VOICE_CARD_PRESETS[0], isCustom: false, presetIndex: 0 };
  }
  if (saved.type === "custom") {
    return {
      theme: buildCustomTheme(saved.bg, saved.text, saved.accent),
      isCustom: true,
      presetIndex: -1,
    };
  }
  // preset
  const idx = VOICE_CARD_PRESETS.findIndex(p => p.name === saved.preset);
  return {
    theme: idx >= 0 ? VOICE_CARD_PRESETS[idx] : VOICE_CARD_PRESETS[0],
    isCustom: false,
    presetIndex: idx >= 0 ? idx : 0,
  };
}
