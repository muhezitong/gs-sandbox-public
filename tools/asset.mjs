// 资产生成 CLI：node tools/asset.mjs image --out public/images/x.webp --use 用途 --prompt "…" [--json]
//              node tools/asset.mjs model --out public/models/x.glb --use 用途 --image public/images/x-ref.png [--json]
// 约定见 game-studio《模型工具接口》。成功后自动登记到 assets/README.md。
import { fileURLToPath } from 'node:url';
import { parseArgs, AssetError } from './asset-lib.mjs';
import { generateImage } from './asset-image.mjs';
import { generateModel } from './asset-model.mjs';
import { realpathSync } from 'node:fs';
// 是否被直接运行：比较真实路径（macOS 上 /var 是 /private/var 的符号链接，直接比字符串会误判）
const isMain = (url) => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; } };

export const COMMANDS = { image: generateImage, model: generateModel };
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export async function run(argv, ctx = {}) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const fn = COMMANDS[cmd];
    if (!fn) throw new AssetError('bad_args', `用法：node tools/asset.mjs <${Object.keys(COMMANDS).join('|')}> --out <路径> --use <用途> …`);
    return { result: await fn(opts, { root: ROOT, ...ctx }), opts };
  } catch (e) {
    return { result: { ok: false, code: e.code ?? 'http', message: e.message }, opts: {} };
  }
}

if (isMain(import.meta.url)) {
  const { result, opts } = await run(process.argv.slice(2));
  if (opts.json || !result.ok) console.log(JSON.stringify(result));
  else console.log(result.dryRun ? `dry-run：${result.endpoint}\n${JSON.stringify(result.params, null, 2)}` : `已生成 ${result.out}（${result.model}，${Math.round(result.bytes / 1024)} KB${result.faces ? `，${result.faces} 面` : ''}，${(result.ms / 1000).toFixed(1)} 秒），已登记到 assets/README.md`);
  for (const w of result.warnings ?? []) console.warn(`警告：${w}`);
  process.exit(result.ok ? 0 : 1);
}
