# Logisva - Image Processing Application

A modern React application built with TypeScript and Tailwind CSS for image processing and OCR functionality.

## Features

- 🖼️ Image upload and gallery management
- 🔍 OCR text extraction from images
- 📱 Responsive design with Tailwind CSS
- ⚡ Fast development with Vite
- 🎨 Modern UI components with Lucide React icons

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Backend**: Node.js with Express
- **OCR**: Tesseract.js
- **Icons**: Lucide React

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Header.tsx
│   ├── ImageGallery.tsx
│   ├── ProcessingPanel.tsx
│   └── UploadZone.tsx
├── hooks/              # Custom React hooks
│   └── useImageProcessor.ts
├── types.ts            # TypeScript type definitions
├── App.tsx             # Main application component
└── main.tsx            # Application entry point

backend/
├── server.js           # Express server
├── package.json        # Backend dependencies
└── *.traineddata       # Tesseract language data
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Silviu2326/logisva.git
cd logisva
```

2. Install frontend dependencies:
```bash
npm install
```

3. Install backend dependencies:
```bash
cd backend
npm install
cd ..
```

### Development

1. Start the backend server:
```bash
cd backend
npm start
```

2. Start the frontend development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.