# Retail ERP & POS System

A comprehensive multi-tenant Retail ERP and Point-of-Sale system built with modern technologies.

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, PostgreSQL
- **Frontend**: React, Vite, TailwindCSS, React Query
- **Authentication**: JWT with role-based access control
- **Database**: PostgreSQL with ledger-driven inventory

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Set up environment
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your database credentials

# Run database migrations
npm run db:migrate -w @retail-erp/backend

# Start development servers
npm run dev
```

### Development URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api
- **Health Check**: http://localhost:3001/health

## Project Structure

```
├── packages/
│   ├── backend/                 # Express API server
│   │   ├── src/
│   │   │   ├── config/          # Environment configuration
│   │   │   ├── database/        # Database connection pool
│   │   │   ├── middleware/      # Auth & tenant isolation
│   │   │   ├── routes/          # API routes
│   │   │   ├── services/        # Business logic
│   │   │   └── types/           # TypeScript types
│   │   └── migrations/          # SQL migrations
│   └── frontend/                # React SPA
│       └── src/
│           ├── components/      # UI components
│           ├── hooks/           # Custom hooks
│           ├── layouts/         # Page layouts
│           ├── lib/             # Utilities
│           ├── pages/           # Route pages
│           └── stores/          # Zustand stores
└── package.json                 # Monorepo root
```

## Features

### Multi-Tenancy
- Strict tenant isolation at database level
- `tenant_id` on all records
- Server-side query enforcement

### Point of Sale
- Fast barcode scanning (<150ms)
- Keyboard-first workflow
- Park/recall transactions
- Cash & card payments
- Shift management

### Inventory Management
- Ledger-driven stock tracking
- Stock on hand per store
- GRN, adjustments, transfers
- Reorder alerts

### Products
- SKU management with variants
- Multiple barcodes per product
- Categories and brands
- Price lists and promotions

### Authentication
- JWT access/refresh tokens
- Role-based permissions
- Store-level access control

## API Endpoints

### Auth
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Tenant registration
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

### Products
- `GET /api/products` - List products
- `GET /api/products/:id` - Get product
- `POST /api/products` - Create product
- `PATCH /api/products/:id` - Update product
- `GET /api/products/lookup/:barcode` - Fast POS lookup

### POS
- `POST /api/pos/sale` - Create sale
- `POST /api/pos/refund` - Process refund
- `POST /api/pos/park` - Park sale
- `POST /api/pos/recall/:id` - Recall parked
- `POST /api/pos/shift/open` - Open shift
- `POST /api/pos/shift/:id/close` - Close shift
- `GET /api/pos/receipts` - Search receipts

## Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/retail_erp

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Security
BCRYPT_ROUNDS=10
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

## Scripts

```bash
npm run dev          # Start all in development
npm run build        # Build all packages
npm run test         # Run tests
npm run lint         # Lint code
npm run db:migrate   # Run migrations
npm run db:seed      # Seed demo data
```

## License

MIT
