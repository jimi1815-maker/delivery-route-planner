#!/usr/bin/env python3
"""
decode_csv.py — 自動偵測 CSV 編碼並轉為 UTF-8

用法:
  python3 decode_csv.py <input.csv>              # 輸出到 <input>_utf8.csv
  python3 decode_csv.py <input.csv> <output.csv> # 指定輸出檔名
"""

import sys
import os

# 常見台灣 CSV 編碼，依優先順序嘗試
# 注意: 不包含 latin-1，因為它接受任何 byte 會造成誤判
ENCODINGS = ['utf-8-sig', 'utf-8', 'cp950', 'big5', 'gbk', 'shift_jis']


def detect_and_decode(raw_bytes):
    """嘗試多種編碼，回傳 (decoded_str, encoding_name)"""
    for enc in ENCODINGS:
        try:
            decoded = raw_bytes.decode(enc)
            return decoded, enc
        except (UnicodeDecodeError, ValueError):
            continue

    # 所有嚴格模式都失敗 → 用 cp950 + 忽略少數壞字元
    # (台灣系統常見 CP950，偶爾夾帶非標準 byte)
    decoded = raw_bytes.decode('cp950', errors='ignore')
    return decoded, 'cp950 (少數無法辨識的字元已略過)'


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_path = sys.argv[1]

    if len(sys.argv) >= 3:
        output_path = sys.argv[2]
    else:
        name, ext = os.path.splitext(input_path)
        output_path = f"{name}_utf8{ext}"

    # 讀取原始 bytes
    with open(input_path, 'rb') as f:
        raw = f.read()

    print(f"📄 輸入檔案: {input_path}")
    print(f"   大小: {len(raw):,} bytes")

    # 偵測編碼並解碼
    decoded, encoding = detect_and_decode(raw)

    lines = decoded.strip().split('\n')
    print(f"   偵測編碼: {encoding}")
    print(f"   總行數: {len(lines)} (含 header)")

    # 寫出 UTF-8
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(decoded)

    output_size = os.path.getsize(output_path)
    print(f"\n✅ 轉換完成: {output_path}")
    print(f"   大小: {output_size:,} bytes")


if __name__ == '__main__':
    main()
