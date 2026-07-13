-- --------------------------------------------------------
-- Anfitrião:                    127.0.0.1
-- Versão do servidor:           8.0.30 - MySQL Community Server - GPL
-- SO do servidor:               Win64
-- HeidiSQL Versão:              12.1.0.6537
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- A despejar estrutura da base de dados para controle_estoque
CREATE DATABASE IF NOT EXISTS `controle_estoque` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `controle_estoque`;

-- A despejar estrutura para tabela controle_estoque.adonis_schema
CREATE TABLE IF NOT EXISTS `adonis_schema` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `batch` int NOT NULL,
  `migration_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.adonis_schema: ~0 rows (aproximadamente)
DELETE FROM `adonis_schema`;
INSERT INTO `adonis_schema` (`id`, `name`, `batch`, `migration_time`) VALUES
	(1, 'database/migrations/1-Produtos', 1, '2024-08-24 17:41:22'),
	(2, 'database/migrations/2-Users', 1, '2024-08-24 17:41:22'),
	(3, 'database/migrations/3-ProdutoValidade', 1, '2024-08-24 17:41:22'),
	(4, 'database/migrations/4-Estoque', 1, '2024-08-24 17:41:22'),
	(5, 'database/migrations/5-ProdutoContraindicacoes', 1, '2024-08-24 17:41:22'),
	(6, 'database/migrations/7-ProdutoDescricao', 1, '2024-08-24 17:41:22'),
	(7, 'database/migrations/8-ProdutoImagens', 1, '2024-08-24 17:41:22'),
	(8, 'database/migrations/8-ProdutoRecomendacoes', 1, '2024-08-24 17:41:22'),
	(9, 'database/migrations/9-Vendas', 1, '2024-08-24 17:41:22'),
	(10, 'database/migrations/10-VendaItens', 1, '2024-08-24 17:41:22');

-- A despejar estrutura para tabela controle_estoque.adonis_schema_versions
CREATE TABLE IF NOT EXISTS `adonis_schema_versions` (
  `version` int unsigned NOT NULL,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.adonis_schema_versions: ~0 rows (aproximadamente)
DELETE FROM `adonis_schema_versions`;
INSERT INTO `adonis_schema_versions` (`version`) VALUES
	(2);

-- A despejar estrutura para tabela controle_estoque.auth_access_tokens
CREATE TABLE IF NOT EXISTS `auth_access_tokens` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tokenable_id` int unsigned NOT NULL,
  `type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `abilities` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `auth_access_tokens_tokenable_id_foreign` (`tokenable_id`) USING BTREE,
  CONSTRAINT `auth_access_tokens_tokenable_id_foreign` FOREIGN KEY (`tokenable_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.auth_access_tokens: ~12 rows (aproximadamente)
DELETE FROM `auth_access_tokens`;
INSERT INTO `auth_access_tokens` (`id`, `tokenable_id`, `type`, `name`, `hash`, `abilities`, `created_at`, `updated_at`, `last_used_at`, `expires_at`) VALUES
	(3, 21, 'auth_token', NULL, '88889118f48295a4578ec5521c1dedd64c3fc965d3296f6011b23c6a087ced20', '["*"]', '2024-09-27 13:07:36', '2024-09-27 13:07:36', NULL, '2024-10-27 13:07:36'),
	(4, 21, 'auth_token', NULL, '8096ebc6e65966ec984fbad989602466d02ddc9c0d0d1106696c059f7557ef12', '["*"]', '2024-09-27 13:57:57', '2024-09-27 13:57:57', NULL, '2024-10-27 13:57:57'),
	(5, 21, 'auth_token', NULL, '7928b91e15289174faf789f30fd12593ac48d2b527344bc586f9d345218e11fc', '["*"]', '2024-09-28 10:07:00', '2024-09-28 10:07:00', NULL, '2024-10-28 10:07:00'),
	(6, 21, 'auth_token', NULL, 'f6d662f38959b8b6c937795f3313e7ea11bc60aea79f31e342d21438d4ea23e0', '["*"]', '2024-09-28 10:13:53', '2024-09-28 10:13:53', NULL, '2024-10-28 10:13:53'),
	(7, 21, 'auth_token', NULL, 'f050b2196e2756f9c860d8ea11767c0a9a4282c3129c21cf4c9acbf1128fe33b', '["*"]', '2024-09-28 10:34:37', '2024-09-28 10:34:37', NULL, '2024-10-28 10:34:37'),
	(8, 21, 'auth_token', NULL, '0128d5ddbc244993c89fc2f4c30b16753894f7ccb175b95aeec91fe02fe2bda8', '["*"]', '2024-09-28 10:40:52', '2024-09-28 10:40:52', NULL, '2024-10-28 10:40:52'),
	(9, 22, 'auth_token', NULL, 'cabf84ab71153a4bffe4d502274279c7595f4341d9d9504a9103a872fc5cbd4d', '["*"]', '2024-09-28 10:44:55', '2024-09-28 10:44:55', NULL, '2024-10-28 10:44:55'),
	(10, 22, 'auth_token', NULL, 'ff12922727f3aa2de254d2526b18c8c6524ba6ddcb8081fe81613fd8e6c0c10c', '["*"]', '2024-09-28 11:00:29', '2024-09-28 11:00:29', NULL, '2024-10-28 11:00:29'),
	(11, 22, 'auth_token', NULL, '9fa7f73743420a452bbc8def4348964e066e7aa4ce3b55f111be1a52ce1ef8d0', '["*"]', '2024-09-28 11:11:18', '2024-09-28 11:11:18', NULL, '2024-10-28 11:11:18'),
	(12, 22, 'auth_token', NULL, 'fc45d22458972d6432c7d86fb8464927029c126b7c3907d91fbbf51c6c7f14aa', '["*"]', '2024-09-28 11:15:51', '2024-09-28 11:15:51', NULL, '2024-10-28 11:15:51'),
	(13, 22, 'auth_token', NULL, '28e8f6bf174b7618ab4cb4b23f49fd3dd2a3287170fb019ff3d4bbd7d6b79a7b', '["*"]', '2024-09-28 11:48:56', '2024-09-28 11:48:56', NULL, '2024-10-28 11:48:56'),
	(14, 22, 'auth_token', NULL, '1d2ea54089af5a1023833c8c4075cba0c8bf27ae972ea045b0275e15a274beea', '["*"]', '2024-09-28 11:59:05', '2024-09-28 11:59:05', NULL, '2024-10-28 11:59:05');

-- A despejar estrutura para tabela controle_estoque.estoque
CREATE TABLE IF NOT EXISTS `estoque` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `produto_validade_id` int unsigned DEFAULT NULL,
  `quantidade` int NOT NULL,
  `tipo_movimentacao` enum('entrada','retirada') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'entrada',
  `motivo_retirada` text,
  `data_registro` datetime NOT NULL,
  `registrado_por` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `estoque_produto_validade_id_foreign` (`produto_validade_id`),
  KEY `estoque_registrado_por_foreign` (`registrado_por`),
  CONSTRAINT `estoque_produto_validade_id_foreign` FOREIGN KEY (`produto_validade_id`) REFERENCES `produto_validade` (`id`) ON DELETE CASCADE,
  CONSTRAINT `estoque_registrado_por_foreign` FOREIGN KEY (`registrado_por`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.estoque: ~15 rows (aproximadamente)
DELETE FROM `estoque`;
INSERT INTO `estoque` (`id`, `produto_validade_id`, `quantidade`, `tipo_movimentacao`, `motivo_retirada`, `data_registro`, `registrado_por`) VALUES
	(29, 37, 50, 'entrada', NULL, '2024-08-01 10:00:00', 10),
	(30, 38, 30, 'entrada', NULL, '2024-08-01 11:00:00', 13),
	(31, 39, 10, 'retirada', 'Venda para cliente João', '2024-08-01 12:00:00', 10),
	(32, 40, 5, 'retirada', 'Produto com validade expirada', '2024-08-02 09:00:00', 12),
	(33, 41, 20, 'entrada', NULL, '2024-08-02 10:00:00', 14),
	(34, 42, 40, 'retirada', 'Venda para cliente Maria', '2024-08-02 14:00:00', 10),
	(35, 43, 15, 'entrada', NULL, '2024-08-03 09:00:00', 15),
	(36, 44, 25, 'retirada', 'Produto danificado', '2024-08-03 15:00:00', 13),
	(37, 45, 60, 'entrada', NULL, '2024-08-04 10:00:00', 16),
	(38, 46, 12, 'retirada', 'Venda para cliente Pedro', '2024-08-04 16:00:00', 12),
	(39, 47, 45, 'entrada', NULL, '2024-08-05 09:00:00', 17),
	(40, 48, 18, 'retirada', 'Produto com validade expirada', '2024-08-05 14:00:00', 14),
	(41, 49, 30, 'entrada', NULL, '2024-08-06 11:00:00', 10),
	(42, 50, 35, 'retirada', 'Venda para cliente Ana', '2024-08-06 13:00:00', 10),
	(43, 51, 50, 'entrada', NULL, '2024-08-07 09:00:00', 12);

-- A despejar estrutura para tabela controle_estoque.produtos
CREATE TABLE IF NOT EXISTS `produtos` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(255) NOT NULL,
  `descricao` text,
  `preco` decimal(10,2) NOT NULL COMMENT 'preço aquisição!',
  `qr_code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'None',
  PRIMARY KEY (`id`),
  UNIQUE KEY `nome` (`nome`)
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.produtos: ~11 rows (aproximadamente)
DELETE FROM `produtos`;
INSERT INTO `produtos` (`id`, `nome`, `descricao`, `preco`, `qr_code`) VALUES
	(37, 'Paracetamol', 'Analgésico e antipirético', 10.50, 'QR12345'),
	(38, 'Ibuprofeno', 'Anti-inflamatório e analgésico', 12.00, 'QR12346'),
	(39, 'Dipirona', 'Analgésico e antipirético', 8.30, 'QR12347'),
	(40, 'Omeprazol', 'Inibidor de bomba de prótons', 15.00, 'QR12348'),
	(41, 'Amoxicilina', 'Antibiótico', 25.50, 'QR12349'),
	(42, 'Loratadina', 'Antialérgico', 5.00, 'QR12350'),
	(43, 'Cetirizina', 'Antialérgico', 6.50, 'QR12351'),
	(44, 'Aspirina', 'Anti-inflamatório e antiplaquetário', 3.20, 'QR12352'),
	(45, 'Vitamina C', 'Suplemento vitamínico', 7.90, 'QR12353'),
	(46, 'Fluconazol', 'Antifúngico', 20.00, 'QR12354'),
	(47, 'centrum mulher', 'Anti-hipertenço', 200000.00, 'None');

-- A despejar estrutura para tabela controle_estoque.produto_contraindicacoes
CREATE TABLE IF NOT EXISTS `produto_contraindicacoes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `produto_id` int unsigned DEFAULT NULL,
  `contraindicacao` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `produto_contraindicacoes_produto_id_foreign` (`produto_id`),
  CONSTRAINT `produto_contraindicacoes_produto_id_foreign` FOREIGN KEY (`produto_id`) REFERENCES `produtos` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.produto_contraindicacoes: ~10 rows (aproximadamente)
DELETE FROM `produto_contraindicacoes`;
INSERT INTO `produto_contraindicacoes` (`id`, `produto_id`, `contraindicacao`) VALUES
	(11, 37, 'Contraindicado para pacientes com alergia a ácido acetilsalicílico.'),
	(12, 38, 'Não utilizar em feridas profundas ou queimaduras de segundo e terceiro grau.'),
	(13, 39, 'Contraindicado para pessoas com alergia a antihistamínicos.'),
	(14, 40, 'Não indicado para pessoas com histórico de cálculos renais.'),
	(15, 41, 'Evitar o uso em áreas com feridas abertas ou pele irritada.'),
	(16, 42, 'Contraindicado para pacientes com hipertensão arterial não controlada.'),
	(17, 43, 'Não recomendado para crianças menores de 2 anos sem orientação médica.'),
	(18, 44, 'Contraindicado para pessoas com hipercalcemia.'),
	(19, 45, 'Evitar o uso em pele gravemente queimada ou irritada.'),
	(20, 46, 'Contraindicado para pacientes com rinite alérgica severa.');

-- A despejar estrutura para tabela controle_estoque.produto_descricao
CREATE TABLE IF NOT EXISTS `produto_descricao` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `produto_id` int unsigned DEFAULT NULL,
  `descricao_detalhada` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `produto_descricao_produto_id_foreign` (`produto_id`),
  CONSTRAINT `produto_descricao_produto_id_foreign` FOREIGN KEY (`produto_id`) REFERENCES `produtos` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.produto_descricao: ~10 rows (aproximadamente)
DELETE FROM `produto_descricao`;
INSERT INTO `produto_descricao` (`id`, `produto_id`, `descricao_detalhada`) VALUES
	(11, 37, 'Medicamento utilizado para tratamento de dores de cabeça e febre. Uso adulto.'),
	(12, 38, 'Pomada cicatrizante de uso tópico para tratar queimaduras leves e cortes superficiais.'),
	(13, 39, 'Antialérgico de uso oral para aliviar sintomas de alergias, como espirros e coceira.'),
	(14, 40, 'Vitamina C efervescente para melhorar a imunidade. Sabor laranja.'),
	(15, 41, 'Creme hidratante para peles secas, recomendado para uso diário.'),
	(16, 42, 'Xarope para alívio de tosse e desconforto respiratório.'),
	(17, 43, 'Analgésico de uso infantil para febre e dor leve a moderada.'),
	(18, 44, 'Suplemento de cálcio para fortalecer ossos e dentes. Uso diário.'),
	(19, 45, 'Gel de aloe vera para aliviar irritações na pele e queimaduras solares.'),
	(20, 46, 'Spray nasal para descongestionamento das vias respiratórias. Uso adulto e infantil.');

-- A despejar estrutura para tabela controle_estoque.produto_imagens
CREATE TABLE IF NOT EXISTS `produto_imagens` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `produto_id` int unsigned DEFAULT NULL,
  `imagem_url` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `produto_imagens_produto_id_foreign` (`produto_id`),
  CONSTRAINT `produto_imagens_produto_id_foreign` FOREIGN KEY (`produto_id`) REFERENCES `produtos` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.produto_imagens: ~10 rows (aproximadamente)
DELETE FROM `produto_imagens`;
INSERT INTO `produto_imagens` (`id`, `produto_id`, `imagem_url`) VALUES
	(11, 37, 'https://farmacia.com/imagens/produtos/paracetamol.jpg'),
	(12, 38, 'https://farmacia.com/imagens/produtos/ibuprofeno.jpg'),
	(13, 39, 'https://farmacia.com/imagens/produtos/dipirona.jpg'),
	(14, 40, 'https://farmacia.com/imagens/produtos/omeprazol.jpg'),
	(15, 41, 'https://farmacia.com/imagens/produtos/amoxicilina.jpg'),
	(16, 42, 'https://farmacia.com/imagens/produtos/loratadina.jpg'),
	(17, 43, 'https://farmacia.com/imagens/produtos/cetirizina.jpg'),
	(18, 44, 'https://farmacia.com/imagens/produtos/aspirina.jpg'),
	(19, 45, 'https://farmacia.com/imagens/produtos/vitamina_c.jpg'),
	(20, 46, 'https://farmacia.com/imagens/produtos/fluconazol.jpg');

-- A despejar estrutura para tabela controle_estoque.produto_recomendacoes
CREATE TABLE IF NOT EXISTS `produto_recomendacoes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `produto_id` int unsigned DEFAULT NULL,
  `recomendacao` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `produto_recomendacoes_produto_id_foreign` (`produto_id`),
  CONSTRAINT `produto_recomendacoes_produto_id_foreign` FOREIGN KEY (`produto_id`) REFERENCES `produtos` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.produto_recomendacoes: ~10 rows (aproximadamente)
DELETE FROM `produto_recomendacoes`;
INSERT INTO `produto_recomendacoes` (`id`, `produto_id`, `recomendacao`) VALUES
	(11, 37, 'Indicado para aliviar dores de cabeça, febre e mal-estar geral.'),
	(12, 38, 'Recomendado para cicatrização de pequenos cortes e queimaduras.'),
	(13, 39, 'Indicado para aliviar sintomas de alergias, como coceira e coriza.'),
	(14, 40, 'Recomendado para fortalecer o sistema imunológico.'),
	(15, 41, 'Indicado para hidratação de peles secas e ressecadas.'),
	(16, 42, 'Recomendado para alívio de tosse seca e produtiva.'),
	(17, 43, 'Indicado para crianças com febre e dores leves.'),
	(18, 44, 'Recomendado para suprir a falta de cálcio no organismo.'),
	(19, 45, 'Indicado para tratamento de irritações leves na pele e queimaduras solares.'),
	(20, 46, 'Recomendado para alívio imediato de congestão nasal.');

-- A despejar estrutura para tabela controle_estoque.produto_validade
CREATE TABLE IF NOT EXISTS `produto_validade` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `produto_id` int unsigned NOT NULL,
  `data_validade` date NOT NULL,
  `quantidade_em_estoque` int NOT NULL,
  `preco_venda` decimal(20,6) DEFAULT '0.000000',
  PRIMARY KEY (`id`),
  KEY `produto_validade_produto_id_foreign` (`produto_id`),
  CONSTRAINT `produto_validade_produto_id_foreign` FOREIGN KEY (`produto_id`) REFERENCES `produtos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.produto_validade: ~15 rows (aproximadamente)
DELETE FROM `produto_validade`;
INSERT INTO `produto_validade` (`id`, `produto_id`, `data_validade`, `quantidade_em_estoque`, `preco_venda`) VALUES
	(37, 37, '2025-07-01', 100, 122.000000),
	(38, 38, '2024-12-01', 150, 122.000000),
	(39, 39, '2025-01-01', 80, 122.000000),
	(40, 40, '2026-03-15', 200, 122.000000),
	(41, 41, '2024-10-20', 60, 122.000000),
	(42, 42, '2025-02-28', 120, 122.000000),
	(43, 43, '2025-08-05', 90, 122.000000),
	(44, 44, '2023-11-01', 110, 122.000000),
	(45, 45, '2026-01-01', 85, 122.000000),
	(46, 46, '2024-05-15', 70, 122.000000),
	(47, 37, '2025-12-01', 50, 122.000000),
	(48, 38, '2024-09-20', 130, 122.000000),
	(49, 39, '2025-02-10', 45, 122.000000),
	(50, 40, '2026-06-20', 180, 122.000000),
	(51, 41, '2025-03-30', 95, 122.000000),
	(52, 39, '2025-05-21', 23, 122.000000);

-- A despejar estrutura para tabela controle_estoque.users
CREATE TABLE IF NOT EXISTS `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `telefone` varchar(255) DEFAULT NULL,
  `tipo` enum('vendedor','administrador','estoquista') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'estoquista',
  `password` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.users: ~11 rows (aproximadamente)
DELETE FROM `users`;
INSERT INTO `users` (`id`, `nome`, `email`, `telefone`, `tipo`, `password`) VALUES
	(10, 'Humberto silva 01', 'joao.silva@email.com', '921708584', 'vendedor', NULL),
	(11, 'Maria Oliveira', 'maria.oliveira@email.com', '11987654322', 'administrador', NULL),
	(12, 'Carlos Pereira', 'carlos.pereira@email.com', '11987654323', 'estoquista', NULL),
	(13, 'Humberto silva 01', 'ana.souza@email.com', '921708584', 'vendedor', NULL),
	(14, 'Pedro Lima', 'pedro.lima@email.com', '11987654325', 'administrador', NULL),
	(15, 'Luiza Almeida', 'luiza.almeida@email.com', '11987654326', 'estoquista', NULL),
	(16, 'Humberto silva 01', 'felipe.rocha@email.com', '921708584', 'vendedor', NULL),
	(17, 'Beatriz Santos', 'beatriz.santos@email.com', '11987654328', 'estoquista', NULL),
	(18, 'Humberto silva 01', 'fernando.gomes@email.com', '921708584', 'vendedor', NULL),
	(19, 'Patrícia Costa', 'patricia.costa@email.com', '11987654330', 'administrador', NULL),
	(20, 'Humberto silva', 'humbertosilva@gmail.com', '921708584', 'administrador', '$scrypt$n=16384,r=8,p=1$+CXuiganD79BBsJyUoWclg$UNhib6XZHHkAO6/UOMK0eGVPyievhq1MVN8FO4GTRaqfjeb0585sryXrVnhohYXStNI6IKzj7tssV6VOhbgusg'),
	(21, 'jacqlin', 'jacqlin@gmail.com', NULL, 'administrador', '$scrypt$n=16384,r=8,p=1$b5WQnDCPUS189kiK14VRVA$0d5Kr9pEYQHLxY9Q5dWQ6KKHX0KHEEEnaEb3/B09/Cz1KzrrNglE4O6uW995pMpgA4Qlrq0CbQzjPBrrQKA6KQ'),
	(22, 'Paulina Luindula', 'paulina@luindula.com', '927835746', 'administrador', '$scrypt$n=16384,r=8,p=1$/GzJaMWqR786u0qX6nm7Sg$8CIo7WOz5zaZh9vjbSX592nprte/Ldg0mXY424CtpE9BlhQ8+En36oPmZMV/pdpNHzoixsgAapVfxJWEauwp9w');

-- A despejar estrutura para tabela controle_estoque.vendas
CREATE TABLE IF NOT EXISTS `vendas` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `vendedor_id` int unsigned DEFAULT NULL,
  `data_venda` datetime NOT NULL,
  `total` decimal(10,2) DEFAULT NULL,
  `fechado` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `vendas_vendedor_id_foreign` (`vendedor_id`),
  CONSTRAINT `vendas_vendedor_id_foreign` FOREIGN KEY (`vendedor_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.vendas: ~19 rows (aproximadamente)
DELETE FROM `vendas`;
INSERT INTO `vendas` (`id`, `vendedor_id`, `data_venda`, `total`, `fechado`) VALUES
	(16, 10, '2024-08-01 10:30:00', 33.00, 1),
	(17, 12, '2024-08-02 11:15:00', 46.60, 1),
	(18, 13, '2024-08-03 14:45:00', 91.50, 1),
	(19, 10, '2024-08-04 09:00:00', 22.70, 1),
	(20, 12, '2024-08-05 15:10:00', 55.60, 1),
	(21, 13, '2024-08-06 17:30:00', 43.50, 1),
	(22, 10, '2024-08-07 12:20:00', 34.90, 1),
	(23, 12, '2024-08-08 16:40:00', 107.00, 1),
	(24, 13, '2024-08-09 13:50:00', 27.70, 1),
	(25, 10, '2024-08-10 10:10:00', 43.60, 1),
	(26, 12, '2024-08-11 08:30:00', 45.00, 1),
	(27, 13, '2024-08-12 14:55:00', 31.90, 1),
	(28, 10, '2024-08-13 18:15:00', 40.50, 1),
	(29, 12, '2024-08-14 09:45:00', 27.00, 1),
	(30, 13, '2024-08-15 15:30:00', 23.70, 1),
	(31, 21, '2024-09-28 12:33:54', 610.00, 1),
	(32, 22, '2024-09-28 13:36:24', 3050.00, 1),
	(33, 22, '2024-09-28 13:51:30', 2318.00, 1),
	(34, 22, '2024-09-28 13:56:40', 2440.00, 1);

-- A despejar estrutura para tabela controle_estoque.venda_itens
CREATE TABLE IF NOT EXISTS `venda_itens` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `venda_id` int unsigned DEFAULT NULL,
  `produto_validade_id` int unsigned DEFAULT NULL,
  `quantidade` int NOT NULL,
  `preco_unitario` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `venda_itens_venda_id_foreign` (`venda_id`),
  KEY `venda_itens_produto_validade_id_foreign` (`produto_validade_id`),
  CONSTRAINT `venda_itens_produto_validade_id_foreign` FOREIGN KEY (`produto_validade_id`) REFERENCES `produto_validade` (`id`),
  CONSTRAINT `venda_itens_venda_id_foreign` FOREIGN KEY (`venda_id`) REFERENCES `vendas` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=71 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A despejar dados para tabela controle_estoque.venda_itens: ~40 rows (aproximadamente)
DELETE FROM `venda_itens`;
INSERT INTO `venda_itens` (`id`, `venda_id`, `produto_validade_id`, `quantidade`, `preco_unitario`) VALUES
	(31, 16, 37, 2, 10.50),
	(32, 16, 37, 1, 12.00),
	(33, 17, 38, 1, 8.30),
	(34, 17, 39, 2, 15.00),
	(35, 18, 40, 1, 25.50),
	(36, 18, 41, 3, 5.00),
	(37, 19, 42, 2, 6.50),
	(38, 20, 43, 1, 3.20),
	(39, 21, 44, 4, 7.90),
	(40, 22, 45, 2, 20.00),
	(41, 23, 37, 3, 10.50),
	(42, 24, 38, 1, 12.00),
	(43, 25, 39, 2, 8.30),
	(44, 25, 40, 1, 15.00),
	(45, 26, 41, 3, 25.50),
	(46, 27, 42, 4, 5.00),
	(47, 28, 43, 1, 6.50),
	(48, 29, 44, 3, 3.20),
	(49, 30, 45, 2, 7.90),
	(50, 30, 46, 1, 20.00),
	(51, 30, 37, 1, 10.50),
	(52, 30, 38, 3, 12.00),
	(53, 30, 39, 1, 8.30),
	(54, 30, 40, 2, 15.00),
	(55, 30, 41, 1, 25.50),
	(56, 30, 42, 3, 5.00),
	(57, 30, 43, 2, 6.50),
	(58, 30, 44, 4, 3.20),
	(59, 30, 45, 2, 7.90),
	(60, 30, 46, 1, 20.00),
	(61, 31, 37, 1, 122.00),
	(62, 31, 38, 1, 122.00),
	(63, 31, 52, 2, 122.00),
	(64, 31, 39, 1, 122.00),
	(65, 32, 37, 1, 122.00),
	(66, 32, 40, 11, 122.00),
	(67, 32, 38, 13, 122.00),
	(68, 33, 37, 19, 122.00),
	(69, 34, 37, 3, 122.00),
	(70, 34, 39, 17, 122.00);

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
