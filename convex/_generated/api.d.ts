/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as availability from "../availability.js";
import type * as bookings from "../bookings.js";
import type * as cases from "../cases.js";
import type * as conversations from "../conversations.js";
import type * as customers from "../customers.js";
import type * as knowledge from "../knowledge.js";
import type * as services from "../services.js";
import type * as tenant from "../tenant.js";
import type * as tenants from "../tenants.js";
import type * as tools from "../tools.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  availability: typeof availability;
  bookings: typeof bookings;
  cases: typeof cases;
  conversations: typeof conversations;
  customers: typeof customers;
  knowledge: typeof knowledge;
  services: typeof services;
  tenant: typeof tenant;
  tenants: typeof tenants;
  tools: typeof tools;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
