import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, ShieldCheck, TrendingUp, Smartphone, Clock, Briefcase } from "lucide-react";
import { useGetPlans } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKES } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";

function useCountUp(target: number, duration = 1800) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (target === 0 || started.current) return;
    started.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
      else setValue(target);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

function usePlatformStats() {
  const [stats, setStats] = useState<{ users: number; totalPaidKES: number } | null>(null);
  useEffect(() => {
    fetch(apiUrl("/api/stats"))
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats({ users: 1000, totalPaidKES: 500000 }));
  }, []);
  return stats;
}

function AnimatedStat({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const safe = isNaN(value) || !isFinite(value) ? 0 : value;
  const count = useCountUp(safe);
  return <span>{prefix}{(count ?? 0).toLocaleString()}{suffix}</span>;
}

export default function Home() {
  const platformStats = usePlatformStats();
  const { data: plans = [] } = useGetPlans();
  const internshipPlan = plans.find(p => p.isInternship);
  const regularPlans = plans.filter(p => !p.isInternship && p.isActive).sort((a, b) => a.minDeposit - b.minDeposit);

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground py-20 lg:py-32">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542314831-c6a4d14210d3?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-primary to-primary/80"></div>
        
        <div className="container relative mx-auto px-4 z-10">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="outline" className="mb-6 border-secondary text-secondary bg-secondary/10 px-3 py-1 text-sm">
              Secure & Reliable Investing in Kenya
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Build your wealth with confidence.
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/80 mb-10 leading-relaxed max-w-2xl mx-auto">
              Zenti is the digital platform designed for everyday Kenyans. Earn daily returns, deposit seamlessly via M-Pesa, and watch your money grow.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold text-lg h-14 px-8">
                  Start Investing Today
                </Button>
              </Link>
              <Link href="/invest">
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-primary-foreground border-primary-foreground hover:bg-primary-foreground/10 h-14 px-8">
                  View Plans
                </Button>
              </Link>
            </div>
            
            <div className="mt-12 pt-8 border-t border-primary-foreground/20 flex flex-wrap justify-center gap-8 text-primary-foreground/70 text-sm font-medium">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Secure Platform</span>
              <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> M-Pesa Integrated</span>
              <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Daily Returns</span>
            </div>
          </div>
        </div>
      </section>

      {/* Internship Banner */}
      {internshipPlan && (
        <section className="bg-secondary/10 border-y border-secondary/20 py-12">
          <div className="container mx-auto px-4">
            <div className="bg-card border-2 border-secondary shadow-lg rounded-2xl p-6 md:p-10 flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Briefcase className="w-48 h-48" />
              </div>
              
              <div className="flex-1 relative z-10">
                <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary mb-4 px-3 py-1">Limited Time Offer</Badge>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">2-Day Internship Package</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  Special offer for new users registering June–July 2026. Try our platform risk-free, generate <span className="font-bold text-foreground">{formatKES(internshipPlan.internshipFixedEarning || 200)}</span> over 2 days, and withdraw your earnings directly to M-Pesa.
                </p>
                
                <div className="max-w-md space-y-2 mb-8">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Progress</span>
                    <span>2 Days</span>
                  </div>
                  <Progress value={33} className="h-3 bg-secondary/20 [&>div]:bg-secondary" />
                  <p className="text-xs text-muted-foreground text-right">Illustrative representation</p>
                </div>
                
              </div>
              
              <div className="w-full lg:w-auto relative z-10 shrink-0">
                <Link href="/register">
                  <Button size="lg" className="w-full lg:w-auto bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl h-16 px-10 text-lg rounded-xl flex items-center gap-2 group">
                    Claim Internship Package
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <p className="text-xs text-center text-muted-foreground mt-3">No deposit required for internship.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* How it Works */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold mb-4">How Zenti Works</h2>
            <p className="text-muted-foreground text-lg">Simple, transparent, and built for your convenience. Start earning in three easy steps.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold shadow-inner">1</div>
              <h3 className="text-xl font-bold">Register & Deposit</h3>
              <p className="text-muted-foreground">Create your account in seconds and deposit funds directly from your M-Pesa wallet.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold shadow-inner">2</div>
              <h3 className="text-xl font-bold">Choose a Plan</h3>
              <p className="text-muted-foreground">Select an investment plan that matches your financial goals and risk appetite.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold shadow-inner">3</div>
              <h3 className="text-xl font-bold">Earn & Withdraw</h3>
              <p className="text-muted-foreground">Watch your returns grow daily. Withdraw your initial deposit and profits directly to your phone or bank.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Investment Plans */}
      <section className="py-20 bg-muted/30 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold mb-4">Featured Investment Plans</h2>
              <p className="text-muted-foreground text-lg">Predictable returns designed to help you reach your financial milestones faster.</p>
            </div>
            <Link href="/invest">
              <Button variant="outline" className="hidden md:flex items-center gap-2">
                View All Plans <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {regularPlans.slice(0, 3).map((plan) => (
              <Card key={plan.id} className="border-border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description || `Earn ${plan.dailyReturnPercent}% daily for ${plan.durationDays} days.`}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground text-sm">Daily Return</span>
                    <span className="font-bold text-lg text-primary">{plan.dailyReturnPercent}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground text-sm">Duration</span>
                    <span className="font-bold text-foreground">{plan.durationDays} Days</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground text-sm">Min Deposit</span>
                    <span className="font-bold text-foreground">{formatKES(plan.minDeposit)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground text-sm">Max Deposit</span>
                    <span className="font-bold text-foreground">{formatKES(plan.maxDeposit)}</span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Link href={`/invest?plan=${plan.id}`} className="w-full">
                    <Button className="w-full">Invest Now</Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center md:hidden">
            <Link href="/invest">
              <Button variant="outline" className="w-full">
                View All Plans
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Trust & Stats */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-x divide-primary-foreground/20">
            <div className="px-4">
              <div className="text-4xl font-bold text-secondary mb-2">
                {platformStats ? <AnimatedStat value={platformStats.users} suffix="+" /> : "1,000+"}
              </div>
              <div className="text-sm font-medium text-primary-foreground/80 uppercase tracking-wider">Active Users</div>
            </div>
            <div className="px-4">
              <div className="text-4xl font-bold text-secondary mb-2">
                {platformStats ? (
                  platformStats.totalPaidKES >= 1_000_000
                    ? <AnimatedStat value={Math.floor(platformStats.totalPaidKES / 1_000_000)} prefix="KES " suffix="M+" />
                    : <AnimatedStat value={Math.floor(platformStats.totalPaidKES / 1_000)} prefix="KES " suffix="K+" />
                ) : "KES 500K+"}
              </div>
              <div className="text-sm font-medium text-primary-foreground/80 uppercase tracking-wider">Paid Out</div>
            </div>
            <div className="px-4">
              <div className="text-4xl font-bold text-secondary mb-2">&lt; 1 hr</div>
              <div className="text-sm font-medium text-primary-foreground/80 uppercase tracking-wider">Withdrawal Time</div>
            </div>
            <div className="px-4">
              <div className="text-4xl font-bold text-secondary mb-2">24/7</div>
              <div className="text-sm font-medium text-primary-foreground/80 uppercase tracking-wider">Local Support</div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
