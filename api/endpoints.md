# Endpoints esperados (Backend)

## Autenticación
- POST /api/auth/login
- POST /api/auth/register
- POST /api/auth/logout

## Productos
- GET /api/products
- GET /api/products/:id
- POST /api/products
- PUT /api/products/:id
- DELETE /api/products/:id

## Categorías
- GET /api/categories

## Inventario
- GET /api/inventory
- GET /api/inventory/low-stock
- PUT /api/inventory/update-stock

## Ventas
- POST /api/sales
- GET /api/sales
- GET /api/sales/:id
- GET /api/sales/reports/daily

## Clientes
- GET /api/customers
- POST /api/customers

## Ópticas
- GET /api/opticas
- POST /api/opticas
- PUT /api/opticas/:id
- DELETE /api/opticas/:id

## Pedidos (Ópticas)
- GET /api/orders
- POST /api/orders
- GET /api/orders/:id
- PUT /api/orders/:id
