"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Home01Icon,
    TaskDaily01Icon,
    ComputerIcon,
    Settings01Icon,
    Key01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface SidebarProps {
    className?: string;
}

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname();

    const isActive = (path: string) => {
        if (path === "/") {
            return pathname === "/";
        }
        return pathname?.startsWith(path);
    };

    const navItems = [
        {
            name: "Home",
            href: "/",
            icon: Home01Icon,
        },
        {
            name: "Tasks",
            href: "/tasks",
            icon: TaskDaily01Icon,
        },
        {
            name: "Desktop",
            href: "/desktop",
            icon: ComputerIcon,
        },
        {
            name: "API Keys",
            href: "/settings",
            icon: Key01Icon,
        },
    ];

    return (
        <aside
            className={cn(
                "flex h-screen w-[72px] flex-col items-center border-r border-sidebar-border bg-sidebar py-4",
                className
            )}
        >
            {/* Logo / Brand Placeholder */}
            <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <span className="text-xl font-bold">F</span>
            </div>

            {/* Navigation Items */}
            <nav className="flex flex-1 flex-col gap-2 px-2">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "group flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            isActive(item.href)
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/70"
                        )}
                        title={item.name}
                    >
                        <HugeiconsIcon icon={item.icon} className="h-5 w-5" />
                        <span className="sr-only">{item.name}</span>
                    </Link>
                ))}
            </nav>

            {/* Footer / Settings */}
            <div className="mt-auto flex flex-col gap-2 px-2">
                {/* Placeholder for settings or user profile if needed */}
                <button
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    title="Settings"
                >
                    <HugeiconsIcon icon={Settings01Icon} className="h-5 w-5" />
                    <span className="sr-only">Settings</span>
                </button>
            </div>
        </aside>
    );
}
