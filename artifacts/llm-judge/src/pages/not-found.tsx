import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-[80vh] flex items-center justify-center"
    >
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-5xl font-bold text-foreground">404</h1>
          <p className="text-lg font-semibold text-foreground mt-1">Page not found</p>
          <p className="text-sm text-muted-foreground mt-2">The page you're looking for doesn't exist.</p>
        </div>
        <Link href="/">
          <Button className="gap-2 mt-2">
            <Home className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
