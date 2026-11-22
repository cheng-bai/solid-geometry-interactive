// Build data/cube-collection.json and data/cube-collection.js from the
// solid-geometry volume. Pass the markdown path; this script does not copy
// the volume or any figure binaries into the repo.
//
//   NODE_PATH=/tmp/katex-build/node_modules node scripts/build-cube-collection.mjs /path/to/立体几何.md

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const katex = require(process.env.KATEX_PATH || '/tmp/katex-build/node_modules/katex');

const ASSET = 'https://cheng-bai.github.io/shanghai-math-essay-collection/assets/';
const IDS = ['018', '020', '032', '040', '049', '055', '061'];
const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('usage: node scripts/build-cube-collection.mjs <立体几何.md>');
  process.exit(1);
}

const markdown = fs.readFileSync(sourcePath, 'utf8');
const failures = [];
const images = new Set();

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function math(tex, display) {
  const source = tex.trim();
  try {
    return katex.renderToString(source, {
      throwOnError: true,
      output: 'mathml',
      displayMode: display,
      strict: 'ignore',
    });
  } catch (error) {
    failures.push({ display, tex: source.slice(0, 240), message: error.message });
    return `<span class="math-unparsed">${esc(source)}</span>`;
  }
}

function renderInline(text) {
  const pattern = /!\[([^\]]*)\]\(\.\.\/assets\/([^)\s]+)\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\*\*([^*]+)\*\*/g;
  let html = '';
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    html += esc(text.slice(last, match.index));
    if (match[2] != null) {
      images.add(match[2]);
      const alt = match[1].trim() || '题目图示';
      html += `<img src="${ASSET}${esc(match[2])}" alt="${esc(alt)}" loading="lazy">`;
    } else if (match[3] != null) {
      html += math(match[3], true);
    } else if (match[4] != null) {
      html += math(match[4], false);
    } else if (match[5] != null) {
      html += `<strong>${esc(match[5])}</strong>`;
    }
    last = match.index + match[0].length;
  }
  html += esc(text.slice(last));
  const leftover = html.match(/\$/g);
  if (leftover) failures.push({ display: false, tex: text.slice(0, 180), message: `unparsed dollar signs: ${leftover.length}` });
  return html;
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '').split('\n');
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed === '---') {
      flush();
      continue;
    }
    if (trimmed === '$$') {
      flush();
      const tex = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== '$$') {
        tex.push(lines[i]);
        i += 1;
      }
      blocks.push(math(tex.join('\n'), true));
      continue;
    }
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      flush();
      blocks.push(math(trimmed.slice(2, -2), true));
      continue;
    }
    if (/^!\[[^\]]*\]\(\.\.\/assets\/[^)\s]+\)$/.test(trimmed)) {
      flush();
      blocks.push(renderInline(trimmed));
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks.join('\n');
}

function takeRevision(lines) {
  let index = 0;
  while (index < lines.length && lines[index].trim() === '') index += 1;
  if (!lines[index] || !lines[index].startsWith('>')) {
    return { revision: '', rest: lines.slice(index) };
  }
  const quote = [];
  while (index < lines.length) {
    if (lines[index].startsWith('>')) {
      quote.push(lines[index].replace(/^>\s?/, ''));
      index += 1;
      continue;
    }
    if (lines[index].trim() === '') {
      let look = index + 1;
      while (look < lines.length && lines[look].trim() === '') look += 1;
      if (look < lines.length && lines[look].startsWith('>')) {
        quote.push('');
        index += 1;
        continue;
      }
    }
    break;
  }
  return { revision: quote.join('\n').trim(), rest: lines.slice(index) };
}

function parseProblem(section) {
  const heading = section.match(/^### (.+)$/m)?.[1]?.trim();
  const id = heading?.slice(0, 3);
  const source = section.match(/^\*\*来源：\*\*\s*(.+)$/m)?.[1]?.trim();
  const skill = section.match(/^\*\*考点说明：\*\*\s*(.+)$/m)?.[1]?.trim();
  const skillAt = section.search(/^\*\*考点说明：\*\*.*$/m);
  const afterSkill = section.slice(skillAt).split('\n').slice(1);
  const { revision, rest } = takeRevision(afterSkill);
  const answerAt = rest.findIndex((line) => line.startsWith('#### 答案'));
  const analysisAt = rest.findIndex((line) => line.startsWith('#### 解析'));
  if (!heading || !source || !skill || answerAt < 0 || analysisAt < 0) {
    throw new Error(`无法拆分题目 ${heading || section.slice(0, 40)}`);
  }
  let stem = rest.slice(0, answerAt).join('\n').trim();
  const answer = rest.slice(answerAt + 1, analysisAt).join('\n').trim();
  const analysis = rest.slice(analysisAt + 1).join('\n').replace(/\n---\s*$/g, '').trim();
  if (id === '061') stem = stem.replace(/^17 解答题 1次作答 正确率 100%/, '');
  return { id, heading, source, skill, revision, stem, answer, analysis };
}

const sections = markdown.split(/\n(?=### )/);
const wanted = new Map();
for (const section of sections) {
  const id = section.match(/^### (\d{3}) /)?.[1];
  if (id && IDS.includes(id)) wanted.set(id, parseProblem(section));
}
if ([...wanted.keys()].join(',') !== IDS.join(',')) {
  throw new Error(`题目集合不符：${[...wanted.keys()].join(',')}`);
}
if (markdown.includes('### 027') && wanted.has('027')) throw new Error('不应收录 027');

const problems = IDS.map((id) => {
  const item = wanted.get(id);
  if (!item.stem.includes('正方体')) throw new Error(`${id} 题干未写明正方体`);
  if ((id === '018' || id === '032') && !item.revision.includes('校订提示')) {
    throw new Error(`${id} 缺少校订提示`);
  }
  if (id !== '018' && id !== '032' && item.revision) throw new Error(`${id} 不应有校订提示`);
  if (id === '061' && item.stem.includes('正确率')) throw new Error('061 仍含作答界面文字');
  return item;
});

const rendered = problems.map((item) => ({
  ...item,
  revisionHtml: item.revision ? renderMarkdown(item.revision) : '',
  stemHtml: renderMarkdown(item.stem),
  answerHtml: renderMarkdown(item.answer),
  analysisHtml: renderMarkdown(item.analysis),
}));

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  throw new Error(`有 ${failures.length} 处公式未能排成 MathML`);
}
if (rendered.some((item) => /math-unparsed|\$[^$]/.test(item.stemHtml + item.answerHtml + item.analysisHtml + item.revisionHtml))) {
  throw new Error('渲染结果仍含未处理的公式');
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const jsonProblems = problems.map(({ id, heading, source, skill, revision, stem, answer, analysis }) => ({
  id, heading, source, skill, revision, stem, answer, analysis,
}));
const meta = {
  sourceRepo: 'https://github.com/cheng-bai/shanghai-math-essay-collection',
  volume: '分册/立体几何.md',
  volumeUrl: 'https://github.com/cheng-bai/shanghai-math-essay-collection/blob/main/分册/立体几何.md',
  note: '只收录题干为正方体的 7 题。公开发布不代表对原试题与题图拥有排他版权。',
  figures: [...images].sort(),
  problems: jsonProblems,
};
fs.writeFileSync(path.join(dataDir, 'cube-collection.json'), `${JSON.stringify(meta, null, 2)}\n`);

const payload = rendered.map(({ id, heading, source, skill, revisionHtml, stemHtml, answerHtml, analysisHtml }) => ({
  id, heading, source, skill, revisionHtml, stemHtml, answerHtml, analysisHtml,
}));
const js = `// Generated by scripts/build-cube-collection.mjs. MathML is pre-rendered; figure URLs point at the collection site.\nwindow.CUBE_COLLECTION = ${JSON.stringify(payload)};\n`;
fs.writeFileSync(path.join(dataDir, 'cube-collection.js'), js);
console.log(`problems ${problems.length}, figures ${images.size}, js ${js.length} bytes`);
