import { cp, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "dist");
const dest = path.join(root, "api/public");

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`Frontend copied to api/public`);
