// The blueprint's own tests: node test/run.mjs
// Rendering, consistency of spec and code, the library rules, and new apps of both profiles
// with the checks that must pass and the violations they must catch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderText, parseConf, checkConf, layerFiles, walk, variables, PROFILES } from '../tools/lib/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`\x1b[32m ✓ \x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`\x1b[31m ✗ \x1b[0m ${name}\n    ${String(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); }
};
const vars = profile => ({ ...variables({ APP_ID: 'demo-app', APP_NAME: 'Demo', APP_TAGLINE: 'A demo.', APP_DESCRIPTION: 'Twenty characters of description.', APP_REPO: 'owner/demo-app', APP_PROFILE: profile, APP_PORT: '8080', APP_KEYWORDS: 'demo', APP_DATA_NOTE: 'Data lives here.', LOGO_PATTERN: 'bars', LOGO_COLORS: 'blue' }, { version: '1.2.3', blueprintVersion: '9.9.9' }), LOGO_RAIL_SVG: '<svg/>', FAVICON_HREF: 'data:x', LIBRARY: '', LIBRARY_CSS: '' });
const varsWith = (profile, extra) => ({ ...vars(profile), ...extra });

// ---------------------------------------------------------------- Rendering
await test('placeholders and profile blocks', () => {
  const t = 'a @@APP_ID@@\n@@IF static@@\ns\n@@ELSE@@\nv\n@@END@@\n@@LIBRARY_CSS@@\nz';
  assert.equal(renderText(t, vars('static')), 'a demo-app\ns\nz');
  assert.equal(renderText(t, vars('server')), 'a demo-app\nv\nz');
  assert.throws(() => renderText('x @@NOPE@@', vars('static')), /unknown placeholder/);
  assert.throws(() => renderText('text @@IF server@@', vars('static')), /must stand alone/);
  assert.throws(() => renderText('@@IF server@@\nx', vars('static')), /without @@END@@/);
  const lib = '@@IF lib:auth@@\na\n@@ELSE@@\nb\n@@END@@\n@@IF packages@@\np @@APP_PACKAGES@@\n@@END@@\nz';
  assert.equal(renderText(lib, varsWith('server', { LIBRARY: 'stats,auth', APP_PACKAGES: 'ansible-core' })), 'a\np ansible-core\nz');
  assert.equal(renderText(lib, varsWith('server', { LIBRARY: 'stats', APP_PACKAGES: '' })), 'b\nz');
  assert.equal(renderText('@@IF server@@\n@@IF lib:jobs@@\nj\n@@END@@\n@@END@@\nz', varsWith('server', { LIBRARY: 'jobs' })), 'j\nz', 'nested');
});

await test('every file of core, template and library renders in both profiles', () => {
  for (const profile of PROFILES) for (const layer of ['core', 'template']) {
    for (const f of layerFiles(ROOT, layer, vars(profile))) if (!f.binary) renderText(fs.readFileSync(f.src, 'utf8'), vars(profile), f.src);
  }
  for (const el of fs.readdirSync(path.join(ROOT, 'library'))) {
    for (const f of walk(path.join(ROOT, 'library', el, 'files'))) renderText(read(`library/${el}/files/${f}`), vars('server'), f);
  }
  // and with every element and packages switched on
  const all = varsWith('server', { LIBRARY: fs.readdirSync(path.join(ROOT, 'library')).join(','), APP_PACKAGES: 'ansible-core openssh-client' });
  for (const layer of ['core', 'template']) for (const f of layerFiles(ROOT, layer, all)) if (!f.binary) renderText(fs.readFileSync(f.src, 'utf8'), all, f.src);
});

await test('project.conf: parsing and every rule', () => {
  const c = parseConf('APP_ID="ok-app"\n# comment\nAPP_NAME="Ok"\n');
  assert.equal(c.APP_ID, 'ok-app');
  assert.throws(() => parseConf('APP_ID=no-quotes'), /expected KEY="value"/);
  const errs = checkConf({ APP_ID: 'Bad Id', APP_TAGLINE: 'Wow!', LIBRARY: 'Stats' });
  assert.ok(checkConf({ APP_PROFILE: 'static', APP_PACKAGES: 'curl' }).some(e => /server profile only/.test(e)));
  assert.ok(checkConf({ APP_PROFILE: 'server', APP_PACKAGES: 'curl;rm' }).some(e => e.startsWith('APP_PACKAGES')));
  assert.ok(errs.some(e => e.startsWith('APP_ID')) && errs.some(e => e.startsWith('APP_TAGLINE')) && errs.some(e => e.startsWith('LIBRARY')) && errs.some(e => e.includes('APP_REPO is missing')));
});

// ---------------------------------------------------------------- Spec and code agree
await test('every token of base.css is in spec/01-design.md with its value', () => {
  const css = read('core/common/src/css/base.css'), spec = read('spec/01-design.md');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const tokens = [...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)];
  assert.ok(tokens.length > 25);
  for (const [, k, v] of tokens) assert.ok(spec.includes(`${k}: ${v.trim()}`), `${k}: ${v}`);
  const dark = css.slice(css.indexOf(':root[data-theme="dark"] {'));
  for (const m of dark.slice(0, dark.indexOf('}')).matchAll(/(--[\w-]+):\s*([^;]+);/g)) assert.ok(spec.includes(m[2].trim()), `dark ${m[1]}`);
});

await test('the same security headers in nginx, the installer, the app server and the test server', () => {
  const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'";
  for (const f of ['core/static/deploy/docker/nginx.conf', 'core/common/installer/core/tail.sh', 'core/server/server/core/http.mjs', 'core/common/test/lib/serve.mjs']) {
    const t = read(f);
    assert.ok(t.includes(csp), `${f}: CSP`);
    for (const h of ['nosniff', 'no-referrer', 'SAMEORIGIN']) assert.ok(t.includes(h), `${f}: ${h}`);
  }
});

await test('the changelog has the current version, the spec chapters exist and link', () => {
  const v = read('BLUEPRINT_VERSION').trim();
  assert.ok(read('CHANGELOG.md').includes(`## ${v}`), `CHANGELOG.md: ## ${v}`);
  const index = read('spec/README.md');
  for (const m of index.matchAll(/\]\(([0-9]{2}-[a-z-]+\.md)\)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'spec', m[1])), m[1]);
  for (const s of ['tpl-home.png', 'tpl-parts.png', 'pp-home.png', 'pp-lab.png']) assert.ok(fs.existsSync(path.join(ROOT, 'spec/screens', s)), s);
});

// ---------------------------------------------------------------- Library rules (spec/12-library.md 12.3)
await test('library elements follow the rules', () => {
  const index = read('spec/12-library.md');
  for (const name of fs.readdirSync(path.join(ROOT, 'library'))) {
    const el = JSON.parse(read(`library/${name}/element.json`));
    assert.match(name, /^[a-z][a-z0-9-]*$/);
    for (const k of ['title', 'kind', 'profiles', 'description', 'since', 'requires']) assert.ok(k in el, `${name}: ${k}`);
    assert.ok(['component', 'module', 'feature'].includes(el.kind));
    assert.ok(el.profiles.every(p => PROFILES.includes(p)));
    const doc = read(`library/${name}/README.md`);
    for (const s of ['## When to use', '## When not to use', '## Rules', '## Files']) assert.ok(doc.includes(s), `${name}: README ${s}`);
    assert.ok(doc.includes('## Markup') || doc.includes('## API'), `${name}: README Markup or API`);
    assert.ok(index.includes(`| \`${name}\` |`), `${name} is listed in spec/12-library.md`);
    const files = walk(path.join(ROOT, 'library', name, 'files'));
    assert.ok(files.some(f => /^test\/(unit|browser)\/lib-/.test(f)), `${name}: a test`);
    for (const f of files.filter(f => f.endsWith('.css'))) {
      const css = read(`library/${name}/files/${f}`).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const sel of css.split('}').map(r => r.split('{')[0].trim()).filter(Boolean)) {
        if (sel.startsWith('@media')) continue;
        for (const one of sel.split(',')) assert.ok(one.trim().startsWith(`.${name}`), `${name}: selector "${one.trim()}" must start with .${name}`);
      }
      assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), `${name}: no hex colors`);
      assert.ok(!/!important|@import|@font-face|font-family:(?!\s*var\()/.test(css), `${name}: no !important, @import, @font-face, foreign fonts`);
    }
    for (const f of files.filter(f => /\.(js|mjs)$/.test(f) && !f.startsWith('test/'))) {
      const js = read(`library/${name}/files/${f}`);
      for (const m of js.matchAll(/from ['"]([^'"]+)['"]/g)) assert.ok(m[1].startsWith('.') || m[1] === 'pg' || m[1].startsWith('node:'), `${name}: ${f} imports ${m[1]}`);
    }
  }
});

// ---------------------------------------------------------------- New apps and the checks
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-test-'));
const tool = (args, cwd = ROOT) => spawnSync(process.execPath, [path.join(ROOT, 'tools/blueprint.mjs'), ...args], { cwd, encoding: 'utf8' });
const app = (profile) => {
  const dir = path.join(tmp, profile);
  const r = tool(['new', dir, '--id', `t-${profile}`, '--name', 'Test', '--repo', `owner/t-${profile}`, '--profile', profile, '--tagline', 'A test app of the blueprint.', '--description', 'An app made by the blueprint test suite.']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // build.sh needs no network for the static profile; the server profile installs pg (lockfile from new)
  return dir;
};
const check = dir => spawnSync(process.execPath, ['.blueprint/tools/blueprint.mjs', 'check'], { cwd: dir, encoding: 'utf8' });
const render = dir => spawnSync(process.execPath, ['.blueprint/tools/blueprint.mjs', 'render'], { cwd: dir, encoding: 'utf8' });
const edit = (dir, f, fn) => { const p = path.join(dir, f); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
const expectProblem = (dir, re, what) => { const r = check(dir); assert.notEqual(r.status, 0, `${what}: check must fail`); assert.match(r.stdout + r.stderr, re, what); };

for (const profile of PROFILES) {
  await test(`a new ${profile} app follows the blueprint`, () => {
    const dir = app(profile);
    // The installer and the PNG logos are made by build.sh and `logo`; for the check they only need to exist
    fs.writeFileSync(path.join(dir, `t-${profile}-install.sh`), '#!/bin/sh\n');
    for (const t of ['light', 'dark']) if (!fs.existsSync(path.join(dir, `assets/logo/t-${profile}-icon-${t}.png`))) fs.writeFileSync(path.join(dir, `assets/logo/t-${profile}-icon-${t}.png`), '');
    if (profile === 'server' && !fs.existsSync(path.join(dir, 'package-lock.json'))) fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    const r = check(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  await test(`the check catches violations (${profile})`, () => {
    const dir = path.join(tmp, profile);
    const backup = f => fs.readFileSync(path.join(dir, f));
    const restore = (f, b) => fs.writeFileSync(path.join(dir, f), b);
    let b = backup('src/css/base.css'); edit(dir, 'src/css/base.css', s => s.replace('--r-s: 6px', '--r-s: 8px')); expectProblem(dir, /blueprint file differs: src\/css\/base.css/, 'edited base.css'); restore('src/css/base.css', b);
    b = backup('src/css/app.css'); edit(dir, 'src/css/app.css', s => s + '\n.x { color: #123456; font-family: Arial; box-shadow: 0 9px 30px red; }\n'); expectProblem(dir, /#123456[\s\S]*font-family[\s\S]*box-shadow/, 'foreign CSS'); restore('src/css/app.css', b);
    b = backup('package.json'); edit(dir, 'package.json', s => s.replace('"devDependencies": {', '"devDependencies": {\n    "left-pad": "1.3.0",')); expectProblem(dir, /left-pad/, 'dependency');
    edit(dir, 'DEVIATIONS.md', s => s.replace('None.', '## Dependency: left-pad\nReason: The owner wants to pad strings on the left in a very particular way.\nApproved: Owner, 2026-10-07\n'));
    assert.equal(check(dir).status, 0, 'an approved deviation passes');
    edit(dir, 'DEVIATIONS.md', s => s.replace('Approved: Owner, 2026-10-07', 'Approved: soon')); expectProblem(dir, /Approved:/, 'deviation without date');
    edit(dir, 'DEVIATIONS.md', s => s.replace(/## Dependency[\s\S]*$/, 'None.\n')); restore('package.json', b);
    b = backup('src/index.html'); edit(dir, 'src/index.html', s => s.replace('</head>', '<script src="https://cdn.example.com/x.js"></script>\n</head>')); expectProblem(dir, /another server/, 'CDN'); restore('src/index.html', b);
    edit(dir, 'src/index.html', s => s.replace('<span class="spacer"></span>', '<a href="#/x" data-nav="x"><span data-icon="plus"></span>Something long</a>\n    <a href="#/y" data-nav="y"><span data-icon="plus"></span>Y</a>\n    <a href="#/z" data-nav="z"><span data-icon="plus"></span>Z</a>\n    <span class="spacer"></span>')); expectProblem(dir, /2 to 6 menu entries|longer than 9/, 'menu'); restore('src/index.html', b);
    edit(dir, '.blueprint/core/common/src/css/base.css', s => s + '\n/* x */\n'); expectProblem(dir, /\.blueprint\/ was changed by hand/, 'tampered .blueprint'); edit(dir, '.blueprint/core/common/src/css/base.css', s => s.replace('\n/* x */\n', ''));
    edit(dir, 'project.conf', s => s + 'LIBRARY="nope"\n'); expectProblem(dir, /no library element "nope"/, 'unknown library element'); edit(dir, 'project.conf', s => s.replace('LIBRARY="nope"\n', ''));
    edit(dir, 'src/js/app.js', s => s + "\nimport { statTiles } from './lib/stats.js';\n"); expectProblem(dir, /library element "stats", which is not in LIBRARY/, 'library used but off'); edit(dir, 'src/js/app.js', s => s.replace("\nimport { statTiles } from './lib/stats.js';\n", ''));
    if (profile === 'server') {
      edit(dir, 'server/migrations/0001_items.sql', s => s + '\n-- changed\n'); expectProblem(dir, /was changed after it was recorded/, 'changed migration'); edit(dir, 'server/migrations/0001_items.sql', s => s.replace('\n-- changed\n', ''));
      edit(dir, 'server/api/items.mjs', s => "import Database from 'better-sqlite3';\n" + s); expectProblem(dir, /library outside the blueprint/, 'another database'); edit(dir, 'server/api/items.mjs', s => s.replace("import Database from 'better-sqlite3';\n", ''));
    }
    assert.equal(check(dir).status, 0, check(dir).stdout + check(dir).stderr);
  });
}

await test('library elements: on, used, off', () => {
  const dir = path.join(tmp, 'static');
  edit(dir, 'project.conf', s => s + 'LIBRARY="stats"\n');
  assert.equal(render(dir).status, 0);
  assert.ok(fs.existsSync(path.join(dir, 'src/css/lib/stats.css')));
  assert.ok(fs.readFileSync(path.join(dir, 'src/index.html'), 'utf8').includes('<link rel="stylesheet" href="css/lib/stats.css">'));
  assert.equal(check(dir).status, 0, check(dir).stdout);
  edit(dir, 'project.conf', s => s.replace('LIBRARY="stats"\n', ''));
  assert.equal(render(dir).status, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'src/css/lib')), 'files and empty folders removed');
  assert.ok(!fs.readFileSync(path.join(dir, 'src/index.html'), 'utf8').includes('css/lib/'));
});

await test('update to a newer blueprint (from a local copy) re-renders and reports', () => {
  const dir = path.join(tmp, 'static');
  const next = path.join(tmp, 'next');
  for (const item of ['BLUEPRINT_VERSION', 'CHANGELOG.md', 'core', 'library', 'template', 'tools', 'spec']) fs.cpSync(path.join(ROOT, item), path.join(next, item), { recursive: true });
  fs.writeFileSync(path.join(next, 'BLUEPRINT_VERSION'), '99.0.0\n');
  fs.appendFileSync(path.join(next, 'CHANGELOG.md'), '\n## 99.0.0\n\nA test version.\n\nProjects must: nothing.\n');
  fs.appendFileSync(path.join(next, 'core/common/src/css/base.css'), '/* 99 */\n');
  const r = spawnSync(process.execPath, ['.blueprint/tools/blueprint.mjs', 'update', '--from', next], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /99\.0\.0[\s\S]*A test version/);
  assert.ok(fs.readFileSync(path.join(dir, 'src/css/base.css'), 'utf8').endsWith('/* 99 */\n'));
  assert.equal(check(dir).status, 0, check(dir).stdout);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} of ${passed + failed} blueprint tests passed`);
process.exit(failed ? 1 : 0);
