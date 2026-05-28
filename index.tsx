// --- CONSTANTS & CONFIGS ---
const GIFS_PER_PAGE = 25;
const DEFAULT_SOURCES = [
    { name: 'Giphy', checked: true, apiKey: '', isCustom: false, url: 'https://api.giphy.com/v1/gifs/search', iconUrl: 'https://i.imgur.com/RmuNt49.png' }
];

// --- STATE ---
let state = {
    searchTerm: '',
    gifs: [],
    loadingState: 'idle', // idle, starting, loading, finished
    loadingMore: false,
    hasMoreResults: true,
    searchSources: [],
    pagination: {},
    debounceTimer: null,
    searchActive: false,
    favorites: [],
    lastRemovedFavorite: null, // { gif, index }
    copies: [], // Tracks copied history during the session
    activeTab: 'favorites', // Tab open in Favorite modal: 'favorites' or 'copies'
    toolbarCollapsed: false
};

// --- DOM ELEMENTS ---
const $ = (selector) => document.querySelector(selector);
const body = document.body;
const searchInput = $('#search-input');
const searchButton = $('#search-button');
const searchInitButton = $('#search-init-button');
const searchContainer = $('#search-container');
const gifCount = $('#gif-count');
const sourceTogglesContainer = $('#source-toggles-container');
const sourceToggles = $('#source-toggles');
const themeToggle = $('#theme-toggle');
const optionsButton = $('#options-button');
const favoritesButton = $('#favorites-button');
const gifGrid = $('#gif-grid');
const messageArea = $('#message-area');
const optionsModal = $('#options-modal');
const favoritesModal = $('#favorites-modal');
const favoritesGrid = $('#favorites-grid');
const favoritesCloseButton = $('#favorites-close-button');
const mainContent = $('#main-content');
const infiniteScrollLoader = $('#infinite-scroll-loader');
const toastContainer = $('#toast-container');

// --- API & DATA NORMALIZATION ---
const normalizers = {
    Giphy: item => ({ id: item.id, url: item.images.original.url, previewUrl: item.images.fixed_width.url, title: item.title, source: 'Giphy' }),
    Generic: (item, name) => ({ id: item.id || item.url, url: item.url || item.gif_url || item.media_url, previewUrl: item.preview_url || item.thumbnail_url || item.previewUrl || item.url, title: item.title || item.content_description || 'Untitled', source: name }),
};

const fetchers = {
    Giphy: async (term, source, offset) => {
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${source.apiKey}&q=${term}&limit=${GIFS_PER_PAGE}&offset=${offset}`);
        if (!res.ok) throw new Error(`Giphy API Error: ${res.status}`);
        const json = await res.json();
        return { gifs: json.data.map(normalizers.Giphy), hasMore: (json.pagination.offset + json.pagination.count) < json.pagination.total_count };
    },
    Custom: async (term, source) => {
        const url = source.url.replace('{searchTerm}', encodeURIComponent(term)).replace('{apiKey}', source.apiKey);
        const res = await fetch(url);
        const json = await res.json();
        const items = json.data || json.results || json.gifs || (Array.isArray(json) ? json : []);
        return { gifs: items.map(item => normalizers.Generic(item, source.name)), hasMore: false };
    }
};

// --- RENDER FUNCTIONS ---
const getSourceBadge = (sourceName: string) => {
    const source = state.searchSources.find(s => s.name === sourceName);
    if (source && source.iconUrl) {
        const isUrl = source.iconUrl.startsWith('http://') || source.iconUrl.startsWith('https://') || source.iconUrl.startsWith('/') || source.iconUrl.startsWith('data:');
        if (isUrl) {
            return `<img src="${source.iconUrl}" alt="${source.name}" title="${source.name}" class="w-5 h-5 object-contain inline-block rounded-md" />`;
        } else {
            // single emoji!
            return `<span class="text-base" title="${source.name}">${source.iconUrl}</span>`;
        }
    }
    return `<span>${sourceName}</span>`;
};

const renderGif = (gif, isFavoriteView = false) => {
    const container = document.createElement('div');
    container.className = "relative aspect-square w-full rounded-lg overflow-hidden shadow-lg cursor-pointer group transform transition-transform duration-300 hover:scale-105";
    
    container.addEventListener('click', (e) => {
        // Cast e.target to HTMLElement to access 'closest' method.
        if ((e.target as HTMLElement).closest('.action-btn')) return;
        navigator.clipboard.writeText(gif.url).then(() => {
            // Add to session copies history if not already listed
            if (!state.copies.some(c => c.id === gif.id)) {
                state.copies.unshift(gif);
            }
            const feedback = document.createElement('div');
            feedback.className = 'feedback-overlay';
            feedback.textContent = 'Copied To Clipboard';
            container.appendChild(feedback);
            setTimeout(() => feedback.remove(), 2000);
        });
    });

    const isFavorited = state.favorites.some(f => f.id === gif.id);
    const favoriteIcon = isFavorited 
        ? `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" /></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>`;

    container.innerHTML = `
        <img src="${gif.previewUrl}" alt="${gif.title}" class="w-full h-full object-cover" loading="lazy" />
        <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
        <div class="absolute bottom-0 left-0 right-0 p-1 bg-black/50 text-white text-xs text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none flex items-center justify-center gap-1">
            ${getSourceBadge(gif.source)}
        </div>
        ${isFavoriteView ? `
            <button title="Remove from Favorites" class="action-btn remove-favorite-btn absolute top-2 left-2 w-8 h-8 flex items-center justify-center bg-red-600/70 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 transform hover:scale-110 active:scale-95">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        ` : `
            <div class="absolute top-2 right-2 flex flex-col gap-2">
                 <button title="Favorite" class="action-btn favorite-btn w-8 h-8 flex items-center justify-center bg-gray-800/50 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 transform hover:scale-110 active:scale-95">
                    ${favoriteIcon}
                </button>
            </div>
        `}
    `;
    
    if (isFavoriteView) {
        container.querySelector('.remove-favorite-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFavorite(gif.id);
        });
    } else {
        container.querySelector('.favorite-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(gif, container);
        });
    }
    return container;
};
        
const renderGifGrid = () => {
    gifGrid.innerHTML = '';
    state.gifs.forEach(gif => gifGrid.appendChild(renderGif(gif)));
    updateGifCount();
};

const appendGifsToGrid = (gifs) => {
    gifs.forEach(gif => gifGrid.appendChild(renderGif(gif)));
    updateGifCount();
};

const renderMessages = () => {
    mainContent.classList.remove('flex', 'items-center', 'justify-center');
    messageArea.innerHTML = '';
    gifGrid.style.display = 'grid';
    infiniteScrollLoader.style.display = 'none';

    if (state.loadingState === 'starting' || (state.loadingState === 'loading' && !state.gifs.length)) {
        gifGrid.style.display = 'none';
        messageArea.innerHTML = `<div class="flex justify-center items-center h-64"><div class="w-16 h-16 border-4 border-t-transparent border-blue-600 dark:border-neon-green rounded-full animate-spin"></div></div>`;
    } else if (state.loadingState === 'idle') {
         gifGrid.style.display = 'none';
         mainContent.classList.add('flex', 'items-center', 'justify-center');
         messageArea.innerHTML = `
            <div class="flex flex-col items-center justify-center h-[60vh] text-center text-gray-500 dark:text-gray-400">
                <h2 class="text-2xl font-semibold">Ready to find the perfect GIF?</h2>
                <p class="mt-2 text-lg">Click the big button to start your search.</p>
            </div>`;
    } else if (state.loadingState === 'finished' && state.gifs.length === 0) {
        gifGrid.style.display = 'none';
        messageArea.innerHTML = `
            <div class="text-center py-20 text-gray-500 dark:text-gray-400">
                <h2 class="text-2xl font-semibold">No GIFs Found</h2>
                <p class="mt-2 text-lg">Try a different search term or check your sources.</p>
            </div>`;
    } else if (state.loadingMore) {
        infiniteScrollLoader.style.display = 'flex';
        infiniteScrollLoader.innerHTML = `<div class="w-10 h-10 border-4 border-t-transparent border-blue-600 dark:border-neon-green rounded-full animate-spin"></div>`;
    }
};

const renderSourceToggles = () => {
    sourceToggles.innerHTML = '';
    state.searchSources.forEach(source => {
        const toggle = document.createElement('button');
        toggle.className = `source-toggle p-1 border-2 border-transparent rounded-lg transition-all duration-300 filter grayscale opacity-50 hover:opacity-100 hover:grayscale-0 focus:outline-none focus:ring-2 ring-blue-500 dark:ring-neon-green ${source.checked ? 'active' : ''}`;
        toggle.title = source.name;
        
        // Handle custom image URL vs custom emoji vs initials
        if (source.iconUrl) {
            const isUrl = source.iconUrl.startsWith('http://') || source.iconUrl.startsWith('https://') || source.iconUrl.startsWith('/') || source.iconUrl.startsWith('data:');
            if (isUrl) {
                toggle.innerHTML = `<img src="${source.iconUrl}" alt="${source.name}" class="w-10 h-10 object-contain rounded-md">`;
            } else {
                toggle.innerHTML = `<div class="w-10 h-10 flex items-center justify-center text-2xl bg-gray-250 dark:bg-gray-700 rounded-md">${source.iconUrl}</div>`;
            }
        } else {
            toggle.innerHTML = `<div class="w-10 h-10 flex items-center justify-center text-xs font-bold leading-none select-none bg-gray-255 dark:bg-gray-700 rounded-md break-all">${source.name.substring(0, 3)}</div>`;
        }

        toggle.addEventListener('click', () => {
            source.checked = !source.checked;
            toggle.classList.toggle('active');
            localStorage.setItem('gif-portal-sources', JSON.stringify(state.searchSources)); // save on toggle
            if(state.searchTerm) handleSearch();
        });
        sourceToggles.appendChild(toggle);
    });
};

const renderOptionsModal = () => {
    const currentSources = JSON.parse(localStorage.getItem('gif-portal-sources-temp')) || state.searchSources;

    let sourcesHtml = currentSources.map((source, index) => `
        <div class="p-3 bg-gray-50 dark:bg-gray-700 rounded-md" data-index="${index}">
            <div class="flex items-center justify-between">
                <label for="source-${index}" class="font-semibold text-lg text-gray-800 dark:text-white">${source.name}</label>
                <div class="flex items-center gap-2">
                    <input type="checkbox" id="source-${index}" ${source.checked ? 'checked' : ''} class="w-6 h-6 text-blue-600 dark:text-neon-green bg-gray-300 rounded focus:ring-blue-500">
                    <button class="remove-source-btn p-1 text-gray-400 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
            </div>
            <div class="mt-2 space-y-2">
                <input type="text" value="${source.apiKey}" placeholder="API Key ${source.isCustom ? "(optional)" : ""}" class="source-apikey mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-850 dark:text-gray-100">
                <input type="text" value="${source.iconUrl || ''}" placeholder="Icon Image URL or Single Emoji (e.g. 🦊)" class="source-icon-url mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-850 dark:text-gray-100">
            </div>
        </div>`).join('');
    
    optionsModal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md animate-bounce-in max-h-[90vh] flex flex-col">
            <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                <h2 class="text-xl font-bold text-blue-600 dark:text-neon-green">Settings</h2>
                <button id="options-close-button" class="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div id="options-content" class="p-6 space-y-4 overflow-y-auto">
                <button id="trigger-setup-wizard-btn" class="w-full py-2.5 px-4 mb-4 bg-blue-50 dark:bg-gray-700 hover:bg-blue-105 dark:hover:bg-gray-650 text-blue-650 dark:text-neon-green font-bold text-sm rounded-lg border border-blue-200 dark:border-gray-600 flex items-center justify-center gap-2 transition-colors">
                    🔑 Run Connection Setup Wizard
                </button>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white">Search Sources</h3>
                ${sourcesHtml}

                <div class="pt-4 border-t dark:border-gray-600">
                    <h3 class="text-lg font-semibold mb-2 text-gray-800 dark:text-white">Add New Custom Source</h3>
                    <div class="space-y-3">
                        <input type="text" id="new-source-name" placeholder="Source Name" class="block w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 rounded-md text-gray-850 dark:text-gray-100">
                        <input type="text" id="new-source-url" placeholder="URL with {searchTerm}" class="block w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 rounded-md text-gray-850 dark:text-gray-100">
                        <input type="text" id="new-source-apikey" placeholder="API Key (optional)" class="block w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 rounded-md text-gray-850 dark:text-gray-100">
                        <input type="text" id="new-source-icon-url" placeholder="Icon Image URL or Single Emoji (e.g. ⚡)" class="block w-full px-3 py-2 bg-white dark:bg-gray-850 border border-gray-300 rounded-md text-gray-850 dark:text-gray-100">
                        <button id="add-source-btn" class="w-full px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-neon-green dark:text-navy dark:hover:bg-green-300">Add Source</button>
                    </div>
                </div>
                 <div class="pt-4 border-t dark:border-gray-600">
                     <h3 class="text-lg font-semibold mb-2 text-gray-800 dark:text-white">Manage Data</h3>
                     <textarea id="import-export-data" class="w-full h-24 p-2 bg-gray-100 dark:bg-gray-900 border rounded-md hidden" placeholder="Paste your data here..."></textarea>
                 </div>
            </div>
            <div class="p-4 border-t dark:border-gray-700 flex justify-between items-center">
                <div class="flex gap-2">
                    <button id="import-btn" class="px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-500 hover:bg-gray-600">Import</button>
                    <button id="export-btn" class="px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-500 hover:bg-gray-650">Export</button>
                </div>
                <button id="options-save-button" class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 dark:bg-neon-green dark:text-navy dark:hover:bg-green-300 font-bold">
                    Save Changes
                </button>
            </div>
        </div>
    `;
    optionsModal.classList.remove('hidden');
    addOptionsModalListeners();
};

const renderFavoritesModal = () => {
    // update tab class names dynamically to highlight selected search tab
    const tabFavs = $('#favorites-tab-favs');
    const tabCopies = $('#favorites-tab-copies');
    
    if (tabFavs && tabCopies) {
        if (state.activeTab === 'favorites') {
            tabFavs.className = "px-3 py-1 rounded-md text-xs font-bold bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-white transition-all";
            tabCopies.className = "px-3 py-1 rounded-md text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all ml-1";
        } else {
            tabCopies.className = "px-3 py-1 rounded-md text-xs font-bold bg-white dark:bg-gray-800 shadow-sm text-gray-800 dark:text-white transition-all";
            tabFavs.className = "px-3 py-1 rounded-md text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all ml-1";
        }
    }

    favoritesGrid.innerHTML = '';
    if (state.activeTab === 'favorites') {
        if (state.favorites.length === 0) {
            favoritesGrid.innerHTML = `<p class="text-gray-500 dark:text-gray-400 col-span-full text-center mt-8">You haven't favorited any GIFs yet. Click the heart icon on a GIF to save it here!</p>`;
        } else {
            state.favorites.forEach(gif => favoritesGrid.appendChild(renderGif(gif, true)));
        }
    } else {
        // 'copies' tab
        if (state.copies.length === 0) {
            favoritesGrid.innerHTML = `<p class="text-gray-500 dark:text-gray-400 col-span-full text-center mt-8">No copies tracked during this session. Tap any GIF in search to copy to clipboard!</p>`;
        } else {
            state.copies.forEach(gif => favoritesGrid.appendChild(renderGif(gif, false)));
        }
    }
    favoritesModal.classList.remove('hidden');
};

const showToast = (message, actionText = null, onAction = null) => {
    const toast = document.createElement('div');
    toast.className = 'bg-gray-800 text-white rounded-lg shadow-lg p-4 flex items-center justify-between gap-4 animate-bounce-in';
    
    let actionButtonHtml = '';
    if (actionText && onAction) {
        actionButtonHtml = `<button class="undo-btn font-bold text-neon-green hover:underline">${actionText}</button>`;
    }

    toast.innerHTML = `
        <div>
            ${message}
        </div>
        ${actionButtonHtml}
        <div class="absolute bottom-0 left-0 h-1 bg-neon-green toast-progress"></div>
    `;

    toastContainer.appendChild(toast);

    const timer = setTimeout(() => {
        toast.remove();
        if (toast.dataset.undoable) {
            state.lastRemovedFavorite = null;
        }
    }, 10000);

    const undoBtn = toast.querySelector('.undo-btn');
    if (undoBtn) {
        toast.dataset.undoable = "true";
        undoBtn.addEventListener('click', () => {
            clearTimeout(timer);
            onAction();
            toast.remove();
        });
    }
};


// --- LOGIC ---
const fetchAndProcessGifs = async () => {
    const term = state.searchTerm.trim();
    const activeSources = state.searchSources.filter(s => s.checked && (s.isCustom || s.apiKey));

    const promises = activeSources.map(source => {
        if (!state.pagination[source.name] || !state.pagination[source.name].hasMore) {
            return Promise.resolve({ gifs: [], sourceName: source.name, hasMore: false });
        }
        
        const pageState = state.pagination[source.name];
        const fetcher = source.isCustom ? fetchers.Custom : fetchers[source.name];
        if (!fetcher) return Promise.resolve({ gifs: [], sourceName: source.name, hasMore: false });

        const param = source.name === 'Giphy' ? pageState.offset : pageState.page;

        return fetcher(term, source, param).then(result => ({ ...result, sourceName: source.name }))
            .catch(e => {
                console.error(`Failed to fetch from ${source.name}`, e);
                return { gifs: [], sourceName: source.name, hasMore: false };
            });
    });

    const results = await Promise.all(promises);
    let allNewGifs = [];
    
    // Fix: Explicitly type the 'result' parameter to avoid it being inferred as 'unknown', which resolves an error when accessing its properties.
    results.forEach((result: {hasMore: boolean, gifs: any[], sourceName: string, next?: string}) => {
        allNewGifs = allNewGifs.concat(result.gifs);
        const pagination = state.pagination[result.sourceName];
        if (pagination) {
            pagination.hasMore = result.hasMore;
            if (result.sourceName === 'Giphy') pagination.offset += GIFS_PER_PAGE;
            else if (result.sourceName === 'Imgur') pagination.page += 1;
        }
    });
    
    state.hasMoreResults = Object.values(state.pagination).some((p: any) => p.hasMore);
    return allNewGifs.sort(() => 0.5 - Math.random());
};

const handleSearch = async () => {
    const term = searchInput.value.trim();
    if (term === state.searchTerm && state.loadingState !== 'idle') return;
    state.searchTerm = term;

    if (term === '') {
        state.gifs = [];
        state.loadingState = 'idle';
        renderMessages();
        renderGifGrid();
        return;
    }

    state.loadingState = 'starting';
    state.gifs = [];
    state.pagination = {};
    state.searchSources.filter(s => s.checked && (s.isCustom || s.apiKey)).forEach(s => {
        state.pagination[s.name] = { hasMore: true, offset: 0, page: 1, pos: null };
    });
    state.hasMoreResults = true;
    renderMessages();
    renderGifGrid();
    
    setTimeout(async () => {
        state.loadingState = 'loading';
        try {
            const newGifs = await fetchAndProcessGifs();
            state.gifs = newGifs;
        } catch (error) {
            console.error("Search failed:", error);
            state.gifs = [];
        } finally {
            state.loadingState = 'finished';
            renderMessages();
            renderGifGrid();
        }
    }, 300);
};

const loadMoreGifs = async () => {
    if (state.loadingMore || !state.hasMoreResults || state.loadingState !== 'finished') return;

    state.loadingMore = true;
    renderMessages();
    try {
        const newGifs = await fetchAndProcessGifs();
        state.gifs = [...state.gifs, ...newGifs];
        appendGifsToGrid(newGifs);
    } catch(e) {
        console.error("Failed to load more GIFs", e);
    } finally {
        state.loadingMore = false;
        renderMessages();
    }
};

// --- Theme ---
const applyTheme = (theme) => {
    const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>`;
    const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-gray-500 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>`;

    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        themeToggle.innerHTML = sunIcon;
    } else {
        document.documentElement.classList.remove('dark');
        themeToggle.innerHTML = moonIcon;
    }
    localStorage.setItem('theme', theme);
    updateFavoritesButton();
};

const toggleTheme = () => applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');

// --- Options Modal ---
const openOptionsModal = () => {
     localStorage.setItem('gif-portal-sources-temp', JSON.stringify(state.searchSources));
     renderOptionsModal();
};

const closeOptionsModal = () => {
    localStorage.removeItem('gif-portal-sources-temp');
    optionsModal.classList.add('hidden');
};

const saveOptions = () => {
    const tempSources = JSON.parse(localStorage.getItem('gif-portal-sources-temp'));
    state.searchSources = tempSources;

    localStorage.setItem('gif-portal-sources', JSON.stringify(tempSources));
    localStorage.setItem('gif-portal-keys-configured', 'true');
    closeOptionsModal();
    renderSourceToggles();
    if (state.searchTerm) handleSearch();
};

const updateTempSourcesFromUI = () => {
     const sources = JSON.parse(localStorage.getItem('gif-portal-sources-temp')) || [];
     const updatedSources = [];
     optionsModal.querySelectorAll('#options-content > div[data-index]').forEach((div, index) => {
         const source = sources[index];
         source.checked = div.querySelector('input[type="checkbox"]').checked;
         source.apiKey = div.querySelector('.source-apikey').value;
         source.iconUrl = div.querySelector('.source-icon-url').value;
         updatedSources.push(source);
     });
     localStorage.setItem('gif-portal-sources-temp', JSON.stringify(updatedSources));
}

// --- Favorites ---
const saveFavorites = () => localStorage.setItem('gif-portal-favorites', JSON.stringify(state.favorites));

const toggleFavorite = (gif, container) => {
    const index = state.favorites.findIndex(f => f.id === gif.id);
    if (index > -1) {
        state.favorites.splice(index, 1);
    } else {
        state.favorites.push(gif);
    }
    saveFavorites();
    updateFavoritesButton();
    const newRenderedGif = renderGif(gif); // Re-render to update heart
    container.replaceWith(newRenderedGif);
};

const removeFavorite = (gifId) => {
    const index = state.favorites.findIndex(f => f.id === gifId);
    if (index > -1) {
        const [removedGif] = state.favorites.splice(index, 1);
        state.lastRemovedFavorite = { gif: removedGif, index: index };
        saveFavorites();
        renderFavoritesModal(); // Re-render favorites grid
        updateFavoritesButton();
        showToast("You can undo if you hurry!", "Undo", undoRemoveFavorite);
    }
};

const undoRemoveFavorite = () => {
    if (state.lastRemovedFavorite) {
        const { gif, index } = state.lastRemovedFavorite;
        state.favorites.splice(index, 0, gif);
        state.lastRemovedFavorite = null;
        saveFavorites();
        renderFavoritesModal();
        updateFavoritesButton();
    }
};

const updateFavoritesButton = () => {
    const isDark = document.documentElement.classList.contains('dark');
    if (state.favorites.length > 0) {
        favoritesButton.innerHTML = isDark ? '💚' : '💙';
    } else {
        favoritesButton.innerHTML = isDark ? '🤍' : '🖤';
    }
};

// --- Data Management ---
const exportData = () => {
    const data = {
        sources: state.searchSources,
        favorites: state.favorites,
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    showToast("Settings & favorites copied to clipboard!");
};

const importData = () => {
    const dataString = $('#import-export-data').value;
    try {
        const data = JSON.parse(dataString);
        if (data.sources && Array.isArray(data.sources) && data.favorites && Array.isArray(data.favorites)) {
            state.searchSources = data.sources;
            state.favorites = data.favorites;
            localStorage.setItem('gif-portal-sources', JSON.stringify(state.searchSources));
            localStorage.setItem('gif-portal-favorites', JSON.stringify(state.favorites));
            showToast("Data imported successfully!");
            renderSourceToggles();
            updateFavoritesButton();
            $('#import-export-data').value = '';
            $('#import-export-data').classList.add('hidden');
        } else {
            throw new Error("Invalid data structure.");
        }
    } catch (e) {
        alert("Import failed. Invalid data format.");
        console.error("Import failed:", e);
    }
};


// --- UI & State Updates ---
const activateSearch = () => {
    if (!areKeysConfigured() || localStorage.getItem('gif-portal-keys-configured') !== 'true') {
        openSetupModal();
        return;
    }
    if (state.searchActive) return;
    state.searchActive = true;
    body.classList.add('search-active');
    setTimeout(() => {
        searchInput?.focus();
        mainContent?.classList.add('opacity-100');
        if (sourceTogglesContainer) {
            sourceTogglesContainer.classList.add('opacity-100', 'pointer-events-auto');
        }
        gifCount?.classList.add('opacity-100');
    }, 500);
};

const updateGifCount = () => {
    if (gifCount) {
        gifCount.textContent = `${state.gifs.length} GIFs`;
    }
};

const updateToolbarCollapse = (collapsed: boolean) => {
    state.toolbarCollapsed = collapsed;
    const container = $('#search-container');
    const arrowIcon = $('#collapse-arrow-icon');
    if (container) {
        if (collapsed) {
            container.classList.add('collapsed');
            if (arrowIcon) {
                arrowIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />`;
            }
        } else {
            container.classList.remove('collapsed');
            if (arrowIcon) {
                arrowIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />`;
            }
        }
    }
};

// --- EVENT LISTENERS ---
const addOptionsModalListeners = () => {
    $('#options-close-button').addEventListener('click', closeOptionsModal);
    $('#options-save-button').addEventListener('click', saveOptions);
    $('#export-btn').addEventListener('click', exportData);
    $('#trigger-setup-wizard-btn')?.addEventListener('click', () => {
        openSetupModal();
    });
    $('#import-btn').addEventListener('click', () => {
        const textarea = $('#import-export-data');
        textarea.classList.toggle('hidden');
        if (!textarea.classList.contains('hidden')) {
            textarea.placeholder = "Paste data here, then click Save Changes";
        }
    });

    optionsModal.querySelector('#options-content').addEventListener('click', e => {
        // Cast e.target to HTMLElement to access 'closest' and other element properties.
        const target = e.target as HTMLElement;
        if (target.id === 'add-source-btn') {
            const name = ($('#new-source-name') as HTMLInputElement).value.trim();
            const url = ($('#new-source-url') as HTMLInputElement).value.trim();
            const apiKey = ($('#new-source-apikey') as HTMLInputElement).value.trim();
            const iconUrl = ($('#new-source-icon-url') as HTMLInputElement).value.trim();
            if (name && url && iconUrl) {
                const tempSources = JSON.parse(localStorage.getItem('gif-portal-sources-temp'));
                tempSources.push({ name, url, apiKey, iconUrl, checked: true, isCustom: true });
                localStorage.setItem('gif-portal-sources-temp', JSON.stringify(tempSources));
                renderOptionsModal();
            } else {
                alert("Name, URL and Icon URL are required for new sources.");
            }
        } else if (target.closest('.remove-source-btn')) {
            const div = target.closest('div[data-index]') as HTMLElement;
            if (div) {
                const index = parseInt(div.dataset.index, 10);
                const tempSources = JSON.parse(localStorage.getItem('gif-portal-sources-temp'));
                tempSources.splice(index, 1);
                localStorage.setItem('gif-portal-sources-temp', JSON.stringify(tempSources));
                renderOptionsModal();
            }
        }
    });
    
    optionsModal.querySelector('#options-content').addEventListener('input', updateTempSourcesFromUI);
};

// --- API SETUP ONBOARDING WIZARD ---
const apiSetupModal = $('#api-setup-modal');

const areKeysConfigured = () => {
    const giphySource = state.searchSources.find(s => s.name === 'Giphy');
    const giphyKey = giphySource?.apiKey || '';
    return giphyKey.trim() !== '';
};

const openSetupModal = () => {
    // Close standard settings if open
    optionsModal.classList.add('hidden');
    
    // Load current sources if available
    const giphySource = state.searchSources.find(s => s.name === 'Giphy') || DEFAULT_SOURCES[0];
    const giphyInput = $('#setup-giphy-key') as HTMLInputElement;

    if (giphyInput) {
        giphyInput.value = giphySource.apiKey || '';
    }

    apiSetupModal.classList.remove('hidden');
};

const closeSetupModal = () => {
    apiSetupModal.classList.add('hidden');
};

const saveSetupKeys = () => {
    const giphyInput = ($('#setup-giphy-key') as HTMLInputElement).value.trim();

    if (giphyInput === '') {
        alert("Please enter a GIPHY API key to start.");
        return;
    }

    state.searchSources.forEach(source => {
        if (source.name === 'Giphy') {
            source.apiKey = giphyInput;
            source.checked = true;
        }
    });

    localStorage.setItem('gif-portal-sources', JSON.stringify(state.searchSources));
    localStorage.setItem('gif-portal-keys-configured', 'true');
    closeSetupModal();
    renderSourceToggles();
    showToast("🔑 Key configured successfully!");
    
    activateSearch();
};

// --- INITIALIZATION ---
const init = () => {
    // Theme
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

    // Data
    const savedSources = localStorage.getItem('gif-portal-sources');
    let loadedSources = savedSources ? JSON.parse(savedSources) : DEFAULT_SOURCES;
    // Filter out Tenor and Imgur entirely to keep resources tidy
    loadedSources = loadedSources.filter((s: any) => s.name !== 'Tenor' && s.name !== 'Imgur');
    state.searchSources = loadedSources;

    const savedFavorites = localStorage.getItem('gif-portal-favorites');
    state.favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
    
    // Initial Renders
    renderMessages();
    renderSourceToggles();
    updateFavoritesButton();

    // Event Listeners
    $('#setup-save-btn')?.addEventListener('click', saveSetupKeys);

    // Force Setup Onboarding if not configured yet
    if (!areKeysConfigured() || localStorage.getItem('gif-portal-keys-configured') !== 'true') {
        setTimeout(() => {
            openSetupModal();
        }, 600);
    }

    searchInitButton?.addEventListener('click', activateSearch);
    document.addEventListener('keydown', (e) => {
        if (!state.searchActive && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            // Check if active element is an input or textarea
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }
            activateSearch();
            // Programmatically append character to search input
            if (searchInput) {
                (searchInput as HTMLInputElement).value = e.key;
                clearTimeout(state.debounceTimer);
                state.debounceTimer = setTimeout(() => handleSearch(), 500);
            }
        } else if (state.searchActive && state.toolbarCollapsed) {
            // If already active but collapsed, and they start typing, uncollapse it!
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                updateToolbarCollapse(false);
            }
        }
    });
    
    searchInput?.addEventListener('input', (e) => {
        if (state.toolbarCollapsed) {
            updateToolbarCollapse(false);
        }
        clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(() => handleSearch(), 500);
    });
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(state.debounceTimer);
            handleSearch();
        }
    });
    searchButton?.addEventListener('click', () => {
        clearTimeout(state.debounceTimer);
        handleSearch();
    });
    themeToggle?.addEventListener('click', toggleTheme);
    optionsButton?.addEventListener('click', openOptionsModal);
    favoritesButton?.addEventListener('click', renderFavoritesModal);
    favoritesCloseButton?.addEventListener('click', () => favoritesModal.classList.add('hidden'));

    // Wire arrow collapse button
    $('#toolbar-collapse-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        updateToolbarCollapse(!state.toolbarCollapsed);
    });

    // Close modal when clicking outside of it
    favoritesModal?.addEventListener('click', (e) => {
        if (e.target === favoritesModal) {
            favoritesModal.classList.add('hidden');
        }
    });

    optionsModal?.addEventListener('click', (e) => {
        if (e.target === optionsModal) {
            closeOptionsModal();
        }
    });

    // Favorites dialog tabs
    $('#favorites-tab-favs')?.addEventListener('click', () => {
        state.activeTab = 'favorites';
        renderFavoritesModal();
    });
    $('#favorites-tab-copies')?.addEventListener('click', () => {
        state.activeTab = 'copies';
        renderFavoritesModal();
    });

    // Favorites Import-Export buttons & text drawer actions
    $('#favorites-import-btn')?.addEventListener('click', () => {
        const drawer = $('#favorites-text-drawer');
        drawer.classList.remove('hidden');
        $('#favorites-drawer-desc').textContent = "Paste a favorites list (JSON list or URLs list separated by commas/newlines):";
        ($('#favorites-drawer-textarea') as HTMLTextAreaElement).value = '';
        $('#favorites-drawer-actions').classList.remove('hidden');
    });

    $('#favorites-export-btn')?.addEventListener('click', () => {
        const drawer = $('#favorites-text-drawer');
        drawer.classList.remove('hidden');
        $('#favorites-drawer-desc').textContent = "Copied exported favorites list below to clipboard:";
        const textValue = JSON.stringify(state.favorites, null, 2);
        ($('#favorites-drawer-textarea') as HTMLTextAreaElement).value = textValue;
        $('#favorites-drawer-actions').classList.add('hidden'); // hide operation buttons during copy/export format
        navigator.clipboard.writeText(textValue).then(() => {
            showToast("📤 Export copied to clipboard!");
        });
    });

    $('#favorites-drawer-close')?.addEventListener('click', () => {
        $('#favorites-text-drawer').classList.add('hidden');
    });

    const handleDrawerLoad = (replaceExisting: boolean) => {
        const textarea = $('#favorites-drawer-textarea') as HTMLTextAreaElement;
        const text = textarea.value.trim();
        if (!text) return;
        try {
            let parsedList = [];
            if (text.startsWith('[')) {
                parsedList = JSON.parse(text);
            } else {
                // comma or newline separated link strings
                const lines = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
                parsedList = lines.map((url, i) => ({
                    id: 'imported-' + Date.now() + '-' + i,
                    url: url,
                    previewUrl: url,
                    title: 'Imported Link',
                    source: 'Imported'
                }));
            }
            if (Array.isArray(parsedList)) {
                if (replaceExisting) {
                    state.favorites = [];
                }
                const existingIds = new Set(state.favorites.map(f => f.id));
                parsedList.forEach((gif: any) => {
                    if (gif && gif.url && !existingIds.has(gif.id)) {
                        state.favorites.push({
                            id: gif.id || 'imported-' + Math.random(),
                            url: gif.url,
                            previewUrl: gif.previewUrl || gif.url,
                            title: gif.title || 'Imported GIF',
                            source: gif.source || 'Imported'
                        });
                    }
                });
                saveFavorites();
                renderFavoritesModal();
                updateFavoritesButton();
                showToast(replaceExisting ? "Favorites clean replaced!" : "Favorites list merged.");
                $('#favorites-text-drawer').classList.add('hidden');
            } else {
                throw new Error("Invalid format - expected JSON list.");
            }
        } catch (e) {
            alert("Import failed. Make sure parsing structure is a JSON or lists of URLs.");
        }
    };

    $('#favorites-drawer-load-append')?.addEventListener('click', () => handleDrawerLoad(false));
    $('#favorites-drawer-load-replace')?.addEventListener('click', () => handleDrawerLoad(true));

    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
            loadMoreGifs();
        }
    });
};

init();