import { Inbox } from "@/components/inbox";
export default async function Page({searchParams}: {searchParams: Promise<{selected?: string}>}) { const {selected} = await searchParams; return <Inbox initialSelected={selected} />; }
