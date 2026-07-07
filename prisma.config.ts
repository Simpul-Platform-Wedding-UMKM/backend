import dotenv from "dotenv";

if (process.env.NODE_ENV === "test") {
    dotenv.config({ path: ".env.test", override: true });
} else {
    dotenv.config();
}
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        seed: "tsx prisma/seed.ts",
    },
    datasource: {
        url: process.env["DATABASE_URL"],
        directUrl: process.env["DIRECT_URL"],
    },
});
