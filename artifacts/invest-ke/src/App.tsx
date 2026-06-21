import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Pages
import NotFound from "@/pages/not-found";
import MaintenancePage from "@/pages/maintenance";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import Dashboard from "@/pages/dashboard";
import Invest from "@/pages/invest";
import Transactions from "@/pages/transactions";
import Withdraw from "@/pages/withdraw";
import Support from "@/pages/support";
import Terms from "@/pages/legal/terms";
import Privacy from "@/pages/legal/privacy";
import Referrals from "@/pages/referrals";

// Admin pages
import AdminReferrals from "@/pages/admin/referrals";
import AdminDashboard from "@/pages/admin/index";
import AdminUsers from "@/pages/admin/users";
import AdminPlans from "@/pages/admin/plans";
import AdminTransactions from "@/pages/admin/transactions";
import AdminLogs from "@/pages/admin/logs";
import AdminFraud from "@/pages/admin/fraud";
import AdminRequests from "@/pages/admin/requests";
import AdminSettings from "@/pages/admin/settings";
import AdminWhatsApp from "@/pages/admin/whatsapp";
import AdminNotifications from "@/pages/admin/notifications";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/maintenance" component={MaintenancePage} />
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/support" component={Support} />
      <Route path="/legal/terms" component={Terms} />
      <Route path="/legal/privacy" component={Privacy} />

      {/* User — auth required (enforced in Layout) */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/invest" component={Invest} />
      <Route path="/transactions" component={Transactions} />
      <Route path="/withdraw" component={Withdraw} />
      <Route path="/referrals" component={Referrals} />

      {/* Admin — admin role required (enforced in Layout) */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/referrals" component={AdminReferrals} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/plans" component={AdminPlans} />
      <Route path="/admin/transactions" component={AdminTransactions} />
      <Route path="/admin/logs" component={AdminLogs} />
      <Route path="/admin/fraud" component={AdminFraud} />
      <Route path="/admin/requests" component={AdminRequests} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/whatsapp" component={AdminWhatsApp} />
      <Route path="/admin/notifications" component={AdminNotifications} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
