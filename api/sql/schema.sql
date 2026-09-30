-- Esquema de Creaty Site — formulario de contacto
-- Base de datos AISLADA: no comparte tablas ni usuarios con las demas apps del servidor.

CREATE DATABASE IF NOT EXISTS `creaty_site`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `creaty_site`;

CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`        VARCHAR(120)  NOT NULL,
  `email`         VARCHAR(190)  NOT NULL,
  `telefono`      VARCHAR(40)   NULL,
  `interes`       VARCHAR(60)   NOT NULL,
  `mensaje`       TEXT          NOT NULL,
  `estado`        ENUM('nuevo','leido','respondido','archivado') NOT NULL DEFAULT 'nuevo',
  `origen`        VARCHAR(40)   NULL COMMENT 'Host de la peticion, p.ej. preview.creaty.fun',
  `ip`            VARCHAR(45)   NULL COMMENT 'IPv4 o IPv6 (45 chars)',
  `user_agent`    VARCHAR(255)  NULL,
  `creado_en`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `respondido_en` TIMESTAMP     NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_estado_creado` (`estado`, `creado_en`),
  KEY `idx_email` (`email`),
  KEY `idx_creado_en` (`creado_en`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Registro de intentos, para detectar spam/abuso y auditar el rate limit.
CREATE TABLE IF NOT EXISTS `rate_events` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip`         VARCHAR(45)  NOT NULL,
  `ruta`       VARCHAR(64)  NOT NULL,
  `creado_en`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ip_creado` (`ip`, `creado_en`),
  KEY `idx_ip_ruta_creado` (`ip`, `ruta`, `creado_en`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
