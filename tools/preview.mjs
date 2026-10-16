// PR 预览（《系统架构》§4.4）：CI 里调用。node tools/preview.mjs deploy | cleanup
// 档位：有 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID → Cloudflare Pages；公开仓库 → gh-pages 分支的 pr-<N>/；
// 都没有 → 只有构建产物下载与截图说明。PR 下维护同一条评论（带隐藏标记）。零依赖，只用 node、git 与 gh。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, appendFileSync, mkdtempSync, cpSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
// 是否被直接运行：比较真实路径（macOS 上 /var 是 /private/var 的符号链接，直接比字符串会误判）
const isMain = (url) => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; } };

export const MARK = '<!-- game-studio:preview -->';

export function chooseTier({ cloudflare, visibility }) {
  if (cloudflare) return 'cloudflare';
  if (visibility === 'public') return 'pages';
  return 'artifact';
}

// Cloudflare 项目名：小写字母数字与连字符，最长 58
export const cfProject = (repo) => repo.split('/')[1].toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 58);

export function pagesUrl(repo, path) {
  const [owner, name] = repo.split('/');
  const site = name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '' : `${name}/`;
  return `https://${owner.toLowerCase()}.github.io/${site}${path}`;
}

// 评论正文：url 为 null 表示没有可试玩地址
export function commentBody({ tier, url, sha, shots = [], runUrl, repo, lorebook = false, assets = [] }) {
  const lines = [MARK, `### 🎮 试玩预览`, ''];
  if (url) lines.push(`**[打开试玩](${url})**（${{ cloudflare: 'Cloudflare Pages', pages: 'GitHub Pages' }[tier]}，提交 \`${sha.slice(0, 7)}\`）`);
  if (url && lorebook) lines.push(`[设定集](${url}lorebook/)`);
  else lines.push(`这个仓库还没有可直接打开的试玩地址。构建产物在[本次运行](${runUrl})的 Artifacts 里（\`preview-dist\`，下载后用本地静态服务器打开）。`, '', `开启可试玩预览：在仓库 Secrets 设置 \`CLOUDFLARE_API_TOKEN\`（Cloudflare Pages 编辑权限）与 \`CLOUDFLARE_ACCOUNT_ID\`，或把仓库设为公开以使用 GitHub Pages。`);
  if (shots.length) lines.push('', '| ' + shots.map((s) => s.name).join(' | ') + ' |', '|' + shots.map(() => '---').join('|') + '|', '| ' + shots.map((s) => `<img src="${s.url}" width="180">`).join(' | ') + ' |');
  else lines.push('', `e2e 截图在[本次运行](${runUrl})的 Artifacts 里（\`e2e-shots\`）。`);
  if (assets.length) {
    const img = assets.filter((a) => /\.(png|jpe?g|webp|gif|avif)$/i.test(a));
    const other = assets.filter((a) => !img.includes(a));
    lines.push('', `**本 PR 的资产**（${assets.length} 个，来源见 \`assets/README.md\`）`);
    if (img.length && url) lines.push('', img.slice(0, 6).map((a) => `<img src="${url}${a.replace(/^public\//, '')}" width="120" alt="${a}">`).join(' '));
    for (const a of [...(url ? [] : img), ...other]) lines.push(`- \`${a}\``);
  }
  lines.push('', `<sub>由 CI 自动更新 · [运行日志](${runUrl}) · ${repo}</sub>`);
  return lines.join('\n');
}

// 挑几张有代表性的截图：失败截图优先，其余按名字取前几张
export function pickShots(files, max = 4) {
  const png = files.filter((f) => f.endsWith('.png')).sort();
  return [...png.filter((f) => f.includes('FAIL')), ...png.filter((f) => !f.includes('FAIL'))].slice(0, max);
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();

function prNumber(repo) {
  const ev = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  if (ev.pull_request) return ev.pull_request.number;
  const ref = process.env.GITHUB_REF_NAME;
  const n = sh('gh', ['pr', 'list', '-R', repo, '--head', ref, '--state', 'open', '--json', 'number', '--jq', '.[0].number']);
  return n ? Number(n) : null;
}

function upsertComment(repo, pr, body) {
  const id = sh('gh', ['api', `repos/${repo}/issues/${pr}/comments?per_page=100`, '--jq', `[.[] | select(.body | startswith("${MARK}"))][0].id // empty`]);
  if (id) sh('gh', ['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${id}`, '-f', `body=${body}`]);
  else sh('gh', ['api', `repos/${repo}/issues/${pr}/comments`, '-f', `body=${body}`]);
}

// 把 src 目录发布到 gh-pages 分支的 dest 子目录（dest 为空表示根目录，保留 pr-*/）
function publishPages(repo, src, dest, message) {
  const work = mkdtempSync(join(tmpdir(), 'gs-pages-'));
  const remote = `https://x-access-token:${process.env.GH_TOKEN}@github.com/${repo}.git`;
  try {
    try { sh('git', ['clone', '-q', '--depth', '1', '--branch', 'gh-pages', remote, work]); }
    catch { sh('git', ['init', '-q', '-b', 'gh-pages', work]); sh('git', ['-C', work, 'remote', 'add', 'origin', remote]); }
    const target = dest ? join(work, dest) : work;
    if (dest) rmSync(target, { recursive: true, force: true });
    else for (const n of readdirSync(work)) if (n !== '.git' && n !== '.nojekyll' && !n.startsWith('pr-')) rmSync(join(work, n), { recursive: true, force: true });
    if (src) { mkdirSync(target, { recursive: true }); cpSync(src, target, { recursive: true }); }
    // 关掉 Jekyll：否则 _shots/ 这类下划线目录不会被发布
    writeFileSync(join(work, '.nojekyll'), '');
    sh('git', ['-C', work, 'add', '-A']);
    if (!sh('git', ['-C', work, 'status', '--porcelain'])) return false;
    sh('git', ['-C', work, '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-q', '-m', message]);
    sh('git', ['-C', work, 'push', '-q', 'origin', 'gh-pages']);
    return true;
  } finally { rmSync(work, { recursive: true, force: true }); }
}

function ensurePagesSite(repo) {
  try { sh('gh', ['api', `repos/${repo}/pages`]); }
  catch {
    // 嵌套参数要用 JSON 请求体；-f 'source[branch]=…' 会被拒（422）
    try { sh('gh', ['api', '-X', 'POST', `repos/${repo}/pages`, '--input', '-'], { input: JSON.stringify({ source: { branch: 'gh-pages', path: '/' } }) }); console.log('已开启 GitHub Pages（gh-pages 分支）'); }
    catch (e) { console.log(`::warning::开启 GitHub Pages 失败，预览地址暂时打不开：${e.message.split('\n')[0]}`); }
  }
}

if (isMain(import.meta.url)) {
  const cmd = process.argv[2];
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA ?? '';
  const runUrl = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const visibility = sh('gh', ['api', `repos/${repo}`, '--jq', '.visibility']);
  const tier = chooseTier({ cloudflare: !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID), visibility });
  const out = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
  out('tier', tier);

  if (cmd === 'cleanup') {
    const pr = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request?.number;
    if (tier === 'pages' && pr) console.log(publishPages(repo, null, `pr-${pr}`, `Remove preview for #${pr}`) ? `已删除 pr-${pr}/` : `没有 pr-${pr}/`);
    process.exit(0);
  }

  const isMain = process.env.GITHUB_REF_NAME === 'main' && process.env.GITHUB_EVENT_NAME === 'push';
  const pr = isMain ? null : prNumber(repo);
  if (!isMain && !pr) { console.log('不是 main，也没有对应的 PR，跳过预览'); process.exit(0); }
  if (!existsSync('dist/index.html')) sh('npm', ['run', 'build'], { stdio: 'inherit' });
  const slot = isMain ? '' : `pr-${pr}`;
  let url = null;
  let shots = [];

  if (tier === 'cloudflare') {
    const project = cfProject(repo);
    try { sh('npx', ['--yes', 'wrangler@4', 'pages', 'project', 'create', project, '--production-branch', 'main'], { stdio: 'pipe' }); } catch { /* 已存在 */ }
    const log = sh('npx', ['--yes', 'wrangler@4', 'pages', 'deploy', 'dist', `--project-name=${project}`, `--branch=${isMain ? 'main' : slot}`, '--commit-dirty=true']);
    url = isMain ? `https://${project}.pages.dev/` : `https://${slot}.${project}.pages.dev/`;
    console.log(log.split('\n').slice(-3).join('\n'));
  } else if (tier === 'pages') {
    ensurePagesSite(repo);
    // 截图放到 _shots/，评论里直接嵌图（公开仓库才可见）
    const stage = mkdtempSync(join(tmpdir(), 'gs-stage-'));
    cpSync('dist', stage, { recursive: true });
    const picked = existsSync('tests/shots') ? pickShots(readdirSync('tests/shots')) : [];
    if (picked.length) { mkdirSync(join(stage, '_shots'), { recursive: true }); for (const f of picked) cpSync(join('tests/shots', f), join(stage, '_shots', f)); }
    publishPages(repo, stage, slot, isMain ? `Publish main ${sha.slice(0, 7)}` : `Preview #${pr} at ${sha.slice(0, 7)}`);
    rmSync(stage, { recursive: true, force: true });
    url = pagesUrl(repo, slot ? `${slot}/` : '');
    shots = picked.map((f) => ({ name: f.replace(/\.png$/, ''), url: `${url}_shots/${f}?v=${sha.slice(0, 7)}` }));
  }
  out('url', url ?? '');
  console.log(`预览：${tier} ${url ?? '（无地址）'}`);
  // PR 里新增或修改的资产文件（public/、assets/ 下的图片与模型）
  let assets = [];
  if (pr) { try { assets = sh('gh', ['pr', 'diff', String(pr), '-R', repo, '--name-only']).split('\n').filter((f) => /^(public|assets)\/.+\.(png|jpe?g|webp|gif|avif|glb|gltf)$/i.test(f) && !f.startsWith('public/lorebook/')); } catch { /* 拿不到 diff 就不列 */ } }
  if (pr) upsertComment(repo, pr, commentBody({ tier, url, sha, shots, runUrl, repo, lorebook: existsSync('dist/lorebook/index.html'), assets }));
}
