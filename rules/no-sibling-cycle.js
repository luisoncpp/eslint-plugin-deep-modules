'use strict';
const { matchesPattern, resolveImport, resolveFromBase } = require('../utils/pathUtils');
const { findSiblingViolation } = require('../utils/siblingGroups');
const { resolveAliasBase } = require('../utils/aliasResolver');

const DefaultOptions = {
  aliasPattern: true,
  ignorePatterns: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
};

function mergeOptions(rawOpts) {
  return {
    aliasPattern: rawOpts.aliasPattern ?? DefaultOptions.aliasPattern,
    ignorePatterns: rawOpts.ignorePatterns ?? DefaultOptions.ignorePatterns,
  };
}

/** The resolved on-disk path an import points at, or null for a package/unmapped specifier. */
function resolveTarget(filename, importSource, opts) {
  const viaAlias = !importSource.startsWith('.');
  if (viaAlias && !opts.aliasPattern) return null;
  if (!viaAlias) return resolveImport(filename, importSource);
  const base = resolveAliasBase(filename, importSource);
  return base ? resolveFromBase(base) : null;
}

function allowedLabel(allowed) {
  return allowed.length ? allowed.map(name => `'${name}'`).join(', ') : 'nothing';
}

/**
 * Keeps the sibling-import graph of a `*.group.md` group set acyclic by making each group DECLARE
 * which peers it may import. `no-boundary-violation` checks that an import goes THROUGH a public
 * interface; it never checks the direction, so two groups importing each other's public interface
 * is a cycle it cannot see. A cycle between subgroups fails silently at runtime: everything
 * crossing it works while it is read at render time, and resolves to `undefined` the moment
 * something reads it at module-eval time (a top-level const, a decorator, a class extends).
 *
 * @type {import('eslint').Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce the declared sibling-import direction between *.group.md groups' },
    schema: [{
      type: 'object',
      properties: {
        aliasPattern: { type: 'boolean' },
        ignorePatterns: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    }],
    messages: {
      undeclaredSibling:
        "Group '{{group}}' must not import sibling group '{{sibling}}'. Its `siblings:` list allows {{allowed}}. " +
        'Adding this edge risks an import cycle — move the shared code down into a group both can import instead.',
    },
  },

  create(context) {
    const opts = mergeOptions(context.options[0] ?? {});
    const filename = context.filename ?? context.getFilename?.();

    function check(node, importSource) {
      if (typeof importSource !== 'string') return;
      if (matchesPattern(filename, opts.ignorePatterns)) return;

      const resolvedImport = resolveTarget(filename, importSource, opts);
      if (!resolvedImport) return;

      const violation = findSiblingViolation(filename, resolvedImport);
      if (!violation) return;

      context.report({
        node,
        messageId: 'undeclaredSibling',
        data: {
          group: violation.group,
          sibling: violation.sibling,
          allowed: allowedLabel(violation.allowed),
        },
      });
    }

    return {
      ImportDeclaration(node) { check(node, node.source.value); },
      // `export { x } from '../sibling'` creates the same edge an import does — a re-export that
      // skipped this check would be the one way to rebuild a cycle through a public interface.
      ExportNamedDeclaration(node) { if (node.source) check(node, node.source.value); },
      ExportAllDeclaration(node) { if (node.source) check(node, node.source.value); },
    };
  },
};
