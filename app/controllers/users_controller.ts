import { HttpContext } from '@adonisjs/core/http'
import Users from "#models/Users";
import { UserLoginValidator, UsersCreateValidator, UsersUpdateValidator } from '#validators/UsersValidator';
import hash from '@adonisjs/core/services/hash';

export default class UsersController {

  // Função que lista os usuários com base nos parâmetros de consulta (query strings).
  async index({ request, response, auth }: HttpContext) {
    try {
      // Verificar se o usuário é administrador
      if (auth.user?.tipo !== 'administrador') {
        return response.forbidden({ message: 'Apenas administradores podem listar usuários' });
      }

      const data = request.qs();  // Captura os parâmetros de consulta da URL
      let query = Users.query();  // Cria uma consulta inicial para a tabela de usuários

      // Filtra os usuários pelo nome, se fornecido
      if (data.nome) {
        query = query.where('nome', 'like', '%' + data.nome + '%');
      }

      // Filtra os usuários pelo email, se fornecido
      if (data.email) {
        query = query.where('email', data.email);
      }

      // Filtra os usuários pelo telefone, se fornecido
      if (data.telefone) {
        query = query.where('telefone', 'like', '%' + data.telefone + '%');
      }

      // Se a paginação for fornecida (page e pageSize)
      if (data.page && data.pageSize) {
        query = query.preload("estoque_")  // Faz preload da relação "estoque_"
          .preload("vendas_");  // Faz preload da relação "vendas_"

        // Se o campo de ordenação for válido, aplica a ordenação
        if (Users._users_fields_.includes(data.order_field)) {
          // Ordena a consulta conforme o campo e a ordem (asc/desc)
          if (String(data.order_field_order).toLowerCase() === "desc") {
            query = query.orderBy(data.order_field, data.order_field_order);
          } else if (String(data.order_field_order).toLowerCase() === "asc") {
            query = query.orderBy(data.order_field, data.order_field_order);
          } else {
            query = query.orderBy(data.order_field, "desc");
          }
        }

        // Realiza a paginação e retorna os resultados
        const data_result = await query.paginate(data.page, data.pageSize);
        return response.json({ data: data_result });

      } else {
        query = query.preload("estoque_")  // Preload da relação "estoque_"
          .preload("vendas_");  // Preload da relação "vendas_"

        // Aplica a ordenação se o campo for válido
        if (Users._users_fields_.includes(data.order_field)) {
          if (String(data.order_field_order).toLowerCase() === "desc") {
            query = query.orderBy(data.order_field, data.order_field_order);
          } else if (String(data.order_field_order).toLowerCase() === "asc") {
            query = query.orderBy(data.order_field, data.order_field_order);
          } else {
            query = query.orderBy(data.order_field, "desc");
          }
        }

        // Retorna todos os resultados sem paginação
        const data_result = await query;
        return response.json(data_result);
      }
    } catch (error) {
      console.error(error);  // Loga o erro no console
      return response.badRequest({ message: 'Erro ao buscar Users' });  // Retorna uma mensagem de erro
    }
  }

  // Função que cria um novo usuário
  async store({ request, response, auth }: HttpContext) {
    try {
      // Verificar se o usuário é administrador (apenas admins criam usuários)
      if (auth.user?.tipo !== 'administrador') {
        return response.forbidden({ message: 'Apenas administradores podem criar usuários' });
      }

      const data = await request.validateUsing(UsersCreateValidator);  // Valida os dados usando o validador
      const data_result = await Users.create(data);  // Cria o usuário com os dados validados

      return response.json({ message: 'Usuário criado com sucesso', data: data_result });
    } catch (error) {
      console.error(error);
      return response.badRequest({ message: error.messages || 'Erro ao criar usuário' });
    }
  }

  // Função que exibe os detalhes de um usuário específico
  async show({ params, response, auth }: HttpContext) {
    try {
      const data_result = await Users.query().where("id", params.id)
        .preload("vendas_")
        .firstOrFail();

      // Apenas admin ou o próprio usuário pode ver seus dados
      if (auth.user?.tipo !== 'administrador' && auth.user?.id !== data_result.id) {
        return response.forbidden({ message: 'Você não tem permissão para ver este usuário' });
      }

      return response.json({ data: data_result });
    } catch (error) {
      console.error(error);
      return response.badRequest({ message: 'Usuário não encontrado' });
    }
  }

  // Função que atualiza os dados de um usuário específico
  async update({ request, params, response, auth }: HttpContext) {
    try {
      const data_result = await Users.query().where("id", params.id).firstOrFail();
      const data = await request.validateUsing(UsersUpdateValidator, { meta: { _id: params.id } });

      // Verificar autorização
      const authenticatedUser = auth.user!;
      const isAdmin = authenticatedUser.tipo === 'administrador';
      const isUpdatingSelf = authenticatedUser.id === data_result.id;

      if (!isAdmin && !isUpdatingSelf) {
        return response.forbidden({ message: 'Você não tem permissão para atualizar este usuário' });
      }

      // Se estiver tentando alterar a senha
      if (data.password) {
        // Se estiver atualizando a própria senha, exige a senha atual
        if (isUpdatingSelf) {
          if (!data.current_password) {
            return response.badRequest({ message: 'Senha atual é obrigatória para alterar sua própria senha' });
          }

          const isPasswordValid = await hash.use('scrypt').verify(data_result.password, data.current_password);
          if (!isPasswordValid) {
            return response.badRequest({ message: 'Senha atual incorreta' });
          }
        }
        // Se for admin atualizando outro usuário, não exige senha atual
      }

      // Remove current_password para não dar erro no merge
      const { current_password, ...updateData } = data;

      data_result.merge(updateData);  // Mescla os dados atualizados
      await data_result.save();  // Salva as alterações no banco de dados

      return response.json({ message: 'Usuário atualizado com sucesso!', data: data_result });
    } catch (error) {
      console.error(error);
      return response.badRequest({ message: 'Erro ao atualizar Usuário', error: error.messages || error.message });
    }
  }

  // Função que exclui um usuário específico
  async destroy({ params, response, auth }: HttpContext) {
    try {
      // Apenas administradores podem excluir usuários
      if (auth.user?.tipo !== 'administrador') {
        return response.forbidden({ message: 'Apenas administradores podem excluir usuários' });
      }

      const data_result = await Users.query().where("id", params.id).firstOrFail();
      await data_result.delete();
      return response.json({ message: 'Usuário excluído com sucesso!' });
    } catch (error) {
      console.error(error);
      return response.badRequest({ message: 'Erro ao excluir Usuário', error: error.message });
    }
  }

  // Função de login
  async login({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(UserLoginValidator);  // Valida os dados de login

      // Verifica se o email foi fornecido e valida as credenciais
      if (data.email) {
        const user = await Users.verifyCredentials(data.email, data.password);  // Verifica as credenciais do usuário
        const token = await Users.accessTokens.create(user);  // Cria um token de acesso para o usuário
        return response.ok({ type: "bearer", value: token.value!.release(), tipo: user.tipo, userId: user.id ,email:user.email, nome:user.nome});  // Retorna o token e as informações do usuário
      }

      return response.ok({ message: "something went wrong,login can not be made" });  // Retorna uma mensagem de erro genérica se o login falhar
    } catch (error) {
      console.log(error.message);  // Loga o erro no console
      return response.badRequest({ message: error.message });  // Retorna uma mensagem de erro detalhada
    }
  }

  // Função de logout
  async logout({ response, auth }: HttpContext) {
    try {
      const user = await Users.findOrFail(auth.user?.id);  // Busca o usuário logado
      const token = auth?.user?.currentAccessToken;  // Captura o token atual

      await Users.accessTokens.delete(user, token!.identifier);  // Remove o token de acesso
      return response.noContent();  // Retorna uma resposta sem conteúdo (logout bem-sucedido)
    } catch (error) {
      console.log(error);  // Loga o erro no console
      return response.badRequest({ message: error.message });  // Retorna uma mensagem de erro detalhada
    }
  }
};
