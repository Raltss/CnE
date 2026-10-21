import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // The two big libraries get their own files: they change far less often than
        // the app, so browsers keep them cached across app updates, and no single file
        // passes Vite's 500 kB warning. (Lighthouse scores are the same either way.)
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/](@supabase|iceberg-js)[\\/]/ },
          ],
        },
      },
    },
  },
})
