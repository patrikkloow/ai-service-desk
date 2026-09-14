"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "../../convex/_generated/api";

type TenantProvisioningState = {
  isReady: boolean;
  error: string | null;
};

const TenantProvisioningContext = createContext<TenantProvisioningState>({
  isReady: false,
  error: null,
});

/**
 * Provisions the active tenant only after both auth layers agree on the
 * current session. The active organization is used solely to decide when to
 * run; all identity, tenant, and role data is derived by Convex from the JWT.
 */
export function TenantBootstrap({ children }: { children: ReactNode }) {
  const { orgId, userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const ensureCurrentTenant = useMutation(api.tenants.ensureCurrentTenant);
  const lastProvisionedSessionKey = useRef<string | null>(null);
  const [provisionedSessionKey, setProvisionedSessionKey] = useState<
    string | null
  >(null);
  const [provisioningError, setProvisioningError] = useState<{
    sessionKey: string;
    message: string;
  } | null>(null);
  const sessionKey =
    isAuthenticated && orgId && userId ? `${userId}:${orgId}` : null;

  useEffect(() => {
    if (sessionKey === null) {
      lastProvisionedSessionKey.current = null;
      return;
    }

    if (lastProvisionedSessionKey.current === sessionKey) {
      return;
    }

    lastProvisionedSessionKey.current = sessionKey;

    void ensureCurrentTenant({})
      .then(() => {
        if (lastProvisionedSessionKey.current === sessionKey) {
          setProvisionedSessionKey(sessionKey);
        }
      })
      .catch(() => {
        if (lastProvisionedSessionKey.current === sessionKey) {
          lastProvisionedSessionKey.current = null;
          setProvisioningError({
            sessionKey,
            message: "The active workspace could not be prepared.",
          });
        }
      });
  }, [ensureCurrentTenant, sessionKey]);

  return (
    <TenantProvisioningContext.Provider
      value={{
        isReady: sessionKey !== null && provisionedSessionKey === sessionKey,
        error:
          provisioningError?.sessionKey === sessionKey
            ? provisioningError.message
            : null,
      }}
    >
      {children}
    </TenantProvisioningContext.Provider>
  );
}

export function useTenantProvisioning(): TenantProvisioningState {
  return useContext(TenantProvisioningContext);
}
