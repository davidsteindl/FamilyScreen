import SidebarNav from "./sidebar-nav";

type SidebarProps = {
  unread?: boolean;
};

export default function Sidebar({ unread = false }: SidebarProps) {
  return (
    <aside className="w-64 shrink-0 border-r border-neutral-200 bg-neutral-50/50 px-4 py-8">
      <p className="mb-6 px-3 text-lg text-neutral-400">FamilyScreen</p>

      <SidebarNav unread={unread} />
    </aside>
  );
}
