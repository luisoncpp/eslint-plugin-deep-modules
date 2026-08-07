'use strict';
const path = require('path');
const fs = require('fs');
const { existsSync, isDirectory, isInsideDir, isDirectChildOf, matchesPattern, samePath } = require('./pathUtils');
const { readGroupDescriptor } = require('./groupFacades');

/**
 * On case-insensitive filesystems (Windows), existsSync('app.tsx') can find 'App.tsx'.
 * This verifies the actual file name matches the expected base name exactly (case-sensitive)
 * so that file+folder detection is cross-platform consistent.
 */
function findExactCaseFile(parent, dirName) {
  for (const ext of ['.ts', '.tsx']) {
    const candidate = path.join(parent, dirName + ext);
    if (!existsSync(candidate)) continue;
    try {
      const actualBase = path.basename(fs.realpathSync.native(candidate), ext);
      if (actualBase === dirName) return fs.realpathSync.native(candidate);
    } catch {
      return candidate;
    }
  }
  return null;
}

/**
 * A `*.group.md` boundary, or null when the folder declares no group facades or
 * when the group's own `ignore` patterns exclude the imported file.
 */
function findGroupBoundary(dir, resolvedImport) {
  const descriptor = readGroupDescriptor(dir);
  if (!descriptor) return null;
  if (descriptor.ignore.length && matchesPattern(resolvedImport, descriptor.ignore)) return null;
  return { type: 'group', moduleDir: dir, publicInterface: descriptor.facades[0], facades: descriptor.facades };
}

/** Every file that counts as the boundary's public entry point. */
function publicInterfacesOf(boundary) {
  return boundary.facades ?? [boundary.publicInterface];
}

/**
 * Collects all deep module boundaries from innermost to outermost
 * by walking up from the resolved import path.
 * Each boundary is { type: 'index'|'filefolder'|'group', moduleDir, publicInterface }.
 */
function findBoundaries(resolvedImport, options) {
  const { indexPattern, fileFolderPattern, groupPattern } = options;
  const boundaries = [];
  let dir = isDirectory(resolvedImport) ? resolvedImport : path.dirname(resolvedImport);

  while (true) {
    const parent = path.dirname(dir);
    if (parent === dir) break;

    const dirName = path.basename(dir);

    if (fileFolderPattern && isDirectory(dir)) {
      const publicInterface = findExactCaseFile(parent, dirName);
      if (publicInterface) {
        boundaries.push({ type: 'filefolder', moduleDir: dir, publicInterface });
      }
    }

    if (indexPattern) {
      const indexTs = path.join(dir, 'index.ts');
      const indexTsx = path.join(dir, 'index.tsx');
      if (existsSync(indexTs)) {
        boundaries.push({ type: 'index', moduleDir: dir, publicInterface: indexTs });
      } else if (existsSync(indexTsx)) {
        boundaries.push({ type: 'index', moduleDir: dir, publicInterface: indexTsx });
      }
    }

    if (groupPattern) {
      const groupBoundary = findGroupBoundary(dir, resolvedImport);
      if (groupBoundary) boundaries.push(groupBoundary);
    }

    dir = parent;
  }

  return boundaries;
}

function isImportThroughPublicInterface(resolvedBase, resolvedImport, boundary) {
  if (boundary.type === 'index') {
    return (
      samePath(resolvedBase, boundary.moduleDir) ||
      samePath(resolvedImport, boundary.publicInterface)
    );
  }
  if (boundary.type === 'group') {
    return boundary.facades.some(facade => {
      // A directory import ('../support') resolves to the folder; the bundler
      // maps it to the folder's index file, so an index facade covers it.
      if (samePath(resolvedBase, path.dirname(facade)) && /index\.[tj]sx?$/.test(facade)) return true;
      return samePath(resolvedImport, facade) || samePath(resolvedBase, facade.replace(/\.[tj]sx?$/, ''));
    });
  }
  if (boundary.type === 'filefolder') {
    const pubWithoutExt = boundary.publicInterface.replace(/\.[tj]sx?$/, '');
    return (
      samePath(resolvedBase, pubWithoutExt) ||
      samePath(resolvedImport, boundary.publicInterface)
    );
  }
  return false;
}

/**
 * Checks for a private-folder access violation.
 * Returns { privateFolder, parentDir } or null.
 */
function findPrivateViolation(resolvedImport, importerFile, privatePatterns) {
  if (!privatePatterns.length) return null;
  let current = isDirectory(resolvedImport) ? resolvedImport : path.dirname(resolvedImport);
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break;
    const name = path.basename(current);
    if (privatePatterns.some(p => p.toLowerCase() === name.toLowerCase())) {
      // A file already living inside this private folder is referencing a
      // sibling implementation file — internal cohesion, not a boundary
      // crossing. Only importers from OUTSIDE the private folder must be a
      // direct sibling of the private folder (e.g. the facade next to it).
      if (isInsideDir(importerFile, current)) return null;
      if (!isDirectChildOf(importerFile, parent)) {
        return { privateFolder: current, parentDir: parent };
      }
      return null;
    }
    current = parent;
  }
  return null;
}

/**
 * Finds the first boundary the importer violates, or null if access is valid.
 * Checks boundaries from innermost to outermost so nested modules are handled correctly:
 * if B is inside A, a file outside A cannot import B's public interface either.
 */
function findBoundaryViolation(resolvedBase, resolvedImport, importerFile, options) {
  const boundaries = findBoundaries(resolvedImport, options);
  for (const boundary of boundaries) {
    const importerIsInside = isInsideDir(importerFile, boundary.moduleDir);
    const importerIsPublicInterface = publicInterfacesOf(boundary).some(entry => samePath(importerFile, entry));
    if (importerIsInside || importerIsPublicInterface) break;
    if (!isImportThroughPublicInterface(resolvedBase, resolvedImport, boundary)) {
      return boundary;
    }
  }
  return null;
}

module.exports = { findPrivateViolation, findBoundaryViolation };
