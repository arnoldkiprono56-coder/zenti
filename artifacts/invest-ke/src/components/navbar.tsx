import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Menu, X, ArrowUpFromLine, ShieldAlert, Users,
  LayoutDashboard, History, ArrowDownToLine,
  LogOut, KeyRound,
} from "lucide-react";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [location] = useLocation();
  const active = location === href;
  return (
    <Link href={href} className={`text-sm font-medium transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {children}
    </Link>
  );
}

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="bg-primary text-primary-foreground p-1 rounded">
            <ArrowUpFromLine className="h-5 w-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-primary">Zenti</span>
        </Link>

        {/* Desktop nav — authenticated only */}
        {isAuthenticated && (
          <nav className="hidden md:flex items-center gap-6">
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/invest">Invest</NavLink>
            <NavLink href="/transactions">Transactions</NavLink>
            <NavLink href="/referrals">Referrals</NavLink>
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">

          {!isAuthenticated ? (
            <>
              {/* Unauthenticated desktop */}
              <Link href="/login" className="hidden sm:inline-block">
                <Button variant="ghost">Log In</Button>
              </Link>
              <Link href="/register" className="hidden sm:inline-block">
                <Button>Get Started</Button>
              </Link>

              {/* Unauthenticated mobile hamburger */}
              <button
                className="sm:hidden p-2 rounded-md hover:bg-muted transition-colors"
                onClick={() => setMobileOpen(o => !o)}
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </>
          ) : (
            <>
              {/* Balance pill — desktop */}
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-xs text-muted-foreground">Balance</span>
                <span className="text-sm font-bold text-primary">KES {(user?.balance ?? 0).toLocaleString()}</span>
              </div>

              {/* Avatar dropdown (desktop + mobile) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full border-2 border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                        {user?.fullName?.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="pb-1">
                    <p className="font-semibold text-sm leading-tight">{user?.fullName}</p>
                    <p className="text-xs text-muted-foreground font-normal">{user?.email}</p>
                    {/* Balance in dropdown for mobile */}
                    <div className="sm:hidden mt-2 pt-2 border-t">
                      <p className="text-xs text-muted-foreground">Wallet Balance</p>
                      <p className="font-bold text-primary">KES {(user?.balance ?? 0).toLocaleString()}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {/* Mobile-only nav links (hidden on md+) */}
                  <div className="md:hidden">
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard" className="cursor-pointer flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4" /> Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/invest" className="cursor-pointer flex items-center gap-2">
                        <ArrowUpFromLine className="h-4 w-4" /> Deposit & Invest
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/withdraw" className="cursor-pointer flex items-center gap-2">
                        <ArrowDownToLine className="h-4 w-4" /> Withdraw
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/transactions" className="cursor-pointer flex items-center gap-2">
                        <History className="h-4 w-4" /> Transactions
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/referrals" className="cursor-pointer flex items-center gap-2">
                        <Users className="h-4 w-4" /> Referrals
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </div>

                  {/* Always visible account items */}
                  <DropdownMenuItem asChild>
                    <Link href="/support" className="cursor-pointer flex items-center gap-2">
                      <KeyRound className="h-4 w-4" /> Support
                    </Link>
                  </DropdownMenuItem>

                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="cursor-pointer flex items-center gap-2 text-primary font-medium">
                          <ShieldAlert className="h-4 w-4" /> Admin Panel
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="cursor-pointer text-destructive focus:text-destructive flex items-center gap-2"
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Mobile nav slide-down — unauthenticated only */}
      {!isAuthenticated && mobileOpen && (
        <div className="sm:hidden border-t bg-background px-4 py-4 flex flex-col gap-1">
          <Link href="/" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 rounded-lg hover:bg-muted text-sm font-medium">Home</Link>
          <Link href="/invest" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 rounded-lg hover:bg-muted text-sm font-medium">Investment Plans</Link>
          <Link href="/support" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 rounded-lg hover:bg-muted text-sm font-medium">Support</Link>
          <div className="mt-3 flex flex-col gap-2">
            <Link href="/login" onClick={() => setMobileOpen(false)}>
              <Button variant="outline" className="w-full">Log In</Button>
            </Link>
            <Link href="/register" onClick={() => setMobileOpen(false)}>
              <Button className="w-full">Get Started</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
