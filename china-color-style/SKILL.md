---
name: china-color-style
description: >-
  Use when the user wants period-accurate art direction, style selection, or color-palette design for AI image generation with a Chinese aesthetic, or wants to identify the era/style of an existing image and improve it. Covers dynasty art styles and schools, historical costume forms and color-rank rules, traditional Chinese color values (384 colors with CMYK/RGB and their documented meanings, organized by the 24 solar terms), palette proportions, prompt assembly, and cross-era fusion such as Chinese-aesthetic cyberpunk or ink-wash glitch. Trigger on: 传统色, 中国传统色, 配色, 色卡, 画风, 风格, 朝代, 唐代, 宋代, 明代, 清代, 汉服, 服饰, 形制, 水墨, 工笔, 青绿山水, 敦煌, 国风, 中华审美, 赛博朋克国风, 跨时代混搭, 提示词, 出图提示词, palette, Chinese traditional colors, Chinese aesthetic style, dynasty art style, hanfu, ink wash, this image looks like which dynasty. Not for generating images by itself (it produces style direction, palettes, knowledge points, and ready-to-paste prompts), and not for non-Chinese period styles.
author: yzsp-ai
repository: https://github.com/yzsp-ai
---


# China Color Style — 中华传统色画风配色设计

## Core Mission

Turn a *story premise* (era, characters, scene, mood) or an *existing image* into an executable
art-direction package for AI image generation:

1. **Style decision** — which dynasty/style lineage, with the visual evidence behind the choice.
2. **Palette** — specific traditional Chinese colors with real CMYK/RGB values, plus proportions.
3. **Knowledge points** — costume forms, color-rank constraints, and the mistakes to avoid.
4. **Prompts** — ready-to-paste English prompts assembled by subject / style / medium / light.
5. **(Mode C)** Reverse-engineering — read an existing image, infer its era/style, and propose fixes.

The Skill never invents color values. Every color it recommends comes from the dataset with its
chapter and book pages attached.

## Data Assets (single source of truth)

This bundle is **self-contained**: everything the Skill reads sits in its own `data/` folder.
Resolve every path below relative to the Skill base directory, so the folder keeps working after
being copied anywhere. Optional overrides: `${CHINA_COLOR_DATA}` and `${CHINA_COLOR_KNOWLEDGE}`.

| Asset | Path (relative to the Skill base dir) | Use |
|---|---|---|
| Color dataset (JSON) | `data/colors.json` | canonical: name, chapter, cmyk, rgb, hex, pages, flags, meaning |
| Color card (readable) | `data/色卡.md` | human-readable card grouped by solar term, includes the documented meaning of each color |
| Color table (CSV) | `data/colors.csv` | same data, for spreadsheets |
| Page structure | `data/page-structure.json`, `data/书籍结构图.md` | which book page holds what, per solar term; use to cite sources |
| Data confidence | `data/待复核清单.md` | which values are inferred or unresolved — check before quoting a value as certain |
| Knowledge: art styles | `data/knowledge/01-历朝画风流派.md` | dynasty styles, schools, brushwork, materials, English style keywords |
| Knowledge: costume | `data/knowledge/02-服饰形制与用色等级.md` | garment forms, rank-color rules, AI 常见错误, quick check table |
| Knowledge: prompting | `data/knowledge/03-AI绘图提示词规则.md` | prompt skeleton, weights, negative prompts, CN→EN term mapping |
| Knowledge: fusion | `data/knowledge/04-跨时代混搭方法论.md` | cross-era fusion pipeline, anchor/variable split, palette ratios |

If `data/` is ever missing or stale, run `node scripts/sync-data.mjs` to refresh it from the
upstream folders (`CHINA_COLOR_SRC` / `CHINA_KNOWLEDGE_SRC` override the sources).

**Data honesty rules (non-negotiable):**

- 375 of the 384 colors carry complete CMYK/RGB. 19 of those were *inferred* by structural
  alignment; 9 are unresolved. `colors.json` marks both in `flags`, and `待复核清单.md` lists them.
  When you recommend one of those colors, say so in one short line — e.g. "此色值在原书中未印全，为推定值".
- Never round, "improve", or re-derive a color value. Quote `rgb`/`cmyk` exactly as stored.
- When you cite where a color comes from, use its `chapter` (solar term) and `pages`.

## Mode A — Direction from a story premise

**Step 1 · Harvest the premise.** From the user's message extract: era/dynasty (or "unspecified"),
subject (person / costume / scene / object), story mood, and any fusion intent. Ask at most the
minimum necessary questions.

**Step 2 · Confirm the ambiguous choices with a popup.** When the era, the style lineage, or the
fusion degree is genuinely ambiguous, use `ask_user_question` — never silently pick. Give 2–4
options, put the recommended one first, label it `（推荐）`, and explain each in plain language
(avoid jargon; the user is a creator, not an art historian). Example axes worth asking about:

- Style lineage (e.g. 唐 浓丽重彩 vs 宋 素雅青绿 vs 明 院体工细),
- Interpretation (历史还原 / 艺术化演绎 / 跨时代混搭),
- Palette temperature & saturation budget for the intended use (海报、人物立绘、场景概念图).

Skip the popup when the premise already pins these down.

**Step 3 · Pick the style with evidence.** Read knowledge `01` and choose the lineage. State the
concrete visual consequences you are aiming for — brushwork, color application, composition, ground
tone, medium — not vague praise. Name the traps from that file's 常见错误 section that this premise
is likely to hit.

**Step 4 · Build the palette from the dataset.** Select 5–8 colors: one dominant, 2–3 supporting,
1–2 accents. Prefer colors whose `chapter` matches the story's season. Two hard constraints:

- **Rank constraint** — check knowledge `02` before putting a color on a costume. Imperial yellow,
  certain purples and reds were rank-restricted; a commoner or a low official wearing them is an error.
- **Semantic fit** — each color in the dataset carries a documented meaning (`meaning`). Prefer colors
  whose meaning resonates with the story, and mention that resonance in one clause; it is what makes a
  recommendation feel authored rather than random.

Assign proportions (a workable default is roughly 60% dominant / 30% supporting / 10% accent),
then state each color as: name · hex · RGB · CMYK · solar term · the role it plays.

**Step 5 · Assemble the prompts.** Follow knowledge `03`: subject → era/style → medium & technique →
palette → light → camera/composition → aspect. One style lineage per prompt; do not stack
contradictory style words (工笔 + 写意, oil painting + ink wash). Put color direction in the palette
segment, not in the style segment. Offer a negative-prompt line when the target model benefits from it.
Give the prompt in English, and explain in Chinese what each segment is doing.

**Step 6 · Output** using the template below, then offer the next natural step (variants, a different
season, or a fused version).

## Mode C — Reverse-engineering an existing image

Trigger: the user shows an image and asks what era/style it is, why it feels off, or how to improve it.

1. **Look at the image.** Use `read_image` if the current model accepts image input. If the harness
   refuses (some sessions run a text-only model), use the vision bridge:
   `node scripts/analyze-image.mjs <image path> "<question>"` — it forwards the image to a
   vision-capable model through the configured router and returns structured JSON. Say which route you used.
2. **Extract the actual palette** (deterministic, no model judgement):
   `node scripts/extract-palette.mjs <image path>` for PNG input. If the format is unsupported it says so —
   then rely on the vision route for approximate colors and mark them as estimates.
3. **Map that palette onto the dataset**: `node scripts/match-colors.mjs "#a1b2c3,#d4e5f6"` returns the
   nearest traditional colors with their ΔE distance. This is how you tell the user *which* historical
   colors their image is accidentally using.
4. **Diagnose the era**, listing the evidence that supports the hypothesis and the evidence against it;
   name at least one competing hypothesis when the image is genuinely ambiguous. Never assert a single
   dynasty from a weak signal.
5. **Deliver fixes**: form/rank errors, anachronisms, palette imbalance, medium inconsistency — each with
   the corrected description and a revised prompt segment.

## Hard Rules

1. **No invented colors, no invented history.** If the dataset or the knowledge files do not support a
   claim, say "资料中没有" instead of filling the gap from memory.
2. **Semantic judgement is yours, not the script's.** The scripts only extract pixels and compute
   distances; deciding what a style *means* is your job.
3. **One clear recommendation.** After presenting options, state which you recommend and why, in plain
   Chinese. The user wants a decision, not a menu.
4. **Flag weak data.** Inferred or unresolved color values, and any knowledge-file statement marked
   "存疑/推断" in the knowledge base, must be passed on as such.
5. **Respect cultural constraints.** Rank colors, ritual/auspicious vs mourning colors, and religious
   symbols are not free decoration; the fusion file's boundary section governs cross-era mixing.
6. **Do not generate images.** This Skill produces direction, palettes, knowledge, and prompts.

## Output Template

```
## 一、风格判定
朝代/流派：… ｜ 依据：…（具体到笔法、设色、构图、底调）
需要避开的坑：…

## 二、配色方案
主色 60%  色名 hex RGB CMYK（节气）— 作用与意象
辅色 30%  …
点缀 10%  …
（若某色值为推定，注明）

## 三、知识点
形制与用色等级：… ｜ 常见错误：… ｜ 出处（书页/知识库）：…

## 四、绘图提示词
Positive: …
Negative: …
中文说明：每段在做什么

## 五、怎么用这套提示词（每次都要给，不许省略）
- 一条提示词 = 一张图，逐条出，绝不把几条合并粘贴
- 正向/负向分开贴；没有负向框的平台（如 Gemini 类）把负向改写成正向约束
- 画幅靠界面比例或平台参数（`--ar` 等），不要当成风格词写进正文
- 同套先出 ① 定调，其余拿 ① 当参考图保证一致；灰度图是自查用，不是成品
- 迭代时一次只改一个变量并保留对照；不要一次把全部提示词都出完
- 详见 `references/怎么用这些提示词.md`（各平台贴法对照表 + 常见问题改法）

## 六、下一步建议
…
```

## References

- `references/数据与知识索引.md` — asset map, confidence caveats, and the caveats of each knowledge file.
- `references/怎么用这些提示词.md` — how to paste and iterate the prompts on each platform; **summarize this every time you deliver prompts**.
- `scripts/extract-palette.mjs`, `scripts/match-colors.mjs`, `scripts/analyze-image.mjs` — deterministic helpers.
- `scripts/sync-data.mjs` — refreshes the bundled `data/` from the upstream folders; `--check` compares without writing.
- `README.md` — what is in this bundle, how to install it, and the limits of each script.
