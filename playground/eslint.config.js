import { configApp } from '@adonisjs/eslint-config'

const config = configApp({
  ignores: ['.adonisjs/**'],
})

config.push({
  rules: {
    '@typescript-eslint/consistent-type-imports': 'off',
  },
})

export default config
