
-- ============================================================
-- Helper: crear índice si no existe (MySQL compatible)
-- Uso: SET @table='products'; SET @index='idx_products_category'; SET @cols='(category_id)'; CALL sp_create_index_if_not_exists();
-- ============================================================
DROP PROCEDURE IF EXISTS sp_create_index_if_not_exists;
DELIMITER $$
CREATE PROCEDURE sp_create_index_if_not_exists()
BEGIN
  DECLARE idx_count INT DEFAULT 0;
  SELECT COUNT(1) INTO idx_count
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = @table
    AND index_name = @index;

  IF idx_count = 0 THEN
    SET @ddl = CONCAT('CREATE INDEX ', @index, ' ON ', @table, ' ', @cols);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- ============================================================
-- 0) CATÁLOGOS BÁSICOS
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(32) NOT NULL UNIQUE,
  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB;

INSERT INTO roles (name, created_at, updated_at)
VALUES ('admin', NOW(), NOW()), ('employee', NOW(), NOW()), ('optica', NOW(), NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW();

CREATE TABLE IF NOT EXISTS payment_methods (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,  -- cash, transfer, card
  label VARCHAR(60) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB;

INSERT INTO payment_methods (code, label, created_at, updated_at) VALUES
('cash','Efectivo', NOW(), NOW()),
('transfer','Transferencia', NOW(), NOW()),
('card','Tarjeta', NOW(), NOW())
ON DUPLICATE KEY UPDATE label = VALUES(label), updated_at = NOW();

-- ============================================================
-- 1) CATEGORÍAS (CRUD)
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL UNIQUE,  -- MICAS, LENTES_CONTACTO, ARMAZONES, ACCESORIOS, BISEL
  name VARCHAR(80) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB;

INSERT INTO categories (code, name, created_at, updated_at) VALUES
('MICAS','Micas', NOW(), NOW()),
('LENTES_CONTACTO','Lentes de Contacto', NOW(), NOW()),
('ARMAZONES','Armazones', NOW(), NOW()),
('ACCESORIOS','Accesorios', NOW(), NOW()),
('BISEL','Bisel (servicio)', NOW(), NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW();

-- ============================================================
-- 2) ÓPTICAS (B2B)
-- ============================================================

CREATE TABLE IF NOT EXISTS opticas (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,

  nombre VARCHAR(160) NOT NULL,
  contacto VARCHAR(160) NULL,
  telefono VARCHAR(40) NULL,
  email VARCHAR(190) NULL,

  active TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  INDEX idx_opticas_email (email),
  INDEX idx_opticas_active (active)
) ENGINE=InnoDB;

-- ============================================================
-- 3) USUARIOS (Laravel-ready)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id TINYINT UNSIGNED NOT NULL,

  -- Para usuarios tipo óptica (login), se liga opcionalmente aquí:
  optica_id BIGINT UNSIGNED NULL,

  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(40) NULL,

  password VARCHAR(255) NOT NULL,      -- Laravel "password"
  remember_token VARCHAR(100) NULL,
  email_verified_at TIMESTAMP NULL,

  active TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  INDEX idx_users_role (role_id),
  INDEX idx_users_optica (optica_id)
) ENGINE=InnoDB;

ALTER TABLE users
  ADD CONSTRAINT fk_users_optica
  FOREIGN KEY (optica_id) REFERENCES opticas(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS optica_payment_methods (
  optica_id BIGINT UNSIGNED NOT NULL,
  payment_method_id TINYINT UNSIGNED NOT NULL,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

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

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  INDEX idx_suppliers_name (name),
  INDEX idx_suppliers_active (active)
) ENGINE=InnoDB;

-- ============================================================
-- 5) PRODUCTOS
-- - Imagen guardada en BD
-- - Descripción
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,

  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(220) NOT NULL,
  description TEXT NULL,

  category_id SMALLINT UNSIGNED NOT NULL,

  -- Clasificadores generales
  type VARCHAR(60) NULL,
  brand VARCHAR(90) NULL,
  model VARCHAR(90) NULL,
  material VARCHAR(90) NULL,
  size VARCHAR(40) NULL,

  -- Precios/stock objetivo
  buy_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  sale_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  max_stock INT NULL,

  supplier_id BIGINT UNSIGNED NULL,

  -- Imagen en BD
  image_filename VARCHAR(190) NULL,
  image_mime VARCHAR(80) NULL,
  image_blob LONGBLOB NULL,

  active TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,

  INDEX idx_products_category (category_id),
  INDEX idx_products_name (name),
  INDEX idx_products_active (active)
) ENGINE=InnoDB;

-- ============================================================
-- 6) VARIANTES (graduación) ✅ recomendado
-- - MICAS y LENTES_CONTACTO: sph/cyl/add (SIN eje)
-- - BISEL no usa variantes (axis va en item)
-- ============================================================

CREATE TABLE IF NOT EXISTS product_variants (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,

  variant_type ENUM('micas','contacto') NOT NULL,

  -- Graduación SIN eje
  sph DECIMAL(6,2) NULL,
  cyl DECIMAL(6,2) NULL,
  add_power DECIMAL(6,2) NULL,

  -- Contacto
  bc DECIMAL(6,2) NULL,
  dia DECIMAL(6,2) NULL,
  color VARCHAR(40) NULL,

  variant_sku VARCHAR(80) NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_variants_product (product_id),
  INDEX idx_variants_type (variant_type),
  INDEX idx_variants_graduation (sph, cyl, add_power)
) ENGINE=InnoDB;

-- ============================================================
-- 7) INVENTARIO
-- 7.1 Por producto
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL UNIQUE,
  stock INT NOT NULL DEFAULT 0,
  last_entry_date DATE NULL,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_inventory_stock (stock)
) ENGINE=InnoDB;

-- 7.2 Por variante
CREATE TABLE IF NOT EXISTS inventory_variants (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  variant_id BIGINT UNSIGNED NOT NULL UNIQUE,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  max_stock INT NULL,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_inv_variants_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  INDEX idx_inventory_variants_stock (stock)
) ENGINE=InnoDB;

-- Movimientos (auditoría)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,

  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,

  movement_type ENUM('in','out','adjust') NOT NULL,
  qty INT NOT NULL,

  reference_type ENUM('sale','order','manual') NOT NULL DEFAULT 'manual',
  reference_id BIGINT UNSIGNED NULL,

  note VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_im_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_im_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  CONSTRAINT fk_im_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_im_product (product_id),
  INDEX idx_im_variant (variant_id),
  INDEX idx_im_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- 8) CLIENTES (POS)
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(190) NOT NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(190) NULL,
  notes TEXT NULL,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  INDEX idx_customers_name (name),
  INDEX idx_customers_email (email)
) ENGINE=InnoDB;

-- ============================================================
-- 9) VENTAS POS
-- - Descuento por pedido o por producto
-- ============================================================

CREATE TABLE IF NOT EXISTS sales (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sold_by BIGINT UNSIGNED NULL,                 -- admin/employee/optica (si aplica)

  customer_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(160) NULL,              -- quick customer

  payment_method_id TINYINT UNSIGNED NOT NULL,  -- cash/card/transfer

  -- Descuento global
  discount_type ENUM('none','order_pct','order_amount') NOT NULL DEFAULT 'none',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,

  notes TEXT NULL,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_sales_user FOREIGN KEY (sold_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
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

  unit_price DECIMAL(12,2) NOT NULL,
  line_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Descuento por producto
  item_discount_type ENUM('none','pct','amount') NOT NULL DEFAULT 'none',
  item_discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  item_discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,

  line_total DECIMAL(12,2) NOT NULL,

  -- BISEL: eje se captura en item
  axis SMALLINT NULL,
  item_notes TEXT NULL,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_sale_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,

  INDEX idx_sale_items_sale (sale_id),
  INDEX idx_sale_items_product (product_id),
  INDEX idx_sale_items_variant (variant_id)
) ENGINE=InnoDB;

-- ============================================================
-- 10) PEDIDOS (UNIFICADOS) — Ópticas y/o internos
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,

  optica_id BIGINT UNSIGNED NULL,               -- null si es pedido interno
  created_by_user_id BIGINT UNSIGNED NULL,      -- admin/employee/optica

  payment_method_id TINYINT UNSIGNED NOT NULL,  -- cash/transfer

  payment_status ENUM('pendiente','pagado') NOT NULL DEFAULT 'pendiente',
  process_status ENUM('en_proceso','listo_para_entregar','entregado','revision') NOT NULL DEFAULT 'en_proceso',

  notes TEXT NULL,

  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_orders_optica FOREIGN KEY (optica_id) REFERENCES opticas(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_pm FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),

  INDEX idx_orders_created_at (created_at),
  INDEX idx_orders_optica (optica_id),
  INDEX idx_orders_payment_status (payment_status),
  INDEX idx_orders_process_status (process_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,

  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,              -- si el pedido es por graduación

  qty INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,

  -- BISEL: eje se captura en item
  axis SMALLINT NULL,
  item_notes TEXT NULL,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,

  INDEX idx_order_items_order (order_id),
  INDEX idx_order_items_product (product_id),
  INDEX idx_order_items_variant (variant_id)
) ENGINE=InnoDB;

-- Auditoría de cambios de estatus
CREATE TABLE IF NOT EXISTS order_status_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,

  from_payment_status ENUM('pendiente','pagado') NULL,
  to_payment_status   ENUM('pendiente','pagado') NULL,

  from_process_status ENUM('en_proceso','listo_para_entregar','entregado','revision') NULL,
  to_process_status   ENUM('en_proceso','listo_para_entregar','entregado','revision') NULL,

  reason VARCHAR(255) NULL,

  created_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT fk_osl_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_osl_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_osl_order (order_id),
  INDEX idx_osl_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- 11) ÍNDICES EXTRA (idempotentes)
-- ============================================================

-- products(category_id)
SET @table='products'; SET @index='idx_products_category_extra'; SET @cols='(category_id)';
CALL sp_create_index_if_not_exists();

-- products(supplier_id)
SET @table='products'; SET @index='idx_products_supplier_extra'; SET @cols='(supplier_id)';
CALL sp_create_index_if_not_exists();

-- inventory(stock)
SET @table='inventory'; SET @index='idx_inventory_stock_extra'; SET @cols='(stock)';
CALL sp_create_index_if_not_exists();

-- inventory_variants(stock)
SET @table='inventory_variants'; SET @index='idx_inventory_variants_stock_extra'; SET @cols='(stock)';
CALL sp_create_index_if_not_exists();

-- orders(process_status, payment_status)
SET @table='orders'; SET @index='idx_orders_status_combo'; SET @cols='(process_status, payment_status)';
CALL sp_create_index_if_not_exists();

-- sales(created_at)
SET @table='sales'; SET @index='idx_sales_created_at_extra'; SET @cols='(created_at)';
CALL sp_create_index_if_not_exists();
