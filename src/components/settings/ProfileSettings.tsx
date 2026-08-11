import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Camera, Info } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useProfileData,
  useProfileFormData,
  TIMEZONE_OPTIONS,
} from '@/hooks/useProfileData';
import { useAuthStore } from '@/stores/authStore';
import { useProfileOverridesStore } from '@/stores/profileOverridesStore';

/**
 * Read an image File and return a downscaled JPEG data-URL (longest side
 * capped at `max`px). Keeps the persisted avatar tiny so it fits comfortably
 * in localStorage.
 */
function downscaleImageToDataUrl(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode the image'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas is unavailable'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const profileFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  // Email must not be editable via UI. We keep it for display-only in header.
  // The form schema intentionally omits email to prevent accidental submission
  // or local state changes to email.
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  timezone: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfileSettings() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  const profileData = useProfileData();
  const formData = useProfileFormData();
  const { authMethod } = useAuthStore();
  const setProfileOverride = useProfileOverridesStore(
    (s) => s.setProfileOverride
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: formData.name,
      bio: formData.bio,
      timezone: formData.timezone,
    },
    mode: 'onChange',
  });

  const onSubmit = async (data: ProfileFormValues) => {
    try {
      setIsSubmitting(true);
      setUpdateError(null);
      setUpdateSuccess(false);

      const userId = profileData.id;
      if (!userId) {
        throw new Error('You need to be signed in to update your profile');
      }

      // Persist the edit client-side (no backend profile endpoint exists on
      // the demo). useProfileData merges these over the auth data, so the
      // change is real, visible app-wide, and survives a reload.
      setProfileOverride(userId, {
        name: data.name.trim(),
        bio: data.bio?.trim() ? data.bio.trim() : undefined,
        timezone: data.timezone || undefined,
      });

      // Reset the form's baseline so "unsaved changes" clears without
      // discarding the just-saved values.
      form.reset({
        name: data.name,
        bio: data.bio ?? '',
        timezone: data.timezone ?? '',
      });

      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (error) {
      setUpdateError(
        error instanceof Error ? error.message : 'Failed to update profile'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhotoSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file later.
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUpdateError('Please choose an image file');
      return;
    }
    const userId = profileData.id;
    if (!userId) {
      setUpdateError('You need to be signed in to change your photo');
      return;
    }
    try {
      setUpdateError(null);
      const dataUrl = await downscaleImageToDataUrl(file);
      setProfileOverride(userId, { picture: dataUrl });
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (error) {
      setUpdateError(
        error instanceof Error ? error.message : 'Could not update your photo'
      );
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isDirty = form.formState.isDirty;

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="flex items-center space-x-4 p-4 border rounded-lg">
        <Avatar className="h-16 w-16">
          <AvatarImage src={profileData.picture} alt={profileData.name} />
          <AvatarFallback className="text-lg">
            {getInitials(profileData.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h3 className="font-medium text-lg">{profileData.name}</h3>
          <p className="text-sm text-muted-foreground">{profileData.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={authMethod === 'google' ? 'secondary' : 'outline'}
              className="text-xs"
            >
              {authMethod === 'google' ? 'Google Account' : 'Local Account'}
            </Badge>
            {profileData.joinedAt && (
              <span className="text-xs text-muted-foreground">
                Member since{' '}
                {new Date(profileData.joinedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoSelected}
          aria-hidden="true"
          tabIndex={-1}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="h-4 w-4 mr-2" />
          Change Photo
        </Button>
      </div>

      {/* Authentication Info */}
      {authMethod === 'google' && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Some fields may be read-only because you're signed in with Google.
            Changes to your email address must be made in your Google account.
          </AlertDescription>
        </Alert>
      )}

      {/* Profile Form */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Update your personal details and preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            {...(form as unknown as import('react-hook-form').UseFormReturn)}
          >
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name Field */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your full name"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription>
                        This is the name that will be displayed across the app
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email is not editable. Display-only row mirrors form inputs for consistency. */}
                <div className="space-y-2">
                  <FormLabel>Email Address</FormLabel>
                  <Input
                    type="email"
                    value={profileData.email}
                    readOnly
                    disabled
                  />
                  <FormDescription>
                    {profileData.canEditEmail
                      ? 'Email changes are restricted for security reasons. Contact support to update.'
                      : 'Email managed by your Google account'}
                  </FormDescription>
                </div>
              </div>

              {/* Bio Field */}
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell us a bit about yourself..."
                        className="resize-none"
                        rows={3}
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>
                      A brief description about yourself (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Timezone Field */}
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        disabled={isSubmitting}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="">Select timezone...</option>
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>
                      Your local timezone for scheduling and notifications
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Error/Success Messages */}
              {updateError && (
                <Alert variant="destructive">
                  <AlertDescription>{updateError}</AlertDescription>
                </Alert>
              )}

              {updateSuccess && (
                <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200">
                  <AlertDescription>
                    Profile updated successfully!
                  </AlertDescription>
                </Alert>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4">
                <div className="text-sm text-muted-foreground">
                  {isDirty && (
                    <span className="text-amber-600 dark:text-amber-400">
                      You have unsaved changes
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!isDirty || isSubmitting}
                    onClick={() => form.reset()}
                  >
                    Reset
                  </Button>
                  <Button type="submit" disabled={!isDirty || isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
