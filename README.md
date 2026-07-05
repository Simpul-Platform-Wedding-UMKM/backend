# SIMPUL Backend

Backend API for the SIMPUL Smart Wedding Marketplace Platform, serving both the consumer and vendor mobile applications.

## Key Features

- **Auth System**: Custom JWT-based authentication using Express.
- **Smart QRIS Split Payment API**: Manages payment tracking, bookings, and splits.
- **Wedding Budget Planner**: Stores projects and budget allocations.
- **AI Wedding Assistant**: Integrates with OpenAI to provide AI recommendation logic.
- **Dispute Resolution**: Support for managing booking disputes.
- **Role-Based Access**: Role endpoints catering to Consumers, Vendors, and Admins.

## Tech Stack

- **Language**: Node.js (TypeScript/JavaScript via `tsx`)
- **Framework**: Express 5
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Prisma
- **Validation**: Zod
- **Testing**: Vitest + Supertest
- **AI Integration**: OpenAI SDK
- **Payment Integration**: Midtrans/Xendit (sandbox mode)

## Prerequisites

- Node.js 20 or higher
- PostgreSQL 15 or higher (or a Supabase project)
- npm, yarn, or pnpm
- OpenAI API Key
- Midtrans/Xendit Sandbox Key

## Getting Started

### 1. Clone the Repository (if not already done)

```bash
git clone https://github.com/your-username/simpul.git
cd simpul/backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the `.env` example file:

```bash
# If there is no .env.example, create a new .env based on the structure below
touch .env
```

Configure your `.env` file with the following variables:

| Variable | Description | Example |
| -------- | ----------- | ------- |
| `DATABASE_URL` | PostgreSQL connection string (pooler) | `postgresql://user:pass@host:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | PostgreSQL direct connection (for migrations) | `postgresql://user:pass@host:5432/postgres` |
| `JWT_SECRET` | Secret key for JWT signing | `change-this-to-a-long-random-string` |
| `JWT_EXPIRES_IN` | JWT expiration duration | `7d` |
| `PJP_PROVIDER` | Payment provider (`xendit` or `midtrans`) | `xendit` |
| `XENDIT_SECRET_KEY` | Xendit development key | `xnd_development_...` |
| `XENDIT_CALLBACK_TOKEN` | Verification token for Xendit webhooks | `...` |
| `MIDTRANS_SERVER_KEY` | Midtrans server key | `SB-Mid-server-...` |
| `MIDTRANS_IS_PRODUCTION` | Sandbox flag | `false` |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `OPENAI_MODEL` | OpenAI Model | `gpt-4o-mini` |
| `PORT` | Server Port | `4000` |
| `CORS_ORIGIN` | Allowed CORS Origin | `http://localhost:8081` |

### 4. Database Setup

Ensure your PostgreSQL instance (or Supabase project) is running.

Push the schema to the database (and run migrations):

```bash
npm run prisma:push
# or use `npx prisma migrate dev`
```

*(Optional)* Seed the database with initial data:

```bash
npm run prisma:seed
```

### 5. Start Development Server

Run the development server via `tsx watch`:

```bash
npm run dev
```

The server should now be running at `http://localhost:4000` (or whichever port you specified).

## Architecture

### Directory Structure

```text
├── .agents/                # Agent workspaces/logs
├── config/                 # Application configuration (env, DB)
├── lib/                    # Shared utilities and helpers
├── middleware/             # Express middlewares (auth, error handling)
├── modules/                # Domain modules (controllers, routes, services)
├── prisma/                 # Prisma ORM setup
│   ├── schema.prisma       # Database schema
├── src/                    # Source code root
│   ├── app.js              # Express app setup
│   └── server.js           # Server entry point
├── tests/                  # Vitest test suite
├── package.json            # Node dependencies
└── vitest.config.js        # Vitest configuration
```

### Request Lifecycle

1. Request hits Express router (in `app.js` or `server.js`).
2. Global middleware processes request (CORS, Morgan logging, Body parsing).
3. Domain-specific routers (in `modules/`) capture the route.
4. Route-level middleware (auth checks, Zod validation) is applied.
5. Controller action executes and interacts with `Prisma` to fetch/mutate data.
6. Controller sends a JSON response back to the client.

### Data Flow

```text
Mobile App (Flutter) → Express Route → Zod Validator → Controller → Prisma Client → PostgreSQL
↓
Mobile App (JSON)    ← Express Res   ←
```

### Database Schema Overview

The database revolves around three core pillars:
1. **Identity & Governance**: `Account`, `Vendor`, `Dispute`, `Review`
2. **Smart QRIS Split Payment**: `Booking`, `BookingItem`, `Payment`, `PaymentSplit`
3. **Wedding Budget Planner**: `WeddingProject`, `BudgetAllocation`

Additionally, `AiRecommendationLog` stores logs for the AI Wedding Assistant.

## Environment Variables Reference

See the table in the "Environment Setup" section. Keep your `.env` out of version control (`.gitignore` it).

## Available Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Starts development server with hot-reload (`tsx watch`) |
| `npm start` | Starts server in production mode (`node src/server.js`) |
| `npm run build` | Compiles TypeScript files via `tsc` (if applicable) |
| `npm run test` | Runs the Vitest test suite |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run test:coverage` | Runs Vitest with coverage report |
| `npm run prisma:generate` | Generates Prisma client types |
| `npm run prisma:push` | Pushes Prisma schema state to the database directly |
| `npm run prisma:seed` | Runs the seed script to populate database |
| `npm run prisma:studio` | Opens Prisma Studio UI to explore the DB |

## Testing

The project uses [Vitest](https://vitest.dev/) for testing.

### Running Tests

```bash
# Run all tests once
npm run test

# Run with hot reload (watch mode)
npm run test:watch

# View coverage
npm run test:coverage
```

Test files should be placed inside the `tests/` directory or alongside files with a `.test.ts`/`.test.js` extension.

## Deployment

Since there is no specific deployment configuration (`fly.toml` or `render.yaml`), Docker is the recommended approach for production deployments.

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate

EXPOSE 4000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t simpul-backend .
docker run -p 4000:4000 \
  -e DATABASE_URL=... \
  -e JWT_SECRET=... \
  simpul-backend
```

### Platform as a Service (e.g. Render / Heroku)

1. Connect your GitHub repository.
2. Set build command: `npm install && npm run prisma:generate`
3. Set start command: `npm start`
4. Add all environment variables to the platform dashboard.

## Troubleshooting

### Database Connection Issues

**Error:** `PrismaClientInitializationError: Can't reach database server`
**Solution:**
1. Check if the `DATABASE_URL` is correct.
2. Ensure you have IPv4 access if using a Supabase pooler, or use the connection string meant for your environment.

### Prisma Migration Fails

**Error:** `P3009` or `P3014`
**Solution:**
If you are using Supabase, ensure that your `DIRECT_URL` points to the session pooler/direct port (`5432`) and your `DATABASE_URL` points to the transaction pooler (`6543`).

### CORS Errors on Web

**Error:** `Access to fetch at '...' from origin '...' has been blocked by CORS policy`
**Solution:**
Make sure the `CORS_ORIGIN` in `.env` matches exactly the origin of the Flutter web app (e.g. `http://localhost:8081`).
