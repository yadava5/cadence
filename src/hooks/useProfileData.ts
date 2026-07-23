import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileOverridesStore } from '@/stores/profileOverridesStore';

export interface NormalizedProfileData {
  id: string;
  name: string;
  email: string;
  bio?: string;
  timezone?: string;
  picture?: string;
  canEditEmail: boolean;
  authMethod: 'jwt' | 'google';
  joinedAt?: string;
}

export interface ProfileFormData {
  name: string;
  bio?: string;
  timezone?: string;
}

/**
 * Hook to normalize user data from different authentication methods
 * Provides a unified interface for profile data regardless of auth method
 */
export function useProfileData(): NormalizedProfileData {
  const { user, googleUser, authMethod } = useAuthStore();
  const overrides = useProfileOverridesStore((s) => s.overrides);

  return useMemo(() => {
    // Handle case where no auth method is set
    if (!authMethod) {
      return {
        id: '',
        name: 'User',
        email: 'user@example.com',
        canEditEmail: true,
        authMethod: 'jwt' as const,
      };
    }

    // Normalize data based on authentication method
    const isJWT = authMethod === 'jwt';
    const currentUser = isJWT ? user : googleUser;

    if (!currentUser) {
      return {
        id: '',
        name: 'User',
        email: 'user@example.com',
        canEditEmail: isJWT,
        authMethod,
      };
    }

    const base: NormalizedProfileData = {
      id: currentUser.id,
      name: currentUser.name || 'User',
      email: currentUser.email || 'user@example.com',
      // These fields are only available for JWT users in our store typing
      bio: isJWT ? (user as unknown as { bio?: string })?.bio : undefined,
      timezone: isJWT
        ? (user as unknown as { timezone?: string })?.timezone
        : undefined,
      picture: currentUser.picture,
      canEditEmail: isJWT, // Google users can't edit email
      authMethod,
      joinedAt: isJWT
        ? (user as unknown as { createdAt?: string })?.createdAt
        : undefined,
    };

    // Merge locally-saved profile edits (Settings → Profile) over the
    // auth-derived values so saved changes actually show and persist.
    const ov = base.id ? overrides[base.id] : undefined;
    if (!ov) return base;
    return {
      ...base,
      name: ov.name?.trim() ? ov.name : base.name,
      bio: ov.bio ?? base.bio,
      timezone: ov.timezone ?? base.timezone,
      picture: ov.picture ?? base.picture,
    };
  }, [user, googleUser, authMethod, overrides]);
}

/**
 * Hook to get form data for profile editing
 * Extracts only editable fields based on auth method
 */
export function useProfileFormData(): ProfileFormData {
  const profileData = useProfileData();

  return useMemo(
    () => ({
      name: profileData.name,
      bio: profileData.bio || '',
      timezone: profileData.timezone || '',
    }),
    [profileData]
  );
}

/**
 * Common timezone options for profile settings
 */
export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European Time (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
  { value: 'Asia/Shanghai', label: 'China Standard Time (CST)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' },
] as const;
