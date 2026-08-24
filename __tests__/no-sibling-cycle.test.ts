import path from 'path';
import { RuleTester } from 'eslint';

import rule from '../rules/no-sibling-cycle';

const groups = path.join(__dirname, '../__fixtures__/sibling-groups');

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-sibling-cycle', rule, {
  valid: [
    // a declared sibling edge
    {
      code: `import { x } from '../leaf';`,
      filename: path.join(groups, 'mid/index.ts'),
    },
    // an import inside the importer's own group is not a sibling edge at all
    {
      code: `import { x } from './internal';`,
      filename: path.join(groups, 'mid/index.ts'),
    },
    // a group that declares no `siblings` key opts out entirely
    {
      code: `import { x } from '../mid';`,
      filename: path.join(groups, 'open/index.ts'),
    },
    // a target outside the sibling set (another fixture tree) is somebody else's rule
    {
      code: `import { x } from '../../index-pattern/moduleA';`,
      filename: path.join(groups, 'leaf/index.ts'),
    },
    // a package specifier resolves to nothing on disk and is skipped
    {
      code: `import { useState } from 'react';`,
      filename: path.join(groups, 'leaf/index.ts'),
    },
    // tests are exempt, like they are for no-boundary-violation
    {
      code: `import { x } from '../mid';`,
      filename: path.join(groups, 'leaf/__tests__/leaf.test.ts'),
    },
  ],

  invalid: [
    // `siblings: []` forbids every sibling — this is the edge that would re-open a cycle
    {
      code: `import { x } from '../mid';`,
      filename: path.join(groups, 'leaf/index.ts'),
      errors: [{ messageId: 'undeclaredSibling', data: { group: 'leaf', sibling: 'mid', allowed: 'nothing' } }],
    },
    // an edge that points back up the chain: mid declares only `leaf`
    {
      code: `import { x } from '../open';`,
      filename: path.join(groups, 'mid/index.ts'),
      errors: [{ messageId: 'undeclaredSibling', data: { group: 'mid', sibling: 'open', allowed: "'leaf'" } }],
    },
    // a re-export creates the same edge an import does
    {
      code: `export { x } from '../mid';`,
      filename: path.join(groups, 'leaf/index.ts'),
      errors: [{ messageId: 'undeclaredSibling' }],
    },
    // ...including a wildcard re-export
    {
      code: `export * from '../mid';`,
      filename: path.join(groups, 'leaf/index.ts'),
      errors: [{ messageId: 'undeclaredSibling' }],
    },
  ],
});
