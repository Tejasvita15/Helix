# MindTrail UI Kit

## Brand direction

MindTrail is a calm, simple healthcare and cognitive wellness app for patients and caregivers.

The UI should feel:
- Calm
- Trustworthy
- Warm
- Clear
- Modern
- Non-clinical
- Not childish

The app supports older adults and people experiencing cognitive decline, so the UI should reduce cognitive load.

## Product name

Use: MindTrail

Do not rename the product.

## Color palette

### Core colors

| Token | Name | Hex | Use |
|---|---|---:|---|
| --color-primary | Deep Teal | #0F766E | Primary actions |
| --color-primary-dark | Dark Teal | #115E59 | Pressed/hover state |
| --color-primary-soft | Soft Mint | #ECFDF5 | Gentle patient backgrounds |
| --color-background | Cloud White | #F8FAFC | App background |
| --color-surface | White | #FFFFFF | Cards and panels |
| --color-text-main | Charcoal | #111827 | Main text |
| --color-text-secondary | Slate | #374151 | Secondary text |
| --color-text-muted | Soft Gray | #64748B | Helper text |

### Supporting colors

| Token | Name | Hex | Use |
|---|---|---:|---|
| --color-caregiver | Calm Blue | #2563EB | Caregiver/report accent |
| --color-success | Green | #15803D | Completed/positive state |
| --color-success-soft | Soft Green | #DCFCE7 | Success background |
| --color-warning | Amber | #B45309 | Reminder/pending state |
| --color-warning-soft | Soft Amber | #FEF3C7 | Reminder background |
| --color-danger | Red | #B91C1C | Attention/risk state |
| --color-danger-soft | Soft Red | #FEE2E2 | Risk background |

## Typography

Preferred font stack:

font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

Patient-facing screens should use larger text than caregiver screens.

### Patient text scale

| Element | Size | Weight | Line height |
|---|---:|---:|---:|
| Screen title | 30-32px | 700 | 40px |
| Section title | 24-26px | 700 | 34px |
| Body text | 19-20px | 400/500 | 30px |
| Button text | 19-20px | 600 | 28px |
| Helper text | 16-17px | 400 | 24px |

### Caregiver text scale

| Element | Size | Weight | Line height |
|---|---:|---:|---:|
| Page title | 28-30px | 700 | 38px |
| Card title | 20-22px | 600/700 | 30px |
| Body text | 16-18px | 400/500 | 26px |
| Button text | 16-17px | 600 | 24px |

## Spacing

Use an 8px spacing system.

| Token | Value |
|---|---:|
| --space-xs | 4px |
| --space-sm | 8px |
| --space-md | 16px |
| --space-lg | 24px |
| --space-xl | 32px |
| --space-2xl | 40px |

## Shape

| Token | Value | Use |
|---|---:|---|
| --radius-card | 24px | Cards |
| --radius-button | 18px | Buttons |
| --radius-pill | 999px | Pills/badges |

## Shadows

Use soft shadows only.

--shadow-soft: 0 8px 24px rgba(15, 23, 42, 0.06);

## Patient buttons

Primary button:
- min-height: 64px
- border-radius: 18px
- font-size: 20px
- font-weight: 600
- background: #0F766E
- color: white

Secondary button:
- min-height: 60px
- border-radius: 18px
- font-size: 19px
- font-weight: 600
- background: white
- color: #0F766E
- border: 2px solid #0F766E

Choice button:
- min-height: 72px
- border-radius: 20px
- padding: 18px 20px
- font-size: 20px
- full width when possible

## Card style

Cards should use:
- background: #FFFFFF
- border-radius: 24px
- padding: 24px
- border: 1px solid #E5E7EB
- optional shadow: 0 8px 24px rgba(15, 23, 42, 0.06)

## Icon rules

- Use simple icons.
- Icons must always have text labels.
- Do not use icon-only navigation for patient screens.
- Avoid hidden hamburger menus for patient screens.

## Accessibility rules

- Use large readable text.
- Use high contrast.
- Do not rely on color alone.
- Use clear labels.
- Use one main action per screen where possible.
- Avoid long forms.
- Avoid fast animations.
- Avoid stressful timers in patient UI unless game logic already requires it.
- Avoid scary medical language.

## Tone of voice

Use calm, reassuring language.

Good:
"Let’s check how you are feeling today."

Avoid:
"Cognitive decline detected."

Good:
"Your caregiver can now see today’s summary."

Avoid:
"Report submitted for monitoring."