import fs from 'node:fs';
import { esc, readCollection } from './collection-source.mjs';

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('usage: node scripts/build-solid-pages.mjs <立体几何.md>');
  process.exit(1);
}

const solids = [
  { id: 'cuboid', name: '长方体', ids: ['027', '028'], revisions: ['027'] },
  { id: 'triangular-prism', name: '直三棱柱', qualifier: '正三角形底', ids: ['048'], stem: /正三棱柱|底面是正三角形的直棱柱/, revisions: ['048'] },
  { id: 'hexagonal-prism', name: '正六棱柱' },
  { id: 'oblique-prism', name: '斜四棱柱', qualifier: '矩形底' },
  { id: 'tetrahedron', name: '正四面体' },
  { id: 'square-pyramid', name: '正四棱锥' },
  { id: 'square-frustum', name: '正四棱台' },
  { id: 'cylinder', name: '圆柱', ids: ['016', '022', '025', '038', '045'], revisions: ['025'], example: 9 },
  { id: 'cone', name: '圆锥', ids: ['011', '031', '035', '052', '057'] },
  { id: 'cone-frustum', name: '圆台', ids: ['042'], example: 1 },
  { id: 'sphere', name: '球' },
  { id: 'hemisphere', name: '半球', ids: ['019'] },
];

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const markdown = fs.readFileSync(sourcePath, 'utf8');
const overview = read('index.html');
const cubeStyle = read('正方体看图做题.html').match(/<style>([\s\S]+?)<\/style>/)?.[1];
if (!cubeStyle) throw new Error('未找到正方体专页样式');

const style = cubeStyle.trim()
  .replace(/^@container reading[^\n]*\n[\s\S]*?^}\n/m, '')
  .replace('container:reading / inline-size', 'min-width:0')
  .replace(/^\.cube-sources[^\n]*\n/m, '')
  .replaceAll('cube-', 'solve-')
  .replaceAll(' h4', ' h2');

const sourceLink = '<a href="https://github.com/cheng-bai/shanghai-math-essay-collection/blob/main/分册/立体几何.md" target="_blank" rel="noopener">上海高中数学大题分类汇编 · 立体几何分册</a>';
const rights = '公开发布不代表对原试题与题图拥有排他版权。题图链到汇编站点，不放进本仓库。';

function exampleCard(id) {
  const pattern = new RegExp(`^<p><strong>例 ${id}｜([^<]+)。</strong> (.*)</p>\\r?\\n<p><strong>答案与解析：</strong> (.*)</p>$`, 'm');
  const match = overview.match(pattern);
  if (!match) throw new Error(`总览中未找到例 ${id} 的题干和解析`);
  const [, topic, stem, answer] = match;
  return `<article class="solve-problem" data-example="${id}">
<p class="solve-kicker">例 ${id} · ${topic}</p>
<p class="solve-stem">${stem}</p>
<details class="solve-answer"><summary>答案与解析</summary><p>${answer}</p></details>
</article>`;
}

function collectionCard(item) {
  return `<article class="solve-problem collection-problem" data-collection-id="${item.id}">
<p class="solve-kicker">${esc(item.heading)}</p>
<p class="collection-meta">来源：${esc(item.source)}</p>
<p class="collection-meta"><strong>考点说明：</strong>${esc(item.skill)}</p>
${item.revisionHtml ? `<div class="collection-revision">${item.revisionHtml}</div>\n` : ''}<div class="collection-stem">${item.stemHtml}</div>
<details class="solve-answer"><summary>答案与解析</summary><div class="collection-body"><p class="collection-label">答案</p>${item.answerHtml}
<p class="collection-label">解析</p>${item.analysisHtml}</div></details>
</article>`;
}

function problemGroup(id, label, note, cards) {
  return `<section id="${id}" class="solve-group" aria-labelledby="${id}-title">
<h3 id="${id}-title" class="solve-group-title">${label}</h3>
<p class="solve-group-note">${note}</p>
${cards.join('\n')}
</section>`;
}

function page({ id, name, qualifier, ids = [], stem = new RegExp(name), revisions = [], example }) {
  const modelName = qualifier ? `${name}（${qualifier}）` : name;
  const both = Boolean(example && ids.length);
  const local = example ? problemGroup('local-examples', '本页例题', `例 ${example} 为自编，与总览中的原文相同。`, [exampleCard(example)]) : '';
  const collection = ids.length ? problemGroup('collection-problems', '汇编题目', `题目来自${sourceLink}。本页只收录与模型相匹配的 ${ids.length} 题，不是整册。`,
    readCollection(markdown, ids, name, stem, revisions).rendered.map(collectionCard)) : '';
  const switcher = both ? `<div class="solve-switch" role="group" aria-label="例题分组" hidden>
<button type="button" aria-controls="local-examples" aria-pressed="true">本页例题</button>
<button type="button" aria-controls="collection-problems" aria-pressed="false">汇编题目</button>
</div>\n` : '';
  const contents = local || collection ? [local, collection].filter(Boolean).join('\n') : '<div class="solve-group"><p class="solve-group-note">目前没有与这个模型匹配的本页例题或汇编题目。</p></div>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="author" content="chengbai"><title>${name}：看图做题</title><link rel="stylesheet" href="solid-look-and-solve.css">${both ? '<script src="solid-look-and-solve.js" defer></script>' : ''}</head>
<body class="solve-page"><header class="solve-mast"><div><div class="eyebrow">SOLID GEOMETRY · 一个图形一页</div><h1>${name}：看图做题</h1></div><a href="index.html#models">返回总览</a></header>
<main class="solve-desk"><p class="studio-lead">左侧是${modelName}，可旋转并调整参数。${ids.length || example ? '右侧只收录与模型相匹配的题目，答案默认收起。题目条件与标注以题干和原图为准。' : '右侧暂未收录匹配题目。'}</p>
<div class="solve-studio"><div class="solve-view"><div class="solve-view-head"><h2>${name}工作台</h2><p>可旋转观察。<a href="立体几何图形工作台.html#scene=${id}" target="_blank" rel="noopener">独立打开工作台</a></p></div>
<iframe title="${modelName}题型图形工作台" src="立体几何图形工作台.html?embed=1&amp;lock=${id}#scene=${id}"></iframe></div>
<section class="solve-problems" aria-labelledby="solve-problems-title"><div class="solve-problems-head"><h2 id="solve-problems-title">这个${name}的题目</h2></div><div class="solve-problem-list" tabindex="0" role="region" aria-label="${name}题目">
${switcher}${contents}
</div></section></div></main>
<footer class="solve-foot">${example ? '本页自编例题与总览原文相同。' : ''}${collection ? `汇编题来自${sourceLink}，${rights}` : '模型来自高中数学常见几何体资产库。'}</footer>
</body></html>
`;
}

const pages = solids.map((solid) => [`${solid.name}看图做题.html`, page(solid)]);
pages.push(['solid-look-and-solve.css', `${style}\n.solve-switch[hidden]{display:none}\n.collection-stem p,.collection-body p,.collection-revision p{overflow-x:auto}\n`]);
for (const [file, content] of pages) fs.writeFileSync(new URL(file, root), content);
console.log(`生成 ${solids.length} 个专页，收录 ${solids.reduce((count, solid) => count + (solid.ids?.length ?? 0), 0)} 道汇编题。`);
