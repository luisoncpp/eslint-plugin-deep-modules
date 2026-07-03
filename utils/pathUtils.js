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

/**
 * Compares two paths for equality, tolerant of Windows drive-letter casing.
 * fs.realpathSync.native canonicalizes the drive letter to uppercase, while a
 * path derived from process.cwd() may carry a lowercase drive depending on how
 * the process was launched. Folding the drive letter prevents a false mismatch
 * without weakening the case-sensitive matching the rule relies on elsewhere.
 */
function foldDriveLetter(p) {
  return path.normalize(p).replace(/^[a-z]:/, driveLetter => driveLetter.toUpperCase());
}

function samePath(a, b) {
  return foldDriveLetter(a) === foldDriveLetter(b);
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

const JsExtensionPattern = /\.[cm]?jsx?$/;

/**
 * Resolves an import source to an actual path on disk.
 * Checks .ts/.tsx extensions before treating as a directory.
 * NodeNext ESM specifiers point at the emitted .js/.mjs/.cjs file
 * (e.g. '../gear/schema.js'); those are remapped to the .ts/.tsx source
 * so boundary checks apply to server code, not just extensionless imports.
 * Returns null if nothing found.
 */
function resolveImport(importerFile, importSource) {
  const base = path.resolve(path.dirname(importerFile), importSource);
  if (existsSync(base + '.ts')) return base + '.ts';
  if (existsSync(base + '.tsx')) return base + '.tsx';
  if (JsExtensionPattern.test(base)) {
    const withoutJsExt = base.replace(JsExtensionPattern, '');
    if (existsSync(withoutJsExt + '.ts')) return withoutJsExt + '.ts';
    if (existsSync(withoutJsExt + '.tsx')) return withoutJsExt + '.tsx';
  }
  if (existsSync(base)) return base;
  return null;
}

module.exports = { existsSync, isDirectory, isInsideDir, isDirectChildOf, matchesPattern, resolveImport, samePath };
