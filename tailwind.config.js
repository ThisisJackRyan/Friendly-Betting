/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('postcss-nested'), // add this line
    require('autoprefixer'),
    require('tailwindcss'),
    
  ]
}

