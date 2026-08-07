'use strict';
const path = require('path');
const fs = require('fs');
const { resolveFromBase, samePath } = require('./pathUtils');

const ExportFromPattern = /\bexport\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\}|type\s+\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;

const reExportCache = new Map();

/**
 * Absolute paths of every module a facade re-exports wholesale
 * (`export * from './types/zone.js'`, `export { A } from './api/loot.js'`).
 */
function reExportedModules(facadeFile) {
  if (reExportCache.has(facadeFile)) return reExportCache.get(facadeFile);

  let source;
  try { source = fs.readFileSync(facadeFile, 'utf8'); }
  catch { source = ''; }

  const modules = [];
  let match;
  while ((match = ExportFromPattern.exec(source)) !== null) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const resolved = resolveFromBase(path.resolve(path.dirname(facadeFile), specifier));
    if (resolved) modules.push(resolved);
  }
  ExportFromPattern.lastIndex = 0;

  reExportCache.set(facadeFile, modules);
  return modules;
}

/**
 * True when the facade already re-exports the imported module wholesale. Such a
 * module is part of the module's published surface — reaching it through a
 * package subpath alias (`@scope/pkg/types/zone`, re-exported by the package's
 * own index) exposes nothing the facade does not, so it is a style
 * preference rather than a boundary breach. A module the facade does NOT
 * re-export stays a violation.
 */
function isReExportedByAny(publicInterfaces, resolvedImport) {
  return publicInterfaces.some(facade =>
    reExportedModules(facade).some(target => samePath(target, resolvedImport)));
}

module.exports = { isReExportedByAny };
