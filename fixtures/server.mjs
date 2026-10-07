import http from "node:http";
import { randomUUID } from "node:crypto";

const tables = {
   restaurants: [
      {
         id: 1,
         name: "Hearth",
         location: "Cal Poly campus",
         tags: ["Italian", "Pizza"],
         hours: [],
         image_urls: [
            "/images/restaurants/Shakesmart-banner.jpg",
         ],
         rating_count: 1,
         rating_sum: 5,
         avg_rating: 5,
         lat: 35.3031,
         lng: -120.6598,
         menu_source_url:
            "http://fixture-supabase:54321/menu-source/hearth",
         location_mapping: {
            schedule: { 4: [["10:00", "14:00"]] },
         },
      },
   ],
   menu_items: [
      {
         id: 1,
         restaurant_id: 1,
         category: "Lunch",
         name: "Margherita Pizza",
         description: "Tomato, mozzarella, basil",
         portion: "1 slice",
         price: 5,
         calories: 360,
         fat: null,
         carbs: null,
         protein: null,
         allergens: ["Milk", "Wheat"],
         dietary_tags: ["Vegetarian"],
         source_url:
            "http://fixture-supabase:54321/menu-source/hearth",
         meal_period: "every-day",
      },
   ],
   bookmarks: [],
   bookmark_shares: [],
   reviews: [],
   review_helpful_votes: [],
   follows: [],
   notifications: [],
   users: [
      {
         id: "11111111-1111-4111-8111-111111111111",
         email: "preview@calpoly.edu",
         created_at: "2026-09-24T00:00:00.000Z",
         name: "Preview User",
         avatar_url:
            "https://ui-avatars.com/api/?name=Preview+User",
         is_verified: true,
      },
   ],
};

// This token is accepted only by this in-memory fixture. It does not grant
// access to any Supabase project or production service.
const fixtureUser = {
   id: tables.users[0].id,
   aud: "authenticated",
   role: "authenticated",
   email: tables.users[0].email,
   email_confirmed_at: "2026-09-24T00:00:00.000Z",
   user_metadata: { name: "Preview User" },
};
const fixtureToken =
   [
      { alg: "HS256", typ: "JWT" },
      {
         sub: fixtureUser.id,
         aud: "authenticated",
         role: "authenticated",
         exp: 4102444800,
      },
   ]
      .map((part) =>
         Buffer.from(JSON.stringify(part)).toString(
            "base64url",
         ),
      )
      .join(".") + ".fixture-only";

const locations = [
   {
      id: "hearth-1",
      name: "Hearth - Lunch",
      latitude: "35.3031",
      longitude: "-120.6598",
      categories: "Italian,Pizza",
   },
];
const weeklySchedule = {
   locations: [
      {
         name: "Hearth - Lunch",
         week: [
            {
               day: 4,
               status: "open",
               hours: [
                  {
                     start_hour: 10,
                     start_minutes: 0,
                     end_hour: 14,
                     end_minutes: 0,
                  },
               ],
            },
         ],
      },
   ],
};
let nextLocationDelayMs = 0;
let delayedLocationRequests = 0;
let nextRestaurantWriteDelayMs = 0;
let delayedRestaurantWrites = 0;

function send(response, status, data, headers = {}) {
   response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
   });
   response.end(JSON.stringify(data));
}

function matchingRows(rows, searchParams) {
   return rows.filter((row) => {
      for (const [key, value] of searchParams) {
         if (
            [
               "select",
               "order",
               "limit",
               "on_conflict",
            ].includes(key)
         )
            continue;
         if (
            value.startsWith("eq.") &&
            String(row[key]) !== value.slice(3)
         )
            return false;
         if (
            value.startsWith("gt.") &&
            !(row[key] > value.slice(3))
         )
            return false;
         if (value.startsWith("in.(")) {
            const allowed = value.slice(4, -1).split(",");
            if (!allowed.includes(String(row[key])))
               return false;
         }
      }
      return true;
   });
}

async function readJson(request) {
   let body = "";
   for await (const chunk of request) {
      body += chunk;
      if (body.length > 1_000_000)
         throw new Error("Fixture request too large");
   }
   return JSON.parse(body || "null");
}

const server = http.createServer(
   async (request, response) => {
      try {
         const url = new URL(
            request.url,
            "http://fixture-supabase:54321",
         );
         if (url.pathname === "/health")
            return send(response, 200, { ok: true });
         if (url.pathname === "/fixture/status") {
            return send(response, 200, {
               delayedLocationRequests,
               delayedRestaurantWrites,
               restaurantNames: tables.restaurants.map(
                  (row) => row.name,
               ),
               restaurantCount: tables.restaurants.length,
               menuItems: tables.menu_items.map((row) => ({
                  name: row.name,
                  restaurant_id: row.restaurant_id,
               })),
            });
         }
         if (url.pathname === "/auth/v1/token") {
            const grant =
               url.searchParams.get("grant_type");
            const input = await readJson(request);
            if (
               request.method === "POST" &&
               ((grant === "password" &&
                  input?.email === "preview@calpoly.edu" &&
                  input?.password === "preview-only") ||
                  (grant === "refresh_token" &&
                     input?.refresh_token ===
                        "fixture-refresh"))
            ) {
               return send(response, 200, {
                  access_token: fixtureToken,
                  token_type: "bearer",
                  expires_in: 60 * 60 * 24 * 365,
                  expires_at: 4102444800,
                  refresh_token: "fixture-refresh",
                  user: fixtureUser,
               });
            }
            return send(response, 400, {
               error: "invalid_grant",
               error_description:
                  "Fixture credentials only",
            });
         }
         if (url.pathname === "/auth/v1/user") {
            return send(
               response,
               request.headers.authorization ===
                  `Bearer ${fixtureToken}`
                  ? 200
                  : 401,
               request.headers.authorization ===
                  `Bearer ${fixtureToken}`
                  ? fixtureUser
                  : { error: "Invalid fixture token" },
            );
         }
         if (
            url.pathname ===
               "/fixture/delay-next-location" &&
            request.method === "POST"
         ) {
            const input = await readJson(request);
            if (
               !Number.isInteger(input?.ms) ||
               input.ms < 1 ||
               input.ms > 20000
            ) {
               return send(response, 400, {
                  error: "Delay must be 1-20000 ms",
               });
            }
            nextLocationDelayMs = input.ms;
            return send(response, 200, {
               nextLocationDelayMs,
            });
         }
         if (
            url.pathname ===
               "/fixture/delay-next-restaurant-write" &&
            request.method === "POST"
         ) {
            const input = await readJson(request);
            if (
               !Number.isInteger(input?.ms) ||
               input.ms < 1 ||
               input.ms > 20000
            ) {
               return send(response, 400, {
                  error: "Delay must be 1-20000 ms",
               });
            }
            nextRestaurantWriteDelayMs = input.ms;
            return send(response, 200, {
               nextRestaurantWriteDelayMs,
            });
         }
         if (url.pathname.endsWith("/locations-public")) {
            if (nextLocationDelayMs) {
               const delay = nextLocationDelayMs;
               nextLocationDelayMs = 0;
               delayedLocationRequests += 1;
               try {
                  await new Promise((resolve) =>
                     setTimeout(resolve, delay),
                  );
               } finally {
                  delayedLocationRequests -= 1;
               }
            }
            return send(response, 200, locations);
         }
         if (url.pathname === "/locations/weekly_schedule")
            return send(response, 200, weeklySchedule);
         if (
            url.pathname === "/locations/hearth-1/periods"
         ) {
            return send(response, 200, { periods: [] });
         }
         if (url.pathname === "/locations/hearth-1/menu") {
            return send(response, 200, {
               sections: [
                  {
                     name: "Lunch",
                     items: [
                        {
                           name: "Margherita Pizza",
                           calories: 360,
                           price: 5,
                        },
                     ],
                  },
               ],
            });
         }
         if (url.pathname === "/menu-source/hearth") {
            return send(response, 200, {
               sections: [
                  {
                     name: "Lunch",
                     items: [
                        {
                           name: "Margherita Pizza",
                           calories: 360,
                           price: 5,
                        },
                     ],
                  },
               ],
            });
         }
         if (
            url.pathname.startsWith("/auth/v1/") ||
            url.pathname.startsWith("/storage/v1/")
         ) {
            return send(response, 503, {
               error: "Auth and Storage require an actual isolated Supabase project.",
            });
         }

         const tableName = url.pathname.match(
            /^\/rest\/v1\/(\w+)$/,
         )?.[1];
         const rows = tables[tableName];
         if (!rows)
            return send(response, 404, {
               error: "Unknown fixture table",
            });
         if (
            request.method === "GET" ||
            request.method === "HEAD"
         ) {
            let found = matchingRows(
               rows,
               url.searchParams,
            );
            if (url.searchParams.has("limit")) {
               const limit = Number(
                  url.searchParams.get("limit"),
               );
               if (Number.isInteger(limit) && limit >= 0) {
                  found = found.slice(0, limit);
               }
            }
            const selection =
               url.searchParams.get("select");
            if (selection && selection !== "*") {
               const columns = selection.split(",");
               found = found.map((row) =>
                  Object.fromEntries(
                     columns.map((column) => [
                        column,
                        row[column],
                     ]),
                  ),
               );
            }
            if (
               request.headers.accept ===
               "application/vnd.pgrst.object+json"
            ) {
               return send(
                  response,
                  found.length === 1 ? 200 : 406,
                  found[0] ?? { message: "No fixture row" },
               );
            }
            return send(response, 200, found);
         }
         if (request.method === "POST") {
            const input = await readJson(request);
            if (
               tableName === "restaurants" &&
               nextRestaurantWriteDelayMs
            ) {
               const delay = nextRestaurantWriteDelayMs;
               nextRestaurantWriteDelayMs = 0;
               delayedRestaurantWrites += 1;
               try {
                  await new Promise((resolve) =>
                     setTimeout(resolve, delay),
                  );
               } finally {
                  delayedRestaurantWrites -= 1;
               }
            }
            const incoming = Array.isArray(input)
               ? input
               : [input];
            const updated = incoming.map((item) => {
               const conflictColumn =
                  url.searchParams.get("on_conflict");
               const existing =
                  conflictColumn &&
                  rows.find(
                     (row) =>
                        row[conflictColumn] ===
                        item[conflictColumn],
                  );
               if (existing)
                  return Object.assign(existing, item);
               const row = {
                  id:
                     tableName === "notifications"
                        ? randomUUID()
                        : Math.max(
                             0,
                             ...rows.map(
                                (value) =>
                                   Number(value.id) || 0,
                             ),
                          ) + 1,
                  ...item,
                  ...(tableName === "notifications"
                     ? {
                          created_at:
                             new Date().toISOString(),
                       }
                     : {}),
               };
               rows.push(row);
               return row;
            });
            return send(response, 201, updated);
         }
         if (request.method === "PATCH") {
            const changes = await readJson(request);
            const found = matchingRows(
               rows,
               url.searchParams,
            );
            found.forEach((row) =>
               Object.assign(row, changes),
            );
            return send(response, 200, found);
         }
         if (request.method === "DELETE") {
            const found = matchingRows(
               rows,
               url.searchParams,
            );
            for (const row of found)
               rows.splice(rows.indexOf(row), 1);
            return send(response, 200, found);
         }
         return send(response, 405, {
            error: "Unsupported fixture method",
         });
      } catch (error) {
         return send(response, 500, {
            error: error.message,
         });
      }
   },
);

server.listen(54321, "0.0.0.0");
const stop = () => {
   server.closeAllConnections();
   server.close();
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
