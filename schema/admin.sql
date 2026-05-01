-- Admin table (single-admin, seeded from .env on server startup)
CREATE TABLE IF NOT EXISTS admins (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    email         VARCHAR(320) NOT NULL,
    password_hash VARCHAR(120) NOT NULL,
    createdAt     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
