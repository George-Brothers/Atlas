"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/** Destroy the session cookie and return to the login page. */
export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
