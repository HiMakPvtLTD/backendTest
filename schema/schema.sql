-- Hi-MAK Website — MySQL/MariaDB schema
-- Run with: mariadb -h127.0.0.1 -uhimak_app -p himak_website < schema/schema.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ─── Blogs ──────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS blog_faqs;
DROP TABLE IF EXISTS blog_key_takeaways;
DROP TABLE IF EXISTS blog_sections;
DROP TABLE IF EXISTS blogs;

CREATE TABLE blogs (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug         VARCHAR(160) NOT NULL,
    title        VARCHAR(320) NOT NULL,
    excerpt      TEXT NOT NULL,
    author       VARCHAR(160) NOT NULL,
    role         VARCHAR(160) DEFAULT NULL,
    date         DATE NOT NULL,
    category     VARCHAR(120) NOT NULL,
    tags         JSON DEFAULT NULL,
    heroImg      VARCHAR(1024) NOT NULL,
    heroAlt      VARCHAR(320) NOT NULL,
    readMinutes  TINYINT UNSIGNED NOT NULL DEFAULT 5,
    status       VARCHAR(20) NOT NULL DEFAULT 'published',
    createdAt    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_blogs_slug (slug),
    KEY idx_blogs_date (date),
    KEY idx_blogs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_sections (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    blog_id      INT UNSIGNED NOT NULL,
    heading      VARCHAR(320) NOT NULL,
    body         TEXT NOT NULL,
    order_index  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_sections_blog (blog_id, order_index),
    CONSTRAINT fk_sections_blog FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_key_takeaways (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    blog_id      INT UNSIGNED NOT NULL,
    text         TEXT NOT NULL,
    order_index  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_takeaways_blog (blog_id, order_index),
    CONSTRAINT fk_takeaways_blog FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_faqs (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    blog_id      INT UNSIGNED NOT NULL,
    question     VARCHAR(500) NOT NULL,
    answer       TEXT NOT NULL,
    order_index  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_faqs_blog (blog_id, order_index),
    CONSTRAINT fk_faqs_blog FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Projects (case studies) ────────────────────────────────────────────

DROP TABLE IF EXISTS projects;

CREATE TABLE projects (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug            VARCHAR(160) NOT NULL,
    title           VARCHAR(320) NOT NULL,
    subtitle        TEXT,
    industry        VARCHAR(120) NOT NULL,
    solution        VARCHAR(120) NOT NULL,
    platform        VARCHAR(120) DEFAULT NULL,
    metric          VARCHAR(240) DEFAULT NULL,
    description     TEXT,
    image           VARCHAR(1024) DEFAULT NULL,
    heroImg         VARCHAR(1024) DEFAULT NULL,
    tags            JSON DEFAULT NULL,
    challenge       TEXT,
    solutionDetail  TEXT,
    scope           JSON DEFAULT NULL,
    differentiators JSON DEFAULT NULL,
    outcomes        JSON DEFAULT NULL,
    techPartners    JSON DEFAULT NULL,
    impact          JSON DEFAULT NULL,
    createdAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_projects_slug (slug),
    KEY idx_projects_industry (industry),
    KEY idx_projects_solution (solution)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Contact / RFQ submissions ──────────────────────────────────────────

DROP TABLE IF EXISTS contact_submissions;

CREATE TABLE contact_submissions (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name           VARCHAR(240) NOT NULL,
    email          VARCHAR(320) NOT NULL,
    phone          VARCHAR(60) DEFAULT NULL,
    company        VARCHAR(240) DEFAULT NULL,
    inquiry_type   VARCHAR(120) DEFAULT NULL,
    project_scope  VARCHAR(500) DEFAULT NULL,
    message        TEXT,
    source         VARCHAR(40) NOT NULL DEFAULT 'rfq',
    createdAt      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_contact_createdAt (createdAt),
    KEY idx_contact_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
