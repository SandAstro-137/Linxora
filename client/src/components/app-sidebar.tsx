import { Home, Briefcase, Wallet, User, Shield, Clock, Bell } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  // Fetch unread notification count
  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!user && user.role === "freelancer",
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const freelancerItems = [
    { title: "Dashboard", url: "/dashboard", icon: Home },
    { title: "Current Job", url: "/current-job", icon: Briefcase },
    { title: "Browse Jobs", url: "/jobs", icon: Briefcase },
    { title: "My Wallet", url: "/wallet", icon: Wallet },
    { title: "My Profile", url: "/profile", icon: User },
    { title: "PTO Requests", url: "/pto", icon: Clock },
    { title: "Notifications", url: "/notifications", icon: Bell },
  ];

  const customerItems = [
    { title: "Dashboard", url: "/dashboard", icon: Home },
    { title: "My Jobs", url: "/my-jobs", icon: Briefcase },
    { title: "Browse Jobs", url: "/jobs", icon: Briefcase },
    { title: "My Wallet", url: "/wallet", icon: Wallet },
  ];

  const staffItems = [
    { title: "Dashboard", url: "/dashboard", icon: Home },
    { title: "Moderation Queue", url: "/moderation", icon: Shield },
    { title: "All Jobs", url: "/jobs", icon: Briefcase },
  ];

  const getMenuItems = () => {
    if (user?.role === "moderator" || user?.role === "staff") {
      return staffItems;
    }
    if (user?.role === "customer") {
      return customerItems;
    }
    return freelancerItems;
  };

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 px-2 py-4">
            <span className="text-lg font-bold text-primary">Pixelcut</span>
            {user && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {user.role}
              </Badge>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {getMenuItems().map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                      {item.title === "Notifications" && unreadCount > 0 && (
                        <Badge variant="destructive" className="ml-auto text-xs" data-testid="badge-unread-count">
                          {unreadCount}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
