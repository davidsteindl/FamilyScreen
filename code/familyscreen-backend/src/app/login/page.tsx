import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginCard } from "@/components/login-card";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <LoginCard />
    </main>
  );
}
