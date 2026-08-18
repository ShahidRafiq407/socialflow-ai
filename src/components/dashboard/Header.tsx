"use client";

import { useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  Search,
  Bell,
  Building2,
  ChevronDown,
  PlusCircle,
  Settings,
  FolderGit2,
  Clock,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  User,
  Sliders,
  HelpCircle,
  Menu,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { sidebarLinks } from "@/components/dashboard/Sidebar";

interface HeaderProps {
  workspaces?: { id: string; name: string }[];
  userDetails?: { name: string; email: string } | null;
}

export function Header({ workspaces = [], userDetails = null }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const currentWorkspace = workspaces[0] || { name: "Default Workspace" };

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-4 md:px-6 backdrop-blur-md font-sans">
      {/* LEFT: Mobile Navigation (hamburger) + Workspace Dropdown */}
      <div className="flex items-center gap-3">
        {/* MOBILE NAV — 3-line menu visible only below md breakpoint */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
          >
            <Menu className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {sidebarLinks.map((item) => (
              <DropdownMenuItem key={item.href} className="p-0">
                <Link
                  href={item.href}
                  className="w-full flex items-center gap-3 px-2 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white"
                >
                  <item.icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <span>{item.name}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
          >
            <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate max-w-[140px]">{currentWorkspace.name}</span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Current Workspace
              </DropdownMenuLabel>
              <DropdownMenuItem className="flex items-center justify-between font-medium text-xs py-2">
                <span className="flex items-center gap-2 truncate">
                  <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{currentWorkspace.name}</span>
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
                  Active
                </Badge>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Switch Workspace
              </DropdownMenuLabel>
              {workspaces.slice(1).map((ws) => (
                <DropdownMenuItem key={ws.id} className="text-xs py-2">
                  <span className="flex items-center gap-2 truncate">
                    <FolderGit2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{ws.name}</span>
                  </span>
                </DropdownMenuItem>
              ))}
              {workspaces.length <= 1 && (
                <div className="px-2 py-2 text-xs text-slate-400">No other workspaces</div>
              )}
            </DropdownMenuGroup>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuGroup>
              <DropdownMenuItem className="text-xs p-0 text-primary font-medium">
                <Link href="/onboarding" className="w-full flex items-center px-1.5 py-2">
                  <PlusCircle className="h-3.5 w-3.5 mr-2" />
                  Create Workspace
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs p-0">
                <Link href="/dashboard/settings" className="w-full flex items-center px-1.5 py-2">
                  <Settings className="h-3.5 w-3.5 mr-2 text-slate-400" />
                  Workspace Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* RIGHT: Global Search, Notifications, Profile */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Search Popover */}
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger
            className="hidden md:flex items-center justify-between w-48 md:w-64 h-8 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-2.5 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 transition-all focus:outline-none"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <span>Search everything...</span>
            </span>
            <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-200/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              ⌘K
            </kbd>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 md:w-96 p-3 shadow-lg">
            <div className="flex items-center border-b pb-2 mb-2">
              <Search className="h-4 w-4 text-slate-400 mr-2" />
              <input
                type="text"
                placeholder="Search posts, campaigns, workflows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <span>Recent Searches</span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-0.5"
                    onClick={() => setSearchQuery("")}
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Clear</span>
                  </button>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs">
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <Clock className="h-3 w-3 text-slate-400" />
                      Q3 LinkedIn Thought Leadership
                    </span>
                    <ArrowUpRight className="h-3 w-3 text-slate-400" />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Quick Results
                </p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs">
                    <span className="flex items-center gap-2 text-primary font-medium">
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate AI Campaign
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      Action
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Notifications Popover */}
        <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <PopoverTrigger
            className="relative hidden md:flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
            title="Notifications"
          >
            <Bell className="h-3.5 w-3.5" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 md:w-96 p-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 mb-2 border-b">
              <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                Notifications
              </span>
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={() => setNotificationsOpen(false)}
              >
                Mark All Read
              </button>
            </div>

            <Tabs defaultValue="sys" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-7 bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="ai" className="text-[11px] font-medium h-5">
                  Alerts
                </TabsTrigger>
                <TabsTrigger value="sys" className="text-[11px] font-medium h-5">
                  System
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ai" className="mt-2 space-y-1.5">
                <div className="py-8 text-center text-xs text-slate-400">No new alerts</div>
              </TabsContent>

              <TabsContent value="sys" className="mt-2 space-y-1.5">
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200 mb-0.5">
                    <span className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-emerald-500" />
                      All Systems Operational
                    </span>
                    <span className="text-[10px] text-slate-400">Now</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Database and APIs connected.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none"
          >
            <User className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Profile &amp; Settings</span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">
                <div className="font-semibold">{userDetails?.name || "User"}</div>
                <div className="text-[11px] font-normal text-slate-500 truncate">
                  {userDetails?.email || ""}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs p-0">
                <Link href="/dashboard/settings" className="w-full flex items-center px-1.5 py-1.5">
                  <User className="h-3.5 w-3.5 mr-2 text-slate-400" />
                  Profile Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Account</span>
                <UserButton />
              </div>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
