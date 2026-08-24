import path from 'path';
import { RuleTester } from 'eslint';

import rule from '../rules/no-boundary-violation';

const fixtures = path.join(__dirname, '../__fixtures__');

// Windows drive letters are case-insensitive. Depending on how the linting
// process is launched, ESLint's reported filename may carry a lowercase drive
// (`c:\`) while fs.realpathSync.native canonicalizes the module's public
// interface to an uppercase drive (`C:\`). A naive string compare then fails to
// recognize the owner file as its own public interface — a false positive.
function withLowercaseDrive(filePath: string): string {
  return filePath.replace(/^[A-Z]:/, driveLetter => driveLetter.toLowerCase());
}

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-boundary-violation', rule, {
  valid: [
    // ── index pattern ──────────────────────────────────────────────────────
    // importing the module directory (public interface) from outside
    {
      code: `import { x } from './moduleA';`,
      filename: path.join(fixtures, 'index-pattern/outside.ts'),
    },
    // importing an internal from inside the same module
    {
      code: `import { x } from './internal';`,
      filename: path.join(fixtures, 'index-pattern/moduleA/index.ts'),
    },
    // NodeNext .js specifier resolving to a .ts source, from inside the module
    {
      code: `import { x } from './internal.js';`,
      filename: path.join(fixtures, 'index-pattern/moduleA/index.ts'),
    },

    // ── file+folder pattern ────────────────────────────────────────────────
    // the .ts file (public interface) importing from its own folder
    {
      code: `import { x } from './Controller/SubSystem';`,
      filename: path.join(fixtures, 'filefolder-pattern/Controller.ts'),
    },
    // same owner import, but the filename carries a lowercase drive letter while
    // realpath canonicalizes the public interface to uppercase — must still be
    // recognized as the owner (regression: drive-letter-case false positive)
    // Only relevant on Windows where drive letters exist; skip on other platforms
    // to avoid a duplicate-test-case error in ESLint's RuleTester.
    ...(withLowercaseDrive(path.join(fixtures, 'filefolder-pattern/Controller.ts')) !==
      path.join(fixtures, 'filefolder-pattern/Controller.ts')
      ? [{
          code: `import { x } from './Controller/SubSystem';`,
          filename: withLowercaseDrive(path.join(fixtures, 'filefolder-pattern/Controller.ts')),
        }]
      : []),
    // outsider importing the public interface .ts file (not the folder internals)
    {
      code: `import { x } from './Controller';`,
      filename: path.join(fixtures, 'filefolder-pattern/Consumer.ts'),
    },

    // ── private pattern ────────────────────────────────────────────────────
    // a direct sibling of the private folder may import from it
    {
      code: `import { x } from './private/helpers';`,
      filename: path.join(fixtures, 'private-pattern/feature/Sibling.ts'),
    },

    // ── tsconfig path aliases ──────────────────────────────────────────────
    // a real package, and any specifier no mapping covers, is not ours to judge
    {
      code: `import React from 'react';`,
      filename: path.join(fixtures, 'alias-pattern/consumer.ts'),
    },
    // exact alias pointing straight at the facade file
    {
      code: `import { x } from '@alias-root';`,
      filename: path.join(fixtures, 'alias-pattern/consumer.ts'),
    },
    // wildcard alias resolving to the module directory (the bundler picks its index)
    {
      code: `import { x } from '@alias/moduleA';`,
      filename: path.join(fixtures, 'alias-pattern/consumer.ts'),
    },
    // aliasPattern: false restores relative-only checking
    {
      code: `import { hidden } from '@alias/moduleA/hidden';`,
      filename: path.join(fixtures, 'alias-pattern/consumer.ts'),
      options: [{ aliasPattern: false }],
    },
    // a mapping rooted AT the module ('@sub/moduleA/*' -> 'modules/moduleA/*') declares
    // its subpaths as entry points, so reaching one the facade re-exports wholesale
    // publishes nothing the facade does not — a style preference, not a breach
    {
      code: `import { x } from '@sub/moduleA/internal';`,
      filename: path.join(fixtures, 'alias-pattern/consumer.ts'),
    },
    // ── root alias over a whole source tree ('@root/*' -> 'sources/*') ─────
    // The shape of a repo-wide alias sitting above a *.group.md facade with a
    // complete barrel. Landing ON a facade is fine however you spell the alias.
    {
      code: `import { published } from '@root/moduleB';`,
      filename: path.join(fixtures, 'alias-root-pattern/consumer.ts'),
    },
    {
      code: `import { internal } from '@root/outer/mid/moduleC';`,
      filename: path.join(fixtures, 'alias-root-pattern/consumer.ts'),
    },
    // '@moduleB/*' -> 'sources/moduleB/*' is rooted AT the module, so it declares
    // its subpaths as entry points: what the barrel publishes stays reachable...
    {
      code: `import { published } from '@moduleB/published';`,
      filename: path.join(fixtures, 'alias-root-pattern/consumer.ts'),
    },
    // ...including a file a folder deeper than the facade itself
    {
      code: `import { deepPublished } from '@moduleB/sub/deepPublished';`,
      filename: path.join(fixtures, 'alias-root-pattern/consumer.ts'),
    },

    // a file already inside the private folder may import a sibling implementation
    // file also inside it — internal cohesion, not a boundary crossing
    {
      code: `import { x } from './other';`,
      filename: path.join(fixtures, 'private-pattern/feature/private/helpers.ts'),
    },

    // ── nested deep modules ────────────────────────────────────────────────
    // file inside outerModule may import innerModule's public interface
    {
      code: `import { x } from './innerModule';`,
      filename: path.join(fixtures, 'nested/outerModule/insideFile.ts'),
    },

    // ── disabled patterns ──────────────────────────────────────────────────
    // indexPattern:false → no boundary enforced on index modules
    {
      code: `import { x } from './moduleA/internal';`,
      filename: path.join(fixtures, 'index-pattern/outside.ts'),
      options: [{ indexPattern: false }],
    },
    // fileFolderPattern:false → no boundary enforced on file+folder modules
    {
      code: `import { x } from './Controller/SubSystem';`,
      filename: path.join(fixtures, 'filefolder-pattern/Consumer.ts'),
      options: [{ fileFolderPattern: false }],
    },
    // privatePatterns:[] → private folders not enforced
    {
      code: `import { x } from './feature/private/helpers';`,
      filename: path.join(fixtures, 'private-pattern/outsider.ts'),
      options: [{ privatePatterns: [] }],
    },

    // ── parent-relative (../) imports from inside the module ───────────────
    // a deeper file inside an index module reaches an internal sibling via ../
    {
      code: `import { x } from '../internal';`,
      filename: path.join(fixtures, 'index-pattern/moduleA/sub/deep.ts'),
    },
    // a file inside outerModule (but outside innerModule) imports innerModule's
    // public interface via ../ — allowed because the importer lives inside outerModule
    {
      code: `import { x } from '../innerModule';`,
      filename: path.join(fixtures, 'nested/outerModule/sub/file.ts'),
    },
    // a file inside innerModule re-imports its parent module's index via ../
    {
      code: `import { x } from '../index';`,
      filename: path.join(fixtures, 'nested/outerModule/innerModule/internal.ts'),
    },

    // ── non-relative imports are always ignored ────────────────────────────
    {
      code: `import React from 'react';`,
      filename: path.join(fixtures, 'index-pattern/outside.ts'),
    },

    // ── files matching ignorePatterns are skipped ──────────────────────────
    {
      code: `import { x } from './moduleA/internal';`,
      filename: path.join(fixtures, 'index-pattern/__tests__/some.test.ts'),
      options: [{ ignorePatterns: ['**/__tests__/**'] }],
    },
  ],

  invalid: [
    // ── index pattern ──────────────────────────────────────────────────────
    // outsider bypasses index and imports an internal directly
    {
      code: `import { x } from './moduleA/internal';`,
      filename: path.join(fixtures, 'index-pattern/outside.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },
    // same bypass via a NodeNext .js specifier (server-style ESM imports)
    {
      code: `import { x } from './moduleA/internal.js';`,
      filename: path.join(fixtures, 'index-pattern/outside.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },

    // ── file+folder pattern ────────────────────────────────────────────────
    // non-owner importing folder internals directly
    {
      code: `import { x } from './Controller/SubSystem';`,
      filename: path.join(fixtures, 'filefolder-pattern/Consumer.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },

    // ── private pattern ────────────────────────────────────────────────────
    // outsider (outside parent dir) accessing private folder
    {
      code: `import { x } from './feature/private/helpers';`,
      filename: path.join(fixtures, 'private-pattern/outsider.ts'),
      errors: [{ messageId: 'privateViolation' }],
    },
    // file in a subdirectory of parent also cannot access private
    {
      code: `import { x } from '../private/helpers';`,
      filename: path.join(fixtures, 'private-pattern/feature/subdir/deep.ts'),
      errors: [{ messageId: 'privateViolation' }],
    },

    // ── nested deep modules ────────────────────────────────────────────────
    // inside outerModule but bypassing innerModule's boundary
    {
      code: `import { x } from './innerModule/internal';`,
      filename: path.join(fixtures, 'nested/outerModule/insideFile.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },
    // outsider cannot import innerModule's public interface (nested module rule)
    {
      code: `import { x } from './outerModule/innerModule';`,
      filename: path.join(fixtures, 'nested/outsider.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },
    // outsider cannot import outerModule internals
    {
      code: `import { x } from './outerModule/insideFile';`,
      filename: path.join(fixtures, 'nested/outsider.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },

    // ── parent-relative (../) imports that bypass a boundary ───────────────
    // ../ crossing into another top-level module's internals
    {
      code: `import { x } from '../index-pattern/moduleA/internal';`,
      filename: path.join(fixtures, 'filefolder-pattern/Consumer.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },
    // a file inside outerModule uses ../ to bypass innerModule's public interface
    {
      code: `import { x } from '../innerModule/internal';`,
      filename: path.join(fixtures, 'nested/outerModule/sub/file.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },
    // a cousin file (not a direct child of feature) reaches a private folder via ../
    {
      code: `import { x } from '../feature/private/helpers';`,
      filename: path.join(fixtures, 'private-pattern/other/file.ts'),
      errors: [{ messageId: 'privateViolation' }],
    },

    // ── tsconfig path aliases ──────────────────────────────────────────────
    // the bypass an alias used to hide: a module the facade does NOT re-export.
    // The suggestion must be an alias too — nobody writes the relative path here.
    {
      code: `import { hidden } from '@alias/moduleA/hidden';`,
      filename: path.join(fixtures, 'alias-pattern/consumer.ts'),
      errors: [{ messageId: 'boundaryViolation', data: { import: '@alias/moduleA/hidden', publicInterface: '@alias-root' } }],
    },
    // an alias rooted ABOVE the module ('@alias/*' -> 'modules/*', the shape of this
    // repo's own '@/*' -> 'src/*') names no module and so declares no entry point.
    // Re-export latitude must not apply, or the alias becomes a blanket way past every
    // facade beneath it — how '@/network/LobbyManager' went unflagged.
    {
      code: `import { x } from '@alias/moduleA/internal';`,
      filename: path.join(fixtures, 'alias-pattern/consumer.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },
    // a module-rooted mapping still cannot reach what the facade does not publish
    {
      code: `import { hidden } from '@sub/moduleA/hidden';`,
      filename: path.join(fixtures, 'alias-pattern/consumer.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },

    // ── root alias over a whole source tree ('@root/*' -> 'sources/*') ─────
    // The bug this fixture exists for: a barrel-exported module reached through a
    // tree-wide alias past a *.group.md facade. The mapping names 'sources', not
    // the module, so the re-export allowance must not apply — the suggestion is
    // the facade, spelled as an alias. It comes from the most specific mapping
    // covering the facade ('@moduleB/*'), not necessarily the one the author
    // wrote; this fixture declares two mappings where a repo often declares one.
    {
      code: `import { published } from '@root/moduleB/published';`,
      filename: path.join(fixtures, 'alias-root-pattern/consumer.ts'),
      errors: [{
        messageId: 'boundaryViolation',
        data: { import: '@root/moduleB/published', publicInterface: '@moduleB' },
      }],
    },
    // same, one folder deeper than the facade
    {
      code: `import { deepPublished } from '@root/moduleB/sub/deepPublished';`,
      filename: path.join(fixtures, 'alias-root-pattern/consumer.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },
    // depth does not dilute it: an alias root three folders above an index facade
    // still declares nothing about that facade
    {
      code: `import { internal } from '@root/outer/mid/moduleC/internal';`,
      filename: path.join(fixtures, 'alias-root-pattern/consumer.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },
    // a module-rooted mapping is not a free pass either — the facade does not
    // publish 'hidden'
    {
      code: `import { hidden } from '@moduleB/hidden';`,
      filename: path.join(fixtures, 'alias-root-pattern/consumer.ts'),
      errors: [{ messageId: 'boundaryViolation' }],
    },

    // ── custom privatePatterns ─────────────────────────────────────────────
    {
      code: `import { x } from './feature/internal/helpers';`,
      filename: path.join(fixtures, 'private-pattern/outsider.ts'),
      options: [{ privatePatterns: ['internal'] }],
      errors: [{ messageId: 'privateViolation' }],
    },
  ],
});
