import assert from "node:assert/strict";

const frontend = `http://127.0.0.1:${process.env.UMAMI_FRONTEND_PORT || 8083}`;
const api = `http://127.0.0.1:${process.env.UMAMI_API_PORT || 3003}`;
const ownerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

async function call(url, options = {}) {
   return fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10_000),
   });
}

async function expectStatus(label, url, options, expected) {
   const response = await call(url, options);
   if (response.status !== expected) {
      assert.equal(
         response.status,
         expected,
         `${label}: ${await response.text()}`,
      );
   }
   return response;
}

const login = await call(
   `${frontend}/supabase/auth/v1/token?grant_type=password`,
   {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
         email: "preview@calpoly.edu",
         password: "preview-only",
      }),
   },
);
assert.equal(login.status, 200, "fixture login failed");
const { access_token: accessToken } = await login.json();
assert.ok(accessToken, "fixture access token missing");
const auth = { Authorization: `Bearer ${accessToken}` };
const json = (body, headers = {}) => ({
   method: "POST",
   headers: {
      "Content-Type": "application/json",
      ...headers,
   },
   body: JSON.stringify(body),
});

await expectStatus(
   "unauthenticated review",
   `${api}/api/reviews`,
   json({ user_id: otherId, restaurant_id: 1, rating: 5 }),
   401,
);
await expectStatus(
   "invalid token",
   `${api}/api/reviews`,
   json(
      { restaurant_id: 1, rating: 5 },
      { Authorization: "Bearer invalid" },
   ),
   401,
);
await expectStatus(
   "cross-user review",
   `${api}/api/reviews`,
   json(
      { user_id: otherId, restaurant_id: 1, rating: 5 },
      auth,
   ),
   403,
);
await expectStatus(
   "private notifications",
   `${api}/api/notifications/${ownerId}`,
   {},
   401,
);
await expectStatus(
   "cross-user notifications",
   `${api}/api/notifications/${otherId}`,
   { headers: auth },
   403,
);
await expectStatus(
   "cross-user profile",
   `${api}/api/users/${otherId}`,
   {
      method: "PATCH",
      headers: {
         ...auth,
         "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Hijacked" }),
   },
   403,
);
await expectStatus(
   "cross-user bookmark",
   `${api}/api/restaurants/bookmarks/sync`,
   json({ user_id: otherId, added: [1] }, auth),
   403,
);
await expectStatus(
   "cross-user photo delete",
   `${api}/api/uploads/profile-photo/${otherId}`,
   { method: "DELETE", headers: auth },
   403,
);

const photo = new FormData();
photo.append("user_id", otherId);
photo.append(
   "file",
   new Blob(["fixture image"], { type: "image/png" }),
   "avatar.png",
);
await expectStatus(
   "unauthenticated photo",
   `${api}/api/uploads/profile-photo`,
   { method: "POST", body: photo },
   401,
);
await expectStatus(
   "cross-user photo",
   `${api}/api/uploads/profile-photo`,
   { method: "POST", headers: auth, body: photo },
   403,
);

const publicProfile = await expectStatus(
   "public profile",
   `${api}/api/users/${ownerId}`,
   {},
   200,
);
assert.equal(
   (await publicProfile.json()).email,
   undefined,
   "public email leaked",
);
const ownProfile = await expectStatus(
   "own profile",
   `${api}/api/users/${ownerId}`,
   { headers: auth },
   200,
);
assert.equal(
   (await ownProfile.json()).email,
   "preview@calpoly.edu",
);

await expectStatus(
   "owner bookmark add",
   `${api}/api/restaurants/bookmarks/sync`,
   json({ added: [1] }, auth),
   200,
);
const bookmarked = await expectStatus(
   "public bookmarks",
   `${api}/api/restaurants/bookmarks/${ownerId}`,
   {},
   200,
);
assert.equal((await bookmarked.json()).length, 1);
await expectStatus(
   "owner bookmark remove",
   `${api}/api/restaurants/bookmarks/sync`,
   json({ removed: [1] }, auth),
   200,
);
const emptyBookmarks = await expectStatus(
   "bookmark removal",
   `${api}/api/restaurants/bookmarks/${ownerId}`,
   {},
   200,
);
assert.equal((await emptyBookmarks.json()).length, 0);

const reminder = await expectStatus(
   "self reminder",
   `${api}/api/notifications`,
   json(
      { type: "profile_photo", message: "Forged text" },
      auth,
   ),
   201,
);
const reminderBody = await reminder.json();
assert.equal(reminderBody.user_id, ownerId);
assert.equal(
   reminderBody.message,
   "Don't forget to add a profile photo so others can recognize you!",
);

console.log(
   "Auth container smoke passed: denial, owner writes, public/private reads, and self reminder",
);
