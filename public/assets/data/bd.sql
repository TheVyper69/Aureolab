-- ============================================================
-- BASE DE DATOS COMPLETA (MySQL) - POS Laboratorio Lentes
-- Incluye:
-- - Roles y usuarios (admin/employee/optica)
-- - Ópticas + métodos de pago permitidos
-- - Catálogo de productos + categorías + proveedores
-- - MICAS y LENTES DE CONTACTO con graduación
-- - Variantes por graduación (stock por graduación) ✅ recomendado
-- - Inventario (por producto) + Inventario por variante
-- - Ventas POS + detalle (items)
-- - Pedidos de Ópticas + detalle (items) + estatus
-- - Movimientos de inventario
-- ============================================================

-- (Opcional) Limpieza total:
-- DROP DATABASE IF EXISTS pos_laboratorio_lentes;

CREATE DATABASE IF NOT EXISTS pos_laboratorio_lentes
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pos_laboratorio_lentes;

-- ============================================================
-- 1) CATÁLOGOS BÁSICOS
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(32) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT INTO roles (name) VALUES ('admin'), ('employee'), ('optica')
ON DUPLICATE KEY UPDATE name = VALUES(name);

CREATE TABLE IF NOT EXISTS payment_methods (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,  -- cash, transfer, card
  label VARCHAR(60) NOT NULL
) ENGINE=InnoDB;

INSERT INTO payment_methods (code,label) VALUES
('cash','Efectivo'),
('transfer','Transferencia'),
('card','Tarjeta')
ON DUPLICATE KEY UPDATE label = VALUES(label);

CREATE TABLE IF NOT EXISTS order_statuses (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,  -- en_proceso, pagado, completado
  label VARCHAR(60) NOT NULL
) ENGINE=InnoDB;

INSERT INTO order_statuses (code,label) VALUES
('en_proceso','En proceso'),
('pagado','Pagado'),
('completado','Completado')
ON DUPLICATE KEY UPDATE label = VALUES(label);

CREATE TABLE IF NOT EXISTS categories (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL UNIQUE,  -- MICAS, LENTES_CONTACTO, ARMAZONES, ACCESORIOS
  name VARCHAR(80) NOT NULL
) ENGINE=InnoDB;

INSERT INTO categories (code,name) VALUES
('MICAS','Micas'),
('LENTES_CONTACTO','Lentes de Contacto'),
('ARMAZONES','Armazones'),
('ACCESORIOS','Accesorios')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ============================================================
-- 2) USUARIOS
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id TINYINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(40) NULL,
  password_hash VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

-- ============================================================
-- 3) ÓPTICAS (B2B)
-- - Se liga opcionalmente a un user con role 'optica'
-- ============================================================

CREATE TABLE IF NOT EXISTS opticas (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL UNIQUE,
  nombre VARCHAR(160) NOT NULL,
  contacto VARCHAR(160) NULL,
  telefono VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_opticas_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS optica_payment_methods (
  optica_id BIGINT UNSIGNED NOT NULL,
  payment_method_id TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (optica_id, payment_method_id),
  CONSTRAINT fk_opm_optica FOREIGN KEY (optica_id) REFERENCES opticas(id) ON DELETE CASCADE,
  CONSTRAINT fk_opm_pm FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- 4) PROVEEDORES
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  notes TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 5) PRODUCTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  category_id SMALLINT UNSIGNED NOT NULL,

  -- Clasificadores generales
  type VARCHAR(60) NULL,            -- monofocal/bifocal/progresivo, diario/mensual/anual, etc.
  brand VARCHAR(90) NULL,
  model VARCHAR(90) NULL,
  material VARCHAR(90) NULL,
  size VARCHAR(40) NULL,            -- pequeño/mediano/grande

  -- Precios/stock objetivo
  buy_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  sale_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  max_stock INT NULL,

  supplier_id BIGINT UNSIGNED NULL,
  image_url VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 6) TABLAS ESPECÍFICAS POR CATEGORÍA (CATÁLOGO)
-- (Aquí guardas info típica del producto, NO stock por graduación)
-- ============================================================

-- MICAS (graduación ampliada)
CREATE TABLE IF NOT EXISTS product_micas (
  product_id BIGINT UNSIGNED PRIMARY KEY,

  -- Graduación típica
  esferico  VARCHAR(20) NULL,    -- SPH
  cilindrico VARCHAR(20) NULL,   -- CYL
  eje       VARCHAR(20) NULL,    -- AXIS

  add_power VARCHAR(20) NULL,    -- ADD
  prisma    VARCHAR(20) NULL,    -- PRISMA
  base_dir  VARCHAR(20) NULL,    -- BASE

  lente_tipo ENUM('monofocal','bifocal','progresivo') NULL,
  indice VARCHAR(40) NULL,       -- alto índice, etc.

  CONSTRAINT fk_micas_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- LENTES DE CONTACTO (parámetros típicos)
CREATE TABLE IF NOT EXISTS product_contact_lenses (
  product_id BIGINT UNSIGNED PRIMARY KEY,

  -- Graduación/parametría
  sph VARCHAR(20) NULL,
  cyl VARCHAR(20) NULL,
  axis VARCHAR(20) NULL,
  add_power VARCHAR(20) NULL,

  bc  VARCHAR(20) NULL,          -- Base Curve
  dia VARCHAR(20) NULL,          -- Diámetro
  color VARCHAR(40) NULL,        -- Color (si aplica)

  lente_tipo ENUM('diario','mensual','anual') NULL,

  CONSTRAINT fk_cl_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ARMAZONES
CREATE TABLE IF NOT EXISTS product_frames (
  product_id BIGINT UNSIGNED PRIMARY KEY,
  frame_material ENUM('acetato','metal','mixto') NULL,
  frame_size ENUM('pequeño','mediano','grande') NULL,
  CONSTRAINT fk_frames_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 7) INVENTARIO
-- 7.1 Inventario por producto (simple)
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL UNIQUE,
  stock INT NOT NULL DEFAULT 0,
  last_entry_date DATE NULL,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 7.2 Variantes por graduación + inventario por variante ✅
-- Útil cuando un mismo producto tiene múltiples graduaciones con stock diferente
-- ============================================================

CREATE TABLE IF NOT EXISTS product_variants (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,

  variant_type ENUM('micas','contacto') NOT NULL,

  -- Graduación común
  sph VARCHAR(20) NULL,
  cyl VARCHAR(20) NULL,
  axis VARCHAR(20) NULL,
  add_power VARCHAR(20) NULL,

  -- Contacto
  bc VARCHAR(20) NULL,
  dia VARCHAR(20) NULL,
  color VARCHAR(40) NULL,

  -- Micas (opcional)
  prisma VARCHAR(20) NULL,
  base_dir VARCHAR(20) NULL,

  variant_sku VARCHAR(80) NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_variants_product (product_id),
  INDEX idx_variants_type (variant_type),
  INDEX idx_variants_graduation (sph, cyl, axis, add_power)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_variants (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  variant_id BIGINT UNSIGNED NOT NULL UNIQUE,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  max_stock INT NULL,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_variants_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  INDEX idx_inv_variants_stock (stock)
) ENGINE=InnoDB;

-- Movimientos de inventario (para auditoría)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,

  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,

  movement_type ENUM('in','out','adjust') NOT NULL,
  qty INT NOT NULL,

  reference_type ENUM('sale','optica_order','manual') NOT NULL DEFAULT 'manual',
  reference_id BIGINT UNSIGNED NULL,

  note VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_im_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_im_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  CONSTRAINT fk_im_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_im_product (product_id),
  INDEX idx_im_variant (variant_id),
  INDEX idx_im_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- 8) VENTAS POS (MOSTRADOR)
-- ============================================================

CREATE TABLE IF NOT EXISTS sales (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sold_by BIGINT UNSIGNED NULL,                 -- admin/employee
  customer_name VARCHAR(160) NULL,

  payment_method_id TINYINT UNSIGNED NOT NULL,  -- cash/card/transfer
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sales_user FOREIGN KEY (sold_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_pm FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),

  INDEX idx_sales_created_at (created_at),
  INDEX idx_sales_sold_by (sold_by)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sale_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,              -- si vendes por graduación
  qty INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,

  CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_sale_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,

  INDEX idx_sale_items_sale (sale_id),
  INDEX idx_sale_items_product (product_id),
  INDEX idx_sale_items_variant (variant_id)
) ENGINE=InnoDB;

-- ============================================================
-- 9) PEDIDOS DE ÓPTICAS (B2B)
-- ============================================================

CREATE TABLE IF NOT EXISTS optica_orders (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,

  optica_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,         -- user role optica
  status_id TINYINT UNSIGNED NOT NULL,             -- en_proceso/pagado/completado

  payment_method_id TINYINT UNSIGNED NOT NULL,     -- cash/transfer (validar en backend)
  notes VARCHAR(255) NULL,

  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_oo_optica FOREIGN KEY (optica_id) REFERENCES opticas(id),
  CONSTRAINT fk_oo_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_oo_status FOREIGN KEY (status_id) REFERENCES order_statuses(id),
  CONSTRAINT fk_oo_pm FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),

  INDEX idx_optica_orders_created_at (created_at),
  INDEX idx_optica_orders_optica (optica_id),
  INDEX idx_optica_orders_status (status_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS optica_order_items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  optica_order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,                -- si el pedido es por graduación
  qty INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,

  CONSTRAINT fk_oi_order FOREIGN KEY (optica_order_id) REFERENCES optica_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_oi_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,

  INDEX idx_optica_items_order (optica_order_id),
  INDEX idx_optica_items_product (product_id),
  INDEX idx_optica_items_variant (variant_id)
) ENGINE=InnoDB;

-- ============================================================
-- 10) ÍNDICES EXTRA RECOMENDADOS
-- ============================================================

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_inventory_stock ON inventory(stock);
CREATE INDEX idx_inventory_variants_stock ON inventory_variants(stock);

-- ============================================================
-- NOTAS IMPORTANTES (para tu backend)
-- ============================================================
-- 1) Para pedidos de óptica:
--    - Validar que payment_method_id exista en optica_payment_methods para esa optica_id.
-- 2) Para ventas/pedidos:
--    - Descontar stock en inventory (por producto) o inventory_variants (por variante),
--      y registrar inventory_movements (out).
-- 3) Para entradas de mercancía:
--    - Aumentar stock y registrar inventory_movements (in).
-- ============================================================
