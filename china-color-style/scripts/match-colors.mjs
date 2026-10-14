#!/usr/bin/env node
/**
 * 把任意色值映射到数据集里最接近的中国传统色（确定性，不调用模型）。
 *
 * 距离用 CIELAB 空间的欧氏距离（ΔE76），比直接比 RGB 更接近人眼感知。
 * 说明：ΔE76 未做 CIEDE2000 的色相/彩度加权修正，用于「找最接近的传统色」足够，
 * 但不应把 ΔE 数值当作严格的色差公差。
 *
 * 用法: node match-colors.mjs "#A1B2C3,#D4E5F6" [每个色的候选数=3]
 *       node match-colors.mjs --file palette.json      (接受 extract-palette.mjs 的输出)
 * 输出: JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 数据随包自带：默认取本脚本上一级的 data/，因此整个文件夹可整体拷走
const BUNDLE_DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DATA_DIR = process.env.CHINA_COLOR_DATA || BUNDLE_DATA;

function srgbToLab(r, g, b) {
  const f = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = f(r), G = f(g), B = f(b);
  // sRGB -> XYZ (D65)
  let X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  let Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / 1.00000;
  let Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
  const g2 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  X = g2(X); Y = g2(Y); Z = g2(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

function parseHex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseRgbStr(s) {
  const m = /^R(\d{1,3})G(\d{1,3})B(\d{1,3})$/i.exec(String(s || '').replace(/\s+/g, ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
}

function loadDataset() {
  const file = path.join(DATA_DIR, 'colors.json');
  if (!fs.existsSync(file)) {
    console.log(JSON.stringify({ ok: false, error: `找不到色卡数据集: ${file}（可用 CHINA_COLOR_DATA 指定目录）` }, null, 1));
    process.exit(0);
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  return rows
    .map((r) => {
      const rgb = parseRgbStr(r.rgb);
      if (!rgb) return null;
      return { ...r, rgbArr: rgb, lab: srgbToLab(...rgb) };
    })
    .filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const topK = Math.max(1, parseInt(args.find((a) => /^\d+$/.test(a)) || '3', 10) || 3);
  let inputs = [];

  if (args[0] === '--file') {
    const f = args[1];
    if (!f || !fs.existsSync(f)) {
      console.log(JSON.stringify({ ok: false, error: '用法: node match-colors.mjs --file <palette.json>' }, null, 1));
      process.exit(0);
    }
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    inputs = (j.colors || []).map((c) => ({ hex: c.hex, share: c.share }));
  } else {
    const list = (args[0] || '').split(',').map((s) => s.trim()).filter(Boolean);
    inputs = list.map((h) => ({ hex: h, share: null }));
  }
  if (!inputs.length) {
    console.log(JSON.stringify({ ok: false, error: '用法: node match-colors.mjs "#A1B2C3,#D4E5F6" [候选数]' }, null, 1));
    process.exit(0);
  }

  const data = loadDataset();
  const results = inputs.map((inp) => {
    const rgb = parseHex(inp.hex);
    if (!rgb) return { input: inp.hex, ok: false, error: '无法解析为 #RRGGBB' };
    const lab = srgbToLab(...rgb);
    const scored = data
      .map((d) => ({ d, de: Math.sqrt((lab[0] - d.lab[0]) ** 2 + (lab[1] - d.lab[1]) ** 2 + (lab[2] - d.lab[2]) ** 2) }))
      .sort((a, b) => a.de - b.de)
      .slice(0, topK)
      .map(({ d, de }) => ({
        色名: d.name, 节气: d.chapter, hex: d.hex, rgb: d.rgb, cmyk: d.cmyk,
        ΔE: +de.toFixed(1),
        意象: (d.meaning || '').slice(0, 40) || undefined,
        备注: (d.flags || []).length ? d.flags.join('; ') : undefined,
      }));
    return { input: inp.hex, share: inp.share, ok: true, matches: scored };
  });

  console.log(JSON.stringify({ ok: true, dataset: path.join(DATA_DIR, 'colors.json'),
                               datasetSize: data.length, results }, null, 1));
}

main();
