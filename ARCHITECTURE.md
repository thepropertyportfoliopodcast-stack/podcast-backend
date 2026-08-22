# Backend architecture

The backend is an Express application. HTTP paths are registered in `src/app.js`; this refactor changes file locations only, not API URLs.

## Where to make changes

- `src/app.js` — Express setup and top-level route mounting.
- `src/config` — infrastructure configuration such as Prisma.
- `src/routes` — endpoint paths, middleware order, and controller binding.
- `src/controllers` — request validation and response orchestration.
- `src/middleware` — authentication and async error handling.
- `src/services` — file storage and media-processing integrations.
- `src/repositories` — reusable database-access functions.
- `src/utils` — response helpers, logging, slugs, and media URL helpers.
- `prisma/schema.prisma` — database models.
- `prisma/migrations` — production database history; never edit an applied migration.
- `prisma/seed.js` — seed data.

## Request flow

`route → middleware → controller → repository/service → Prisma or external storage`

Examples:

- Episode endpoints: `src/routes/fileRoutes.js` → `src/controllers/fileController.js`
- Admin mutations: `src/routes/adminRoutes.js` → `src/controllers/adminController.js`
- Large uploads: `src/routes/largeUploadRoutes.js` → `src/controllers/largeUploadController.js`
- Database client: `src/config/database.js`

