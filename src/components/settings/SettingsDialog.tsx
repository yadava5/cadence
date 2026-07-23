import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
// import { Separator } from '@/components/ui/separator';
import { SettingsNav } from './SettingsNav';
import { ProfileSettings } from './ProfileSettings';
import { GeneralSettings } from './GeneralSettings';
import { PreferencesSettings } from './PreferencesSettings';
import { HelpSettings } from './HelpSettings';
import { CalendarSettings } from './CalendarSettings';

export type SettingsSection =
  | 'general'
  | 'profile'
  | 'preferences'
  | 'help'
  | 'calendar';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSection?: SettingsSection;
}

export function SettingsDialog({
  open,
  onOpenChange,
  defaultSection = 'general',
}: SettingsDialogProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>(defaultSection);

  // Update active section when defaultSection changes and dialog opens
  useEffect(() => {
    if (open) {
      setActiveSection(defaultSection);
    }
  }, [open, defaultSection]);

  // Safety net: if a Radix modal-lifecycle race ever leaves the body
  // pointer-events lock behind after this dialog closes (and no other modal is
  // open), release it so the page never gets stuck unclickable. Mirrors the
  // fix in CommandPalette.tsx (see commit 628a8fe) — the settings dialog opens
  // nested dialogs (delete-account, and now schedule-meeting via the toolbar)
  // that can trip the same footgun.
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      const anyModalOpen = document.querySelector(
        '[data-slot="dialog-content"][data-state="open"], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
      );
      if (!anyModalOpen && document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [open]);

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSettings />;
      case 'calendar':
        return <CalendarSettings />;
      case 'profile':
        return <ProfileSettings />;
      case 'preferences':
        return <PreferencesSettings />;
      case 'help':
        return <HelpSettings />;
      default:
        return <GeneralSettings />;
    }
  };

  const getSectionTitle = () => {
    switch (activeSection) {
      case 'general':
        return 'General';
      case 'calendar':
        return 'Calendar';
      case 'profile':
        return 'Profile';
      case 'preferences':
        return 'Preferences';
      case 'help':
        return 'Help & Support';
      default:
        return 'Settings';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full max-w-[calc(100vw-2rem)] sm:max-w-[90vw] md:max-w-6xl h-[80vh] max-h-[800px] p-0 gap-0 grid-rows-[auto_1fr]"
        closeButtonClassName="top-2"
      >
        <DialogHeader className="px-6 py-2 border-b">
          <DialogTitle className="text-xl font-semibold">Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row min-h-0 overflow-hidden">
          {/* Navigation Sidebar: a horizontal scrollable pill bar under sm,
              a fixed-width vertical sidebar at sm and up. The old unconditional
              w-64 crushed the content pane to ~90px on a 375px-wide dialog. */}
          <aside className="w-full sm:w-64 shrink-0 border-b sm:border-b-0 sm:border-r bg-muted/30 p-3 sm:p-4 overflow-x-auto sm:overflow-y-auto sm:overflow-x-visible">
            <div className="sm:space-y-1">
              <SettingsNav
                activeSection={activeSection}
                onSectionChange={setActiveSection}
              />
            </div>
          </aside>

          {/* Content Area */}
          <div className="flex-1 min-w-0 min-h-0 overflow-auto">
            <div className="p-6">
              <div className="mb-2 space-y-1">
                <h2 className="text-lg font-semibold">{getSectionTitle()}</h2>
                <p className="text-sm text-muted-foreground">
                  {activeSection === 'general' &&
                    'Manage your account and application settings'}
                  {activeSection === 'profile' &&
                    'Manage your personal information and preferences'}
                  {activeSection === 'preferences' &&
                    'Customize how information is displayed across the app'}
                  {activeSection === 'help' &&
                    'Get help, documentation, and support'}
                </p>
              </div>
              {/* Keep content tight to the header; separator removed to avoid large visual gap */}
              {renderContent()}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
