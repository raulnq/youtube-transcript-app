import jseslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';

export default defineConfig(
  globalIgnores(['dist/**/*']),
  jseslint.configs.recommended,
  tseslint.configs.recommended,
  prettierConfig
);
