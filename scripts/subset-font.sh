#!/bin/bash
# 日本語サブセットフォント生成スクリプト
#
# 入力 :
#   public/fonts/NotoSansJP-Variable.ttf  ... Variable Font 本体 (約9MB)
#   scripts/jp-chars.txt                  ... 常用漢字(2,136) + 人名用漢字(863) = 2,999字
#                                             (vaiorabbit/everyday_use_kanji より取得)
# 出力 :
#   public/fonts/NotoSansJP-subset.ttf    ... Bold + 日本語サブセット (目標 500-700KB)
#
# 含める文字:
# - 英数字記号       (U+0020-007E)
# - 句読点           (U+3000-303F)
# - ひらがな         (U+3040-309F)
# - カタカナ         (U+30A0-30FF)
# - 半角全角         (U+FF00-FFEF)
# - 常用＋人名用漢字 (scripts/jp-chars.txt)
#
# 手順:
#   1. fonttools varLib.instancer で Variable Font から wght=700 (Bold) を抽出
#   2. pyftsubset で --text-file + --unicodes をマージしてサブセット化
#
# CJK 全域 (U+4E00-9FBF, 20,928字) を取り込むと 4.8MB に膨れる過去事例があるため、
# 必ず text-file で常用＋人名用漢字に絞ること。

set -e

cd "$(dirname "$0")/.."

# pyftsubset / fonttools の場所を解決（pip3 install --user の既定パス）
if ! command -v pyftsubset >/dev/null 2>&1; then
  export PATH="$HOME/Library/Python/3.9/bin:$PATH"
fi

if ! command -v pyftsubset >/dev/null 2>&1; then
  echo "ERROR: pyftsubset not found. Install with: pip3 install --user fonttools brotli zopfli" >&2
  exit 1
fi

if [ ! -f scripts/jp-chars.txt ]; then
  echo "ERROR: scripts/jp-chars.txt が見つかりません。常用＋人名用漢字リストを配置してください。" >&2
  exit 1
fi

# Variable Font が無ければ自動DL（再生成可能な中間ファイルなので Git 管理外）
if [ ! -f public/fonts/NotoSansJP-Variable.ttf ]; then
  echo "NotoSansJP-Variable.ttf が無いのでダウンロードします..."
  mkdir -p public/fonts
  curl -fsSL -o public/fonts/NotoSansJP-Variable.ttf \
    "https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf"
fi

cd public/fonts

# Step 1: Variable Font から Bold (wght=700) を抽出
echo "[1/2] Bold ウェイトを抽出中..."
fonttools varLib.instancer NotoSansJP-Variable.ttf wght=700 \
  --output NotoSansJP-Bold-tmp.ttf

# Step 2: サブセット化（text-file + 仮名/記号の Unicode 範囲）
echo "[2/2] サブセット化中..."
pyftsubset NotoSansJP-Bold-tmp.ttf \
  --output-file=NotoSansJP-subset.ttf \
  --text-file=../../scripts/jp-chars.txt \
  --unicodes="U+0020-007E,U+3000-303F,U+3040-309F,U+30A0-30FF,U+FF00-FFEF" \
  --layout-features='' \
  --no-hinting \
  --desubroutinize \
  --drop-tables+=GSUB,GPOS,GDEF,FFTM,kern \
  --recommended-glyphs

# 中間ファイル削除
rm NotoSansJP-Bold-tmp.ttf

echo "サブセット化完了:"
ls -la NotoSansJP-subset.ttf
