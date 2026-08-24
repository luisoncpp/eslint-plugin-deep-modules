# eslint-plugin-deep-modules

Two rules, answering two different questions about the same import:

| Rule | Question | Fails when |
|---|---|---|
| `no-boundary-violation` | Did the import go **through** the public interface? | it reaches past one into a module's implementation |
| `no-sibling-cycle` | Was the import allowed to point **that way**? | a `*.group.md` group imports a sibling group its `siblings:` list omits |

The second exists because the first is direction-blind: two groups importing each other's
public interface satisfy `no-boundary-violation` completely, and that is a cycle.

This folder is self-contained and meant to be copied into another repo intact, so its
documentation lives here rather than in the host project's `docs/`. Everything the host
project must supply is listed under [Host project coupling](#host-project-coupling).

## Install

```js
// eslint.config.js
import deepModules from "./Tools/eslint-plugin-deep-modules/index.js";

export default [
  {
    plugins: { "deep-modules": deepModules },
    rules: {
      "deep-modules/no-boundary-violation": "error",
      "deep-modules/no-sibling-cycle": "error",
    },
  },
];
```

## What counts as a boundary

Four independent patterns, each toggleable. A boundary applies to importers **outside**
the module directory; anything inside it may import freely.

| Pattern | Option | A folder is a module when… | Public interface |
|---|---|---|---|
| index | `indexPattern` (default `true`) | it contains `index.ts` / `index.tsx` | that index file, or the folder itself |
| file+folder | `fileFolderPattern` (`true`) | a sibling file of the same name guards it (`Solver/` next to `Solver.ts`) | the sibling file |
| group | `groupPattern` (`true`) | a co-located `*.group.md` declares `facades:` | every listed facade |
| private | `privatePatterns` (`['private']`) | its name matches, case-insensitively | reachable only from a **direct child of its parent** |

`ignorePatterns` (default `['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts']`) skips
importers entirely.

Boundaries are checked innermost-first, so nesting works as expected: if `B` sits inside
`A`, a file outside `A` may not import `B`'s public interface either.

### `*.group.md` facades

Frontmatter only; the body is ignored by the rule.

```yaml
---
facades: ["index.ts"]
ignore: ["legacy/**"]        # `exclude:` is accepted as a synonym
siblings: ["support"]        # optional; see no-sibling-cycle
---
```

`facades` implies every other module in the folder is private. Inline (`["a.ts"]`) and
block (`- "a.ts"`) list syntax both parse. A descriptor whose facade points **outside**
its own folder is skipped — that group is rooted elsewhere and its membership cannot be
derived from the folder tree.

## `no-sibling-cycle`

A set of sibling groups under one parent folder is a dependency graph. This rule keeps that
graph acyclic by making every edge **declared** rather than inferred: each descriptor lists
the sibling folders its members may import.

```yaml
siblings: ["grid", "support"]   # may import these two peers
siblings: []                    # a sink: may import no peer at all
# key absent                    # this group opts out of the rule entirely
```

`siblings: []` and an absent key are deliberately **not** the same thing. The empty list is
the load-bearing declaration — it is what makes a folder a safe home for anything two peers
share, because nothing placed there can close a loop.

Scope, deliberately narrow:

- Only **true siblings** are judged — both groups must share a parent folder. An import into
  the importer's own group, into an unrelated subtree, or into a group nested at another
  depth is not this rule's business.
- Re-exports count. `export { x } from '../peer'` builds the same edge an import does, and
  skipping it would leave one way to rebuild a cycle straight through a public interface.
- `ignorePatterns` matches `no-boundary-violation`'s, so tests may deep-import freely.

**Why a per-file rule is enough:** the rule never builds a dependency graph. It compares one
resolved import against one declared list. The acyclicity comes from the declarations being
a DAG, which a reviewer can verify by reading eight lines of frontmatter — and the rule then
holds every file to it.

**What a sibling cycle costs if it does form:** nothing visible, for a while. Everything
crossing it works while it is read at *render* time (a hoisted `function`). The first
module-eval-time read across the loop — a top-level `const` derived from an imported value,
a decorator, a class `extends` — resolves to `undefined`, and that surfaces as a blank
render, not an import error.

## Import resolution

Both specifier forms resolve to a real file before any boundary check runs:

- **Relative** — `./x`, `../x`, resolved against the importer's folder. `.ts`/`.tsx` are
  tried first; a NodeNext ESM specifier (`./x.js`) is remapped to its `.ts` source.
- **Aliased** — `@/x`, `@scope/pkg/sub`, resolved through `compilerOptions.paths` of the
  **nearest ancestor `tsconfig.json` that declares them** (`utils/aliasResolver.js`).
  Exact keys beat wildcard keys and longer wildcard prefixes beat shorter ones, matching
  the TypeScript resolver. A tsconfig without `paths` does not stop the upward walk, so a
  nested package still inherits the repo-root alias table.

A specifier that maps to nothing (`react`) is ignored. Set `aliasPattern: false` to go
back to relative-only checking.

### The re-export allowance

An aliased import clears a boundary when **both** hold:

1. the matched mapping's **target root** — the target text before the wildcard — is the
   boundary folder itself or something inside it, and
2. the facade already re-exports the target module wholesale
   (`export * from './types/zone.js'`).

`@scope/pkg/utils/*` → `shared/src/utils/*` under the `shared/src` facade satisfies (1):
the mapping names that subpath, so the alias table publishes it and the facade publishes
its contents — reaching it directly exposes nothing extra, a style preference rather than
a leak.

A mapping rooted **above** the boundary does not. `@/*` → `src/*` names only `src` and
says nothing about the facade at `src/network`, so `@/network/LobbyManager` is a crossing
exactly as `../network/LobbyManager` would be. Skipping check (1) makes a single repo-root
alias a blanket exemption from every facade beneath it — the rule then passes a whole
`src/` tree while an external audit reports the violations.

A **relative** import gets no allowance at all: reaching into a folder is exactly what the
rule exists to stop.

Condition (2) matters more than it sounds. Switching alias resolution on for the first
time in a repo will flag every subpath-alias import of a barrel-exported module; without
this allowance the only fix is a mass rewrite. What it does still flag is the genuine case
— a module the facade does *not* re-export — which is usually a gap in the barrel rather
than a bad import.

## Gotchas learned the hard way

**Two files inside the same `Private/` folder may import each other.** Only importers
from *outside* must be a direct child of the private folder's parent. The rule once
rejected intra-`Private/` sibling imports; if that fires again, the detector is wrong,
not the layout — never keep an implementation file at facade level to appease it.

**Never compare paths with bare `===` on Windows.** Drive letters are case-insensitive,
so `process.cwd()` yields `C:\` under PowerShell and `c:\` under some Bash wrappers,
while `fs.realpathSync.native()` always uppercases. A raw compare then fails to recognise
a module's own owner file and every import from its private folder is flagged — lint
results that differ between shells on one machine. Use `samePath()` in
`utils/pathUtils.js`, which folds **only** the drive letter; `findExactCaseFile` keeps the
rest case-sensitive on purpose. `path.relative`-based checks are immune.

**The rule enforces physical structure plus declared facades — not a whole architecture
model.** If the host project also runs a logical grouping tool, several of its groups can
live in one flat folder; a cross-group import between two files in that folder trips no
boundary here, because there is none on disk and no facade declares one. Fixing such a
violation is usually a metadata move, not a code change.

**Check which boundary actually fired before editing a `*.group.md`.** When an error
names a folder that has a descriptor, the descriptor may well be inert — a facade
pointing outside the folder makes the whole group skipped, and a `Foo/` folder guarded by
a sibling `Foo.ts` reports as a `filefolder` boundary regardless of any descriptor. In
those cases adding an `ignore:` entry does nothing; the fixes are to re-export through
the real facade or move the file out of the folder. Re-export is not always available
either: if the facade already (transitively) imports the offending file's importer,
routing through it creates a cycle, and moving the file out is the only way.

**A rule gap and a glob gap look identical.** When a file "should" be caught but is not,
check the lint script's paths before suspecting the rule.

## Layout

```
index.js                     plugin entry (facade)
rules/no-boundary-violation.js
rules/no-sibling-cycle.js
utils/pathUtils.js           path predicates, samePath, resolveImport/resolveFromBase
utils/moduleDetector.js      boundary discovery + violation decision
utils/groupFacades.js        *.group.md frontmatter parsing
utils/siblingGroups.js       declaring-group lookup + sibling-edge verdict
utils/aliasResolver.js       tsconfig paths → absolute path
utils/reExports.js           facade re-export scanning
__tests__/                   RuleTester suite
__fixtures__/                on-disk trees the suite asserts against
```

The rule reads the filesystem, so tests need real fixture files, not inline code alone.

## Host project coupling

| What | Where | Why |
|---|---|---|
| Plugin registration | host `eslint.config.js` | both rules are off until registered |
| Lint script paths | host `package.json` | files outside the glob are never checked |
| Test runner | host jest/vitest config must match `**/__tests__/**/*.test.ts` | the suite lives in this folder |
| `tsconfig.json` `paths` | host repo | alias resolution reads it; nothing is hardcoded here |
| `*.group.md` files | host source tree | optional; only `facades`/`ignore`/`exclude`/`siblings` are read |

Nothing else in this folder refers to the host project by name.
