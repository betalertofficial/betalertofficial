import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PhoneAuth } from "@/components/auth/PhoneAuth";
import { MyTriggers } from "@/components/dashboard/MyTriggers";
import { History } from "@/components/dashboard/History";
import { Settings } from "@/components/dashboard/Settings";
import { CreateTrigger } from "@/components/dashboard/CreateTrigger";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Bell } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/router";

type TabValue = "triggers" | "history" | "settings";
type ViewMode = "dashboard" | "create";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabValue>("triggers");
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Check for createTrigger URL param on mount
  useEffect(() => {
    if (router.isReady && router.query.createTrigger === "true") {
      setShowCreateModal(true);
      // Clean up URL param
      const { createTrigger, ...cleanQuery } = router.query;
      router.replace({ query: cleanQuery }, undefined, { shallow: true });
    }
  }, [router.isReady, router.query]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <PhoneAuth />;
  }

  useEffect(() => {
    if (router.query.createTrigger) {
      setViewMode("create");
    }
  }, [router.query.createTrigger]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border glass-panel sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Bet Alert
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {viewMode === "create" ? (
          <CreateTrigger
            onBack={() => setViewMode("dashboard")}
            onSuccess={() => {
              setViewMode("dashboard");
              setActiveTab("triggers");
            }}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-8">
              <TabsTrigger value="triggers">My Triggers</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="triggers">
              <MyTriggers onCreateNew={() => setShowCreateModal(true)} />
            </TabsContent>

            <TabsContent value="history">
              <History />
            </TabsContent>

            <TabsContent value="settings">
              <Settings />
            </TabsContent>
          </Tabs>
        )}

        {/* Create Trigger Modal */}
        <CreateTrigger
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          onSuccess={() => {
            setShowCreateModal(false);
            setActiveTab("triggers");
          }}
        />
      </main>

      <footer className="border-t border-border mt-16 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            I agree to receive SMS alerts from Hammer when my alerts trigger. Msg & data rates may apply. Reply STOP anytime to unsubscribe.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            © {new Date().getFullYear()} Bet Alert. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}