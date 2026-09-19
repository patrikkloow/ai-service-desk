import { Inbox } from "@/components/inbox";
export default async function Page({searchParams}: {searchParams: Promise<{selected?: string; returnTo?: string}>}) {
  const {selected, returnTo} = await searchParams;
  const safeReturnTo = returnTo?.startsWith("/calendar?") ? returnTo : null;
  return <Inbox requestsOnly initialSelected={selected} returnTo={safeReturnTo} />;
}
