'use strict';
const path = require('path');
const fs = require('fs');
const { isInsideDir } = require('./pathUtils');

const GroupFileSuffix = '.group.md';
const FrontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---/;
const InlineListPattern = /^(facades|ignore|exclude):\s*\[(.*)\]\s*$/;
const BlockListStartPattern = /^(facades|ignore|exclude):\s*$/;
const BlockListItemPattern = /^-\s*(.+?)\s*$/;
const QuotedItemPattern = /["']([^"']+)["']/g;

const groupCache = new Map();

function parseListEntries(rawList) {
  const entries = [];
  let match;
  while ((match = QuotedItemPattern.exec(rawList)) !== null) entries.push(match[1]);
  QuotedItemPattern.lastIndex = 0;
  return entries;
}

function parseGroupFile(filePath) {
  let frontmatter;
  try { frontmatter = FrontmatterPattern.exec(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
  if (!frontmatter) return null;

  const lists = { facades: [], ignore: [], exclude: [] };
  let openBlockList = null;

  for (const rawLine of frontmatter[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    const inlineList = InlineListPattern.exec(line);
    if (inlineList) {
      lists[inlineList[1]] = parseListEntries(inlineList[2]);
      openBlockList = null;
      continue;
    }
    const blockListStart = BlockListStartPattern.exec(line);
    if (blockListStart) {
      openBlockList = blockListStart[1];
      continue;
    }
    const blockListItem = openBlockList && BlockListItemPattern.exec(line);
    if (blockListItem) {
      lists[openBlockList].push(blockListItem[1].replace(/^["']|["']$/g, ''));
      continue;
    }
    openBlockList = null;
  }
  return lists;
}

/**
 * Reads the `*.group.md` CodeChart descriptor co-located in `dir`, if any.
 * A group whose frontmatter declares `facades` is a deep module boundary even
 * when it has no `index.ts` and no same-named sibling file: `facades` already
 * implies every other module in the group is private.
 * `ignore` (and the `exclude` spelling some descriptors use) carve files out of
 * the group, so imports of those files cross no boundary.
 * Returns { facades: absolute paths, ignore: patterns } or null.
 */
function readGroupDescriptor(dir) {
  if (groupCache.has(dir)) return groupCache.get(dir);

  let descriptor = null;
  let dirEntries = [];
  try { dirEntries = fs.readdirSync(dir); } catch { dirEntries = []; }

  for (const entry of dirEntries) {
    if (!entry.endsWith(GroupFileSuffix)) continue;
    const lists = parseGroupFile(path.join(dir, entry));
    if (!lists || !lists.facades.length) continue;
    const facades = lists.facades.map(facade => path.resolve(dir, facade));
    // A facade outside the descriptor's own folder (e.g. `../Solver.ts`) means the
    // group is rooted elsewhere and its membership comes from `match`, which this
    // rule cannot evaluate — enforcing the folder as the boundary would be wrong.
    if (facades.some(facade => !isInsideDir(facade, dir))) continue;
    descriptor = { facades, ignore: [...lists.ignore, ...lists.exclude] };
    break;
  }

  groupCache.set(dir, descriptor);
  return descriptor;
}

module.exports = { readGroupDescriptor };
