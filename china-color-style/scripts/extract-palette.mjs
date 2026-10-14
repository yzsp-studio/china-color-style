#!/usr/bin/env node
/**
 * 提取图片的主色板（确定性，不调用任何模型）。
 *
 * 仅依赖 Node 内置模块：PNG 用 zlib 解压后自行反滤波。
 * 为什么不用图像库：本机的解析依赖装在 /tmp，容器重启即失效；
 * 技能必须只依赖运行时本身才能长期可用。
 *
 * 用法: node extract-palette.mjs <图片路径> [主色数量=8] [采样步长=2]
 * 输出: JSON { file, format, width, height, sampled, colors: [{hex, rgb, share}] }
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(msg) {
  console.log(JSON.stringify({ ok: false, error: msg }, null, 1));
  process.exit(0);
}

function parseChunks(buf) {
  const chunks = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
    if (type === 'IEND') break;
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) v += paeth(a, b, c);
      else if (ft !== 0) throw new Error('未知 PNG 滤波器: ' + ft);
      cur[x] = v & 0xff;
    }
  }
  return out;
}

function decodePng(buf) {
  const chunks = parseChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG 缺少 IHDR');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const depth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];
  if (depth !== 8) throw new Error(`仅支持 8 位色深（本图 ${depth} 位）`);
  if (interlace !== 0) throw new Error('不支持隔行扫描 PNG，请另存为非隔行 PNG');
  const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bpp = bppMap[colorType];
  if (!bpp) throw new Error('不支持的 PNG 颜色类型: ' + colorType);
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);
  const px = unfilter(raw, width, height, bpp);
  const plte = chunks.find((c) => c.type === 'PLTE');
  const trns = chunks.find((c) => c.type === 'tRNS');
  return { width, height, colorType, bpp, px, plte: plte && plte.data, trns: trns && trns.data };
}

function pixelAt(img, x, y) {
  const { px, width, bpp, colorType } = img;
  const i = (y * width + x) * bpp;
  if (colorType === 0) { const g = px[i]; return [g, g, g]; }
  if (colorType === 4) { const g = px[i]; return [g, g, g]; }
  if (colorType === 2) return [px[i], px[i + 1], px[i + 2]];
  if (colorType === 6) return [px[i], px[i + 1], px[i + 2]];
  if (colorType === 3) {
    const idx = px[i];
    const p = img.plte;
    if (!p) return [0, 0, 0];
    return [p[idx * 3], p[idx * 3 + 1], p[idx * 3 + 2]];
  }
  return [0, 0, 0];
}

function alphaAt(img, x, y) {
  const { px, width, bpp, colorType } = img;
  if (colorType === 6) return px[(y * width + x) * bpp + 3];
  if (colorType === 4) return px[(y * width + x) * bpp + 1];
  if (colorType === 3 && img.trns) {
    const idx = px[(y * width + x) * bpp];
    return idx < img.trns.length ? img.trns[idx] : 255;
  }
  return 255;
}

function main() {
  const [file, nStr, stepStr] = process.argv.slice(2);
  if (!file) fail('用法: node extract-palette.mjs <图片路径> [主色数量=8] [采样步长=2]');
  if (!fs.existsSync(file)) fail('文件不存在: ' + file);
  const topN = Math.max(1, parseInt(nStr || '8', 10) || 8);
  const step = Math.max(1, parseInt(stepStr || '2', 10) || 2);
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(PNG_SIG)) {
    const kind = buf[0] === 0xff && buf[1] === 0xd8 ? 'JPEG' : '非 PNG';
    fail(`${kind} 格式：本脚本只解码 PNG（无外部依赖）。请把图片另存为 PNG 后再试，` +
         `或改用 vision 通道（scripts/analyze-image.mjs）由模型给出近似配色。`);
  }
  let img;
  try { img = decodePng(buf); } catch (e) { fail('PNG 解码失败: ' + e.message); }

  const buckets = new Map();
  let sampled = 0;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      if (alphaAt(img, x, y) < 128) continue;         // 跳过透明像素
      const [r, g, b] = pixelAt(img, x, y);
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);   // 5 位量化
      let e = buckets.get(key);
      if (!e) { e = { r: 0, g: 0, b: 0, n: 0 }; buckets.set(key, e); }
      e.r += r; e.g += g; e.b += b; e.n++;
      sampled++;
    }
  }
  const colors = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, topN)
    .map((e) => {
      const r = Math.round(e.r / e.n), g = Math.round(e.g / e.n), b = Math.round(e.b / e.n);
      return { hex: '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(),
               rgb: `R${r}G${g}B${b}`, share: +(e.n / sampled).toFixed(4) };
    });
  console.log(JSON.stringify({ ok: true, file, format: 'PNG', width: img.width, height: img.height,
                               sampled, colors }, null, 1));
}

main();
