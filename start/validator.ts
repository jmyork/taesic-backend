import vine, { SimpleMessagesProvider } from "@vinejs/vine"

export const messages = {
    // "string" e "UUID" são palavras de quem escreve o código, não de quem
    // preenche o formulário. O `uuid` chega sempre de uma escolha numa lista
    // (o id de um produto, de um cliente, de um método de pagamento), por isso
    // o que falhou foi a opção escolhida, não um formato que alguém escreveu.
    'string': 'O campo {{ field }} deve ser texto',
    'email': 'O campo {{ field }} deve ser um endereço de email válido',
    'regex': 'O formato do campo {{ field }} é inválido',
    'url': 'O campo {{ field }} deve ser uma URL válida',
    'activeUrl': 'O campo {{ field }} deve ser uma URL válida',
    'alpha': 'O campo {{ field }} deve conter apenas letras',
    'alphaNumeric': 'O campo {{ field }} deve conter apenas letras e números',
    'minLength': 'O campo {{ field }} deve ter pelo menos {{ min }} caracteres',
    'maxLength': 'O campo {{ field }} não deve ter mais que {{ max }} caracteres',
    'fixedLength': 'O campo {{ field }} deve ter {{ size }} caracteres',
    'confirmed': 'Os campos {{ field }} e {{ otherField }} devem ser iguais',
    'endsWith': 'O campo {{ field }} deve terminar com {{ substring }}',
    'startsWith': 'O campo {{ field }} deve começar com {{ substring }}',
    'sameAs': 'Os campos {{ field }} e {{ otherField }} devem ser iguais',
    'notSameAs': 'Os campos {{ field }} e {{ otherField }} devem ser diferentes',
    'in': 'O campo {{ field }} selecionado é inválido',
    'notIn': 'O campo {{ field }} selecionado é inválido',
    // `enum` faltava, e é a regra por trás de todos os campos de escolha fechada deste
    // projecto (`vine.enum`) — tamanho da empresa, tipo de movimentação de stock, estado
    // de uma venda, ramo de actuação. Sem a entrada, o VineJS caía na mensagem por
    // omissão, em inglês ("The selected X is invalid"), no meio de uma resposta cujo
    // envelope já vinha em português.
    'enum': 'A opção escolhida em {{ field }} não é válida',
    'ipAddress': 'O campo {{ field }} deve ser um endereço IP válido',
    'uuid': 'A opção escolhida em {{ field }} não é válida',
    'ascii': 'O campo {{ field }} deve conter apenas caracteres ASCII',
    'creditCard': 'O campo {{ field }} deve ser um número de cartão de {{ providersList }} válido',
    'hexCode': 'O campo {{ field }} deve ser um código de cor hexadecimal válido',
    'iban': 'O campo {{ field }} deve ser um número IBAN válido',
    'jwt': 'O campo {{ field }} deve ser um token JWT válido',
    'coordinates': 'O campo {{ field }} deve conter coordenadas de latitude e longitude',
    'mobile': 'O campo {{ field }} deve ser um número de telefone móvel válido',
    'passport': 'O campo {{ field }} deve ser um número de passaporte válido',
    'postalCode': 'O campo {{ field }} deve ser um código postal válido',
    'number': 'O campo {{ field }} deve ser um número',
    'min': 'O campo {{ field }} deve ser pelo menos {{ min }}',
    'max': 'O campo {{ field }} não deve ser maior que {{ max }}',
    'range': 'O campo {{ field }} deve estar entre {{ min }} e {{ max }}',
    'positive': 'O campo {{ field }} deve ser positivo',
    'negative': 'O campo {{ field }} deve ser negativo',
    'decimal': 'O campo {{ field }} deve ter {{ digits }} casas decimais',
    'withoutDecimals': 'O campo {{ field }} não deve ter casas decimais',
    'date': 'O campo {{ field }} deve ser um valor de data e hora',
    'date.equals': 'O campo {{ field }} deve ser uma data igual a {{ expectedValue }}',
    'date.after': 'O campo {{ field }} deve ser uma data após {{ expectedValue }}',
    'date.before': 'O campo {{ field }} deve ser uma data antes de {{ expectedValue }}',
    'date.afterOrEqual': 'O campo {{ field }} deve ser uma data igual ou após {{ expectedValue }}',
    'date.beforeOrEqual':'O campo {{ field }} deve ser uma data igual ou antes de {{ expectedValue }}',
    'date.sameAs': 'Os campos {{ field }} e {{ otherField }} devem ser iguais',
    'date.notSameAs': 'Os campos {{ field }} e {{ otherField }} devem ser diferentes',
    'date.afterField': 'O campo {{ field }} deve ser uma data após {{ otherField }}',
    'required': '{{field}} é obrigatório',

    // As regras `.unique()`/`.exists()` do Adonis+Lucid identificam-se como `database.unique` e
    // `database.exists`, não como `unique`/`exists`. As duas chaves curtas que aqui estavam nunca
    // chegaram a aplicar-se: o utilizador via sempre o texto inglês por omissão do VineJS
    // ("The nif has already been taken"). Confirmado no corpo de erro real devolvido pela API,
    // que traz "rule":"database.unique". Ficam ambas as formas — a curta é inofensiva e evita
    // que isto volte a partir caso a nomenclatura mude.
    'unique': '{{field}} já existe',
    'exists': '{{field}} não existe',
    'database.unique': 'Já existe um registo com este {{field}}.',
    'database.exists': 'O {{field}} indicado não existe.',

    // Mensagens por campo, para o utilizador saber o que fazer em vez de ler "nif já existe".
    // A chave é `<campo>.<regra>`, logo só afecta campos com esse nome QUE TENHAM a regra.
    // Redacção neutra quanto à entidade, para continuar correcta se amanhã outra entidade
    // passar a exigir NIF/email únicos.
    'nif.database.unique': 'Já existe um registo com este NIF nesta empresa.',
    'email.database.unique': 'Já existe um registo com este email nesta empresa.',

    // ── Registo de empresa ────────────────────────────────────────────────────
    // O `regex` genérico ("O formato do campo X é inválido") não diz que forma é
    // esperada, e este é o campo que mais confusão causa no registo: é um
    // identificador, é permanente e o formato não se adivinha. Aqui diz-se a
    // regra e dá-se um exemplo válido.
    'empresa_company_alias.regex':
        'O nome curto da empresa só pode ter letras minúsculas e hífens — por exemplo, "minha-empresa".',
    'empresa_nif.regex': 'O NIF só pode conter letras e números, sem espaços nem pontuação.',
    'empresa_nif.database.unique': 'Já existe uma empresa registada com este NIF.',
    'empresa_nome.database.unique': 'Já existe uma empresa registada com este nome.',
    'user_email.database.unique': 'Já existe uma conta com este email.',
    'user_username.database.unique': 'Este nome de utilizador já está a ser usado.',
}

/**
 * Nome do campo tal como o utilizador o vê, para o `{{ field }}` das mensagens.
 *
 * Sem isto, um erro de validação do registo chega ao ecrã como "O formato do
 * campo empresa_company_alias é inválido" — o nome da chave do payload, que
 * desenha a API a quem só quer saber que linha do formulário corrigir. O
 * frontend tem o mesmo mapa como última rede (src/lib/mensagens-erro.ts), mas o
 * sítio certo para o texto nascer correcto é aqui.
 */
export const fields = {
    // Registo de empresa (payload plano — ver empresa_validator.ts)
    user_username: 'nome de utilizador',
    user_email: 'email',
    user_password: 'palavra-passe',
    dados_nome: 'nome',
    dados_sobrenome: 'sobrenome',
    dados_foto: 'fotografia',
    empresa_nif: 'NIF',
    empresa_company_alias: 'nome curto da empresa',
    empresa_nome: 'nome da empresa',
    empresa_contacto: 'contacto',
    empresa_localizacao: 'localização',
    empresa_tamanho: 'dimensão da empresa',
    empresa_regime_iva: 'regime de IVA',
    ramo: 'ramo de actuação',

    // Transversais
    company_alias: 'nome curto da empresa',
    uid: 'email ou nome de utilizador',
    username: 'nome de utilizador',
    password: 'palavra-passe',
    senha: 'palavra-passe',
    nome: 'nome',
    sobrenome: 'sobrenome',
    razao_social: 'razão social',
    nome_fantasia: 'nome comercial',
    descricao: 'descrição',
    telefone: 'telefone',
    telefone_secundario: 'telefone alternativo',
    contacto: 'contacto',
    endereco: 'endereço',
    localizacao: 'localização',
    codigo_postal: 'código postal',
    data_nascimento: 'data de nascimento',
    genero: 'género',
    estado_civil: 'estado civil',
    profissao: 'profissão',
    observacao: 'observação',

    // Produtos e stock
    produto_id: 'produto',
    lote_id: 'lote',
    lote_produto_id: 'lote',
    marca_id: 'marca',
    formato_id: 'formato',
    fabricante_id: 'fabricante',
    fornecedor_id: 'fornecedor',
    produto_categoria_id: 'categoria',
    is_service: 'tipo (produto ou serviço)',
    disponivel: 'disponibilidade',
    quantidade: 'quantidade',
    quantidade_em_estoque: 'quantidade em stock',
    preco_compra: 'preço de compra',
    preco_venda: 'preço de venda',
    preco_unitario: 'preço unitário',
    data_fabrico: 'data de fabrico',
    data_validade: 'data de validade',
    qr_code: 'código de barras',
    media: 'imagens',
    propriedade: 'característica',
    descricao_detalhada: 'detalhe',

    // Vendas, caixa e pagamentos
    venda_id: 'venda',
    venda_item_id: 'item da venda',
    caixa_id: 'caixa',
    pos_id: 'ponto de venda',
    cliente_id: 'cliente',
    cliente_presencial_id: 'cliente',
    cliente_online_id: 'cliente',
    metodo_pagamento_id: 'método de pagamento',
    valor: 'valor',
    valor_inicial: 'valor inicial',
    referencia: 'referência',
    motivo: 'motivo',
    data_venda: 'data da venda',
    cupom_codigo: 'código do cupão',
    codigo: 'código',
    desconto: 'desconto',
    validade: 'validade',

    // Acessos
    user_id: 'utilizador',
    papel: 'perfil',
    papel_id: 'perfil',
    permissoes: 'permissões',
    ativo: 'estado',
    data_despesa: 'data da despesa',
}

vine.messagesProvider = new SimpleMessagesProvider(messages, fields)