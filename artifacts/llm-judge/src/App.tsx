import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { AppLayout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Models from "@/pages/models";
import Datasets from "@/pages/datasets";
import DatasetDetail from "@/pages/dataset-detail";
import Inference from "@/pages/inference";
import Evaluate from "@/pages/evaluate";
import Results from "@/pages/results";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/models" component={Models} />
        <Route path="/datasets" component={Datasets} />
        <Route path="/datasets/:id" component={DatasetDetail} />
        <Route path="/inference" component={Inference} />
        <Route path="/evaluate" component={Evaluate} />
        <Route path="/results" component={Results} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
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
