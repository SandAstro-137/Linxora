import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Settings, Bell, Shield, User, Camera, Save, Download, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserPreferences } from "@shared/schema";

export default function SettingsPage() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [isDeactivating, setIsDeactivating] = useState(false);

  const { data: settings, isLoading } = useQuery<UserPreferences>({
    queryKey: ["/api/settings"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (updates: Partial<UserPreferences>) => apiRequest("PUT", "/api/settings", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved", description: "Your preferences have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: { username?: string; email?: string }) => apiRequest("PUT", "/api/profile", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await refetchUser();
      toast({ title: "Profile updated", description: "Your profile has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" });
    },
  });

  const updateAvatarMutation = useMutation({
    mutationFn: (avatar: string) => apiRequest("PUT", "/api/profile/avatar", { avatar }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await refetchUser();
      toast({ title: "Profile picture updated", description: "Your new profile picture has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update profile picture.", variant: "destructive" });
    },
  });

  const deactivateAccountMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/deactivate-account", {}),
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to deactivate account.", variant: "destructive" });
      setIsDeactivating(false);
    },
  });

  const resizeImage = (file: File, maxSize: number = 400): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        
        const quality = 0.8;
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }

    try {
      const resizedImage = await resizeImage(file);
      updateAvatarMutation.mutate(resizedImage);
    } catch {
      toast({ title: "Error", description: "Failed to process image.", variant: "destructive" });
    }
  };

  const handleDownloadData = async () => {
    try {
      const response = await fetch("/api/settings/download-data", { credentials: "include" });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `linxora-data-${user?.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Download started", description: "Your data export is downloading." });
    } catch {
      toast({ title: "Error", description: "Failed to download data.", variant: "destructive" });
    }
  };

  const toggleSetting = (key: keyof UserPreferences, value: boolean) => {
    updateSettingsMutation.mutate({ [key]: value });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
          <p className="text-muted-foreground">Manage your account preferences and privacy</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Settings
          </CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-24 w-24">
                <AvatarImage src={user?.avatar || undefined} />
                <AvatarFallback className="text-2xl">{user?.username?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                variant="secondary"
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-change-avatar"
              >
                <Camera className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
                data-testid="input-avatar-file"
              />
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your username"
                  data-testid="input-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  data-testid="input-email"
                />
              </div>
            </div>
          </div>
          <Button
            onClick={() => updateProfileMutation.mutate({ username, email })}
            disabled={updateProfileMutation.isPending}
            data-testid="button-save-profile"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>Control how you receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notifications-enabled">Enable Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive notifications for important updates</p>
            </div>
            <Switch
              id="notifications-enabled"
              checked={settings?.notificationsEnabled ?? true}
              onCheckedChange={(checked) => toggleSetting("notificationsEnabled", checked)}
              data-testid="switch-notifications-enabled"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notification-sound">Notification Sound</Label>
              <p className="text-sm text-muted-foreground">Play a sound when you receive notifications</p>
            </div>
            <Switch
              id="notification-sound"
              checked={settings?.notificationSoundEnabled ?? true}
              onCheckedChange={(checked) => toggleSetting("notificationSoundEnabled", checked)}
              data-testid="switch-notification-sound"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="delete-confirmation">Delete Confirmation</Label>
              <p className="text-sm text-muted-foreground">Show confirmation prompt when deleting notifications</p>
            </div>
            <Switch
              id="delete-confirmation"
              checked={settings?.deleteConfirmationEnabled ?? true}
              onCheckedChange={(checked) => toggleSetting("deleteConfirmationEnabled", checked)}
              data-testid="switch-delete-confirmation"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy Settings
          </CardTitle>
          <CardDescription>Control your privacy and visibility</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="show-online-status">Show Online Status</Label>
              <p className="text-sm text-muted-foreground">Let others see when you're online</p>
            </div>
            <Switch
              id="show-online-status"
              checked={settings?.showOnlineStatus ?? true}
              onCheckedChange={(checked) => toggleSetting("showOnlineStatus", checked)}
              data-testid="switch-show-online-status"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="allow-direct-messages">Allow Direct Messages</Label>
              <p className="text-sm text-muted-foreground">Allow anyone to send you direct messages</p>
            </div>
            <Switch
              id="allow-direct-messages"
              checked={settings?.allowDirectMessages ?? true}
              onCheckedChange={(checked) => toggleSetting("allowDirectMessages", checked)}
              data-testid="switch-allow-direct-messages"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Account Management
          </CardTitle>
          <CardDescription>Manage your account data and status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Download My Data</Label>
              <p className="text-sm text-muted-foreground">Export all your account data as a JSON file</p>
            </div>
            <Button variant="outline" onClick={handleDownloadData} data-testid="button-download-data">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-destructive">Deactivate Account</Label>
              <p className="text-sm text-muted-foreground">Temporarily deactivate your account</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" data-testid="button-deactivate-account">
                  Deactivate
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deactivate Account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will deactivate your account. You will be logged out and your profile will be hidden. You can reactivate by contacting support.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setIsDeactivating(true);
                      deactivateAccountMutation.mutate();
                    }}
                    disabled={isDeactivating}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeactivating ? "Deactivating..." : "Deactivate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
