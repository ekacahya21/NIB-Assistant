---
name: NIB Assistant
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1b1c1c'
  on-surface-variant: '#3e4946'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0ef'
  outline: '#6e7976'
  outline-variant: '#bec9c5'
  surface-tint: '#046b5e'
  primary: '#004f45'
  on-primary: '#ffffff'
  primary-container: '#00695c'
  on-primary-container: '#94e5d5'
  inverse-primary: '#84d5c5'
  secondary: '#7e5700'
  on-secondary: '#ffffff'
  secondary-container: '#feb300'
  on-secondary-container: '#6a4800'
  tertiary: '#005111'
  on-tertiary: '#ffffff'
  tertiary-container: '#196b22'
  on-tertiary-container: '#97e990'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a0f2e1'
  primary-fixed-dim: '#84d5c5'
  on-primary-fixed: '#00201b'
  on-primary-fixed-variant: '#005046'
  secondary-fixed: '#ffdeac'
  secondary-fixed-dim: '#ffba38'
  on-secondary-fixed: '#281900'
  on-secondary-fixed-variant: '#604100'
  tertiary-fixed: '#a3f69c'
  tertiary-fixed-dim: '#88d982'
  on-tertiary-fixed: '#002204'
  on-tertiary-fixed-variant: '#005312'
  background: '#fcf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e5e2e1'
  bg-off-white: '#FAFAFA'
  border-light: '#E0E0E0'
  status-error: '#C62828'
  status-info: '#0277BD'
  surface-card: '#FFFFFF'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  caption:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-padding-mobile: 16px
  container-padding-desktop: 40px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 40px
  gutter: 16px
  max-width-form: 640px
---

## Brand & Style

The brand identity is built on the pillars of **Security, Guidance, and Clarity**. It aims to dismantle the intimidation factor of government bureaucracy for Indonesian UMKM owners. The visual language bridges the gap between a formal administrative tool and a helpful personal assistant.

This design system adopts a **Corporate / Modern** style with a focus on **Administrative Minimalism**. It prioritizes high legibility and a structured information hierarchy to ensure non-technical users feel in control. The interface uses a systematic layout with "bento-box" inspired cards and a clear step-by-step wizard flow to reduce cognitive load.

**Design Principles:**
- **Guidance over Grids:** Use progressive disclosure and steppers to lead users through complex data entry.
- **Trust through Transparency:** Explicitly label automation states and user-controlled actions.
- **Mobile-First Utility:** Large touch targets and tall input fields designed for one-handed operation on mobile devices.

## Colors

The palette is anchored by **Deep Teal (#00695C)**, a color that evokes institutional stability and progress. This is the primary driver for actions and progress indicators. 

**Warm Amber (#FFB300)** is used sparingly as an accent to highlight recommendations, help tooltips, and areas requiring user attention without inducing panic. 

**Status Colors** follow a "Calm Awareness" philosophy:
- **Success Green (#2E7D32):** Used for completed steps and successful NIB generation.
- **Error Red (#C62828):** Used for critical issues, but styled with soft edges to remain approachable.
- **Neutral Charcoal (#212121):** Ensuring AAA accessibility for all body text against the **Off-White (#FAFAFA)** background.

## Typography

This design system utilizes **Hanken Grotesk** for all roles. Its clean, sharp, and contemporary geometry provides the "Administrative-Modern" feel required. It is highly legible on mobile screens and conveys precision.

**Usage Rules:**
- **Headlines:** Use Bold (700) for page titles to establish clear hierarchy immediately.
- **Body:** Use Regular (400) for descriptions and instructions. Line height is set slightly wider (1.5x) to improve readability for long descriptions like KBLI details.
- **Labels:** Use Semi-Bold (600) for form labels and metadata to ensure they are distinct from user input.
- **Microcopy:** Use the `caption` style for autosave indicators and field-level help text.

## Layout & Spacing

The layout employs a **Fluid-to-Fixed** strategy. On mobile, it uses a single-column layout with 16px side margins. On desktop, content is constrained to a 640px center column to maintain focus and prevent long line lengths for forms.

**Spatial Rhythm:**
- **Vertical Stacking:** Use 24px (`stack-md`) between form groups and 40px (`stack-lg`) between major sections.
- **Touch Targets:** Buttons and input fields must maintain a minimum height of 48px for mobile accessibility.
- **Progressive Disclosure:** Use consistent 16px padding within cards to create a contained, organized feel.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers** and **Soft Ambient Shadows**. The background remains flat (Off-White), while interactive elements like KBLI recommendation cards use a white surface with a subtle shadow to indicate clickability.

- **Level 0 (Background):** `#FAFAFA` - The canvas.
- **Level 1 (Cards/Surface):** `#FFFFFF` with a 4px blur, 0.05 opacity black shadow. Used for choice cards and wizard steps.
- **Level 2 (Active/Floating):** Used for sticky bottom CTA bars on mobile. This uses a stronger shadow (12px blur, 0.1 opacity) to indicate it sits above the scrolling content.
- **Outlines:** Use 1px `#E0E0E0` borders for non-interactive containers to provide structure without adding visual weight.

## Shapes

The design system uses **Soft (0.25rem)** roundedness to maintain a professional, administrative character while avoiding the "sharpness" of traditional government sites. 

- **Standard Elements:** 4px radius for input fields and small buttons.
- **Cards & Modals:** 8px radius (`rounded-lg`) to give them a distinct, container-like feel.
- **Status Badges:** Fully rounded (capsule) to differentiate them from functional buttons.

## Components

### Buttons
- **Primary:** Filled with Primary Teal. High contrast, used for "Lanjut" or "Mulai".
- **Secondary:** Outlined with Primary Teal. Used for "Kembali" or "Edit".
- **Tertiary:** Text-only with underline or icon. Used for "Bantuan" or "Lihat Detail".

### Form Fields
- **Tall Inputs:** Minimum height of 56px for mobile. Includes clear floating labels and explicit error text below the field in Red.
- **Masked Inputs:** Used for NIK and Phone Numbers to guide correct data entry.

### KBLI Recommendation Cards
- **Structure:** Code (Label), Title (Headline-md), and Summary (Body-md).
- **Confidence Badge:** A small capsule badge in the top right (Green for High, Amber for Medium).
- **Comparison Toggle:** A checkbox or switch to select multiple codes.

### Automation Monitor
- **Timeline:** A vertical stepper showing "System Working" (Pulse animation) vs "Waiting for User" (Amber highlight).
- **Action Panel:** A persistent block at the bottom when user intervention (OTP/Captcha) is required.

### Stepper
- A compact horizontal line at the top of the wizard. On mobile, this may be simplified to "Step X of Y" to save vertical space.

### Status Badges
- Small, pill-shaped tags used in the dashboard.
- **Draft:** Gray background, Dark Gray text.
- **Running:** Teal background, White text.
- **Attention:** Amber background, Dark Charcoal text.