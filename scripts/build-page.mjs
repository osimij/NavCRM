// Builds landing/index.html from src/index.template.html by replacing
// <!-- @partial name --> markers with src/partials/name.html.
// Usage: npm run build
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const template = readFileSync(new URL('src/index.template.html', root), 'utf8');

const missing = [];
const html = template.replace(/<!-- @partial ([\w-]+) -->/g, (_, name) => {
  const file = new URL(`src/partials/${name}.html`, root);
  if (!existsSync(file)) {
    missing.push(name);
    return `<!-- partial "${name}" not built yet -->`;
  }
  return readFileSync(file, 'utf8').trim();
});

writeFileSync(new URL('landing/index.html', root), html);
console.log(`Built landing/index.html${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
