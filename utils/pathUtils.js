'use strict';
const path = require('path');
const fs = require('fs');

const fsCache = new Map();

function existsSync(p) {
  if (!fsCache.has(p)) fsCache.set(p, fs.existsSync(p));
  return fsCache.get(p);
}

function isDirectory(p) {
  try { return fs.statSync(p).isDirectory(); }
  catch { return false; }
}

function isInsideDir(file, dir) {
  const rel = path.relative(dir, file);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isDirectChildOf(file, dir) {
  const rel = path.relative(dir, file);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep);
}

function matchesPattern(filePath, patterns) {
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some(pattern => {
    const regexStr = pattern
      .replace(/\\/g, '/')
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/(?<!\*)\*(?!\*)/g, '[^/]*');
    return new RegExp(regexStr).test(normalized);
  });
}

/**
 * Resolves an import source to an actual path on disk.
 * Checks .ts/.tsx extensions before treating as a directory.
 * Returns null if nothing found.
 */
function resolveImport(importerFile, importSource) {
  const base = path.resolve(path.dirname(importerFile), importSource);
  if (existsSync(base + '.ts')) return base + '.ts';
  if (existsSync(base + '.tsx')) return base + '.tsx';
  if (existsSync(base)) return base;
  return null;
}

module.exports = { existsSync, isDirectory, isInsideDir, isDirectChildOf, matchesPattern, resolveImport };
