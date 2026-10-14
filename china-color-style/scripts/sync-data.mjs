#!/usr/bin/env node
/**
 * 刷新包内 data/ 副本（本技能自包含所需的唯一维护动作）。
 *
 * 背景：技能要能整个文件夹拷走就用，所以数据随包自带一份；
 * 而数据集本体仍在原来的项目目录里维护（那份是"上游"）。
 * 上游更新后，跑一次本脚本即可把包内副本刷新到最新。
 *
 * 用法: node scripts/sync-data.mjs [--check]
 *   --check  只比对差异，不写入（用于确认包里是否已是最新）
 *
 * 环境变量（覆盖上游位置）:
 *   CHINA_COLOR_SRC      色卡数据集目录，默认 /workspace/skill/china-color  (audit-genericity-allow)
 *   CHINA_KNOWLEDGE_SRC  知识库目录，默认 /workspace/skill/中华审美绘图/knowledge  (audit-genericity-allow)
 *
 * audit-genericity-allow: 上面两个默认值是部署环境的上游位置，可用环境变量覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'data');
const SRC_COLOR = process.env.CHINA_COLOR_SRC || '/workspace/skill/china-color';          // audit-genericity-allow
const SRC_KNOW = process.env.CHINA_KNOWLEDGE_SRC || '/workspace/skill/中华审美绘图/knowledge';  // audit-genericity-allow

const FILES = [
  [SRC_COLOR, 'colors.json'],
  [SRC_COLOR, 'colors.csv'],
  [SRC_COLOR, '色卡.md'],
  [SRC_COLOR, 'page-structure.json'],
  [SRC_COLOR, '书籍结构图.md'],
  [SRC_COLOR, '待复核清单.md'],
  [SRC_KNOW, '01-历朝画风流派.md'],
  [SRC_KNOW, '02-服饰形制与用色等级.md'],
  [SRC_KNOW, '03-AI绘图提示词规则.md'],
  [SRC_KNOW, '04-跨时代混搭方法论.md'],
];

const check = process.argv.includes('--check');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12);

let copied = 0, same = 0, missing = 0;
for (const [src, name] of FILES) {
  const from = path.join(src, name);
  const to = path.join(DATA, name.startsWith('0') ? 'knowledge' : '', name);
  if (!fs.existsSync(from)) { console.log(`  ✗ 上游缺失: ${from}`); missing++; continue; }
  const changed = !fs.existsSync(to) || sha(from) !== sha(to);
  if (!changed) { same++; continue; }
  if (check) { console.log(`  ≠ 需刷新: ${name}`); }
  else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log(`  → 已更新: ${path.relative(DATA, to)}`);
  }
  copied++;
}

console.log(check
  ? `\n检查完成：${copied} 个待刷新，${same} 个已是最新${missing ? `，${missing} 个上游缺失` : ''}`
  : `\n同步完成：更新 ${copied} 个，${same} 个已是最新${missing ? `，${missing} 个上游缺失` : ''}`);
if (missing) process.exitCode = 1;
