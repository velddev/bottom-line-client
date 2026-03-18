/**
 * Embed external texture URIs into GLB files.
 * 
 * Many GLB files in public/models/ reference textures via external URI
 * (e.g. "Textures/colormap.png"). Discord's Activity proxy returns 403
 * for these separate fetches. This script reads each GLB, resolves the
 * external images, and re-writes the GLB with textures embedded in the
 * binary chunk.
 */

import fs from 'fs';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';

const MODELS_DIR = path.resolve('public/models');

function findGlbFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findGlbFiles(full));
    else if (entry.name.endsWith('.glb')) results.push(full);
  }
  return results;
}

async function main() {
  const io = new NodeIO();
  const files = findGlbFiles(MODELS_DIR);
  
  let embedded = 0;
  let skipped = 0;

  for (const filePath of files) {
    // Quick check: does this GLB reference external URIs?
    const buf = fs.readFileSync(filePath);
    const jsonLen = buf.readUInt32LE(12);
    const jsonStr = buf.toString('utf8', 20, 20 + jsonLen);
    const gltf = JSON.parse(jsonStr);

    const hasExternalImages = gltf.images?.some(img => img.uri && !img.uri.startsWith('data:'));
    if (!hasExternalImages) {
      skipped++;
      continue;
    }

    const rel = path.relative(MODELS_DIR, filePath);
    console.log(`Embedding: ${rel}`);

    // gltf-transform reads and resolves external resources
    const doc = await io.read(filePath);
    
    // Write back as GLB (all resources embedded)
    await io.write(filePath, doc);
    embedded++;
  }

  console.log(`\nDone: ${embedded} files embedded, ${skipped} already embedded.`);
}

main().catch(err => { console.error(err); process.exit(1); });
