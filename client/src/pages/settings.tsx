import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Bell, Shield, User, Camera, Save, Download, AlertTriangle, Mail, Clock, X, Check, Ban, UserMinus, Search, FileText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserPreferences } from "@shared/schema";

interface BlacklistedUser {
  id: string;
  userId: number;
  username: string;
  avatar: string | null;
  level: number;
  rating: string;
}

function BlacklistSection() {
  const { toast } = useToast();
  const [searchId, setSearchId] = useState("");

  const { data: blacklist = [], isLoading } = useQuery<BlacklistedUser[]>({
    queryKey: ["/api/blacklist"],
  });

  const addToBlacklistMutation = useMutation({
    mutationFn: async (freelancerId: string) => {
      return apiRequest("POST", `/api/blacklist/${freelancerId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
      toast({ title: "Freelancer Blacklisted", description: "They can no longer apply to your jobs." });
      setSearchId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeFromBlacklistMutation = useMutation({
    mutationFn: async (freelancerId: string) => {
      return apiRequest("DELETE", `/api/blacklist/${freelancerId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
      toast({ title: "Removed from Blacklist", description: "Freelancer can now apply to your jobs." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const searchFreelancerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/find?userId=${userId}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "User not found");
      }
      return res.json();
    },
    onSuccess: (user) => {
      if (user.role !== "freelancer") {
        toast({ title: "Error", description: "Can only blacklist freelancers", variant: "destructive" });
        return;
      }
      addToBlacklistMutation.mutate(user.id);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5" />
          Freelancer Blacklist
        </CardTitle>
        <CardDescription>Block specific freelancers from applying to your jobs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Enter User ID to blacklist"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchId && searchFreelancerMutation.mutate(searchId)}
            data-testid="input-blacklist-user-id"
          />
          <Button
            onClick={() => searchId && searchFreelancerMutation.mutate(searchId)}
            disabled={!searchId || searchFreelancerMutation.isPending || addToBlacklistMutation.isPending}
            data-testid="button-add-to-blacklist"
          >
            <Ban className="w-4 h-4 mr-2" />
            Block
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading blacklist...</p>
        ) : blacklist.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Ban className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No freelancers are blacklisted.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Blocked Freelancers ({blacklist.length})</p>
            {blacklist.map((freelancer) => (
              <div
                key={freelancer.id}
                className="flex items-center justify-between p-2 border rounded-lg"
                data-testid={`blacklisted-${freelancer.id}`}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={freelancer.avatar || undefined} />
                    <AvatarFallback>{freelancer.username.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{freelancer.username}</p>
                    <p className="text-xs text-muted-foreground">ID: {freelancer.userId} | Level {freelancer.level}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeFromBlacklistMutation.mutate(freelancer.id)}
                  disabled={removeFromBlacklistMutation.isPending}
                  data-testid={`button-unblock-${freelancer.id}`}
                >
                  <UserMinus className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [newEmail, setNewEmail] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username || "");
      setBio(user.bio || "");
    }
  }, [user]);

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
    mutationFn: (data: { username?: string }) => apiRequest("PUT", "/api/profile", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await refetchUser();
      toast({ title: "Profile updated", description: "Your username has been saved." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error?.message || "Failed to update profile.", 
        variant: "destructive" 
      });
    },
  });

  const requestEmailChangeMutation = useMutation({
    mutationFn: (email: string) => apiRequest("POST", "/api/profile/email-change", { email }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await refetchUser();
      setNewEmail("");
      toast({ 
        title: "Verification email sent", 
        description: "Please check your inbox and click the verification link." 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error?.message || "Failed to send verification email.", 
        variant: "destructive" 
      });
    },
  });

  const cancelEmailChangeMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/profile/email-change", {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await refetchUser();
      toast({ title: "Cancelled", description: "Email change request has been cancelled." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel email change.", variant: "destructive" });
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

  const updateBioMutation = useMutation({
    mutationFn: (bio: string) => apiRequest("PUT", "/api/profile/bio", { bio }),
    onSuccess: async (data: { bio: string | null }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await refetchUser();
      setBio(data.bio || "");
      toast({ title: "Bio updated", description: "Your bio has been saved." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error?.message || "Failed to update bio.", 
        variant: "destructive" 
      });
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

  const handleEmailChange = () => {
    if (!newEmail.trim()) {
      toast({ title: "Error", description: "Please enter an email address.", variant: "destructive" });
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    
    requestEmailChangeMutation.mutate(newEmail.trim());
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

  const hasPendingEmail = !!user?.pendingEmail;

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
                <div className="flex gap-2">
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Your username"
                    data-testid="input-username"
                  />
                  <Button
                    onClick={() => updateProfileMutation.mutate({ username })}
                    disabled={updateProfileMutation.isPending || username === user?.username}
                    data-testid="button-save-username"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <Label htmlFor="bio">About Me</Label>
            </div>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell others about yourself, your skills, and what you can do..."
              className="min-h-[120px] resize-none"
              maxLength={500}
              data-testid="input-bio"
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {bio.length}/500 characters
              </span>
              <Button
                onClick={() => updateBioMutation.mutate(bio)}
                disabled={updateBioMutation.isPending || bio === (user?.bio || "")}
                data-testid="button-save-bio"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Bio
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Settings
          </CardTitle>
          <CardDescription>Manage your email address with verification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Current Email</Label>
            <div className="flex items-center gap-2">
              <Input 
                value={user?.email || "No email set"} 
                disabled 
                className="bg-muted"
                data-testid="input-current-email"
              />
              {user?.emailVerified && (
                <Badge variant="secondary" className="shrink-0">
                  <Check className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              )}
            </div>
          </div>

          {hasPendingEmail && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-800 dark:text-amber-200">Verification Pending</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    A verification email was sent to <strong>{user?.pendingEmail}</strong>. 
                    Please check your inbox and click the verification link.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => cancelEmailChangeMutation.mutate()}
                  disabled={cancelEmailChangeMutation.isPending}
                  data-testid="button-cancel-email-change"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {!hasPendingEmail && (
            <div className="space-y-2">
              <Label htmlFor="new-email">Change Email</Label>
              <div className="flex gap-2">
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Enter new email address"
                  data-testid="input-new-email"
                />
                <Button
                  onClick={handleEmailChange}
                  disabled={requestEmailChangeMutation.isPending || !newEmail.trim()}
                  data-testid="button-change-email"
                >
                  {requestEmailChangeMutation.isPending ? "Sending..." : "Verify"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                You will receive a verification email to confirm the change.
              </p>
            </div>
          )}
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
              <Label htmlFor="allow-dms">Allow Direct Messages</Label>
              <p className="text-sm text-muted-foreground">Allow other users to send you direct messages</p>
            </div>
            <Switch
              id="allow-dms"
              checked={settings?.allowDirectMessages ?? true}
              onCheckedChange={(checked) => toggleSetting("allowDirectMessages", checked)}
              data-testid="switch-allow-dms"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="allow-unknown-messages">Allow Messages from Unknown Users</Label>
              <p className="text-sm text-muted-foreground">When off, only people you've worked with, messaged before, or added as friends can contact you</p>
            </div>
            <Switch
              id="allow-unknown-messages"
              checked={settings?.allowMessagesFromUnknown ?? true}
              onCheckedChange={(checked) => toggleSetting("allowMessagesFromUnknown", checked)}
              data-testid="switch-allow-unknown-messages"
            />
          </div>
        </CardContent>
      </Card>

      {user?.role === "customer" && (
        <BlacklistSection />
      )}

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
              <p className="font-medium">Download Your Data</p>
              <p className="text-sm text-muted-foreground">Get a copy of all your account data</p>
            </div>
            <Button variant="outline" onClick={handleDownloadData} data-testid="button-download-data">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-destructive">Deactivate Account</p>
              <p className="text-sm text-muted-foreground">Temporarily disable your account</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" data-testid="button-deactivate-account">
                  Deactivate
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deactivate your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your account will be temporarily disabled. You can reactivate it by logging in again.
                    Your data will be preserved.
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
                    {isDeactivating ? "Deactivating..." : "Deactivate Account"}
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
