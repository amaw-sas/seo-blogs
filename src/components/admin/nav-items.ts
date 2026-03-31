import {
  LayoutDashboard,
  FileText,
  Key,
  Globe,
  Network,
  Calendar,
  ScrollText,
  ImageIcon,
  BarChart3,
  Settings,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Posts", href: "/posts", icon: FileText },
  { title: "Keywords", href: "/keywords", icon: Key },
  { title: "Sitios", href: "/sites", icon: Globe },
  { title: "Clusters", href: "/clusters", icon: Network },
  { title: "Calendario", href: "/calendar", icon: Calendar },
  { title: "Logs", href: "/logs", icon: ScrollText },
  { title: "Image Pool", href: "/image-pool", icon: ImageIcon },
  { title: "Pipeline", href: "/pipeline", icon: Workflow },
  { title: "Estadísticas", href: "/stats", icon: BarChart3 },
  { title: "Configuración", href: "/settings", icon: Settings },
];
