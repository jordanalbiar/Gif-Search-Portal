Gif Search Portal

![screenshot](https://github.com/jordanalbiar/Gif-Portal-Search/blob/main/Screenshot_20260528_133521.png?raw=true)

## ✨ Features

- **Lightning-fast GIF search** powered by GIPHY
- **One-click copy** — just click any GIF to copy it to your clipboard
- **Favorites system** — save the GIFs you love
- **Clipboard history** — easily access recently copied GIFs
- **Custom search sources** — add your own GIF APIs or endpoints
- **Fully responsive** dark UI with smooth animations
- **Data import/export** — backup and restore your favorites
- **Settings & API key management**

## How It Works

1. **Enter your GIPHY API key** (free to get)
2. **Search** for anything — the app instantly loads relevant GIFs
3. **Click a GIF** → instantly copied to clipboard with visual feedback
4. **Heart icon** → save to your favorites
5. Use the **Favorites Manager** to organize saved GIFs and view clipboard history

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Modern dark UI with smooth interactions
- **API**: GIPHY API (with support for custom sources)
- **Storage**: Local browser storage (favorites + settings)

## API keys

App loads and checks for stored settings (API keys, preferences) in localStorage.
User is prompted to enter their GIPHY API key.

![screenshot](https://github.com/jordanalbiar/Gif-Portal-Search/blob/main/Screenshot_20260528_133540.png?raw=true)

## Search
Debounced search query is sent to the GIPHY API via the service layer.
Results are displayed in a responsive masonry-style grid.

![screenshot](https://github.com/jordanalbiar/Gif-Portal-Search/blob/main/Screenshot_20260528_133554.png?raw=true)

## Click to copy
Click → Copies the GIF URL (or direct GIF data) to clipboard with toast feedback.
Heart button → Adds/removes from favorites (saved in localStorage).

![screenshot](https://github.com/jordanalbiar/Gif-Portal-Search/blob/main/Screenshot_20260528_133712.png?raw=true)

## Favorites Manager
Dedicated view/tab to browse all saved GIFs.
Options to remove items or export the list.

![screenshot](https://github.com/jordanalbiar/Gif-Portal-Search/blob/main/Screenshot_20260528_133725.png?raw=true)

Settings
API key management
Theme preferences (dark mode is default)
Custom API endpoint support.
![screenshot](https://github.com/jordanalbiar/Gif-Portal-Search/blob/main/Screenshot_20260528_133757.png)

## Getting Started

```bash
# Clone the repo
git clone https://github.com/jordanalbiar/Gif-Portal-Search.git

# Install dependencies
npm install

# Add your GIPHY API key to .env.local
# Run the app
npm run dev
