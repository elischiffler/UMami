import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

const container = `umami-rls-${randomUUID()}`;
const image =
   "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const read = (path) =>
   readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read(
   "../supabase/migrations/20261007031657_harden_umami_client_access.sql",
);

function docker(args, input) {
   const result = spawnSync("docker", args, {
      input,
      encoding: "utf8",
      timeout: 120000,
   });
   if (result.error || result.status !== 0) {
      throw new Error(
         result.error?.message ||
            result.stderr ||
            result.stdout,
      );
   }
   return result.stdout;
}

try {
   docker([
      "run",
      "--detach",
      "--rm",
      "--name",
      container,
      "--network",
      "none",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "--mount",
      `type=bind,source=${fileURLToPath(new URL("../tests/rls/startup-delay.sql", import.meta.url))},target=/docker-entrypoint-initdb.d/10-startup-delay.sql,readonly`,
      image,
   ]);
   let ready = false;
   for (let attempt = 0; attempt < 60; attempt++) {
      const result = spawnSync(
         "docker",
         [
            "exec",
            container,
            "pg_isready",
            // The image's temporary init server accepts only Unix sockets.
            "-h",
            "127.0.0.1",
            "-U",
            "postgres",
         ],
         {
            encoding: "utf8",
            timeout: 10000,
         },
      );
      if (result.status === 0) {
         ready = true;
         break;
      }
      await setTimeout(500);
   }
   if (!ready)
      throw new Error(
         "Disposable PostgreSQL did not become ready",
      );
   const sql = [
      "do $$ begin if inet_server_addr() is null then raise exception 'RLS tests must connect to the final TCP server'; end if; end $$;",
      read("../tests/rls/schema.sql"),
      migration,
      migration,
      read("../tests/rls/access.sql"),
      read(
         "../supabase/migrations/20261007031659_add_private_bookmark_shares.sql",
      ),
      read("../tests/rls/shares.sql"),
   ].join("\n");
   const output = docker(
      [
         "exec",
         "-i",
         container,
         "psql",
         "-X",
         "-h",
         "127.0.0.1",
         "-U",
         "postgres",
         "-v",
         "ON_ERROR_STOP=1",
      ],
      sql,
   );
   console.log(
      output
         .trim()
         .split("\n")
         .filter((line) => line.includes("PASS:"))
         .join("\n"),
   );
   console.log(
      "PASS: PostgreSQL grants, RLS, counters, and migration reapplication",
   );
} finally {
   spawnSync("docker", ["rm", "--force", container], {
      encoding: "utf8",
      timeout: 30000,
   });
}
