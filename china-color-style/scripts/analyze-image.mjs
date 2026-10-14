#!/usr/bin/env node
/**
 * 视觉通道：把图片交给支持看图的模型，取回结构化的风格/朝代分析。
 *
 * 为什么需要它：会话默认模型可能是纯文本模型（harness 会拒绝 read_image）。
 * 本脚本绕开该限制，把图片经路由器转发给视觉模型。
 *
 * 用法: node analyze-image.mjs <图片路径> ["想追问的问题"]
 * 环境变量:
 *   CHINA_COLOR_VISION_MODEL  默认 gemini-3.8-flash（实测生僻字与形制细节更稳）
 *   DSH_TEAMOROUTER_API_KEY   优先；缺省时读凭证文件
 * 输出: JSON（含 answer 与解析后的 analysis 字段，解析失败时只给原文）
 *
 * audit-genericity-allow: 凭证路径与接口地址属部署环境常量，可用环境变量覆盖。
 */
import fs from 'node:fs';

const CRED_FILE = process.env.DSH_CREDENTIALS || '/root/.dsh/.credentials.yaml';  // audit-genericity-allow
const BASE_URL = process.env.DSH_TEAMOROUTER_BASE_URL || 'https://api.teamorouter.cn/v1';
const MODEL = process.env.CHINA_COLOR_VISION_MODEL || 'gemini-3.8-flash';
const MAX_BYTES = 12 * 1024 * 1024;

function readKey() {
  if (process.env.DSH_TEAMOROUTER_API_KEY) return process.env.DSH_TEAMOROUTER_API_KEY;
  try {
    const txt = fs.readFileSync(CRED_FILE, 'utf8');
    const m = /DSH_TEAMOROUTER_API_KEY:\s*["']?([^"'\s]+)/.exec(txt);
    if (m) return m[1];
  } catch { /* 回落为空，下面统一报错 */ }
  return null;
}

function mimeOf(file) {
  const ext = file.toLowerCase().split('.').pop();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
}

const PROMPT = `你是一位中国美术史与古装造型顾问。请分析这张图，只输出 JSON：
{
 "era_hypothesis": "你判断的时代/风格（如 唐、宋、明、清、现代国风、跨时代混搭），无法判断则写 不确定",
 "confidence": "高/中/低",
 "evidence_for": ["支持该判断的具体视觉证据，每条一句话，写到形制/笔法/设色/材质层面"],
 "evidence_against": ["与判断相矛盾的细节"],
 "alternatives": [{"era": "另一可能", "why": "为什么也可能是它"}],
 "style_lineage": "最接近的流派或画风（如 院体工笔、文人水墨、青绿山水）",
 "medium_and_technique": ["材质与技法线索，如 绢本底调、矿物颜料、皴法、渲染方式"],
 "composition": "构图与空间处理特点",
 "palette_estimate": [{"hex": "#RRGGBB", "role": "主色/辅色/点缀", "note": "这是什么色、出现在哪"}],
 "costume_forms": ["可见的服饰形制、头饰、纹样（只写看得见的，看不到就留空数组）"],
 "anachronisms": ["时代错位或形制错误，逐条写清 错在哪 / 正确应该是什么"],
 "improvement_suggestions": ["可执行的改进建议，按优先级排序"]
}
铁律：
1) 只描述你在图上真实看到的东西，看不清就写"看不清"，绝不猜测填充；
2) palette_estimate 里的 hex 是**目测估计**，不是精确采样，请如实标注；
3) 若画面属于跨时代混搭，era_hypothesis 要写清混了哪几层，而不是硬选一个朝代。`;

async function main() {
  const [file, question] = process.argv.slice(2);
  if (!file) {
    console.log(JSON.stringify({ ok: false, error: '用法: node analyze-image.mjs <图片路径> ["追问"]' }, null, 1));
    process.exit(0);
  }
  if (!fs.existsSync(file)) {
    console.log(JSON.stringify({ ok: false, error: '文件不存在: ' + file }, null, 1));
    process.exit(0);
  }
  const size = fs.statSync(file).size;
  if (size > MAX_BYTES) {
    console.log(JSON.stringify({ ok: false, error: `图片 ${(size / 1048576).toFixed(1)}MB 超过 ${MAX_BYTES / 1048576}MB 上限，请先压缩或裁剪` }, null, 1));
    process.exit(0);
  }
  const key = readKey();
  if (!key) {
    console.log(JSON.stringify({ ok: false, error: `未找到 API 凭证（可用 DSH_TEAMOROUTER_API_KEY 环境变量或 ${CRED_FILE}）` }, null, 1));
    process.exit(0);
  }

  const dataUrl = `data:${mimeOf(file)};base64,${fs.readFileSync(file).toString('base64')}`;
  const content = [
    { type: 'text', text: question ? `${PROMPT}\n\n额外追问（请在 JSON 中新增 answer_extra 字段回答）：${question}` : PROMPT },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 180000);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, temperature: 0, messages: [{ role: 'user', content }] }),
    });
    clearTimeout(timer);
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content;
    if (!text) {
      console.log(JSON.stringify({ ok: false, error: j?.error?.message || `HTTP ${res.status}`, model: MODEL }, null, 1));
      process.exit(0);
    }
    let analysis = null;
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s >= 0 && e > s) { try { analysis = JSON.parse(text.slice(s, e + 1)); } catch { /* 保留原文 */ } }
    console.log(JSON.stringify({ ok: true, model: MODEL, file, analysis, raw: analysis ? undefined : text }, null, 1));
  } catch (err) {
    clearTimeout(timer);
    console.log(JSON.stringify({ ok: false, error: '请求失败: ' + err.message, model: MODEL }, null, 1));
  }
}

main();
