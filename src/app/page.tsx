"use client";

import {
  OrganizationSwitcher,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { CoreDataConsole } from "../components/core-data-console";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
      <Authenticated>
        <div className="w-full max-w-5xl rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">
                AI Service Desk
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                Your workspace is ready
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <OrganizationSwitcher />
              <UserButton />
            </div>
          </div>
          <CoreDataConsole />
        </div>
      </Authenticated>
      <Unauthenticated>
        <div className="rounded-xl bg-white p-8 text-center shadow-sm dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            AI Service Desk
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Sign in to access your organization workspace.
          </p>
          <SignInButton>
            <button
              className="mt-6 rounded-lg bg-zinc-950 px-4 py-2 font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
              type="button"
            >
              Sign in
            </button>
          </SignInButton>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <p className="text-zinc-600 dark:text-zinc-400">Loading workspace…</p>
      </AuthLoading>
    </main>
  );
}
