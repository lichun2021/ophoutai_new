# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quantum Publish (量子发行) is a full-stack gaming platform backend built with Nuxt 3, featuring game publishing, payment processing, user management, and data analytics. It supports multi-level agent systems, gift package management, and comprehensive reporting.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test

# Run daily statistics
npm run daily-stats
```

## Architecture

### Frontend Structure
- **Nuxt 3 SSR** with Vue 3 composition API
- **UI Framework**: @nuxt/ui with Tailwind CSS
- **State Management**: Pinia stores in `store/`
- **Authentication**: JWT-based with auto-refresh in `composables/useAuthTimer.ts`
- **Layouts**: `auth.vue` for admin pages, default layout for user pages

### Backend Structure
- **Server Directory**: Full-stack Nitro server in `server/`
- **Database**: MySQL with connection pooling in `server/db/index.ts`
- **API Router**: Centralized routing in `server/api/[...].ts`
- **Controllers**: Business logic in `server/controller/`
- **Models**: Database models in `server/model/`
- **Utilities**: Auth, logging, Redis, i18n in `server/utils/`

### Key Components
- **Admin System**: Multi-level agent management with permissions
- **Payment Processing**: Third-party payment integration with callback handling
- **Gift Package System**: External package management with purchase tracking
- **Data Analytics**: Comprehensive reporting with LTV, channel, and daily stats
- **User Management**: Registration, login, profile with third-party integration

## Database Environment Variables

```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=A1q2w3e4r!@#1234
DB_NAME=quantum_db
DB_CONNECTION_LIMIT=500
DB_QUEUE_LIMIT=0
```

## API Structure

### Admin APIs (`/api/admin/`)
- Authentication and permissions management
- Game management with status controls
- Payment settings and system parameters
- Data analytics and reporting endpoints
- Settlement and withdrawal processing

### User APIs (`/api/user/`, `/api/client/`)
- User registration and authentication
- Profile and purchase history
- Gift package browsing and purchasing
- Payment processing and order tracking

### Payment APIs (`/api/payment/`, `/api/rechargeurl/`)
- Payment URL generation
- Third-party payment callbacks
- Order status checking
- Transaction management

## Important Files

- `server/config.ts`: Third-party API configuration
- `server/utils/auth.ts`: JWT authentication utilities
- `server/utils/logger.ts`: Logging system
- `server/utils/redis-cluster.ts`: Redis cluster configuration
- `composables/useAuthTimer.ts`: Frontend auth state management
- `middleware/auth.global.ts`: Route protection middleware

## Page Structure

### Admin Pages (`/admin/`)
- Login and authentication
- Game permissions and operations
- Payment settings management
- System parameter configuration
- Settlement and financial management

### User Pages (`/user/`)
- User registration and login
- Mall and gift package browsing
- Payment and recharge functionality
- Profile and order history

### Data Pages (`/data/`)
- Overview analytics dashboard
- Channel and LTV reporting
- Payment and user registration analytics
- Daily reporting and statistics

## Development Notes

- The project uses TypeScript throughout
- All API endpoints include comprehensive logging
- Payment processing supports multiple third-party providers
- Multi-language support with i18n utilities
- Redis clustering for session and cache management
- Comprehensive error handling and logging system