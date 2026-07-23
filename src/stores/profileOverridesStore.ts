import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

/**
 * Client-side profile overrides.
 *
 * The demo backend exposes no authenticated "update profile" endpoint, so
 * edits made in Settings → Profile are persisted here (keyed by user id) and
 * merged over the auth-derived profile by `useProfileData`. This makes the
 * profile form a real, persisted control — name/bio/timezone/photo changes
 * survive reloads and show up wherever the profile is rendered — rather than a
 * fake "saved!" toast that discarded the input.
 */
export interface ProfileOverride {
  name?: string;
  bio?: string;
  timezone?: string;
  /** Data-URL of a locally-chosen, downscaled avatar image. */
  picture?: string;
}

interface ProfileOverridesState {
  overrides: Record<string, ProfileOverride>;
  setProfileOverride: (userId: string, patch: ProfileOverride) => void;
  clearProfileOverride: (userId: string) => void;
}

export const useProfileOverridesStore = create<ProfileOverridesState>()(
  devtools(
    persist(
      (set) => ({
        overrides: {},
        setProfileOverride: (userId, patch) =>
          set(
            (state) => ({
              overrides: {
                ...state.overrides,
                [userId]: { ...state.overrides[userId], ...patch },
              },
            }),
            false,
            'setProfileOverride'
          ),
        clearProfileOverride: (userId) =>
          set(
            (state) => {
              const next = { ...state.overrides };
              delete next[userId];
              return { overrides: next };
            },
            false,
            'clearProfileOverride'
          ),
      }),
      { name: 'profile-overrides' }
    ),
    { name: 'profile-overrides' }
  )
);
