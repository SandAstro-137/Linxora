import { useState, useRef, useEffect, useCallback } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Bell, Shield, User, Camera, Save, AlertTriangle, Mail, Clock, X, Check, Ban, UserMinus, Search, FileText, LogOut, RefreshCw, Plus, ChevronUp, ZoomIn, ZoomOut, Move } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserPreferences } from "@shared/schema";

function ImageCropper({ imageSrc, onCrop, onCancel }: { imageSrc: string; onCrop: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerSize = 280;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const minScale = containerSize / Math.min(img.width, img.height);
      setScale(minScale);
      setOffset({
        x: (containerSize - img.width * minScale) / 2,
        y: (containerSize - img.height * minScale) / 2,
      });
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    if (!imgLoaded || !imgRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const img = imgRef.current;
    const iw = img.width * scale;
    const ih = img.height * scale;
    ctx.clearRect(0, 0, containerSize, containerSize);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(img, offset.x, offset.y, iw, ih);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(containerSize / 2, containerSize / 2, containerSize / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, offset.x, offset.y, iw, ih);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(containerSize / 2, containerSize / 2, containerSize / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [imgLoaded, scale, offset]);

  const getEventPos = (e: React.MouseEvent | React.TouchEvent) => {
    if ("touches" in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDragging(true);
    const pos = getEventPos(e);
    setDragStart({ x: pos.x - offset.x, y: pos.y - offset.y });
  };

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const pos = getEventPos(e);
    setOffset({ x: pos.x - dragStart.x, y: pos.y - dragStart.y });
  }, [dragging, dragStart]);

  const handlePointerUp = () => setDragging(false);

  const handleZoom = (newScale: number[]) => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const centerX = containerSize / 2;
    const centerY = containerSize / 2;
    const imgCenterX = (centerX - offset.x) / scale;
    const imgCenterY = (centerY - offset.y) / scale;
    const s = newScale[0];
    setScale(s);
    setOffset({
      x: centerX - imgCenterX * s,
      y: centerY - imgCenterY * s,
    });
  };

  const handleCrop = () => {
    if (!imgRef.current) return;
    const outputSize = 400;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = outputSize;
    exportCanvas.height = outputSize;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;
    const ratio = outputSize / containerSize;
    ctx.drawImage(imgRef.current, offset.x * ratio, offset.y * ratio, imgRef.current.width * scale * ratio, imgRef.current.height * scale * ratio);
    onCrop(exportCanvas.toDataURL("image/jpeg", 0.85));
  };

  const minScale = imgRef.current ? containerSize / Math.max(imgRef.current.width, imgRef.current.height) : 0.1;
  const maxScale = imgRef.current ? (containerSize / Math.min(imgRef.current.width, imgRef.current.height)) * 3 : 3;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground flex items-center gap-1">
        <Move className="w-3 h-3" /> Drag to reposition
      </p>
      <div
        className="relative cursor-grab active:cursor-grabbing"
        style={{ width: containerSize, height: containerSize, touchAction: "none" }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        <canvas
          ref={canvasRef}
          width={containerSize}
          height={containerSize}
          className="rounded-md"
          data-testid="canvas-image-cropper"
        />
      </div>
      <div className="flex items-center gap-3 w-full max-w-[280px]">
        <ZoomOut className="w-4 h-4 text-muted-foreground shrink-0" />
        <Slider
          min={minScale}
          max={maxScale}
          step={0.01}
          value={[scale]}
          onValueChange={handleZoom}
          data-testid="slider-zoom"
        />
        <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
      <DialogFooter className="w-full">
        <Button variant="outline" onClick={onCancel} data-testid="button-cancel-crop">Cancel</Button>
        <Button onClick={handleCrop} data-testid="button-save-crop">Save</Button>
      </DialogFooter>
    </div>
  );
}

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

  const parseErrorMessage = (error: Error): string => {
    try {
      const msg = error.message;
      const jsonStart = msg.indexOf("{");
      if (jsonStart !== -1) {
        const parsed = JSON.parse(msg.substring(jsonStart));
        return parsed.error || parsed.message || "Something went wrong";
      }
      return msg;
    } catch {
      return error.message || "Something went wrong";
    }
  };

  const addToBlacklistMutation = useMutation({
    mutationFn: async (freelancerId: string) => {
      const res = await apiRequest("POST", `/api/blacklist/${freelancerId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
      toast({ title: "Freelancer Blacklisted", description: "They can no longer apply to your jobs." });
      setSearchId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const removeFromBlacklistMutation = useMutation({
    mutationFn: async (freelancerId: string) => {
      const res = await apiRequest("DELETE", `/api/blacklist/${freelancerId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
      toast({ title: "Removed from Blacklist", description: "Freelancer can now apply to your jobs." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const searchFreelancerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("GET", `/api/users/find?userId=${userId}`);
      return await res.json();
    },
    onSuccess: (user: any) => {
      if (user.role !== "freelancer") {
        toast({ title: "Error", description: "Can only blacklist freelancers", variant: "destructive" });
        return;
      }
      addToBlacklistMutation.mutate(user.id);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
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

const defaultDemoAccounts = [
  { id: "demo-freelancer-1", username: "Alex Chen", role: "freelancer", avatar: null as string | null },
  { id: "demo-freelancer-2", username: "Sarah Johnson", role: "freelancer", avatar: null as string | null },
  { id: "demo-customer-1", username: "Tech Startup Inc", role: "customer", avatar: null as string | null },
  { id: "demo-moderator-1", username: "Admin User", role: "moderator", avatar: null as string | null },
  { id: "demo-founder-1", username: "Founder", role: "founder", avatar: null as string | null },
];

export default function SettingsPage() {
  const { user, refetchUser, logout, login } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [newEmail, setNewEmail] = useState("");
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username || "");
      setBio(user.bio || "");
    }
  }, [user]);

  const { data: demoAccounts } = useQuery<{ id: string; username: string; role: string; avatar: string | null }[]>({
    queryKey: ["/api/auth/demo-accounts"],
  });

  const accounts = demoAccounts || defaultDemoAccounts;

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
    mutationFn: async (bio: string) => {
      const res = await apiRequest("PUT", "/api/profile/bio", { bio });
      return res.json() as Promise<{ bio: string | null }>;
    },
    onSuccess: async (data) => {
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


  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropperImageSrc(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropComplete = (dataUrl: string) => {
    setCropperImageSrc(null);
    updateAvatarMutation.mutate(dataUrl);
  };

  const handleSwitchAccount = async (accountId: string) => {
    setSwitchingTo(accountId);
    try {
      await logout();
      await login(accountId);
      setAccountSheetOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/demo-accounts"] });
      toast({ title: "Account switched", description: "You are now logged in as a different account." });
    } catch {
      toast({ title: "Error", description: "Failed to switch account.", variant: "destructive" });
    } finally {
      setSwitchingTo(null);
    }
  };

  const handleLogout = () => {
    logout();
  };

  const toggleSetting = (key: keyof UserPreferences, value: boolean) => {
    updateSettingsMutation.mutate({ [key]: value });
  };

  const updateSetting = (key: keyof UserPreferences, value: string | boolean | number) => {
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
            <Dialog open={!!cropperImageSrc} onOpenChange={(open) => { if (!open) setCropperImageSrc(null); }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Crop Profile Picture</DialogTitle>
                </DialogHeader>
                {cropperImageSrc && (
                  <ImageCropper
                    imageSrc={cropperImageSrc}
                    onCrop={handleCropComplete}
                    onCancel={() => setCropperImageSrc(null)}
                  />
                )}
              </DialogContent>
            </Dialog>
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
          <div className="space-y-3">
            <div>
              <Label>Who Can Send You Direct Messages</Label>
              <p className="text-sm text-muted-foreground">Control who is allowed to start a direct message conversation with you</p>
            </div>
            <Select
              value={(settings?.allowDirectMessages as string) ?? "everyone"}
              onValueChange={(value) => updateSetting("allowDirectMessages" as keyof UserPreferences, value)}
              data-testid="select-allow-dms"
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Select who can message you" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="friends_and_associates">Friends &amp; Associates</SelectItem>
                <SelectItem value="friends">Friends only</SelectItem>
                <SelectItem value="associates">Associates only</SelectItem>
                <SelectItem value="none">No one</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <strong>Associates</strong> are people you share a job with or have exchanged messages with before.
              Moderators and staff can always message you regardless of this setting.
            </p>
          </div>
          <Separator />
          <div className="space-y-3">
            <div>
              <Label>Email Visibility on Profile</Label>
              <p className="text-sm text-muted-foreground">Choose who can see your email address on your profile. Email must be verified to change this setting.</p>
            </div>
            {!user?.emailVerified ? (
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Please verify your email address to control email visibility. Currently set to <strong>No one</strong>.
                </p>
              </div>
            ) : (
              <Select
                value={(settings as any)?.emailVisibility ?? "none"}
                onValueChange={(value) => updateSetting("emailVisibility" as keyof UserPreferences, value)}
                data-testid="select-email-visibility"
              >
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Select who can see your email" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No one</SelectItem>
                  <SelectItem value="friends">Friends only</SelectItem>
                  <SelectItem value="associates">Friends &amp; Associates</SelectItem>
                  <SelectItem value="all">Everyone</SelectItem>
                </SelectContent>
              </Select>
            )}
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
              <p className="font-medium">Swap Accounts</p>
              <p className="text-sm text-muted-foreground">Switch to a different account</p>
            </div>
            <Sheet open={accountSheetOpen} onOpenChange={setAccountSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" data-testid="button-swap-accounts">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Swap
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mb-4" />
                <SheetHeader className="text-left">
                  <SheetTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Switch Account
                  </SheetTitle>
                  <SheetDescription>
                    Select an account to switch to
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-2 max-h-[50vh] overflow-y-auto">
                  {accounts.map((account) => {
                    const isCurrentAccount = user?.discordId === account.id;
                    return (
                      <button
                        key={account.id}
                        onClick={() => !isCurrentAccount && handleSwitchAccount(account.id)}
                        disabled={isCurrentAccount || switchingTo !== null}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          isCurrentAccount 
                            ? "bg-primary/10 border-2 border-primary cursor-default" 
                            : "hover-elevate border border-border"
                        } ${switchingTo === account.id ? "opacity-50" : ""}`}
                        data-testid={`account-switch-${account.id}`}
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={account.avatar || undefined} />
                          <AvatarFallback className="text-lg">
                            {account.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <p className="font-medium">{account.username}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs capitalize">
                              {account.role}
                            </Badge>
                            {isCurrentAccount && (
                              <span className="text-xs text-primary font-medium">Current</span>
                            )}
                          </div>
                        </div>
                        {switchingTo === account.id && (
                          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {isCurrentAccount && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={handleLogout}
                    data-testid="button-add-account"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Another Account
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Logout</p>
              <p className="text-sm text-muted-foreground">Sign out of your account</p>
            </div>
            <Button variant="outline" onClick={handleLogout} data-testid="button-logout-settings">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
