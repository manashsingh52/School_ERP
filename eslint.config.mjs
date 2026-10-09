// Lint rules include project guardrails from the docs, not just style:
//  • feature modules must not use the RLS-bypassing PlatformPrismaService (docs/03 §6)
//  • no authorisation by role name — check permissions (docs/04 §1)
//  • no unsafe raw SQL (docs/09 §3)
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ROLE_KEYS = 'school_admin|principal|accountant|teacher|parent';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/generated/**', '**/coverage/**', '**/next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: `BinaryExpression[operator=/^[!=]==?$/] > Literal[value=/^(${ROLE_KEYS})$/]`,
          message: 'Authorise with permissions, not role names (docs/04 §1).',
        },
        {
          selector: 'MemberExpression[property.name=/^\\$(query|execute)RawUnsafe$/]',
          message: 'Unsafe raw SQL is banned — use tagged $queryRaw`...` (docs/09 §3).',
        },
      ],
    },
  },
  {
    // Feature modules get tenant-scoped data only. Allowed users of the bypass client:
    // core/, auth, me, public, mobile (push tokens are global, per phone), schools (platform provisioning), platform (super-admin console), webhooks (an inbound payment
    // webhook must find its school from the URL before any tenant context exists; it only
    // stores the event — processing runs tenant-scoped in the worker).
    files: ['apps/api/src/modules/**/*.ts'],
    ignores: ['apps/api/src/modules/{auth,me,public,mobile,schools,webhooks,platform}/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core/prisma/prisma.service.js'],
              importNames: ['PlatformPrismaService'],
              message: 'PlatformPrismaService bypasses Row-Level Security. Use PrismaService (docs/03 §6).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Tests look roles up by key to set up scenarios — that's not authorisation.
    files: ['**/*.test.ts', 'apps/api/test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^\\$(query|execute)RawUnsafe$/]',
          message: 'Unsafe raw SQL is banned — use tagged $queryRaw`...` (docs/09 §3).',
        },
      ],
    },
  },
);
