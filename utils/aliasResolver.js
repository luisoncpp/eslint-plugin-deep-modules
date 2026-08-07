'use strict';
const path = require('path');
const fs = require('fs');
const { existsSync } = require('./pathUtils');

const TsConfigFileName = 'tsconfig.json';
const WildcardToken = '*';

const tsConfigByDir = new Map();
const pathMappingsByConfig = new Map();

/**
 * tsconfig.json is JSONC in principle. Only the comment/trailing-comma forms that
 * actually appear in hand-written configs are stripped; anything still unparseable
 * yields no mappings rather than crashing the lint run.
 */
function readJsonc(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch { return null; }
  const withoutComments = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(withoutTrailingCommas); }
  catch { return null; }
}

/**
 * Compiles `compilerOptions.paths` into absolute-path mappings, most specific
 * first: exact keys beat wildcard keys, and a longer wildcard prefix beats a
 * shorter one (`@x/shared/utils/*` must win over `@x/*`) — the same precedence
 * the TypeScript resolver applies.
 */
function compilePathMappings(configPath) {
  if (pathMappingsByConfig.has(configPath)) return pathMappingsByConfig.get(configPath);

  const config = readJsonc(configPath);
  const paths = config?.compilerOptions?.paths;
  const configDir = path.dirname(configPath);
  const baseDir = path.resolve(configDir, config?.compilerOptions?.baseUrl ?? '.');

  const mappings = [];
  for (const [pattern, targets] of Object.entries(paths ?? {})) {
    const wildcardIndex = pattern.indexOf(WildcardToken);
    const absoluteTargets = (targets ?? []).map(target => path.resolve(baseDir, target));
    if (wildcardIndex === -1) {
      mappings.push({ prefix: pattern, suffix: '', hasWildcard: false, targets: absoluteTargets });
      continue;
    }
    mappings.push({
      prefix: pattern.slice(0, wildcardIndex),
      suffix: pattern.slice(wildcardIndex + 1),
      hasWildcard: true,
      targets: absoluteTargets,
    });
  }
  mappings.sort((left, right) => {
    if (left.hasWildcard !== right.hasWildcard) return left.hasWildcard ? 1 : -1;
    return right.prefix.length - left.prefix.length;
  });

  pathMappingsByConfig.set(configPath, mappings);
  return mappings;
}

/**
 * Nearest ancestor tsconfig.json that actually declares `paths`. A config
 * without them (e.g. a build-only tsconfig in a subpackage) does not stop the
 * walk, so a nested package still inherits the repo-root aliases.
 */
function findPathMappings(startDir) {
  if (tsConfigByDir.has(startDir)) return tsConfigByDir.get(startDir);

  let mappings = [];
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, TsConfigFileName);
    if (existsSync(candidate)) {
      const candidateMappings = compilePathMappings(candidate);
      if (candidateMappings.length) {
        mappings = candidateMappings;
        break;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  tsConfigByDir.set(startDir, mappings);
  return mappings;
}

function substitute(mapping, importSource) {
  if (!mapping.hasWildcard) {
    return importSource === mapping.prefix ? mapping.targets : [];
  }
  if (!importSource.startsWith(mapping.prefix) || !importSource.endsWith(mapping.suffix)) return [];
  const matched = importSource.slice(mapping.prefix.length, importSource.length - mapping.suffix.length);
  if (!matched) return [];
  return mapping.targets.map(target => target.replace(WildcardToken, matched));
}

/**
 * Resolves a non-relative import (`@/feature/Contract`, `@scope/pkg/utils/x`) to
 * the absolute path the bundler would load, using the importer's tsconfig
 * `paths`. Without this, aliased imports look like bare package specifiers and
 * skip every boundary check.
 * Returns null for real packages ('react') and unmapped specifiers.
 */
function resolveAliasBase(importerFile, importSource) {
  for (const mapping of findPathMappings(path.dirname(importerFile))) {
    for (const candidate of substitute(mapping, importSource)) {
      if (existsSync(candidate) || existsSync(candidate + '.ts') || existsSync(candidate + '.tsx')) {
        return candidate;
      }
    }
  }
  return null;
}

module.exports = { resolveAliasBase };
