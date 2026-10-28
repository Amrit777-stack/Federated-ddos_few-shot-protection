/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        soc: {
          bg: '#080808',           // Near-black background
          dark: '#0D0D0D',         // Secondary deep near-black (header, sidebar)
          panel: '#141414',        // Dark charcoal primary panels
          card: '#181818',         // Dark charcoal cards & surfaces
          cardHover: '#222222',    // Subtle interactive charcoal hover
          border: '#262626',       // Thin crisp industrial border
          borderLight: '#333333',  // Technical divider
          borderAccent: '#F97316', // Thin burnt-orange accent border
          orange: '#F97316',       // Primary brand accent: Burnt orange
          orangeDark: '#EA580C',   // Deep burnt orange for buttons/pressed
          orangeLight: '#FB923C',  // Light burnt orange for highlight
          crimson: '#EF4444',      // Red strictly for critical threats/errors
          amber: '#F59E0B',        // Amber for warnings/elevated states
          emerald: '#22C55E',      // Green strictly for healthy/success states
          muted: '#737373',        // Muted gray for secondary labels/descriptions
          text: '#EDEDED',         // Off-white primary text (no stark white)
          textMuted: '#A3A3A3',    // Secondary readable text
          textDim: '#525252',      // Tertiary captions
          // Aliases mapped to orange/neutral so any residual classes conform to theme
          blue: '#EA580C',
          cyan: '#F97316',
          cyanLight: '#FB923C'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
};
