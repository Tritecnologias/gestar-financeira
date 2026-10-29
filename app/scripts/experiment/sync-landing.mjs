// One source of truth: exact tracked official landing snapshot, never a second editable design.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const repo = process.argv[2];
const sha = 'ed17a4407949479ca1d8407feeef8704bd9e0451';
if (!repo || execFileSync('git', ['rev-parse','HEAD'], {cwd:repo,encoding:'utf8'}).trim() !== sha) throw Error('APPROVED_LANDING_SHA_REQUIRED');
const root = resolve(import.meta.dirname,'../..');
const paths = ['index.html','styles.css','brand-approved.png','favicon.svg',...[16,32,48,192,512].map(s=>`icons/dez-symbol-${s}.png`)];
const hashes = {};
for (const file of paths) {
  const bytes = execFileSync('git',['show',`${sha}:${file}`],{cwd:repo,maxBuffer:10*1024*1024});
  hashes[file] = createHash('sha256').update(bytes).digest('hex');
  if (file === 'index.html') writeFileSync(resolve(root,'src/lib/official-landing.ts'),`// Generated from official landing ${sha}; edit its source, then sync.\nexport const officialLanding = ${JSON.stringify(bytes.toString('utf8'))};\n`);
  else { const out = resolve(root,'public/experimentacao/assets',file); mkdirSync(resolve(out,'..'),{recursive:true}); writeFileSync(out,bytes); }
}
writeFileSync(resolve(root,'public/experimentacao/assets/provenance.json'),JSON.stringify({sourceCommit:sha,hashes},null,2)+'\n');
console.log(JSON.stringify({state:'OFFICIAL_LANDING_PINNED',sourceCommit:sha,assets:paths.length}));
