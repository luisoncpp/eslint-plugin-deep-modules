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

    // ── custom privatePatterns ─────────────────────────────────────────────
    {
      code: `import { x } from './feature/internal/helpers';`,
      filename: path.join(fixtures, 'private-pattern/outsider.ts'),
      options: [{ privatePatterns: ['internal'] }],
      errors: [{ messageId: 'privateViolation' }],
    },
  ],
});
