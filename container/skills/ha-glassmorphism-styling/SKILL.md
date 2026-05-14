---
name: ha-glassmorphism-styling
description: |
  Home Assistant Lovelace dashboard glassmorphism styling with card-mod. Use when:
  (1) Creating frosted glass/blur effects on HA cards
  (2) Setting view backgrounds with themes or YAML
  (3) Fixing card overlap in sections view layout
  (4) Styling Mushroom cards with backdrop-filter
  (5) Light vs dark glassmorphism themes
  Covers card-mod CSS, backdrop-filter, Mushroom card selectors.
author: Claude Code
version: 1.0.0
date: 2026-01-25
---

# Home Assistant Glassmorphism Styling Guide

## Problem
Creating modern glassmorphism (frosted glass) effects on Home Assistant Lovelace dashboards while avoiding common issues like card overlap and incorrect theme application.

## Context / Trigger Conditions
- Want backdrop-filter blur on HA cards
- Cards overlapping in sections view
- Background not applying correctly
- Mushroom cards need glass effect styling
- Light or dark glassmorphism theme needed

## Solution

### 1. View Background Configuration

**YAML Method (in view config):**
```yaml
views:
  - title: Home
    path: home
    type: sections
    background:
      image: /local/background.png
      opacity: 50
      size: cover
      alignment: center
      attachment: fixed
```

**Theme Method (for all views):**
```yaml
frontend:
  themes:
    my-glass-theme:
      lovelace-background: center / cover no-repeat url("/local/background.png") fixed
```

**Solid Color Background:**
```yaml
views:
  - title: Home
    theme: my-theme
    background: "#F8F7FC"  # Light lavender
```

### 2. Glassmorphism Card Styling with card-mod

**Basic Frosted Glass Effect:**
```yaml
card_mod:
  style: |
    ha-card {
      background: rgba(255, 255, 255, 0.7) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      border-radius: 24px !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
    }
```

**Light Theme Glassmorphism:**
```yaml
card_mod:
  style: |
    ha-card {
      background: rgba(147, 112, 219, 0.06) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(147, 112, 219, 0.15) !important;
      border-radius: 24px !important;
      box-shadow: 0 4px 16px rgba(147, 112, 219, 0.1) !important;
    }
```

**Dark Theme Glassmorphism:**
```yaml
card_mod:
  style: |
    ha-card {
      background: rgba(26, 22, 37, 0.8) !important;
      backdrop-filter: blur(20px) !important;
      -webkit-backdrop-filter: blur(20px) !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      border-radius: 28px !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35) !important;
    }
```

### 3. Mushroom Card Specific Selectors

**Card background:**
```yaml
card_mod:
  style: |
    ha-card {
      background: rgba(255, 255, 255, 0.8) !important;
      backdrop-filter: blur(10px) !important;
    }
```

**Icon shape (requires $ for shadow DOM):**
```yaml
card_mod:
  style:
    mushroom-shape-icon$: |
      .shape {
        background: rgba(74, 222, 128, 0.2) !important;
      }
```

### 4. Preventing Card Overlap in Sections View

**Issue:** Cards can overlap when using custom heights or in sections layout.

**Solutions:**

1. **Use min-height instead of fixed height:**
```yaml
card_mod:
  style: |
    ha-card {
      min-height: 140px !important;  /* Not height: 140px */
    }
```

2. **Ensure proper grid options:**
```yaml
grid_options:
  columns: 1
  rows: auto
```

3. **Use spacer cards if needed:**
```yaml
- type: custom:mushroom-template-card
  primary: ""
  card_mod:
    style: |
      ha-card {
        background: transparent !important;
        box-shadow: none !important;
        min-height: 20px;
      }
```

### 5. Theme-Level Glass Effects

**In your theme YAML:**
```yaml
liquid-amethyst-light:
  # Backgrounds
  primary-background-color: "#F8F7FC"
  secondary-background-color: "#EFEDF5"

  # Card glass effect
  ha-card-background: "rgba(147, 112, 219, 0.06)"
  ha-card-border-radius: "24px"
  ha-card-border-width: "1px"
  ha-card-border-color: "rgba(147, 112, 219, 0.15)"
  ha-card-box-shadow: "0 4px 16px rgba(147, 112, 219, 0.1)"

  # Dialog blur
  dialog-backdrop-filter: "blur(5px)"
```

### 6. Cross-Browser Compatibility

Always include vendor prefixes:
```css
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
-moz-backdrop-filter: blur(12px);
```

## Verification

1. Check that cards have visible blur effect against background
2. Verify cards don't overlap by scrolling through sections
3. Test on target device (tablet/kiosk) as blur performance varies
4. Confirm theme colors match design system

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| No blur effect | Missing webkit prefix | Add `-webkit-backdrop-filter` |
| Cards overlap | Fixed height on cards | Use `min-height` instead |
| Background not showing | Wrong path | Use `/local/` for www folder |
| Theme not applying | Theme not loaded | Reload themes in HA settings |
| Blur too heavy on tablet | Performance | Reduce blur to 8-12px |

## Notes

- HA 2025.1.0+ has some card-mod compatibility issues - check GitHub for updates
- Sections view background color feature expected in HA 2025.10
- For kiosk mode, combine with kiosk-mode card to hide header/sidebar
- Performance: `backdrop-filter` can be heavy - reduce blur on slower devices

## References

- [Home Assistant Views Documentation](https://www.home-assistant.io/dashboards/views/)
- [Mushroom Cards Card Mod Styling Guide](https://community.home-assistant.io/t/mushroom-cards-card-mod-styling-config-guide/600472)
- [Card-mod GitHub](https://github.com/thomasloven/lovelace-card-mod)
- [Prism Dashboard (Glassmorphism Example)](https://github.com/BangerTech/Prism-Dashboard)
- [Frosted Glass Themes](https://github.com/wessamlauf/homeassistant-frosted-glass-themes)
