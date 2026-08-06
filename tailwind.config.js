/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                zinc: {
                    950: '#09090b',
                }
            },
            fontFamily: {
                mono: ['Menlo', 'Monaco', 'Courier New', 'monospace'],
                sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
            }
        },
    },
    plugins: [],
};
