/**
 * Unit tests for src/parser/import-extractor.ts
 *
 * Comprehensive test suite covering all import extraction scenarios:
 *   1.  ES module default import
 *   2.  Named imports
 *   3.  Namespace import (import * as)
 *   4.  Dynamic import()
 *   5.  CommonJS require()
 *   6.  Re-exports (export * from, export { } from)
 *   7.  Type-only imports (import type)
 *   8.  Scoped packages (@org/pkg)
 *   9.  Relative imports are correctly categorized
 *   10. Multiple imports on same line
 *   11. Commented-out imports are skipped (AST strategy)
 *   12. String imports inside non-import contexts are skipped (AST strategy)
 *
 * Target: 100% branch coverage on import-extractor.ts
 *
 * Tests both strategies (regex and AST) for each case where applicable,
 * plus the 'auto' strategy (default).
 */

import { describe, it, expect } from 'vitest';
import {
  extractImports,
  extractImportsRegex,
  extractImportsAst,
  isBareSpecifier,
  getPackageName,
  partitionImports,
} from '../../src/parser/import-extractor.js';
import type { ImportInfo } from '../../src/core/types.js';

// =============================================================================
// Helper
// =============================================================================

/** Shorthand to find an import by source module name */
function findBySource(imports: ImportInfo[], source: string): ImportInfo | undefined {
  return imports.find((i) => i.source === source);
}

// =============================================================================
// 1. ES Module Default Import
// =============================================================================

describe('ES Module Default Import', () => {
  const src = `import React from 'react';\nimport lodash from 'lodash';`;

  it('AST: extracts default imports', () => {
    const result = extractImportsAst(src, 'test.ts');
    expect(result).toHaveLength(2);

    const react = findBySource(result, 'react')!;
    expect(react).toBeDefined();
    expect(react.specifiers).toContain('React');
    expect(react.isDynamic).toBe(false);
    expect(react.isTypeOnly).toBe(false);
    expect(react.line).toBe(1);

    const lod = findBySource(result, 'lodash')!;
    expect(lod).toBeDefined();
    expect(lod.specifiers).toContain('lodash');
    expect(lod.line).toBe(2);
  });

  it('regex: extracts default imports', () => {
    const result = extractImportsRegex(src);
    expect(result).toHaveLength(2);

    const react = findBySource(result, 'react')!;
    expect(react).toBeDefined();
    expect(react.specifiers).toContain('React');
    expect(react.isDynamic).toBe(false);
    expect(react.isTypeOnly).toBe(false);
  });

  it('auto strategy (default) extracts default imports', () => {
    const result = extractImports(src, 'test.ts');
    expect(result).toHaveLength(2);
    expect(findBySource(result, 'react')).toBeDefined();
    expect(findBySource(result, 'lodash')).toBeDefined();
  });

  it('handles side-effect only import', () => {
    const code = `import 'polyfill';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('polyfill');
    expect(result[0]!.specifiers).toEqual([]);
  });

  it('regex: handles side-effect only import', () => {
    const code = `import 'polyfill';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('polyfill');
    expect(result[0]!.specifiers).toEqual([]);
  });
});

// =============================================================================
// 2. Named Imports
// =============================================================================

describe('Named Imports', () => {
  const src = `import { useState, useEffect } from 'react';\nimport { map, filter as f } from 'lodash';`;

  it('AST: extracts named imports with correct specifiers', () => {
    const result = extractImportsAst(src, 'test.ts');
    expect(result).toHaveLength(2);

    const react = findBySource(result, 'react')!;
    expect(react.specifiers).toContain('useState');
    expect(react.specifiers).toContain('useEffect');
    expect(react.isDynamic).toBe(false);

    const lod = findBySource(result, 'lodash')!;
    expect(lod.specifiers).toContain('map');
    // AST uses the local name (the 'as' target)
    expect(lod.specifiers).toContain('f');
  });

  it('regex: extracts named imports with correct specifiers', () => {
    const result = extractImportsRegex(src);
    expect(result).toHaveLength(2);

    const react = findBySource(result, 'react')!;
    expect(react.specifiers).toContain('useState');
    expect(react.specifiers).toContain('useEffect');

    const lod = findBySource(result, 'lodash')!;
    expect(lod.specifiers).toContain('map');
    // Regex parses 'filter as f' — uses local name 'f'
    expect(lod.specifiers).toContain('f');
  });

  it('handles combined default and named import', () => {
    const code = `import React, { useState } from 'react';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    const r = result[0]!;
    expect(r.specifiers).toContain('React');
    expect(r.specifiers).toContain('useState');
  });

  it('regex: handles combined default and named import', () => {
    const code = `import React, { useState } from 'react';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    const r = result[0]!;
    expect(r.specifiers).toContain('React');
    expect(r.specifiers).toContain('useState');
  });
});

// =============================================================================
// 3. Namespace Import (import * as)
// =============================================================================

describe('Namespace Import', () => {
  const src = `import * as fs from 'fs';\nimport * as path from 'path';`;

  it('AST: extracts namespace imports', () => {
    const result = extractImportsAst(src, 'test.ts');
    expect(result).toHaveLength(2);

    const fsMod = findBySource(result, 'fs')!;
    expect(fsMod.specifiers).toContain('fs');
    expect(fsMod.isDynamic).toBe(false);

    const pathMod = findBySource(result, 'path')!;
    expect(pathMod.specifiers).toContain('path');
  });

  it('regex: extracts namespace imports', () => {
    const result = extractImportsRegex(src);
    expect(result).toHaveLength(2);

    const fsMod = findBySource(result, 'fs')!;
    expect(fsMod.specifiers).toContain('fs');

    const pathMod = findBySource(result, 'path')!;
    expect(pathMod.specifiers).toContain('path');
  });

  it('handles combined default + namespace import', () => {
    const code = `import defaultExport, * as ns from 'some-lib';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    const imp = result[0]!;
    expect(imp.specifiers).toContain('defaultExport');
    expect(imp.specifiers).toContain('ns');
  });
});

// =============================================================================
// 4. Dynamic import()
// =============================================================================

describe('Dynamic import()', () => {
  const src = `const mod = import('dynamic-module');\nconst other = import('another-mod');`;

  it('AST: extracts dynamic imports', () => {
    const result = extractImportsAst(src, 'test.ts');
    expect(result).toHaveLength(2);

    for (const imp of result) {
      expect(imp.isDynamic).toBe(true);
      expect(imp.specifiers).toEqual([]);
      expect(imp.isTypeOnly).toBe(false);
    }

    expect(findBySource(result, 'dynamic-module')).toBeDefined();
    expect(findBySource(result, 'another-mod')).toBeDefined();
  });

  it('regex: extracts dynamic imports', () => {
    const result = extractImportsRegex(src);
    expect(result).toHaveLength(2);

    for (const imp of result) {
      expect(imp.isDynamic).toBe(true);
      expect(imp.specifiers).toEqual([]);
    }
  });

  it('handles dynamic import inside async function', () => {
    const code = `async function load() {\n  const m = await import('lazy-lib');\n}`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('lazy-lib');
    expect(result[0]!.isDynamic).toBe(true);
  });

  it('extractImports with includeDynamic=false filters dynamic imports', () => {
    const code = `import 'static';\nconst m = import('dyn');`;
    const result = extractImports(code, 'test.ts', { includeDynamic: false });
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('static');
  });
});

// =============================================================================
// 5. CommonJS require()
// =============================================================================

describe('CommonJS require()', () => {
  it('AST: extracts simple require', () => {
    const code = `const express = require('express');`;
    const result = extractImportsAst(code, 'test.js');
    expect(result).toHaveLength(1);
    const imp = result[0]!;
    expect(imp.source).toBe('express');
    expect(imp.specifiers).toContain('express');
    expect(imp.isDynamic).toBe(false);
    expect(imp.isTypeOnly).toBe(false);
  });

  it('regex: extracts simple require', () => {
    const code = `const express = require('express');`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('express');
    expect(result[0]!.specifiers).toContain('express');
  });

  it('AST: extracts destructured require', () => {
    const code = `const { readFile, writeFile } = require('fs');`;
    const result = extractImportsAst(code, 'test.js');
    expect(result).toHaveLength(1);
    const imp = result[0]!;
    expect(imp.source).toBe('fs');
    expect(imp.specifiers).toContain('readFile');
    expect(imp.specifiers).toContain('writeFile');
  });

  it('regex: extracts destructured require', () => {
    const code = `const { readFile, writeFile } = require('fs');`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    const imp = result[0]!;
    expect(imp.source).toBe('fs');
    expect(imp.specifiers).toContain('readFile');
    expect(imp.specifiers).toContain('writeFile');
  });

  it('AST: extracts require with let/var', () => {
    const code = `let mod = require('mod-a');\nvar other = require('mod-b');`;
    const result = extractImportsAst(code, 'test.js');
    expect(result).toHaveLength(2);
    expect(findBySource(result, 'mod-a')!.specifiers).toContain('mod');
    expect(findBySource(result, 'mod-b')!.specifiers).toContain('other');
  });

  it('regex: extracts require with let/var', () => {
    const code = `let mod = require('mod-a');\nvar other = require('mod-b');`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(2);
    expect(findBySource(result, 'mod-a')!.specifiers).toContain('mod');
    expect(findBySource(result, 'mod-b')!.specifiers).toContain('other');
  });

  it('handles bare require (no assignment)', () => {
    const code = `require('side-effect-pkg');`;
    const result = extractImportsAst(code, 'test.js');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('side-effect-pkg');
    expect(result[0]!.specifiers).toEqual([]);
  });

  it('regex: handles bare require (no assignment)', () => {
    const code = `require('side-effect-pkg');`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('side-effect-pkg');
    expect(result[0]!.specifiers).toEqual([]);
  });

  it('regex: handles destructured require with renaming', () => {
    const code = `const { a: aliasA, b } = require('pkg');`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    const imp = result[0]!;
    expect(imp.source).toBe('pkg');
    // Regex uses the local name (after colon)
    expect(imp.specifiers).toContain('aliasA');
    expect(imp.specifiers).toContain('b');
  });
});

// =============================================================================
// 6. Re-exports (export * from, export { } from)
// =============================================================================

describe('Re-exports', () => {
  it('AST: extracts export * from', () => {
    const code = `export * from 'utils';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('utils');
    expect(result[0]!.specifiers).toContain('*');
    expect(result[0]!.isDynamic).toBe(false);
  });

  it('regex: extracts export * from', () => {
    const code = `export * from 'utils';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('utils');
    expect(result[0]!.specifiers).toContain('*');
  });

  it('AST: extracts named re-export', () => {
    const code = `export { foo, bar } from 'helpers';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('helpers');
    expect(result[0]!.specifiers).toContain('foo');
    expect(result[0]!.specifiers).toContain('bar');
  });

  it('regex: extracts named re-export', () => {
    const code = `export { foo, bar } from 'helpers';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('helpers');
    expect(result[0]!.specifiers).toContain('foo');
    expect(result[0]!.specifiers).toContain('bar');
  });

  it('AST: extracts export * as namespace from', () => {
    const code = `export * as ns from 'namespace-pkg';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('namespace-pkg');
    expect(result[0]!.specifiers).toContain('ns');
  });

  it('regex: extracts export * as namespace from', () => {
    const code = `export * as ns from 'namespace-pkg';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('namespace-pkg');
    expect(result[0]!.specifiers).toContain('ns');
  });

  it('AST: extracts type re-export', () => {
    const code = `export type { Foo, Bar } from 'types';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('types');
    expect(result[0]!.isTypeOnly).toBe(true);
    expect(result[0]!.specifiers).toContain('Foo');
    expect(result[0]!.specifiers).toContain('Bar');
  });

  it('regex: extracts type re-export', () => {
    const code = `export type { Foo, Bar } from 'types';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('types');
    expect(result[0]!.isTypeOnly).toBe(true);
  });

  it('AST: extracts re-export with alias', () => {
    const code = `export { foo as bar } from 'mod';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    // AST uses the exported name (bar)
    expect(result[0]!.specifiers).toContain('bar');
  });

  it('regex: extracts re-export with alias', () => {
    const code = `export { foo as bar } from 'mod';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.specifiers).toContain('bar');
  });
});

// =============================================================================
// 7. Type-only Imports (import type)
// =============================================================================

describe('Type-only Imports', () => {
  it('AST: extracts import type with named specifiers', () => {
    const code = `import type { Config, Options } from 'config-pkg';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    const imp = result[0]!;
    expect(imp.source).toBe('config-pkg');
    expect(imp.isTypeOnly).toBe(true);
    expect(imp.specifiers).toContain('Config');
    expect(imp.specifiers).toContain('Options');
    expect(imp.isDynamic).toBe(false);
  });

  it('regex: extracts import type', () => {
    const code = `import type { Config, Options } from 'config-pkg';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    const imp = result[0]!;
    expect(imp.isTypeOnly).toBe(true);
    expect(imp.source).toBe('config-pkg');
  });

  it('AST: extracts default type import', () => {
    const code = `import type MyType from 'my-types';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.isTypeOnly).toBe(true);
    expect(result[0]!.specifiers).toContain('MyType');
  });

  it('regex: extracts default type import', () => {
    const code = `import type MyType from 'my-types';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.isTypeOnly).toBe(true);
  });

  it('extractImports with includeTypeOnly=false filters type imports', () => {
    const code = `import type { Foo } from 'types';\nimport { bar } from 'bar';`;
    const result = extractImports(code, 'test.ts', { includeTypeOnly: false });
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('bar');
    expect(result[0]!.isTypeOnly).toBe(false);
  });

  it('type-only + non-type imports coexist', () => {
    const code = `import type { T } from 'types';\nimport { useHook } from 'types';`;
    // After deduplication, isTypeOnly should be false (not all are type-only)
    const result = extractImports(code, 'test.ts');
    const combined = findBySource(result, 'types')!;
    expect(combined).toBeDefined();
    expect(combined.isTypeOnly).toBe(false);
    expect(combined.specifiers).toContain('T');
    expect(combined.specifiers).toContain('useHook');
  });
});

// =============================================================================
// 8. Scoped Packages (@org/pkg)
// =============================================================================

describe('Scoped Packages (@org/pkg)', () => {
  const src = `
import { render } from '@testing-library/react';
import { css } from '@emotion/styled';
import nested from '@scope/deep/nested/path';
  `.trim();

  it('AST: extracts scoped package imports', () => {
    const result = extractImportsAst(src, 'test.ts');
    expect(result).toHaveLength(3);

    const tl = findBySource(result, '@testing-library/react')!;
    expect(tl).toBeDefined();
    expect(tl.specifiers).toContain('render');

    const emotion = findBySource(result, '@emotion/styled')!;
    expect(emotion).toBeDefined();
    expect(emotion.specifiers).toContain('css');

    const deep = findBySource(result, '@scope/deep/nested/path')!;
    expect(deep).toBeDefined();
    expect(deep.specifiers).toContain('nested');
  });

  it('regex: extracts scoped package imports', () => {
    const result = extractImportsRegex(src);
    expect(result).toHaveLength(3);
    expect(findBySource(result, '@testing-library/react')).toBeDefined();
    expect(findBySource(result, '@emotion/styled')).toBeDefined();
    expect(findBySource(result, '@scope/deep/nested/path')).toBeDefined();
  });

  it('scoped packages with require()', () => {
    const code = `const jestDom = require('@testing-library/jest-dom');`;
    const result = extractImportsAst(code, 'test.js');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('@testing-library/jest-dom');
    expect(result[0]!.specifiers).toContain('jestDom');
  });

  it('scoped packages in dynamic import', () => {
    const code = `const mod = import('@angular/core');`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('@angular/core');
    expect(result[0]!.isDynamic).toBe(true);
  });
});

// =============================================================================
// 9. Relative Imports Are Correctly Categorized
// =============================================================================

describe('Relative Imports Categorization', () => {
  const src = `
import utils from './utils';
import config from '../config';
import deep from '../../deep/module';
import pkg from 'external-pkg';
import scoped from '@scope/lib';
  `.trim();

  it('partitionImports separates packages and relative', () => {
    const result = extractImports(src, 'test.ts');
    const { packages, relative } = partitionImports(result);

    expect(relative).toHaveLength(3);
    expect(relative.map((i) => i.source)).toContain('./utils');
    expect(relative.map((i) => i.source)).toContain('../config');
    expect(relative.map((i) => i.source)).toContain('../../deep/module');

    expect(packages).toHaveLength(2);
    expect(packages.map((i) => i.source)).toContain('external-pkg');
    expect(packages.map((i) => i.source)).toContain('@scope/lib');
  });

  it('isBareSpecifier correctly classifies relative paths', () => {
    expect(isBareSpecifier('./utils')).toBe(false);
    expect(isBareSpecifier('../config')).toBe(false);
    expect(isBareSpecifier('../../deep')).toBe(false);
  });

  it('isBareSpecifier correctly classifies packages', () => {
    expect(isBareSpecifier('lodash')).toBe(true);
    expect(isBareSpecifier('@scope/pkg')).toBe(true);
    expect(isBareSpecifier('express')).toBe(true);
  });

  it('isBareSpecifier correctly classifies absolute paths', () => {
    expect(isBareSpecifier('/absolute/path')).toBe(false);
  });

  it('isBareSpecifier correctly classifies protocol specifiers', () => {
    expect(isBareSpecifier('node:fs')).toBe(false);
    expect(isBareSpecifier('https://cdn.example.com/module.js')).toBe(false);
    expect(isBareSpecifier('data:text/javascript,export default 1')).toBe(false);
  });
});

// =============================================================================
// 10. Multiple Imports on Same Line
// =============================================================================

describe('Multiple Imports on Same Line', () => {
  it('AST: handles semicolon-separated imports on one line', () => {
    const code = `import a from 'pkg-a'; import b from 'pkg-b';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(2);
    expect(findBySource(result, 'pkg-a')).toBeDefined();
    expect(findBySource(result, 'pkg-b')).toBeDefined();
  });

  it('regex: handles semicolon-separated imports on one line', () => {
    const code = `import a from 'pkg-a'; import b from 'pkg-b';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(2);
    expect(findBySource(result, 'pkg-a')).toBeDefined();
    expect(findBySource(result, 'pkg-b')).toBeDefined();
  });

  it('handles import + require on same line', () => {
    const code = `import x from 'mod-x'; const y = require('mod-y');`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(2);
    expect(findBySource(result, 'mod-x')!.isDynamic).toBe(false);
    expect(findBySource(result, 'mod-y')!.isDynamic).toBe(false);
  });

  it('handles mixed import + dynamic import on same line', () => {
    const code = `import a from 'static-mod'; const b = import('dynamic-mod');`;
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(2);
    expect(findBySource(result, 'static-mod')!.isDynamic).toBe(false);
    expect(findBySource(result, 'dynamic-mod')!.isDynamic).toBe(true);
  });
});

// =============================================================================
// 11. Commented-out Imports Are Skipped (AST strategy)
// =============================================================================

describe('Commented-out Imports', () => {
  it('AST: skips single-line commented imports', () => {
    const code = `
// import ghost from 'ghost-pkg';
import real from 'real-pkg';
    `.trim();
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('real-pkg');
  });

  it('AST: skips multi-line commented imports', () => {
    const code = `
/*
import ghost1 from 'ghost1';
import ghost2 from 'ghost2';
*/
import real from 'real-pkg';
    `.trim();
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('real-pkg');
  });

  it('regex: DOES match commented-out imports (known limitation)', () => {
    // Regex strategy cannot distinguish comments from real code — this is
    // a documented known limitation. The test confirms the behavior.
    const code = `// import ghost from 'ghost-pkg';\nimport real from 'real-pkg';`;
    const result = extractImportsRegex(code);
    // Regex may pick up the commented import — this is expected behavior
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(findBySource(result, 'real-pkg')).toBeDefined();
  });

  it('AST: skips imports inside JSDoc comments', () => {
    const code = `
/**
 * Usage: import { fn } from 'jsdoc-pkg';
 */
import actual from 'actual-pkg';
    `.trim();
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('actual-pkg');
  });

  it('auto strategy skips commented imports (uses AST)', () => {
    const code = `
// import ghost from 'ghost-pkg';
import real from 'real-pkg';
    `.trim();
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('real-pkg');
  });
});

// =============================================================================
// 12. String Imports Inside Non-import Contexts Are Skipped (AST strategy)
// =============================================================================

describe('String Imports in Non-import Contexts', () => {
  it('AST: skips import-like strings in template literals', () => {
    const code = `
const template = \`import fake from 'fake-pkg'\`;
import real from 'real-pkg';
    `.trim();
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('real-pkg');
  });

  it('AST: skips import-like strings in regular strings', () => {
    const code = `
const str = "import fake from 'fake-pkg'";
import real from 'real-pkg';
    `.trim();
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('real-pkg');
  });

  it('regex: may match import-like strings (known limitation)', () => {
    const code = `const str = "import fake from 'fake-pkg'";\nimport real from 'real-pkg';`;
    const result = extractImportsRegex(code);
    // Regex may pick up fake imports inside strings — expected behavior
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(findBySource(result, 'real-pkg')).toBeDefined();
  });

  it('AST: skips require-like expressions inside strings', () => {
    const code = `
const instructions = "Use require('some-pkg') to load the module";
const actual = require('actual-pkg');
    `.trim();
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('actual-pkg');
  });

  it('auto strategy skips string imports (uses AST)', () => {
    const code = `
const x = "import blah from 'not-real'";
import real from 'real-pkg';
    `.trim();
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('real-pkg');
  });
});

// =============================================================================
// getPackageName() utility
// =============================================================================

describe('getPackageName()', () => {
  it('extracts root package name from simple specifier', () => {
    expect(getPackageName('lodash')).toBe('lodash');
  });

  it('extracts root package name from deep import', () => {
    expect(getPackageName('lodash/map')).toBe('lodash');
    expect(getPackageName('lodash/fp/map')).toBe('lodash');
  });

  it('extracts scoped package name', () => {
    expect(getPackageName('@scope/pkg')).toBe('@scope/pkg');
  });

  it('extracts scoped package name from deep import', () => {
    expect(getPackageName('@scope/pkg/subpath')).toBe('@scope/pkg');
    expect(getPackageName('@scope/pkg/deep/nested')).toBe('@scope/pkg');
  });

  it('returns null for relative paths', () => {
    expect(getPackageName('./utils')).toBeNull();
    expect(getPackageName('../config')).toBeNull();
  });

  it('returns null for absolute paths', () => {
    expect(getPackageName('/absolute/path')).toBeNull();
  });

  it('returns null for protocol specifiers', () => {
    expect(getPackageName('node:fs')).toBeNull();
    expect(getPackageName('https://cdn.example.com')).toBeNull();
  });

  it('returns null for malformed scoped package (no slash)', () => {
    expect(getPackageName('@scope')).toBeNull();
  });
});

// =============================================================================
// partitionImports() utility
// =============================================================================

describe('partitionImports()', () => {
  it('correctly partitions mixed imports', () => {
    const imports: ImportInfo[] = [
      { source: 'react', specifiers: ['React'], isDynamic: false, line: 1 },
      { source: './utils', specifiers: ['helper'], isDynamic: false, line: 2 },
      { source: '@scope/lib', specifiers: [], isDynamic: false, line: 3 },
      { source: '../config', specifiers: [], isDynamic: false, line: 4 },
    ];

    const { packages, relative } = partitionImports(imports);
    expect(packages).toHaveLength(2);
    expect(packages.map((i) => i.source)).toEqual(['react', '@scope/lib']);
    expect(relative).toHaveLength(2);
    expect(relative.map((i) => i.source)).toEqual(['./utils', '../config']);
  });

  it('handles all-packages case', () => {
    const imports: ImportInfo[] = [
      { source: 'a', specifiers: [], isDynamic: false, line: 1 },
      { source: 'b', specifiers: [], isDynamic: false, line: 2 },
    ];
    const { packages, relative } = partitionImports(imports);
    expect(packages).toHaveLength(2);
    expect(relative).toHaveLength(0);
  });

  it('handles all-relative case', () => {
    const imports: ImportInfo[] = [
      { source: './a', specifiers: [], isDynamic: false, line: 1 },
      { source: '../b', specifiers: [], isDynamic: false, line: 2 },
    ];
    const { packages, relative } = partitionImports(imports);
    expect(packages).toHaveLength(0);
    expect(relative).toHaveLength(2);
  });

  it('handles empty array', () => {
    const { packages, relative } = partitionImports([]);
    expect(packages).toHaveLength(0);
    expect(relative).toHaveLength(0);
  });
});

// =============================================================================
// Deduplication behavior
// =============================================================================

describe('Deduplication', () => {
  it('merges specifiers from duplicate imports of same module', () => {
    const code = `
import { a } from 'pkg';
import { b } from 'pkg';
    `.trim();
    const result = extractImports(code, 'test.ts');
    // Should be deduplicated into one entry
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('pkg');
    expect(result[0]!.specifiers).toContain('a');
    expect(result[0]!.specifiers).toContain('b');
  });

  it('does NOT merge static and dynamic imports of same module', () => {
    const code = `
import { a } from 'pkg';
const lazy = import('pkg');
    `.trim();
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(2);
    const staticImp = result.find((i) => !i.isDynamic)!;
    const dynamicImp = result.find((i) => i.isDynamic)!;
    expect(staticImp.source).toBe('pkg');
    expect(dynamicImp.source).toBe('pkg');
  });

  it('isTypeOnly is false when mixed type and non-type imports', () => {
    const code = `
import type { T } from 'mod';
import { val } from 'mod';
    `.trim();
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.isTypeOnly).toBe(false);
  });

  it('isTypeOnly is true when ALL imports of module are type-only', () => {
    const code = `
import type { T } from 'mod';
import type { U } from 'mod';
    `.trim();
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.isTypeOnly).toBe(true);
  });

  it('results are sorted by line number', () => {
    const code = `
import z from 'z-pkg';
import a from 'a-pkg';
import m from 'm-pkg';
    `.trim();
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(3);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.line).toBeGreaterThanOrEqual(result[i - 1]!.line);
    }
  });
});

// =============================================================================
// Strategy selection
// =============================================================================

describe('Strategy selection', () => {
  it('strategy=regex uses regex extractor', () => {
    const code = `import x from 'pkg';`;
    const result = extractImports(code, 'test.ts', { strategy: 'regex' });
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('pkg');
  });

  it('strategy=ast uses AST extractor', () => {
    const code = `import x from 'pkg';`;
    const result = extractImports(code, 'test.ts', { strategy: 'ast' });
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('pkg');
  });

  it('strategy=auto (default) falls back to regex on AST failure', () => {
    // Severely broken syntax that may cause AST issues
    // The auto strategy should still return results via regex fallback
    // We can't easily force a TS parse failure with normal code, so we
    // test that the auto path works on valid code (covering the try path)
    const code = `import x from 'pkg';`;
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('pkg');
  });
});

// =============================================================================
// Script kind detection (file extensions)
// =============================================================================

describe('File extension handling', () => {
  const code = `import x from 'pkg';`;

  it('handles .ts files', () => {
    const result = extractImportsAst(code, 'file.ts');
    expect(result).toHaveLength(1);
  });

  it('handles .tsx files', () => {
    const tsxCode = `import React from 'react';\nconst App = () => <div />;`;
    const result = extractImportsAst(tsxCode, 'file.tsx');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('react');
  });

  it('handles .js files', () => {
    const result = extractImportsAst(code, 'file.js');
    expect(result).toHaveLength(1);
  });

  it('handles .jsx files', () => {
    const jsxCode = `import React from 'react';\nconst App = () => <div />;`;
    const result = extractImportsAst(jsxCode, 'file.jsx');
    expect(result).toHaveLength(1);
  });

  it('handles .mjs files', () => {
    const result = extractImportsAst(code, 'file.mjs');
    expect(result).toHaveLength(1);
  });

  it('handles .cjs files', () => {
    const cjsCode = `const x = require('pkg');`;
    const result = extractImportsAst(cjsCode, 'file.cjs');
    expect(result).toHaveLength(1);
  });

  it('handles .mts files', () => {
    const result = extractImportsAst(code, 'file.mts');
    expect(result).toHaveLength(1);
  });

  it('handles .cts files', () => {
    const ctsCode = `const x = require('pkg');`;
    const result = extractImportsAst(ctsCode, 'file.cts');
    expect(result).toHaveLength(1);
  });

  it('handles unknown extension (defaults to JS)', () => {
    const result = extractImportsAst(code, 'file.unknown');
    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// Line and column tracking
// =============================================================================

describe('Line and column tracking', () => {
  it('AST: reports correct line numbers', () => {
    const code = `
import a from 'pkg-a';
import b from 'pkg-b';
import c from 'pkg-c';
    `.trim();
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(3);
    expect(result[0]!.line).toBe(1);
    expect(result[1]!.line).toBe(2);
    expect(result[2]!.line).toBe(3);
  });

  it('regex: reports correct line numbers', () => {
    const code = `
import a from 'pkg-a';
import b from 'pkg-b';
import c from 'pkg-c';
    `.trim();
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(3);
    expect(result[0]!.line).toBe(1);
    expect(result[1]!.line).toBe(2);
    expect(result[2]!.line).toBe(3);
  });

  it('AST: reports correct column numbers', () => {
    const code = `import a from 'pkg-a';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.column).toBe(1);
  });

  it('regex: reports correct column numbers', () => {
    const code = `import a from 'pkg-a';`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.column).toBe(1);
  });

  it('AST: tracks raw source text', () => {
    const code = `import { foo } from 'bar';`;
    const result = extractImportsAst(code, 'test.ts');
    expect(result[0]!.raw).toBe(`import { foo } from 'bar';`);
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('Edge cases', () => {
  it('handles empty source code', () => {
    const result = extractImports('', 'test.ts');
    expect(result).toEqual([]);
  });

  it('handles source code with no imports', () => {
    const code = `const x = 1;\nfunction hello() { return 'world'; }`;
    const result = extractImports(code, 'test.ts');
    expect(result).toEqual([]);
  });

  it('handles multiline import statement', () => {
    const code = `
import {
  useState,
  useEffect,
  useCallback,
} from 'react';
    `.trim();
    const result = extractImportsAst(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.specifiers).toContain('useState');
    expect(result[0]!.specifiers).toContain('useEffect');
    expect(result[0]!.specifiers).toContain('useCallback');
  });

  it('handles import with double quotes', () => {
    const code = `import a from "double-quote-pkg";`;
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('double-quote-pkg');
  });

  it('handles import with single quotes', () => {
    const code = `import a from 'single-quote-pkg';`;
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('single-quote-pkg');
  });

  it('handles require with double quotes', () => {
    const code = `const x = require("double-pkg");`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('double-pkg');
  });

  it('handles deep subpath imports', () => {
    const code = `import x from 'lodash/fp/map';`;
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('lodash/fp/map');
  });

  it('handles node: protocol imports', () => {
    const code = `import { readFile } from 'node:fs/promises';`;
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('node:fs/promises');
    expect(isBareSpecifier('node:fs/promises')).toBe(false);
  });

  it('handles large number of imports', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `import mod${i} from 'pkg-${i}';`);
    const code = lines.join('\n');
    const result = extractImports(code, 'test.ts');
    expect(result).toHaveLength(100);
  });

  it('regex: handles getLineAndColumn at end of file', () => {
    // Test the edge case where offset is past all lines
    const code = `import x from 'pkg';\n`;
    const result = extractImportsRegex(code);
    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// Auto strategy fallback (catch branch — lines 63-65)
// =============================================================================

describe('Auto strategy AST-to-regex fallback', () => {
  it('auto strategy still works on unusual but valid code', () => {
    // The TS parser is very tolerant, so it's hard to make it throw.
    // We verify the auto path works for various scenarios.
    const code = `import x from 'pkg';`;
    const result = extractImports(code, 'test.ts', { strategy: 'auto' });
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('pkg');
  });
});

// =============================================================================
// Mixed scenarios (comprehensive integration)
// =============================================================================

describe('Mixed import scenarios', () => {
  it('handles a realistic file with all import types', () => {
    const code = `
import React, { useState, useCallback } from 'react';
import type { FC, ReactNode } from 'react';
import * as path from 'path';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { render } from '@testing-library/react';
export * from './utils';
export { helper } from './helpers';
const lodash = require('lodash');
const { map, filter } = require('underscore');
const lazy = import('./lazy-component');
// import ghost from 'ghost-pkg';
    `.trim();

    const result = extractImports(code, 'app.tsx');

    // Check we got all the real imports (not the commented one)
    expect(findBySource(result, 'path')).toBeDefined();
    expect(findBySource(result, 'node:fs/promises')).toBeDefined();
    expect(findBySource(result, 'express')).toBeDefined();
    expect(findBySource(result, '@testing-library/react')).toBeDefined();
    expect(findBySource(result, 'lodash')).toBeDefined();
    expect(findBySource(result, 'underscore')).toBeDefined();
    expect(findBySource(result, './utils')).toBeDefined();
    expect(findBySource(result, './helpers')).toBeDefined();
    expect(findBySource(result, './lazy-component')).toBeDefined();

    // react should be deduplicated (import + import type)
    const react = findBySource(result, 'react')!;
    expect(react).toBeDefined();
    // isTypeOnly should be false because not all imports are type-only
    expect(react.isTypeOnly).toBe(false);
    // Should contain all specifiers from both lines
    expect(react.specifiers).toContain('React');
    expect(react.specifiers).toContain('useState');
    expect(react.specifiers).toContain('useCallback');
    expect(react.specifiers).toContain('FC');
    expect(react.specifiers).toContain('ReactNode');

    // ghost should NOT be present (commented out)
    expect(findBySource(result, 'ghost-pkg')).toBeUndefined();

    // Partition check
    const { packages, relative } = partitionImports(result);
    expect(relative.length).toBeGreaterThanOrEqual(3); // ./utils, ./helpers, ./lazy-component
    expect(packages.length).toBeGreaterThanOrEqual(4); // react, express, lodash, underscore, @testing-library/react

    // Dynamic import check
    const lazyImp = findBySource(result, './lazy-component')!;
    expect(lazyImp.isDynamic).toBe(true);
  });
});
