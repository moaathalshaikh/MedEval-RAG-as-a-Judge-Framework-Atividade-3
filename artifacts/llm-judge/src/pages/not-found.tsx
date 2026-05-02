import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Home } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="h-[80vh] w-full flex items-center justify-center"
    >
      <Card className="w-full max-w-md mx-4 rounded-none border-border bg-card/50 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-destructive" />
        <CardContent className="pt-12 pb-10 px-8 flex flex-col items-center text-center">
          <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
          
          <h1 className="text-2xl font-bold font-mono uppercase tracking-widest text-foreground mb-2">
            404: Route Not Found
          </h1>
          
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-8 leading-relaxed">
            The requested module path does not exist in the current execution environment.
          </p>
          
          <Link href="/">
            <Button variant="outline" className="rounded-none font-mono text-xs uppercase tracking-widest border-border/50 hover:bg-muted/50 h-12 px-6">
              <Home className="mr-2 h-4 w-4" />
              Return to Telemetry
            </Button>
          </Link>
        </CardContent>
      </Card>
    </motion.div>
  );
}