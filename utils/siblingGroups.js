'use strict';
const path = require('path');
const { isDirectory, samePath } = require('./pathUtils');
const { readGroupDescriptor } = require('./groupFacades');

/**
 * The nearest ancestor folder of `target` that declares a `*.group.md` descriptor, or null.
 * Walking up (rather than reading `target`'s own folder) is what makes a file nested inside a
 * subgroup count as a member of that subgroup.
 */
function declaringGroupDir(target) {
  let dir = isDirectory(target) ? target : path.dirname(target);
  while (true) {
    if (readGroupDescriptor(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The sibling-import verdict for one resolved import, or null when the rule has nothing to say.
 *
 * Only TRUE siblings are judged: both groups must share a parent folder. An import that lands in
 * the importer's own group, in an unrelated part of the tree, or in a group nested at another
 * depth is somebody else's business — `no-boundary-violation` already governs whether it went
 * through a public interface, and this rule governs only the DIRECTION between peers.
 *
 * Returns { group, sibling, allowed } for a forbidden import; null for an allowed one.
 */
function findSiblingViolation(importerFile, resolvedImport) {
  const importerGroup = declaringGroupDir(importerFile);
  if (!importerGroup) return null;

  const { siblings } = readGroupDescriptor(importerGroup);
  if (!siblings) return null; // descriptor opted out by not declaring the key

  const importedGroup = declaringGroupDir(resolvedImport);
  if (!importedGroup) return null;
  if (samePath(importerGroup, importedGroup)) return null;
  if (!samePath(path.dirname(importerGroup), path.dirname(importedGroup))) return null;

  const sibling = path.basename(importedGroup);
  if (siblings.includes(sibling)) return null;

  return { group: path.basename(importerGroup), sibling, allowed: siblings };
}

module.exports = { findSiblingViolation };
