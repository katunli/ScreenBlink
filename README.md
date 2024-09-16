# Electron + React + Tailwind Boilerplate

A modern boilerplate to build cross-platform, high-performance desktop applications using Electron, React, Tailwind CSS, and other cutting-edge web development tools.
---
## Features

- Electron: Cross-platform desktop app development with web technologies.
- React: Efficient library for building dynamic user interfaces.
- Tailwind CSS: Utility-first CSS framework for fast UI development.
- Shadcn UI: Reusable and customizable components to speed up development.
- Vite: Lightning-fast development server with hot module replacement (HMR).
- Vitest: Fast and simple unit testing for React components.
- React Testing Library: Helps test React components in a user-centric way.
- Happy DOM: A fast DOM simulation for testing React components.
- Biome: A fast and reliable linter and code formatter for consistent code style.

## Getting Started

1. Clone or Fork the Repository

You can either use this template by clicking the "Use this template" button or clone the repository to your local machine:

git clone https://github.com/your-username/electron-react-tailwind-boilerplate.git
cd electron-react-tailwind-boilerplate

2. Install Dependencies

Once inside the project directory, install all required dependencies:

npm install

3. Run the Development Server

Start the project in development mode with hot-reloading enabled:

npm run dev

4. Run Tests

Run all tests with Vitest:

npm run test

To open the Vitest UI for a visual overview of your tests:

npm run test:ui

5. Build the Project

To build the project for production:

npm run build

This will bundle your application and prepare it for distribution across different platforms.

## Project Structure

.
├── src/                 # Source files for your application
│   ├── __tests__/       # Test setup and tests files 
│   ├── assets/          # Static assets like images and logos
│   ├── components/      # React components
│   ├── lib/             # Utils for ShadcnUI
│   ├── app.tsx          # Main application component
│   ├── index.css        # TailwindCSS config
│   └── main.tsx         # Entry point for the React app
├── public/              # Public folder for static files
├── coverage/            # UI files for Istanbul test file coverage
├── electron/            # Electron config files
├── package.json         # Project dependencies and scripts
├── biome.json           # Rules for lint and format with BiomeJS
├── components.json      # Shadcn components config file
├── vite.config.ts       # Vite configuration
├── vitest.config.ts     # Vitest configuration
└── README.md            # Project overview and instructions

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributions

Feel free to contribute! Please submit a pull request or open an issue for any changes or improvements.