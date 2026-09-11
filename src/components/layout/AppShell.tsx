import type { ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "../ui/sidebar";
import { AppSidebar } from "./Sidebar";
import { Header } from "./Header";
import { PendingInvitationsProvider } from "../invitations/PendingInvitationsProvider";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      {/* Inside the sidebar provider so the Header can consume it later. Its
          fetch is gated on a mounted trigger, so this costs nothing on pages
          that have none. */}
      <PendingInvitationsProvider>
        <AppSidebar />
        <SidebarInset>
          <Header />
          <div className="relative flex flex-1 flex-col gap-4 overflow-hidden p-6">{children}</div>
        </SidebarInset>
      </PendingInvitationsProvider>
    </SidebarProvider>
  );
}
