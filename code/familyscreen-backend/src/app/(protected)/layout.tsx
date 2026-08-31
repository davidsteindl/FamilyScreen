import { auth } from "@/auth";
import Sidebar from "@/components/sidebar/sidebar";
import { redirect } from "next/navigation";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      {/* The one place the page chrome lives, so no route can drift out of
          step: same padding everywhere, and min-w-0 keeps wide content from
          stretching the row instead of scrolling inside it. */}
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
