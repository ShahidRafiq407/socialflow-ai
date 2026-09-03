"use client";

import React, { useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Camera, Check, Loader2, Mail, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Profile section — the Clerk-facing half of the account.
 *
 * Avatar and name are editable here. Email, password and 2FA live in the Clerk
 * Account menu (the avatar button in the header) because changing them needs
 * verification flows this app must not reimplement — the email is shown
 * read-only instead.
 */

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

type ToastFn = (tone: "success" | "error" | "info", text: string) => void;

export function ProfileCard({ onToast }: { onToast: ToastFn }) {
  const { user, isLoaded } = useUser();

  // The form mounts only once the Clerk user is available, so its inputs can
  // initialize straight from the user — no sync effect needed.
  if (!isLoaded || !user) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return <ProfileForm key={user.id} user={user} onToast={onToast} />;
}

function ProfileForm({ user, onToast }: { user: ReturnType<typeof useUser>["user"]; onToast: ToastFn }) {
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const nameDirty =
    firstName.trim() !== (user?.firstName || "") || lastName.trim() !== (user?.lastName || "");

  const handleAvatarPicked = async (file: File | undefined) => {
    if (!file || !user) return;
    if (file.size > MAX_AVATAR_BYTES) {
      onToast("error", "That image is larger than 5MB. Please pick a smaller one.");
      return;
    }

    setUploadingAvatar(true);
    try {
      await user.setProfileImage({ file });
      onToast("success", "Profile photo updated.");
    } catch {
      onToast("error", "The photo could not be uploaded. Please try a different image.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      onToast("success", "Name saved.");
    } catch {
      onToast("error", "The name could not be saved. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const email = user?.primaryEmailAddress?.emailAddress || "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile photo</CardTitle>
          <CardDescription>
            Shown next to your posts and in the header. PNG or JPG up to 5MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user?.imageUrl}
                alt="Your profile photo"
                className="h-20 w-20 rounded-2xl object-cover ring-1 ring-foreground/10"
              />
              {uploadingAvatar && (
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleAvatarPicked(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                {uploadingAvatar ? "Uploading…" : "Upload new photo"}
              </button>
              <p className="text-xs text-muted-foreground max-w-xs">
                Changes apply everywhere immediately — no save needed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
          <CardDescription>Used when the AI addresses you and on your workspace profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-foreground">
              First name
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                maxLength={80}
                className="h-9"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-foreground">
              Last name
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                maxLength={80}
                className="h-9"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void saveName()}
              disabled={!nameDirty || savingName}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingName ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : nameDirty ? (
                <Save className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {savingName ? "Saving…" : nameDirty ? "Save name" : "Saved"}
            </button>
            {nameDirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email & sign-in security</CardTitle>
          <CardDescription>
            Email changes, password and two-factor settings are managed by your account menu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/10 border border-secondary/20 px-2.5 py-1 text-xs font-semibold text-secondary">
              <Mail className="h-3.5 w-3.5" />
              {email || "No email on file"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            To change your email address, password or two-factor authentication, click your avatar in
            the top-right header and open <span className="font-semibold text-foreground">Account</span>.
            Those changes need verification, so they happen in one secure place.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
