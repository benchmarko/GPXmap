// https://stackoverflow.com/questions/78330131/how-do-i-configure-eslint-flat-config-with-typescript-in-vs-code-without-flatco
// https://typescript-eslint.io/getting-started
// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
);
