#!/usr/bin/env node
/**
 * sync-protos.mjs
 *
 * Merges all server .proto files into a single flat TradeMMOClient/trademmo.proto
 * that the Node.js gRPC client can load directly (no import resolution needed).
 *
 * What this script does:
 *  1. Reads all .proto files from TradeMMO.Server/Protos/ in a fixed order
 *     (common first, then services alphabetically).
 *  2. Strips declarations that don't belong in a merged single-file proto:
 *       - syntax, package, option csharp_namespace, import lines
 *       - option (google.api.http) HTTP-transcoding annotations (server-only)
 *  3. Prepends a shared header (syntax + package).
 *  4. Writes the result to TradeMMOClient/trademmo.proto.
 *
 * Usage (from TradeMMOClient/):
 *   node sync-protos.mjs           # merge and write
 *   node sync-protos.mjs --dry-run # print diff, don't write
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SERVER_PROTOS_DIR = join(__dirname, '../TradeMMO/TradeMMO.Server/Protos');
const OUTPUT_FILE       = join(__dirname, 'trademmo.proto');

// Order matters: common enums/messages must come before the services that reference them.
// common.proto is always first; the rest are sorted alphabetically.
const PROTO_ORDER = [
  'common.proto',
  'agreement.proto',
  'bank.proto',
  'building.proto',
  'city.proto',
  'events.proto',
  'market.proto',
  'marketing.proto',
  'player.proto',
  'politics.proto',
  'research.proto',
  'tile.proto',
];

// ── Transformation helpers ────────────────────────────────────────────────────

/**
 * Remove top-level file directives that don't belong in a merged proto:
 *   syntax = "proto3";
 *   package trademmo;
 *   option csharp_namespace = "...";
 *   import "...";
 */
function stripFileDirectives(src) {
  return src
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (t.startsWith('syntax '))                   return false;
      if (t.startsWith('package '))                  return false;
      if (t.startsWith('option csharp_namespace'))   return false;
      if (t.startsWith('import '))                   return false;
      return true;
    })
    .join('\n');
}

/**
 * Strip `option (google.api.http) = { ... };` blocks from service RPCs.
 * These annotations are used by the HTTP transcoding layer on the server
 * and are not understood by @grpc/proto-loader on the client side.
 *
 * They can span multiple lines, e.g.:
 *   option (google.api.http) = {
 *     post: "/v1/buildings"
 *     body: "*"
 *   };
 */
function stripHttpAnnotations(src) {
  // Match the full option block (may be single- or multi-line)
  // We anchor on `option (google.api.http)` and consume until the closing `};`
  return src.replace(/\s*option\s+\(google\.api\.http\)\s*=\s*\{[^}]*\}\s*;/g, '');
}

/**
 * Remove duplicate blank lines (collapse 3+ consecutive blank lines to 2).
 */
function normalizeBlankLines(src) {
  return src.replace(/(\n\s*){3,}/g, '\n\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const HEADER = `// AUTO-GENERATED — do not edit manually.
// Run \`node sync-protos.mjs\` from the repo root to regenerate.
//
// Merged from TradeMMO.Server/Protos/*.proto
// HTTP transcoding annotations are stripped; all service definitions are preserved.
// google.protobuf.Timestamp is inlined as a local message to avoid WKT import.

syntax = "proto3";

package trademmo;

// Inline replacement for google.protobuf.Timestamp (avoids WKT import in merged proto).
message Timestamp { int64 seconds = 1; int32 nanos = 2; }

`;

const sections = PROTO_ORDER.map(filename => {
  const path = join(SERVER_PROTOS_DIR, filename);
  let src;
  try {
    src = readFileSync(path, 'utf8');
  } catch (e) {
    console.warn(`  ⚠  Could not read ${filename}: ${e.message}`);
    return '';
  }

  src = stripFileDirectives(src);
  src = stripHttpAnnotations(src);
  // Replace WKT Timestamp reference with the inline local message
  src = src.replace(/google\.protobuf\.Timestamp/g, 'Timestamp');
  src = normalizeBlankLines(src);

  // Add a section separator comment
  const divider = `\n// ${'─'.repeat(73)}\n// ${filename}\n// ${'─'.repeat(73)}\n`;
  return divider + src.trimStart();
});

const output = HEADER + sections.join('\n') + '\n';

const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  // Show a summary diff (lines changed)
  let existing = '';
  try { existing = readFileSync(OUTPUT_FILE, 'utf8'); } catch { /* new file */ }
  const existingLines = existing.split('\n').length;
  const newLines      = output.split('\n').length;
  console.log(`Dry run — would write ${newLines} lines (currently ${existingLines} lines)`);
  if (existing !== output) {
    console.log('Changes detected.');
  } else {
    console.log('No changes.');
  }
} else {
  writeFileSync(OUTPUT_FILE, output, 'utf8');
  const lineCount = output.split('\n').length;
  console.log(`✓ Wrote ${OUTPUT_FILE} (${lineCount} lines)`);
  console.log(`  Merged: ${PROTO_ORDER.join(', ')}`);
}
