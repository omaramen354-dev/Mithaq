import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/* اتصال Neon Serverless عبر Drizzle — يعمل مباشرة على Vercel بلا تجمع اتصالات
   (neon-http: طلب HTTP واحد لكل استعلام، الأنسب لبيئة Serverless) */
const sqlClient = neon(process.env.DATABASE_URL!);

export const db = drizzle(sqlClient, { schema });

export type Db = typeof db;
