import express from "express";
import {
   requireAuth,
   requireOwner,
} from "../middleware/auth.js";
import { supabase } from "../config/supabaseClient.js";
import {
   Restaurant,
   Bookmark,
   MenuItem,
} from "../models/restaurantModel.js";
import { z } from "zod";

const router = express.Router();

const parseRestaurantId = (id) => {
   const restaurantId = Number(id);
   return Number.isInteger(restaurantId) && restaurantId > 0
      ? restaurantId
      : null;
};

// Get all restaurants
router.get("/", async (req, res) => {
   try {
      const { data } = await supabase
         .from("restaurants")
         .select("*");

      const validatedData = z.array(Restaurant).parse(data);

      res.status(200).json(validatedData);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

// Get bookmarks for a specific user
router.get(
   "/bookmarks/:userId",
   requireAuth,
   async (req, res) => {
      const { userId } = req.params;
      if (!requireOwner(req, res, userId)) {
         return;
      }
      try {
         // Step 1: Fetch all bookmarked restaurant ids for a user
         const { data: bookmarks, error: bookmarksError } =
            await supabase
               .from("bookmarks")
               .select("restaurant_id")
               .eq("user_id", userId);

         if (bookmarksError) {
            throw bookmarksError;
         }

         const restaurantIds = bookmarks.map(
            (b) => b.restaurant_id,
         );

         // Step 2: Use those restaurant ids to fetch the restaurant object
         const {
            data: restaurants,
            error: restaurantsError,
         } = await supabase
            .from("restaurants")
            .select(
               "id,name,location,image_urls,avg_rating",
            )
            .in("id", restaurantIds);

         if (restaurantsError) {
            throw restaurantsError;
         }

         res.status(200).json(restaurants);
      } catch (error) {
         res.status(500).json({ error: error.message });
      }
   },
);

// Get the signed-in user's bookmarks
router.get("/bookmarks", requireAuth, async (req, res) => {
   try {
      const { data, error } = await supabase
         .from("bookmarks")
         .select("*")
         .eq("user_id", req.authUser.id);

      if (error) {
         throw error;
      }

      const validatedData = z.array(Bookmark).parse(data);

      res.status(200).json(validatedData);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

// Add a restaurant to bookmarks
router.post("/bookmarks", requireAuth, async (req, res) => {
   const { restaurant_id } = req.body;
   if (!requireOwner(req, res, req.body.user_id)) {
      return;
   }
   const user_id = req.authUser.id;
   try {
      const { data, error } = await supabase
         .from("bookmarks")
         .insert({ user_id, restaurant_id });

      if (error) {
         return res.status(500).json(error);
      }

      res.status(201).json(data);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

// Sync bookmarks
router.post(
   "/bookmarks/sync",
   requireAuth,
   async (req, res) => {
      const { added, removed } = req.body;
      if (!requireOwner(req, res, req.body.user_id)) {
         return;
      }
      const user_id = req.authUser.id;
      try {
         // Handle removals
         if (removed && removed.length > 0) {
            const { error } = await supabase
               .from("bookmarks")
               .delete()
               .eq("user_id", user_id)
               .in("restaurant_id", removed);
            if (error) {
               throw error;
            }
         }

         // Handle additions
         if (added && added.length > 0) {
            const rowsToAdd = added.map((rid) => ({
               user_id,
               restaurant_id: rid,
            }));
            const { error } = await supabase
               .from("bookmarks")
               .insert(rowsToAdd);
            if (error) {
               throw error;
            }
         }

         res.status(200).json({
            message: "Sync successful",
         });
      } catch (error) {
         res.status(500).json({ error: error.message });
      }
   },
);

// Get menu items by restaurant id
router.get("/:id/menu", async (req, res) => {
   try {
      const restaurantId = parseRestaurantId(req.params.id);
      const { meal_period: mealPeriod } = req.query;

      if (!restaurantId) {
         return res
            .status(400)
            .json({ error: "Invalid restaurant id" });
      }

      if (
         mealPeriod &&
         (Array.isArray(mealPeriod) ||
            typeof mealPeriod !== "string")
      ) {
         return res
            .status(400)
            .json({ error: "Invalid meal period" });
      }

      let query = supabase
         .from("menu_items")
         .select("*")
         .eq("restaurant_id", restaurantId)
         .order("category", { ascending: true })
         .order("name", { ascending: true });

      if (mealPeriod) {
         query = query.eq("meal_period", mealPeriod);
      }

      const { data, error } = await query;

      if (error) {
         throw error;
      }

      const validatedData = z
         .array(MenuItem)
         .parse(data || []);

      const sections = validatedData.reduce((acc, item) => {
         const category = item.category || "Uncategorized";
         const existingSection = acc.find(
            (section) => section.category === category,
         );

         if (!existingSection) {
            acc.push({ category, items: [item] });
         } else {
            // Check if an item with this exact name already exists in this section
            const isDuplicate = existingSection.items.some(
               (existingItem) =>
                  existingItem.name.toLowerCase() ===
                  item.name.toLowerCase(),
            );

            if (!isDuplicate) {
               existingSection.items.push(item);
            }
         }

         return acc;
      }, []);

      res.status(200).json(sections);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

// Get tags by restaurant id
router.get("/:id/tags", async (req, res) => {
   try {
      const restaurantId = parseRestaurantId(req.params.id);

      if (!restaurantId) {
         return res
            .status(400)
            .json({ error: "Invalid restaurant id" });
      }

      const { data, error } = await supabase
         .from("restaurants")
         .select("tags")
         .eq("id", restaurantId)
         .single();

      if (error) {
         throw error;
      }

      // If no data is returned, the restaurant was not found
      if (!data) {
         return res
            .status(404)
            .json({ error: "Restaurant not found" });
      }

      res.status(200).json(data.tags || []);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

// Get restaurant by id
router.get("/:id", async (req, res) => {
   try {
      const restaurantId = parseRestaurantId(req.params.id);

      if (!restaurantId) {
         return res
            .status(400)
            .json({ error: "Invalid restaurant id" });
      }

      const { data, error } = await supabase
         .from("restaurants")
         .select("*")
         .eq("id", restaurantId)
         .single();

      if (error) {
         throw error;
      }

      // If no data is returned, the restaurant was not found
      if (!data) {
         return res
            .status(404)
            .json({ error: "Restaurant not found" });
      }
      const validatedData = Restaurant.parse(data);

      res.status(200).json(validatedData);
   } catch (error) {
      res.status(500).json({ error: error.message });
   }
});

export default router;
