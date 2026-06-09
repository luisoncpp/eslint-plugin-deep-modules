'use strict';
const path = require('path');
const { matchesPattern, resolveImport } = require('../utils/pathUtils');
const { findPrivateViolation, findBoundaryViolation } = require('../utils/moduleDetector');

const DefaultOptions = {
  indexPattern: true,
  fileFolderPattern: true,
  privatePatterns: ['private'],
  ignorePatterns: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
};

function mergeOptions(rawOpts) {
  return {
    indexPattern: rawOpts.indexPattern ?? DefaultOptions.indexPattern,
    fileFolderPattern: rawOpts.fileFolderPattern ?? DefaultOptions.fileFolderPattern,
    privatePatterns: rawOpts.privatePatterns ?? DefaultOptions.privatePatterns,
    ignorePatterns: rawOpts.ignorePatterns ?? DefaultOptions.ignorePatterns,
  };
}

function publicInterfaceLabel(boundary, importerFile) {
  if (boundary.type === 'index') {
    return path.relative(path.dirname(importerFile), boundary.moduleDir);
  }
  const withoutExt = boundary.publicInterface.replace(/\.[tj]sx?$/, '');
  return path.relative(path.dirname(importerFile), withoutExt);
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce deep module boundaries (index.ts, file+folder, private folder)' },
    schema: [{
      type: 'object',
      properties: {
        indexPattern: { type: 'boolean' },
        fileFolderPattern: { type: 'boolean' },
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
        if (typeof importSource !== 'string' || !importSource.startsWith('.')) return;
        if (matchesPattern(filename, opts.ignorePatterns)) return;

        const resolvedBase = path.resolve(path.dirname(filename), importSource);
        const resolvedImport = resolveImport(filename, importSource);
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

        const boundaryViolation = findBoundaryViolation(resolvedBase, resolvedImport, filename, opts);
        if (boundaryViolation) {
          context.report({
            node,
            messageId: 'boundaryViolation',
            data: {
              import: importSource,
              publicInterface: publicInterfaceLabel(boundaryViolation, filename),
            },
          });
        }
      },
    };
  },
};
