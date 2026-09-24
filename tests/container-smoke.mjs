import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const frontend = `http://127.0.0.1:${process.env.UMAMI_FRONTEND_PORT || 8083}`;
const api = `http://127.0.0.1:${process.env.UMAMI_API_PORT || 3003}`;
const timeout = 10_000;

function compose(args, expected = 0) {
   const result = spawnSync(
      "docker",
      ["compose", ...args],
      {
         encoding: "utf8",
         timeout: 60_000,
         env: process.env,
      },
   );
   if (result.error) throw result.error;
   assert.equal(
      result.status,
      expected,
      `docker compose ${args.join(" ")} exited ${result.status}\n${result.stdout}\n${result.stderr}`,
   );
   return result.stdout;
}

function docker(args) {
   const result = spawnSync("docker", args, {
      encoding: "utf8",
      timeout: 30_000,
   });
   if (result.error) throw result.error;
   assert.equal(
      result.status,
      0,
      `docker ${args.join(" ")} failed: ${result.stderr}`,
   );
   return result.stdout.trim();
}

function fixtureStatus() {
   return JSON.parse(
      compose([
         "exec",
         "-T",
         "fixture-supabase",
         "node",
         "-e",
         "fetch('http://127.0.0.1:54321/fixture/status').then(r=>r.text()).then(console.log)",
      ]).trim(),
   );
}

async function request(url, options = {}) {
   return fetch(url, {
      signal: AbortSignal.timeout(timeout),
      ...options,
   });
}

const root = await request(frontend);
assert.equal(root.status, 200);
assert.match(
   root.headers.get("content-type"),
   /text\/html/,
);
assert.match(await root.text(), /<div id="root"><\/div>/);
assert.equal(
   (await request(`${frontend}/healthz`)).status,
   200,
);
assert.equal((await request(`${api}/health`)).status, 200);
assert.equal((await request(`${api}/ready`)).status, 200);
assert.equal(
   (await request(`${frontend}/restaurants`)).status,
   200,
);
assert.equal(
   (await request(`${frontend}/missing.js`)).status,
   404,
);

const allowedOrigin = await request(
   `${api}/api/restaurants`,
   {
      headers: { origin: frontend },
   },
);
assert.equal(allowedOrigin.status, 200);
assert.equal(
   allowedOrigin.headers.get("access-control-allow-origin"),
   frontend,
);
const restaurants = await allowedOrigin.json();
assert.equal(restaurants.length, 1);
assert.equal(restaurants[0].name, "Hearth");
const disallowed = await request(`${api}/api/restaurants`, {
   headers: { origin: "https://unapproved.invalid" },
});
assert.notEqual(
   disallowed.headers.get("access-control-allow-origin"),
   "https://unapproved.invalid",
);
const menu = await request(`${api}/api/restaurants/1/menu`);
assert.equal(menu.status, 200);
assert.match(await menu.text(), /Margherita Pizza/);

const login = await request(
   `${frontend}/supabase/auth/v1/token?grant_type=password`,
   {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
         email: "preview@calpoly.edu",
         password: "preview-only",
      }),
   },
);
assert.equal(login.status, 200);
const session = await login.json();
assert.equal(session.user.email, "preview@calpoly.edu");
assert.equal(
   (
      await request(`${frontend}/supabase/auth/v1/user`, {
         headers: {
            authorization: `Bearer ${session.access_token}`,
         },
      })
   ).status,
   200,
);
assert.equal(
   (
      await request(
         `${frontend}/supabase/storage/v1/object/missing`,
      )
   ).status,
   503,
);

const oneShot = [
   "run",
   "--rm",
   "--no-deps",
   "worker",
   "node",
   "worker.js",
];
compose(
   [
      ...oneShot,
      "--once=menus",
      "--source-url=https://example.invalid/menu",
      "--restaurant-id=1",
   ],
   1,
);
compose([...oneShot, "--once=restaurants"]);
compose([...oneShot, "--once=restaurants"]);
compose([...oneShot, "--once=menus"]);
compose([...oneShot, "--once=menus"]);
const fixture = fixtureStatus();
assert.equal(fixture.restaurantCount, 1);
assert.equal(fixture.menuItems.length, 1);
assert.equal(fixture.menuItems[0].name, "Margherita Pizza");
const worker = compose([
   "exec",
   "-T",
   "worker",
   "node",
   "-e",
   "fetch('http://127.0.0.1:3004/health').then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))",
]);
const workerHealth = JSON.parse(worker.trim());
assert.equal(workerHealth.status, 200);
assert.equal(workerHealth.body.schedulerActive, true);
function workerRequest(path) {
   return JSON.parse(
      compose([
         "exec",
         "-T",
         "worker",
         "node",
         "-e",
         `fetch('http://127.0.0.1:3004${path}',{method:'POST'}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()})))`,
      ]).trim(),
   );
}
async function unskippedWorkerRequest(path) {
   const deadline = Date.now() + 10_000;
   while (true) {
      const result = workerRequest(path);
      if (result.status !== 409) return result;
      assert.ok(
         Date.now() < deadline,
         `worker remained busy for ${path}`,
      );
      await new Promise((resolve) =>
         setTimeout(resolve, 200),
      );
   }
}
assert.equal(
   (await unskippedWorkerRequest("/fixture/fail")).status,
   500,
);
const unhealthy = JSON.parse(
   compose([
      "exec",
      "-T",
      "worker",
      "node",
      "-e",
      "fetch('http://127.0.0.1:3004/health').then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))",
   ]).trim(),
);
assert.equal(unhealthy.status, 503);
assert.equal(unhealthy.body.lastRun.status, "failed");
assert.equal(
   (await unskippedWorkerRequest("/fixture/recover"))
      .status,
   200,
);
const recovered = JSON.parse(
   compose([
      "exec",
      "-T",
      "worker",
      "node",
      "-e",
      "fetch('http://127.0.0.1:3004/health').then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))",
   ]).trim(),
);
assert.equal(recovered.status, 200);
assert.equal(recovered.body.lastRun.status, "succeeded");

async function interruptScrape({
   delayPath,
   activityField,
   browserCount,
}) {
   compose([
      "exec",
      "-T",
      "fixture-supabase",
      "node",
      "-e",
      `fetch('http://127.0.0.1:54321/fixture/${delayPath}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ms:15000})}).then(r=>{if(!r.ok)process.exit(1)})`,
   ]);
   const probeName = `umami-interrupt-${activityField}-${process.pid}`;
   const probeId = compose([
      "run",
      "--detach",
      "--name",
      probeName,
      "--no-deps",
      "worker",
      "node",
      "worker.js",
      "--once=restaurants",
   ]).trim();
   try {
      const deadline = Date.now() + 10_000;
      while (fixtureStatus()[activityField] !== 1) {
         assert.ok(
            Date.now() < deadline,
            `${activityField} did not start`,
         );
         await new Promise((resolve) =>
            setTimeout(resolve, 200),
         );
      }
      docker(["stop", "--timeout", "10", probeId]);
      const exitCode = Number(
         docker([
            "inspect",
            "--format",
            "{{.State.ExitCode}}",
            probeId,
         ]),
      );
      assert.equal(
         exitCode,
         143,
         "interrupted one-shot should exit as SIGTERM",
      );
      assert.match(
         docker(["logs", probeId]),
         new RegExp(
            `closed ${browserCount} browser\\(s\\)`,
         ),
      );
      assert.equal(fixtureStatus().restaurantCount, 1);
   } finally {
      docker(["rm", "--force", probeId]);
   }
   // The fixture may complete an already accepted write after client shutdown.
   const settleDeadline = Date.now() + 20_000;
   while (fixtureStatus()[activityField] !== 0) {
      assert.ok(
         Date.now() < settleDeadline,
         `${activityField} did not settle`,
      );
      await new Promise((resolve) =>
         setTimeout(resolve, 200),
      );
   }
   assert.equal(fixtureStatus().restaurantCount, 1);
   compose([...oneShot, "--once=restaurants"]);
   const afterInterrupt = fixtureStatus();
   assert.equal(afterInterrupt.restaurantCount, 1);
   assert.equal(afterInterrupt.menuItems.length, 1);
}

await interruptScrape({
   delayPath: "delay-next-location",
   activityField: "delayedLocationRequests",
   browserCount: 1,
});
await interruptScrape({
   delayPath: "delay-next-restaurant-write",
   activityField: "delayedRestaurantWrites",
   browserCount: 0,
});

compose([
   "exec",
   "--detach",
   "worker",
   "node",
   "-e",
   "(async()=>{for(let i=0;i<30;i++){const r=await fetch('http://127.0.0.1:3004/fixture/hang',{method:'POST'});if(r.status!==409)return;await new Promise(resolve=>setTimeout(resolve,200))}})().catch(()=>{})",
]);
const activeDeadline = Date.now() + 10_000;
while (true) {
   const state = JSON.parse(
      compose([
         "exec",
         "-T",
         "worker",
         "node",
         "-e",
         "fetch('http://127.0.0.1:3004/status').then(r=>r.text()).then(console.log)",
      ]).trim(),
   );
   if (state.runningJob === "fixture-probe") break;
   assert.ok(
      Date.now() < activeDeadline,
      "daemon job did not start",
   );
   await new Promise((resolve) => setTimeout(resolve, 200));
}
const daemonId = compose([
   "ps",
   "--quiet",
   "worker",
]).trim();
const stopStarted = Date.now();
compose(["stop", "worker"]);
assert.ok(
   Date.now() - stopStarted < 10_000,
   "active worker exceeded stop deadline",
);
assert.equal(
   Number(
      docker([
         "inspect",
         "--format",
         "{{.State.ExitCode}}",
         daemonId,
      ]),
   ),
   143,
);
compose([
   "up",
   "--detach",
   "--wait",
   "--wait-timeout",
   "60",
   "worker",
]);
const restarted = JSON.parse(
   compose([
      "exec",
      "-T",
      "worker",
      "node",
      "-e",
      "fetch('http://127.0.0.1:3004/health').then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))",
   ]).trim(),
);
assert.equal(restarted.status, 200);
assert.equal(restarted.body.schedulerActive, true);
console.log("UMami isolated container smoke passed.");
