import { configPkg } from '@adonisjs/eslint-config'

const config = configPkg({
  ignores: ['playground/.adonisjs/**'],
})

config.push({
  files: ['playground/**/*.ts'],
  rules: {
    '@typescript-eslint/consistent-type-imports': 'off',
  },
})

export default config
