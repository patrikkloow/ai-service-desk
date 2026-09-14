"use client";

import type { ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { TenantBootstrap } from "./tenant-bootstrap";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (convexUrl === undefined) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
}

const convex = new ConvexReactClient(convexUrl);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <TenantBootstrap>{children}</TenantBootstrap>
    </ConvexProviderWithClerk>
  );
}
