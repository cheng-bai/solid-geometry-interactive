import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const katex = require(process.env.KATEX_PATH || require.resolve('katex', { paths: ['/tmp/katex-build'] }));

const ASSET = 'https://cheng-bai.github.io/shanghai-math-essay-collection/assets/';

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function math(tex, display, failures) {
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

function renderInline(text, context) {
  const pattern = /(!?)\[([^\]]*)\]\(\.\.\/assets\/([^)\s]+)\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\*\*([^*]+)\*\*/g;
  let html = '';
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    html += esc(text.slice(last, match.index));
    if (match[3] != null) {
      const label = esc(match[2].trim() || '题目图示');
      const url = `${ASSET}${esc(match[3])}`;
      context.images.add(match[3]);
      html += match[1] ? `<img src="${url}" alt="${label}" loading="lazy">` : `<a href="${url}">${label}</a>`;
    } else if (match[4] != null) {
      html += math(match[4], true, context.failures);
    } else if (match[5] != null) {
      html += math(match[5], false, context.failures);
    } else if (match[6] != null) {
      html += `<strong>${renderInline(match[6], context)}</strong>`;
    }
    last = match.index + match[0].length;
  }
  html += esc(text.slice(last));
  const leftover = html.match(/\$/g);
  if (leftover) context.failures.push({ display: false, tex: text.slice(0, 180), message: `unparsed dollar signs: ${leftover.length}` });
  return html;
}

function renderMarkdown(md, context) {
  const lines = md.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '').split('\n');
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInline(paragraph.join(' '), context)}</p>`);
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed === '---') {
      flush();
      continue;
    }
    if (trimmed === '$$') {
      flush();
      const tex = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== '$$') {
        tex.push(lines[index]);
        index += 1;
      }
      if (index === lines.length) throw new Error('公式块缺少结束的 $$');
      blocks.push(math(tex.join('\n'), true, context.failures));
      continue;
    }
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      flush();
      blocks.push(math(trimmed.slice(2, -2), true, context.failures));
      continue;
    }
    if (/^!\[[^\]]*\]\(\.\.\/assets\/[^)\s]+\)$/.test(trimmed)) {
      flush();
      blocks.push(renderInline(trimmed, context));
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
  if (id === '061') stem = stem.replace(/^17 解答题 1次作答 正确率 100%/, '');
  if (id === '022') stem = stem.replace(/^19 解答题\s*/, '');
  const answer = rest.slice(answerAt + 1, analysisAt).join('\n').trim();
  const analysis = rest.slice(analysisAt + 1).join('\n').replace(/\n---\s*$/g, '').trim();
  return { id, heading, source, skill, revision, stem, answer, analysis };
}

export function readCollection(markdown, ids, solidName, stemPattern, revisions) {
  const wanted = new Map();
  for (const section of markdown.replace(/\r\n/g, '\n').split(/\n(?=### )/)) {
    const id = section.match(/^### (\d{3}) /)?.[1];
    if (!ids.includes(id)) continue;
    if (wanted.has(id)) throw new Error(`题号重复：${id}`);
    wanted.set(id, parseProblem(section));
  }
  const context = { images: new Set(), failures: [] };
  const problems = ids.map((id) => {
    const item = wanted.get(id);
    if (!item) throw new Error(`缺少题目：${id}`);
    if (!stemPattern.test(item.stem)) throw new Error(`${id} 题干未写明${solidName}`);
    if (revisions.includes(id) && !item.revision.includes('校订提示')) throw new Error(`${id} 缺少校订提示`);
    if (!revisions.includes(id) && item.revision) throw new Error(`${id} 出现新的校订提示，需核对`);
    if ((id === '061' && item.stem.includes('正确率')) || (id === '022' && /^19\s*解答题/.test(item.stem))) {
      throw new Error(`${id} 仍含作答界面文字`);
    }
    return item;
  });
  const rendered = problems.map((item) => {
    const fields = ['revision', 'stem', 'answer', 'analysis'].map((field) => [
      `${field}Html`, renderMarkdown(item[field], context),
    ]);
    if (context.failures.length) {
      console.error(JSON.stringify(context.failures, null, 2));
      throw new Error(`${item.id} 有 ${context.failures.length} 处公式未能排成 MathML`);
    }
    return { id: item.id, heading: item.heading, source: item.source, skill: item.skill, ...Object.fromEntries(fields) };
  });
  return { problems, rendered, figures: [...context.images].sort() };
}
