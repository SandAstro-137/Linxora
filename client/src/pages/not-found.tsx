import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-background via-accent/5 to-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mb-4">
            <div className="text-8xl font-bold text-primary mb-2">404</div>
            <Search className="w-12 h-12 mx-auto text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Page Not Found</CardTitle>
          <CardDescription>
            The page you're looking for doesn't exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild className="w-full" data-testid="button-go-home">
            <Link href="/dashboard">
              <Home className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/jobs">
              Browse Jobs
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
