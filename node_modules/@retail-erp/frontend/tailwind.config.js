/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" }
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        success: {
          DEFAULT: "hsl(142 76% 36%)",
          foreground: "hsl(0 0% 100%)"
        },
        warning: {
          DEFAULT: "hsl(38 92% 50%)",
          foreground: "hsl(0 0% 100%)"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0, 0, 0, 0.03)',
        'medium': '0 5px 20px rgba(0, 0, 0, 0.06)',
        'hard': '0 10px 40px rgba(0, 0, 0, 0.1)',
      },
      fontFamily: {
        sans: ["SF Pro Display", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"]
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0, opacity: 0 },
          to: { height: "var(--radix-accordion-content-height)", opacity: 1 }
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: 1 },
          to: { height: 0, opacity: 0 }
        },
        "fade-in": {
          from: { opacity: 0, transform: "scale(0.98)" },
          to: { opacity: 1, transform: "scale(1)" }
        },
        "slide-in-from-top": {
          from: { transform: "translateY(-20px)", opacity: 0 },
          to: { transform: "translateY(0)", opacity: 1 }
        },
        "slide-in-from-right": {
          from: { transform: "translateX(20px)", opacity: 0 },
          to: { transform: "translateX(0)", opacity: 1 }
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.8 }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "accordion-up": "accordion-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in": "slide-in-from-top 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slide-in-from-right 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-subtle": "pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
