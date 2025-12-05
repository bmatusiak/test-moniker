import js from '@eslint/js';
import globals from 'globals';
// import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

// const __dirname = import.meta.dirname;

export default defineConfig([
    // tseslint.configs.recommended,
    eslintConfigPrettier,
    pluginReact.configs.flat.recommended,
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        plugins: { js },
        // extends: ['js/recommended'],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
            }
        },
        settings: { react: { version: 'detect' } },
        rules: {
            'no-empty': ['error', { 'allowEmptyCatch': true }],
            'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_', 'caughtErrorsIgnorePattern': '^_' }],
            'quotes': ['warn', 'single', { 'allowTemplateLiterals': true }],
            'semi': ['error', 'always'],
            'indent': ['error', 4],
            'no-tabs': 'off',
            'space-before-function-paren': ['error', 'never'],
            'react/prop-types': 'off',
            'undef': 'on',
        },
    },
]);