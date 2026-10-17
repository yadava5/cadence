/**
 * ColorPicker - Custom color picker with standardized color presets
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/Button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { COLOR_PRESETS } from '@/constants/colors';

export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  recentColors?: string[];
  onColorUsed?: (color: string) => void;
  className?: string;
  /**
   * Open the picker from somewhere other than its own swatch, such as a menu
   * item. With an anchor the picker renders no trigger, positions against the
   * anchor, starts focus in the hex field and returns it to the anchor on
   * close, so it can be driven from the keyboard. Pair with open/onOpenChange.
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  recentColors = [],
  onColorUsed,
  className,
  anchorRef,
  open,
  onOpenChange,
}) => {
  // Note: recentColors functionality not yet implemented
  void recentColors;
  const [inputValue, setInputValue] = useState(value);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const [committedColor, setCommittedColor] = useState(value);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // A click outside closes the picker; focus then belongs to what was clicked.
  const closedByPointerRef = useRef(false);

  // Keys stay inside the picker, except Tab when anchored: the popover's focus
  // scope needs it to cycle between the swatches and the hex field.
  const stopKeyPropagation = (e: React.KeyboardEvent) => {
    if (!(anchorRef && e.key === 'Tab')) e.stopPropagation();
  };

  // Detect theme changes
  useEffect(() => {
    const checkTheme = () => {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(isDark);
    };

    checkTheme();

    // Listen for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', checkTheme);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', checkTheme);
    };
  }, []);

  // Keep inputValue in sync with value prop only when popup is closed
  useEffect(() => {
    if (!isOpen) {
      setInputValue(value);
      setCommittedColor(value);
    }
  }, [value, isOpen]);

  const handleColorChange = useCallback(
    (color: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setInputValue(color);
      setCommittedColor(color);
      // Don't call onChange while popup is open to prevent re-renders
    },
    []
  );

  const handleCustomColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const color = e.target.value;
      setInputValue(color);
      // Update committed color for valid hex, but don't call onChange yet
      if (color.match(/^#[0-9A-Fa-f]{6}$/)) {
        setCommittedColor(color);
      }
    },
    []
  );

  // Handle popup close and commit the color
  const handlePopoverOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
      if (!nextOpen && committedColor !== value) {
        // Only call onChange when popup closes and color has changed
        onChange(committedColor);
        onColorUsed?.(committedColor);
      }
    },
    [open, onOpenChange, committedColor, value, onChange, onColorUsed]
  );

  // Create proper OKLCH color wheel for trigger button with theme responsiveness
  const multicolorGradient = `conic-gradient(in oklch from 0deg, 
    oklch(0.55 0.2 0), 
    oklch(0.55 0.2 60), 
    oklch(0.55 0.2 120), 
    oklch(0.55 0.2 180), 
    oklch(0.55 0.2 240), 
    oklch(0.55 0.2 300), 
    oklch(0.55 0.2 360)
  )`;

  const multicolorGradientDark = `conic-gradient(in oklch from 0deg, 
    oklch(0.75 0.2 0), 
    oklch(0.75 0.2 60), 
    oklch(0.75 0.2 120), 
    oklch(0.75 0.2 180), 
    oklch(0.75 0.2 240), 
    oklch(0.75 0.2 300), 
    oklch(0.75 0.2 360)
  )`;

  return (
    <Popover open={isOpen} onOpenChange={handlePopoverOpenChange} modal={false}>
      {anchorRef ? (
        <PopoverAnchor virtualRef={anchorRef} />
      ) : (
        <PopoverTrigger asChild>
          <button
            className={`w-3 h-3 rounded-full border border-border hover:scale-110 transition-transform ${className}`}
            style={{
              background: isDarkMode
                ? multicolorGradientDark
                : multicolorGradient,
            }}
            aria-label="Pick custom color"
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        </PopoverTrigger>
      )}
      <PopoverContent
        className="w-auto p-0"
        aria-label="Color picker"
        align="start"
        side="right"
        sideOffset={10}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (anchorRef) {
            inputRef.current?.focus();
            inputRef.current?.select();
          }
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (anchorRef && !closedByPointerRef.current) {
            anchorRef.current?.focus();
          }
          closedByPointerRef.current = false;
        }}
        onEscapeKeyDown={() => handlePopoverOpenChange(false)}
        onPointerDownOutside={(e) => {
          const target = e.target as Element;
          if (!target.closest('[data-radix-dropdown-menu-content]')) {
            closedByPointerRef.current = true;
            handlePopoverOpenChange(false);
          }
        }}
        onFocusOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div
          className="p-4 space-y-4"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={stopKeyPropagation}
        >
          {/* Preset Colors with close button on same row */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Preset Colors</Label>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handlePopoverOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  onClick={(e) => handleColorChange(color, e)}
                  className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                    committedColor === color
                      ? 'border-foreground'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Select color ${color}`}
                />
              ))}
            </div>
          </div>

          {/* Custom Color */}
          <div>
            <Label className="text-sm font-medium">Custom Color</Label>
            <div className="flex items-center gap-2 mt-2">
              <div
                className="w-8 h-8 rounded-full border-2 border-border/60 flex-shrink-0"
                style={{ backgroundColor: committedColor }}
                aria-label={`Current color ${committedColor}`}
              />
              <Input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleCustomColorChange}
                className="min-w-0 text-sm"
                placeholder="#000000"
                aria-label="Hex color"
                onKeyDown={(e) => {
                  if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    handlePopoverOpenChange(false);
                  }
                  stopKeyPropagation(e);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
                onMouseEnter={(e) => e.stopPropagation()}
                onMouseLeave={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerEnter={(e) => e.stopPropagation()}
                onPointerLeave={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ColorPicker;
