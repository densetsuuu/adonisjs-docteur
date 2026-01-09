export const controllers = {
  NewAccount: () => import('#controllers/new_account_controller'),
  Session: () => import('#controllers/session_controller'),
  Slow: () => import('#controllers/slow_controller'),
}
