/*
|--------------------------------------------------------------------------
| Bouncer policies
|--------------------------------------------------------------------------
|
| You may define a collection of policies inside this file and pre-register
| them when creating a new bouncer instance.
|
| Pre-registered policies and abilities can be referenced as a string by their
| name. Also they are must if want to perform authorization inside Edge
| templates.
|
*/

export const policies = {
  ProjectUserRolePolicy: () => import('#policies/project_user_role_policy'),
  ProjectPermissionRolePolicy: () => import('#policies/project_permission_role_policy'),
  ProjectPermissionPolicy: () => import('#policies/project_permission_policy'),
  ProjectRolePolicy: () => import('#policies/project_role_policy'),
  ProjectUserPolicy: () => import('#policies/project_user_policy'),
  ProjectPolicy: () => import('#policies/project_policy'),
  UserPapelPolicy: () => import('#policies/user_papel_policy'),
  PapelPermissaoPolicy: () => import('#policies/papel_permissao_policy'),
  PapelPolicy: () => import('#policies/papel_policy'),
  PermissaoPolicy: () => import('#policies/permissao_policy'),
  AuthPolicy: () => import('#policies/auth_policy'),
  CupomPolicy: () => import('#policies/cupom_policy'),
  PlanoPolicy: () => import('#policies/plano_policy'),
  MetodoPagamentoPolicy: () => import('#policies/metodopagamento_policy'),
}
