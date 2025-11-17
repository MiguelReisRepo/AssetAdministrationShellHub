# AI Rules for AASX Visualizer Application

This document outlines the core technologies used in this application and provides clear guidelines on which libraries to use for specific functionalities. Adhering to these rules ensures consistency, maintainability, and efficient development.

## Tech Stack Description

*   **React 19**: The core JavaScript library for building user interfaces.
*   **Next.js**: The React framework for production, providing server-side rendering, routing, and API routes.
*   **TypeScript**: A superset of JavaScript that adds static typing, enhancing code quality and developer experience.
*   **Tailwind CSS**: A utility-first CSS framework used for all styling, enabling rapid UI development and consistent design.
*   **shadcn/ui**: A collection of reusable UI components built on Radix UI and styled with Tailwind CSS, providing accessible and customizable UI primitives.
*   **Lucide React**: A library of beautiful and consistent open-source icons, used throughout the application.
*   **React Hook Form & Zod**: Libraries for efficient form management and schema-based validation.
*   **JSZip**: A JavaScript library for creating, reading, and editing `.zip` files, specifically used for handling `.aasx` archives.
*   **Recharts**: A composable charting library built with React and D3, used for data visualization.
*   **Sonner**: A modern toast library for displaying notifications.
*   **Vaul**: A headless UI library for building drawers, used for mobile-friendly sheets.
*   **Fast XML Parser**: A high-performance XML parser for converting XML to JSON and vice-versa.

## Library Usage Rules

To maintain a consistent and efficient codebase, please follow these guidelines when implementing new features or modifying existing ones:

*   **UI Components**: Always prioritize `shadcn/ui` components for building user interfaces. If a specific component is not available or requires significant customization, create a new component that leverages `shadcn/ui` primitives or Tailwind CSS directly, rather than modifying existing `shadcn/ui` files.
*   **Styling**: Use Tailwind CSS exclusively for all styling. Avoid inline styles or custom CSS files unless absolutely necessary for global styles (e.g., `globals.css`).
*   **Icons**: All icons should be sourced from the `lucide-react` library.
*   **Forms**: For any form management, including state, validation, and submission, use `react-hook-form`. All form schema validation should be handled with `zod`.
*   **Data Visualization**: When creating charts or any other data visualizations, use `recharts`.
*   **Toasts/Notifications**: For displaying temporary, non-intrusive messages to the user (e.g., success, error, loading), use `sonner`.
*   **Modals & Drawers**: Use `shadcn/ui`'s `Dialog` component for traditional modal dialogs. For mobile-friendly bottom or side sheets, use `shadcn/ui`'s `Drawer` component (which is built on `vaul`).
*   **File Archiving (.zip, .aasx)**: Any operations involving reading, writing, or manipulating `.zip` or `.aasx` archive files should be done using the `jszip` library.
*   **Date Pickers**: For date input and selection, use `react-day-picker`.
*   **Carousels**: Implement carousels or image sliders using `embla-carousel-react`.
*   **XML Parsing**: For parsing XML content into JavaScript objects, use `fast-xml-parser`.
*   **Utility Functions**: For combining CSS classes, always use the `cn` utility function (which wraps `clsx` and `tailwind-merge`).
*   **Project Structure**: Keep pages in `src/pages/` and reusable components in `src/components/`.