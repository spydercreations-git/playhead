"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeamRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--bg)] text-[var(--text-3)] text-sm">
      Redirecting to Admin...
    </div>
  );
}
