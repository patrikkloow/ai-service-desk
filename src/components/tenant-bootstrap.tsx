"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Provisions the active tenant only after both auth layers agree on the
 * current session. The active organization is used solely to decide when to
 * run; all identity, tenant, and role data is derived by Convex from the JWT.
 */
export function TenantBootstrap() {
  const { orgId, userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const ensureCurrentTenant = useMutation(api.tenants.ensureCurrentTenant);
  const lastProvisionedSessionKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !orgId || !userId) {
      lastProvisionedSessionKey.current = null;
      return;
    }

    const sessionKey = `${userId}:${orgId}`;

    if (lastProvisionedSessionKey.current === sessionKey) {
      return;
    }

    lastProvisionedSessionKey.current = sessionKey;

    void ensureCurrentTenant({}).catch((error: unknown) => {
      if (lastProvisionedSessionKey.current === sessionKey) {
        lastProvisionedSessionKey.current = null;
      }

      console.error("Unable to provision the active tenant", error);
    });
  }, [ensureCurrentTenant, isAuthenticated, orgId, userId]);

  return null;
}
