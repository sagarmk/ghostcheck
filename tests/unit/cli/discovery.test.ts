/**
 * Unit tests for File Discovery module
 *
 * Tests file discovery, language detection, and filtering logic.
 */

import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../../../src/cli/discovery.js';

describe('File Discovery', () => {
  describe('detectLanguage()', () => {
    it('should detect JavaScript from .js extension', () => {
      expect(detectLanguage('/src/app.js')).toBe('javascript');
    });

    it('should detect JavaScript from .jsx extension', () => {
      expect(detectLanguage('/src/component.jsx')).toBe('javascript');
    });

    it('should detect JavaScript from .mjs extension', () => {
      expect(detectLanguage('/src/module.mjs')).toBe('javascript');
    });

    it('should detect JavaScript from .cjs extension', () => {
      expect(detectLanguage('/src/config.cjs')).toBe('javascript');
    });

    it('should detect TypeScript from .ts extension', () => {
      expect(detectLanguage('/src/app.ts')).toBe('typescript');
    });

    it('should detect TypeScript from .tsx extension', () => {
      expect(detectLanguage('/src/component.tsx')).toBe('typescript');
    });

    it('should detect TypeScript from .mts extension', () => {
      expect(detectLanguage('/src/module.mts')).toBe('typescript');
    });

    it('should detect TypeScript from .cts extension', () => {
      expect(detectLanguage('/src/config.cts')).toBe('typescript');
    });

    it('should detect Python from .py extension', () => {
      expect(detectLanguage('/src/main.py')).toBe('python');
    });

    it('should detect Python from .pyw extension', () => {
      expect(detectLanguage('/src/gui.pyw')).toBe('python');
    });

    it('should detect Go from .go extension', () => {
      expect(detectLanguage('/src/main.go')).toBe('go');
    });

    it('should detect Rust from .rs extension', () => {
      expect(detectLanguage('/src/main.rs')).toBe('rust');
    });

    it('should detect Java from .java extension', () => {
      expect(detectLanguage('/src/Main.java')).toBe('java');
    });

    it('should detect Ruby from .rb extension', () => {
      expect(detectLanguage('/src/app.rb')).toBe('ruby');
    });

    it('should return null for unsupported extensions', () => {
      expect(detectLanguage('/src/styles.css')).toBeNull();
      expect(detectLanguage('/src/data.json')).toBeNull();
      expect(detectLanguage('/src/page.html')).toBeNull();
      expect(detectLanguage('/src/image.png')).toBeNull();
    });

    it('should return null for files without extensions', () => {
      expect(detectLanguage('/src/Makefile')).toBeNull();
      expect(detectLanguage('/src/Dockerfile')).toBeNull();
    });

    it('should handle deeply nested paths', () => {
      expect(detectLanguage('/a/b/c/d/e/f/g/file.ts')).toBe('typescript');
    });

    it('should handle files with multiple dots', () => {
      expect(detectLanguage('/src/app.test.ts')).toBe('typescript');
      expect(detectLanguage('/src/app.spec.js')).toBe('javascript');
      expect(detectLanguage('/src/module.config.py')).toBe('python');
    });
  });
});
