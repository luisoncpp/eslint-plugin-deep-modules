'use strict';
const path = require('path');
const { matchesPattern, resolveImport, resolveFromBase } = require('../utils/pathUtils');
const { findPrivateViolation, findBoundaryViolation } = require('../utils/moduleDetector');
const { resolveAliasBase, resolveAliasEntryRoot, resolveAliasSpecifier } = require('../utils/aliasResolver');

const DefaultOptions = {
  indexPattern: true,
  fileFolderPattern: true,
  groupPattern: true,
  aliasPattern: true,
  privatePatterns: ['private'],
  ignorePatterns: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
};

function mergeOptions(rawOpts) {
  return {
    indexPattern: rawOpts.indexPattern ?? DefaultOptions.indexPattern,
    fileFolderPattern: rawOpts.fileFolderPattern ?? DefaultOptions.fileFolderPattern,
    groupPattern: rawOpts.groupPattern ?? DefaultOptions.groupPattern,
    aliasPattern: rawOpts.aliasPattern ?? DefaultOptions.aliasPattern,
    privatePatterns: rawOpts.privatePatterns ?? DefaultOptions.privatePatterns,
    ignorePatterns: rawOpts.ignorePatterns ?? DefaultOptions.ignorePatterns,
  };
}

/**
 * The specifier the importer should write instead. An import that came in through a
 * tsconfig alias gets an alias suggestion back — telling a file that wrote
 * '@typerlords/shared/utils/itemKey' to use '../../../shared/src/index' would be a fix
 * nobody in this repo writes by hand.
 */
function entryLabel(entryFile, importerFile, wasAliased) {
  if (wasAliased) {
    const specifier = resolveAliasSpecifier(importerFile, entryFile);
    if (specifier) return specifier;
  }
  return path.relative(path.dirname(importerFile), entryFile.replace(/\.[tj]sx?$/, ''));
}

function publicInterfaceLabel(boundary, importerFile, wasAliased) {
  if (boundary.type === 'index') {
    const indexFile = boundary.publicInterface ?? boundary.moduleDir;
    if (wasAliased) {
      const specifier = resolveAliasSpecifier(importerFile, indexFile);
      if (specifier) return specifier.replace(/[/\\]index$/, '').replace(/\\/g, '/');
    }
    return path.relative(path.dirname(importerFile), boundary.moduleDir);
  }
  const entries = boundary.facades ?? [boundary.publicInterface];
  return entries.map(entry => entryLabel(entry, importerFile, wasAliased)).join("' or '");
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce deep module boundaries (index.ts, file+folder, private folder, *.group.md facades)' },
    schema: [{
      type: 'object',
      properties: {
        indexPattern: { type: 'boolean' },
        fileFolderPattern: { type: 'boolean' },
        groupPattern: { type: 'boolean' },
        aliasPattern: { type: 'boolean' },
        privatePatterns: { type: 'array', items: { type: 'string' } },
        ignorePatterns: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    }],
    messages: {
      boundaryViolation:
        "Import '{{import}}' violates deep module boundary. Use '{{publicInterface}}' instead.",
      privateViolation:
        "Import from private folder '{{folder}}' is only allowed from files directly inside '{{parent}}'.",
    },
  },

  create(context) {
    const opts = mergeOptions(context.options[0] ?? {});
    const filename = context.filename ?? context.getFilename?.();

    return {
      ImportDeclaration(node) {
        const importSource = node.source.value;
        if (typeof importSource !== 'string') return;
        if (matchesPattern(filename, opts.ignorePatterns)) return;

        // A tsconfig-aliased import ('@/feature/x', '@scope/pkg/utils/x') addresses the
        // same file a relative import would; resolving it here is what stops an alias
        // from being a silent way around every boundary. Real packages ('react') and
        // unmapped specifiers resolve to null and are skipped.
        const wasAliased = !importSource.startsWith('.');
        if (wasAliased && !opts.aliasPattern) return;
        const resolvedBase = wasAliased
          ? resolveAliasBase(filename, importSource)
          : path.resolve(path.dirname(filename), importSource);
        if (!resolvedBase) return;

        const resolvedImport = wasAliased
          ? resolveFromBase(resolvedBase)
          : resolveImport(filename, importSource);
        if (!resolvedImport) return;

        const privateViolation = findPrivateViolation(resolvedImport, filename, opts.privatePatterns);
        if (privateViolation) {
          context.report({
            node,
            messageId: 'privateViolation',
            data: {
              folder: path.basename(privateViolation.privateFolder),
              parent: privateViolation.parentDir,
            },
          });
          return;
        }

        const boundaryViolation = findBoundaryViolation(
          {
            resolvedBase,
            resolvedImport,
            aliasEntryRoot: wasAliased ? resolveAliasEntryRoot(filename, importSource) : null,
          },
          filename,
          opts,
        );
        if (boundaryViolation) {
          context.report({
            node,
            messageId: 'boundaryViolation',
            data: {
              import: importSource,
              publicInterface: publicInterfaceLabel(boundaryViolation, filename, wasAliased),
            },
          });
        }
      },
    };
  },
};
