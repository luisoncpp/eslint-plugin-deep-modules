'use strict';
const path = require('path');
const fs = require('fs');

function existsSync(p) {
  return fs.existsSync(p);
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

const compiledPatterns = new Map();

function compilePattern(pattern) {
  if (!compiledPatterns.has(pattern)) {
    const regexStr = pattern
      .replace(/\\/g, '/')
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/(?<!\*)\*(?!\*)/g, '[^/]*');
    compiledPatterns.set(pattern, new RegExp(regexStr + '$'));
  }
  return compiledPatterns.get(pattern);
}

function matchesPattern(filePath, patterns) {
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some(pattern => compilePattern(pattern).test(normalized));
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
