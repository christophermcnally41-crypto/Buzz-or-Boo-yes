/**
 * Semantic design tokens — synced from the sibling web artifact (artifacts/forecast/src/index.css).
 * HSL values converted to hex. Includes both light and dark themes.
 */

const colors = {
  light: {
    text: '#1F1913',
    tint: '#94C213',

    background: '#F5F2ED',
    foreground: '#1F1913',

    card: '#FAF9F7',
    cardForeground: '#1F1913',

    primary: '#94C213',
    primaryForeground: '#1F1913',

    secondary: '#E4E0DA',
    secondaryForeground: '#1F1913',

    muted: '#EBE8E2',
    mutedForeground: '#7C7169',

    accent: '#CC5830',
    accentForeground: '#FFFFFF',

    destructive: '#DB3B2B',
    destructiveForeground: '#FFFFFF',

    border: '#DDD8CF',
    input: '#DDD8CF',
  },

  dark: {
    text: '#F5F2ED',
    tint: '#B0E817',

    background: '#130F0C',
    foreground: '#F5F2ED',

    card: '#1C1714',
    cardForeground: '#F5F2ED',

    primary: '#B0E817',
    primaryForeground: '#130F0C',

    secondary: '#322C27',
    secondaryForeground: '#F5F2ED',

    muted: '#241F1B',
    mutedForeground: '#9E9388',

    accent: '#D87855',
    accentForeground: '#FFFFFF',

    destructive: '#E0483A',
    destructiveForeground: '#FFFFFF',

    border: '#322C27',
    input: '#322C27',
  },

  // Matches web --radius: 0.5rem = 8px
  radius: 8,
};

export default colors;
