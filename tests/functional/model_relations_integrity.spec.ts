import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * Regressão para uma classe de bug encontrada ao ligar o alerta de estoque crítico:
 * `@belongsTo(() => Modelo)` sem `foreignKey` explícito faz o Lucid inferir a FK a partir
 * do NOME DA CLASSE relacionada (`camelCase(NomeClasse) + 'Id'`), não do nome da coluna
 * real no model local. `lote.ts` tinha exactamente este problema (`produto` -> esperava
 * `produtosId`/`produtos_id`, mas a coluna real é `produto_id`) e nunca tinha sido
 * detectado porque nada chamava `.preload('produto')` em lote antes desta sessão.
 *
 * Este teste chama `.preload(relação)` em cada `belongsTo` sem `foreignKey` explícito
 * encontrado no código — não precisa de dados: o erro (E_MISSING_MODEL_ATTRIBUTE)
 * acontece no "boot" da relação, antes de qualquer linha ser lida.
 */
test.group('integridade das relações belongsTo (sem foreignKey explícito)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  const casos: Array<{ label: string; load: () => Promise<unknown> }> = [
    {
      label: 'authplatform/project.ts -> user',
      load: async () => (await import('#models/authplatform/project')).default.query().preload('user' as any).first(),
    },
    {
      label: 'auth/papel_permissao.ts -> papel',
      load: async () => (await import('#models/auth/papel_permissao')).default.query().preload('papel' as any).first(),
    },
    {
      label: 'auth/papel_permissao.ts -> permissao',
      load: async () => (await import('#models/auth/papel_permissao')).default.query().preload('permissao' as any).first(),
    },
    {
      label: 'authplatform/project_permission.ts -> project',
      load: async () => (await import('#models/authplatform/project_permission')).default.query().preload('project' as any).first(),
    },
    {
      label: 'authplatform/project_permission_role.ts -> project_permission',
      load: async () =>
        (await import('#models/authplatform/project_permission_role')).default
          .query()
          .preload('project_permission' as any)
          .first(),
    },
    {
      label: 'authplatform/project_permission_role.ts -> project_role',
      load: async () =>
        (await import('#models/authplatform/project_permission_role')).default
          .query()
          .preload('project_role' as any)
          .first(),
    },
    {
      label: 'auth/user_papel.ts -> User',
      load: async () => (await import('#models/auth/user_papel')).default.query().preload('User' as any).first(),
    },
    {
      label: 'auth/user_papel.ts -> papel',
      load: async () => (await import('#models/auth/user_papel')).default.query().preload('papel' as any).first(),
    },
    {
      label: 'authplatform/project_role.ts -> project',
      load: async () => (await import('#models/authplatform/project_role')).default.query().preload('project' as any).first(),
    },
    {
      label: 'authplatform/project_user.ts -> project',
      load: async () => (await import('#models/authplatform/project_user')).default.query().preload('project' as any).first(),
    },
    {
      label: 'authplatform/project_user_role.ts -> project_user',
      load: async () =>
        (await import('#models/authplatform/project_user_role')).default.query().preload('project_user' as any).first(),
    },
    {
      label: 'authplatform/project_user_role.ts -> project_role',
      load: async () =>
        (await import('#models/authplatform/project_user_role')).default.query().preload('project_role' as any).first(),
    },
    {
      label: 'faturacao/estoque.ts -> lote',
      load: async () => (await import('#models/faturacao/estoque')).default.query().preload('lote' as any).first(),
    },
    {
      label: 'faturacao/estoque.ts -> user',
      load: async () => (await import('#models/faturacao/estoque')).default.query().preload('user' as any).first(),
    },
    {
      label: 'faturacao/estoque.ts -> pos',
      load: async () => (await import('#models/faturacao/estoque')).default.query().preload('pos' as any).first(),
    },
    {
      label: 'faturacao/pos.ts -> empresa',
      load: async () => (await import('#models/faturacao/pos')).default.query().preload('empresa' as any).first(),
    },
    // Estas duas tinham foreignKey ERRADO (não em falta): `fornecedor` apontava para o
    // model `produto_formatos` (copy-paste de `formato`) em vez de `produto_fornecedores`,
    // e `empresa` usava `foreignKey: 'produto_id'` em vez de `'empresa_id'`.
    {
      label: 'faturacao/produtos.ts -> fornecedor',
      load: async () => (await import('#models/faturacao/produtos')).default.query().preload('fornecedor' as any).first(),
    },
    {
      label: 'faturacao/produtos.ts -> empresa',
      load: async () => (await import('#models/faturacao/produtos')).default.query().preload('empresa' as any).first(),
    },
    // idem: apontava para `foreignKey: 'produto_fornecedor_id'` (coluna inexistente) em
    // vez de `'empresa_id'`. Só encontrado depois de mover o model para faturacao/.
    {
      label: 'faturacao/produto_fornecedores.ts -> empresa',
      load: async () =>
        (await import('#models/faturacao/produto_fornecedores')).default.query().preload('empresa' as any).first(),
    },
  ]

  for (const caso of casos) {
    test(caso.label, async ({ assert }) => {
      await assert.doesNotReject(() => caso.load())
    })
  }
})
