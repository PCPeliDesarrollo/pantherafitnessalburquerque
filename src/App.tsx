import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./components/AppSidebar";
import { NotificationBell } from "./components/NotificationBell";
import { ChangePasswordDialog } from "./components/ChangePasswordDialog";
import { NotificationPermissionRequest } from "./components/NotificationPermissionRequest";
import panteraMenuIcon from "@/assets/pantera-menu-icon.png";
import Profile from "./pages/Profile";
import GymInfo from "./pages/GymInfo";
import Classes from "./pages/Classes";
import ClassDetail from "./pages/ClassDetail";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import Calculator from "./pages/Calculator";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import ManageSchedules from "./pages/ManageSchedules";
import ManageClasses from "./pages/ManageClasses";
import ManagePayments from "./pages/ManagePayments";
import MyPayments from "./pages/MyPayments";
import TrainingTables from "./pages/TrainingTables";
import BuySingleClass from "./pages/BuySingleClass";
import PaymentSuccess from "./pages/PaymentSuccess";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNativePush } from "./hooks/useNativePush";


const queryClient = new QueryClient();

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const [showNotificationRequest, setShowNotificationRequest] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setShowNotificationRequest(true);
      }
    };
    checkAuth();
  }, []);

  return (
    <SidebarProvider>
      <AppLayoutContent showNotificationRequest={showNotificationRequest}>
        {children}
      </AppLayoutContent>
    </SidebarProvider>
  );
};

const AppLayoutContent = ({ 
  children, 
  showNotificationRequest 
}: { 
  children: React.ReactNode;
  showNotificationRequest: boolean;
}) => {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="min-h-screen flex w-full" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* iOS Safe Area - black bar for status bar */}
      <div className="fixed top-0 left-0 right-0 bg-black z-50" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 w-full">
        <header className="sticky top-0 z-10 h-12 sm:h-14 border-b border-border flex items-center justify-between px-2 sm:px-4 bg-card/95 backdrop-blur-sm">
          <button 
            onClick={toggleSidebar}
            className="md:hidden p-1.5 sm:p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Toggle menu"
          >
            <img src={panteraMenuIcon} alt="Menu" className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            <a 
              href="tel:+34623616950" 
              className="hidden sm:flex items-center gap-2 text-primary font-semibold hover:text-primary/80 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span className="text-sm">623 61 69 50</span>
            </a>
            <a 
              href="https://www.instagram.com/pantherafitnessalburquerque/" 
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center hover:opacity-80 transition-opacity"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: '#FED373', stopOpacity: 1 }} />
                    <stop offset="25%" style={{ stopColor: '#F15245', stopOpacity: 1 }} />
                    <stop offset="50%" style={{ stopColor: '#D92E7F', stopOpacity: 1 }} />
                    <stop offset="75%" style={{ stopColor: '#9B36B7', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#515ECF', stopOpacity: 1 }} />
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#instagram-gradient)" strokeWidth="2" fill="none"/>
                <circle cx="12" cy="12" r="4" stroke="url(#instagram-gradient)" strokeWidth="2" fill="none"/>
                <circle cx="18" cy="6" r="1.5" fill="url(#instagram-gradient)"/>
              </svg>
            </a>
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-auto min-w-0">
          <div className="p-2 sm:p-3 md:p-4 max-w-full">
            {showNotificationRequest && <NotificationPermissionRequest />}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

const App = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);

  useNativePush(userId);

  useEffect(() => {

    const checkUserStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setUserId(user.id);
        
        // Check if user needs to change password
        const { data: profile } = await supabase
          .from("profiles")
          .select("password_changed")
          .eq("id", user.id)
          .single();
        
        if (profile && !profile.password_changed) {
          setNeedsPasswordChange(true);
        } else {
          setNeedsPasswordChange(false);
        }
      }
    };

    checkUserStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          checkUserStatus();
        } else {
          setUserId(null);
          setNeedsPasswordChange(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <AppLayout>
                  <Classes />
                </AppLayout>
              }
            />
            <Route
              path="/profile"
              element={
                <AppLayout>
                  <Profile />
                </AppLayout>
              }
            />
            <Route
              path="/my-payments"
              element={
                <AppLayout>
                  <MyPayments />
                </AppLayout>
              }
            />
            <Route
              path="/tables"
              element={
                <AppLayout>
                  <TrainingTables />
                </AppLayout>
              }
            />
            <Route
              path="/gym-info"
              element={
                <AppLayout>
                  <GymInfo />
                </AppLayout>
              }
            />
            <Route
              path="/classes"
              element={
                <AppLayout>
                  <Classes />
                </AppLayout>
              }
            />
            <Route
              path="/classes/:id"
              element={
                <AppLayout>
                  <ClassDetail />
                </AppLayout>
              }
            />
            <Route
              path="/users"
              element={
                <AppLayout>
                  <Users />
                </AppLayout>
              }
            />
            <Route
              path="/users/:id"
              element={
                <AppLayout>
                  <UserDetail />
                </AppLayout>
              }
            />
            <Route
              path="/calculator"
              element={
                <AppLayout>
                  <Calculator />
                </AppLayout>
              }
            />
            <Route
              path="/manage-schedules"
              element={
                <AppLayout>
                  <ManageSchedules />
                </AppLayout>
              }
            />
            <Route
              path="/manage-classes"
              element={
                <AppLayout>
                  <ManageClasses />
                </AppLayout>
              }
            />
            <Route
              path="/manage-payments"
              element={
                <AppLayout>
                  <ManagePayments />
                </AppLayout>
              }
            />
            <Route path="/buy-single-class" element={<BuySingleClass />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        {userId && (
          <ChangePasswordDialog 
            open={needsPasswordChange} 
            onClose={() => setNeedsPasswordChange(false)}
            userId={userId} 
          />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
