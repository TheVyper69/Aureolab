/* =========================================================
   1) PRODUCT_TREATMENTS: tratamientos permitidos por producto
   ========================================================= */
CREATE TABLE IF NOT EXISTS `product_treatments` (
  `product_id` BIGINT(20) UNSIGNED NOT NULL,
  `treatment_id` BIGINT(20) UNSIGNED NOT NULL,
  `extra_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`product_id`, `treatment_id`),
  KEY `idx_pt_treatment` (`treatment_id`),
  CONSTRAINT `fk_pt_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pt_treatment` FOREIGN KEY (`treatment_id`) REFERENCES `treatments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   2) ORDER_ITEM_TREATMENTS: tratamientos elegidos por item
   ========================================================= */
CREATE TABLE IF NOT EXISTS `order_item_treatments` (
  `order_item_id` BIGINT(20) UNSIGNED NOT NULL,
  `treatment_id` BIGINT(20) UNSIGNED NOT NULL,
  `price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`order_item_id`, `treatment_id`),
  KEY `idx_oit_treatment` (`treatment_id`),
  CONSTRAINT `fk_oit_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oit_treatment` FOREIGN KEY (`treatment_id`) REFERENCES `treatments` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   3) (RECOMENDADO) Quitar products.treatment_id si ya no aplica
   - OJO: solo si ya decidiste que NO habrá tratamiento fijo por SKU.
   - Si tienes datos ahí, primero migra a product_treatments.
   ========================================================= */
-- ALTER TABLE `products` DROP FOREIGN KEY `fk_products_treatment`;
-- ALTER TABLE `products` DROP COLUMN `treatment_id`;


/* =========================================================
   4) (OPCIONAL) índices útiles si vas a listar por categoría
   ========================================================= */
-- CREATE INDEX idx_pt_product_active ON product_treatments(product_id, active);
-- CREATE INDEX idx_oit_item ON order_item_treatments(order_item_id);