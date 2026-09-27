import { supabase } from "./supabase";

export async function authenticatedFetch(
   url,
   options = {},
) {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data?.session?.access_token) {
      throw new Error("Sign in required");
   }

   return fetch(url, {
      ...options,
      headers: {
         ...options.headers,
         Authorization: `Bearer ${data.session.access_token}`,
      },
   });
}

export async function sessionFetch(url, options = {}) {
   const { data } = await supabase.auth.getSession();
   if (!data?.session?.access_token) {
      return fetch(url, options);
   }
   return fetch(url, {
      ...options,
      headers: {
         ...options.headers,
         Authorization: `Bearer ${data.session.access_token}`,
      },
   });
}
