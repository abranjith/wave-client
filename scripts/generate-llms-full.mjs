#!/usr/bin/env node
/**
 * Generates docs/llms-full.txt by concatenating the documentation pages into a
 * single file for LLM ingestion.
 *
 * This is a build artifact — do NOT edit docs/llms-full.txt by hand. Edit the
 * individual files under docs/ and regenerate with:
 *
 *   pnpm docs:llms
 *
 * Each source file is delimited by a `===== FILE: <path> =====` marker so a
 * model can attribute content back to its origin. Keep ORDER in sync with the
 * docs structure and docs/llms.txt when pages are added or removed.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(__dirname, '..', 'docs');
const OUTPUT = join(DOCS_DIR, 'llms-full.txt');

// Reading order — mirrors the documentation map in docs/llms.txt.
const ORDER = [
  'README.md',
  'getting-started/installation.md',
  'getting-started/quick-start.md',
  'features/requests.md',
  'features/collections.md',
  'features/environments.md',
  'features/variables.md',
  'features/auth.md',
  'features/validations.md',
  'features/wave-store.md',
  'features/flows.md',
  'features/tests.md',
  'features/reporting.md',
  'features/settings.md',
  'features/ai-arena.md',
  'platforms/vscode.md',
  'platforms/web-app.md',
  'design.md',
  'release-notes.md',
];

const HEADER =
  '# Wave Client — Full Documentation\n\n' +
  '> Auto-generated bundle: every Wave Client documentation page concatenated into one file for LLM ingestion. ' +
  'Do not edit by hand — edit the individual files under docs/ and regenerate with `pnpm docs:llms`. ' +
  'Source files are delimited by "===== FILE: <path> =====" markers.\n';

async function main() {
  const parts = [HEADER];

  for (const rel of ORDER) {
    const abs = join(DOCS_DIR, rel);
    const content = await readFile(abs, 'utf8');
    parts.push(`\n\n===== FILE: docs/${rel} =====\n\n`);
    parts.push(content.replace(/\s+$/, ''));
  }

  await writeFile(OUTPUT, parts.join('') + '\n', 'utf8');
  console.log(`Wrote ${OUTPUT} (${ORDER.length} files)`);
}

main().catch((err) => {
  console.error('Failed to generate llms-full.txt:', err);
  process.exit(1);
});
