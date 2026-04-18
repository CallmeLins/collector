<script>
	import Fuse from 'fuse.js';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import BackTop from '$lib/components/BackTop.svelte';

	let { data } = $props();
	const THEME_STORAGE_KEY = 'collector-theme-mode';
	const SEARCH_ENGINE_STORAGE_KEY = 'collector-search-engine';
	const CUSTOM_SEARCH_TEMPLATE_STORAGE_KEY = 'collector-custom-search-template';
	const THEME_MODES = ['light', 'dark', 'system'];
	const SYSTEM_THEME_MEDIA = '(prefers-color-scheme: dark)';
	const SEARCH_ENGINES = [
		{
			id: 'bookmark',
			label: 'Bookmarks',
			placeholder: 'Search bookmarks'
		},
		{
			id: 'google',
			label: 'Google',
			placeholder: 'Search with Google',
			url: 'https://www.google.com/search?q=%s'
		},
		{
			id: 'baidu',
			label: 'Baidu',
			placeholder: 'Search with Baidu',
			url: 'https://www.baidu.com/s?wd=%s'
		},
		{
			id: 'bing',
			label: 'Bing',
			placeholder: 'Search with Bing',
			url: 'https://www.bing.com/search?q=%s'
		},
		{
			id: 'custom',
			label: 'Custom',
			placeholder: 'Search with Custom'
		}
	];

	const keys = [
		{
			name: 'title',
			weight: 3
		},
		{
			name: 'tags',
			weight: 2
		},
		{
			name: 'description',
			weight: 1
		}
	];
	const searchOptions = {
		keys: keys,
		includeScore: true,
		includeMatches: true,
		useExtendedSearch: true,
		minMatchCharLength: 1
	};

	let fuseIndex = null;
	let fuseInstance = null;
	let searchResults = $state([]);
	let faviconResolvedSrc = $state({});
	let themeMode = $state('system');
	let searchEngine = $state('bookmark');
	let customSearchTemplate = $state('');
	let formatedData = $derived(formatData(data.data));
	let flattenedData = $derived(flattenData(formatedData));
	const faviconPreloadTasks = new Map();
	let faviconPreloadStarted = false;
	let themeMediaQuery;
	let activeSearchEngine = $derived(getSearchEngineConfig(searchEngine));

	$effect(() => {
		if (flattenedData) {
			fuseIndex = Fuse.createIndex(searchOptions.keys, flattenedData);
			fuseInstance = new Fuse(flattenedData, searchOptions, fuseIndex);
		}
	});

	$effect(() => {
		if (!browser || faviconPreloadStarted || !flattenedData?.length) return;

		faviconPreloadStarted = true;
		void preloadAllFavicons(flattenedData);
	});

	function handleKeyPress(event) {
		if (event.key === '/' && event.target.tagName !== 'INPUT') {
			event.preventDefault();
			searchInputRef?.focus();
		}
	}
	onMount(() => {
		if (!browser) return;

		document.addEventListener('keydown', handleKeyPress);
		themeMediaQuery = window.matchMedia(SYSTEM_THEME_MEDIA);
		const savedThemeMode = localStorage.getItem(THEME_STORAGE_KEY);
		const savedSearchEngine = localStorage.getItem(SEARCH_ENGINE_STORAGE_KEY);
		themeMode = THEME_MODES.includes(savedThemeMode) ? savedThemeMode : 'system';
		searchEngine = SEARCH_ENGINES.some((engine) => engine.id === savedSearchEngine) ? savedSearchEngine : 'bookmark';
		customSearchTemplate = localStorage.getItem(CUSTOM_SEARCH_TEMPLATE_STORAGE_KEY) || '';
		applyTheme(themeMode, false);
		themeMediaQuery.addEventListener('change', handleSystemThemeChange);
	});

	onDestroy(() => {
		if (!browser) return;

		document.removeEventListener('keydown', handleKeyPress);
		themeMediaQuery?.removeEventListener('change', handleSystemThemeChange);
	});

	function resolveTheme(mode) {
		if (mode === 'system') {
			return themeMediaQuery?.matches ? 'dark' : 'light';
		}

		return mode;
	}

	function applyTheme(mode, persist = true) {
		themeMode = mode;
		document.documentElement.setAttribute('data-theme', resolveTheme(mode));

		if (!persist) return;
		localStorage.setItem(THEME_STORAGE_KEY, mode);
	}

	function handleThemeModeChange(mode) {
		applyTheme(mode);
	}

	function handleSystemThemeChange() {
		if (themeMode !== 'system') return;
		applyTheme('system', false);
	}

	function getSearchEngineConfig(engineId) {
		return SEARCH_ENGINES.find((engine) => engine.id === engineId) || SEARCH_ENGINES[0];
	}

	function getNextSearchEngine(currentEngineId) {
		const currentIndex = SEARCH_ENGINES.findIndex((engine) => engine.id === currentEngineId);
		return SEARCH_ENGINES[(currentIndex + 1) % SEARCH_ENGINES.length];
	}

	function configureCustomSearch() {
		if (!browser) return false;

		const defaultTemplate = customSearchTemplate || 'https://example.com/search?q=%s';
		const template = window.prompt('Custom search URL template, use %s for the query', defaultTemplate)?.trim();
		if (!template) return false;
		if (!template.includes('%s')) {
			window.alert('Custom search URL must include %s as the query placeholder.');
			return false;
		}

		customSearchTemplate = template;
		localStorage.setItem(CUSTOM_SEARCH_TEMPLATE_STORAGE_KEY, template);
		return true;
	}

	function cycleSearchEngine() {
		const nextEngine = getNextSearchEngine(searchEngine);
		if (nextEngine.id === 'custom' && !customSearchTemplate && !configureCustomSearch()) {
			return;
		}

		searchEngine = nextEngine.id;
		localStorage.setItem(SEARCH_ENGINE_STORAGE_KEY, nextEngine.id);
		handleSearch();
	}

	function handleSearchEngineContextMenu(event) {
		event.preventDefault();
		configureCustomSearch();
	}

	function buildSearchUrl(query) {
		const trimmedQuery = query.trim();
		if (!trimmedQuery || searchEngine === 'bookmark') return '';

		const template = searchEngine === 'custom' ? customSearchTemplate : activeSearchEngine.url;
		if (!template) return '';

		return template.replace('%s', encodeURIComponent(trimmedQuery));
	}

	function submitSearch() {
		if (searchEngine === 'bookmark') {
			handleSearch();
			return;
		}

		if (searchEngine === 'custom' && !customSearchTemplate && !configureCustomSearch()) {
			return;
		}

		const url = buildSearchUrl(searchTerm);
		if (!url) return;
		window.open(url, '_blank', 'noopener,noreferrer');
	}

	function handleSearchSubmit(event) {
		event.preventDefault();
		submitSearch();
	}

	function formatData(data) {
		if (!data) return [];

		let result = formatDataWithPath(data, '');
		result = sortDataByType(result);
		return result;

		function formatDataWithPath(items, parentPath = '') {
			if (!Array.isArray(items)) return items;

			return items.map((item) => {
				const itemPath = parentPath ? [parentPath, item.title].join('%') : item.title;

				if (item.type === 'folder' && Array.isArray(item.children)) {
					const hasChildFolders = item.children.some((child) => child.type === 'folder');
					return {
						...item,
						id: `folder:${itemPath}`,
						path: parentPath,
						hasChildren: hasChildFolders,
						children: formatDataWithPath(item.children, itemPath)
					};
				}

				return {
					...item,
					id: `bookmark:${itemPath}:${item.url}`,
					path: parentPath,
					faviconSources: getFaviconSources(item)
				};
			});
		}

		function sortDataByType(items) {
			if (!Array.isArray(items)) return items;

			const sortedItems = [...items].sort((a, b) => {
				if (a.type === 'folder' && b.type !== 'folder') return -1;
				if (b.type === 'folder' && a.type !== 'folder') return 1;
				return a.title.localeCompare(b.title);
			});

			return sortedItems.map((item) => {
				if (item.type === 'folder' && Array.isArray(item.children)) {
					return {
						...item,
						children: sortDataByType(item.children)
					};
				}
				return item;
			});
		}
	}

	function flattenData(data) {
		if (!Array.isArray(data)) return [];

		const flattened = [];

		function flatten(items) {
			for (const item of items) {
				if (item.type === 'folder' && item.children) {
					flatten(item.children);
				} else {
					flattened.push(item);
				}
			}
		}
		flatten(data);
		return flattened;
	}

	function getFaviconSources(item) {
		if (item.icon) return [item.icon];

		try {
			const parsedUrl = new URL(item.url);
			const { origin, hostname } = parsedUrl;
			return [
				`${origin}/favicon.ico`,
				`https://icons.duckduckgo.com/ip3/${hostname}.ico`,
				`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
				createFallbackIcon(item.title)
			];
		} catch {
			return [`https://www.google.com/s2/favicons?domain=${item.url}&sz=32`, createFallbackIcon(item.title)];
		}
	}

	function createFallbackIcon(title) {
		const label = (title || 'C').trim().slice(0, 1) || 'C';
		const svg = `
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
				<rect width="64" height="64" rx="18" fill="#2a2a2a"/>
				<rect x="2" y="2" width="60" height="60" rx="16" fill="#f4f4f4" fill-opacity="0.08"/>
				<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="28" font-weight="700" fill="#f5f5f5">${escapeSvgText(label)}</text>
			</svg>
		`;

		return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
	}

	function escapeSvgText(text) {
		return text.replace(/[&<>"']/g, (char) => {
			const entities = {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;'
			};

			return entities[char];
		});
	}

	function getFaviconSrc(item) {
		return faviconResolvedSrc[item.id] || item.faviconSources[item.faviconSources.length - 1];
	}

	function setResolvedFavicon(itemId, src) {
		if (faviconResolvedSrc[itemId] === src) return;

		faviconResolvedSrc = {
			...faviconResolvedSrc,
			[itemId]: src
		};
	}

	function preloadImage(src) {
		return new Promise((resolve) => {
			const image = new Image();
			image.onload = () => resolve(true);
			image.onerror = () => resolve(false);
			image.src = src;
		});
	}

	async function preloadFavicon(item) {
		if (!browser) return item.faviconSources[item.faviconSources.length - 1];
		if (faviconResolvedSrc[item.id]) return faviconResolvedSrc[item.id];
		if (faviconPreloadTasks.has(item.id)) return faviconPreloadTasks.get(item.id);

		const task = (async () => {
			for (const src of item.faviconSources.slice(0, -1)) {
				if (await preloadImage(src)) {
					setResolvedFavicon(item.id, src);
					return src;
				}
			}

			const fallbackSrc = item.faviconSources[item.faviconSources.length - 1];
			setResolvedFavicon(item.id, fallbackSrc);
			return fallbackSrc;
		})();

		faviconPreloadTasks.set(item.id, task);

		try {
			return await task;
		} finally {
			faviconPreloadTasks.delete(item.id);
		}
	}

	async function preloadAllFavicons(items) {
		const queue = [...items];
		const concurrency = 6;

		async function worker() {
			while (queue.length > 0) {
				const item = queue.shift();
				if (!item) continue;
				await preloadFavicon(item);
			}
		}

		await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
	}

	let searchTerm = $state('');
	let searchInputRef;
	let selectedFolder = $state([]);
	let filteredResults = $derived(getFilteredResults());

	function handleSearch() {
		if (searchEngine !== 'bookmark') {
			searchResults = [];
			return;
		}

		if (!fuseInstance || searchTerm.length < searchOptions.minMatchCharLength) {
			searchResults = [];
			return;
		}
		selectedFolder = [];
		searchResults = searchTerm ? fuseInstance.search(searchTerm) : flattenedData;
	}

	function highlightText(text, matches) {
		if (!matches || matches.length === 0) return text;

		let result = '';
		let lastIndex = 0;

		const sortedMatches = [...matches].sort((a, b) => a[0] - b[0]);

		sortedMatches.forEach(([start, end]) => {
			result += text.slice(lastIndex, start);
			result += `<span class="bg-accent">${text.slice(start, end + 1)}</span>`;
			lastIndex = end + 1;
		});

		result += text.slice(lastIndex);
		return result;
	}

	function getFilteredResults() {
		if (selectedFolder.length === 0) {
			if (searchResults.length > 0) {
				return searchResults;
			}
			return flattenedData;
		}
		let folder = formatedData;
		for (let i = 0; i < selectedFolder.length && folder; i++) {
			const element = selectedFolder[i];
			folder = folder.find((item) => item.title === element);
			folder = folder?.children || [];
		}
		return folder || [];
	}

	function handleFolderClick(folderPath) {
		selectedFolder = folderPath ? folderPath.split('%') : [];
		searchResults = [];
		searchTerm = '';
		isAsideVisible = false;
	}

	let isAsideVisible = $state(false);
</script>

<svelte:head>
	<title>Collector</title>
</svelte:head>

<nav class="surface-panel fixed top-0 z-50 w-full">
	<div class="px-3 py-3 lg:px-5 lg:pl-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center justify-start rtl:justify-end">
				<label class="surface-nav-action swap swap-rotate p-1 focus:outline-none sm:hidden">
					<input
						type="checkbox"
						onclick={() => {
							isAsideVisible = !isAsideVisible;
						}}
						bind:checked={isAsideVisible}
					/>
					<!-- hamburger icon -->
					<span class="swap-off icon-[mynaui--menu-solid] fill-current" style="width: 32px; height: 32px;"></span>
					<!-- close icon -->
					<span class="swap-on icon-[iconamoon--close-light] fill-current" style="width: 32px; height: 32px;"></span>
				</label>
				<a href="#" class="group ms-2 flex md:me-24">
					<img src="./favicon.svg" class="me-2 w-20 sm:w-8" alt="Collector Logo" />
					<span class="text-md hidden self-center font-semibold sm:block">Collector</span>
				</a>
			</div>

			<div class="flex items-center justify-end">
				<form class="surface-input input flex h-10 items-center rounded-full" onsubmit={handleSearchSubmit}>
					<button
						type="button"
						aria-label={`Switch search engine. Current: ${activeSearchEngine.label}`}
						title={`Search engine: ${activeSearchEngine.label}. Click to switch, right-click to edit custom search.`}
						class="surface-search-engine mr-1 flex h-8 w-8 items-center justify-center rounded-full"
						onclick={cycleSearchEngine}
						oncontextmenu={handleSearchEngineContextMenu}
					>
						<span class="icon-[fluent--search-12-regular]" style="width: 20px; height: 20px;"></span>
					</button>
					<input
						id="searchInput"
						type="text"
						placeholder={`${activeSearchEngine.placeholder}...`}
						class="input input-ghost w-full max-w-xs focus:border-none"
						oninput={handleSearch}
						bind:this={searchInputRef}
						bind:value={searchTerm}
					/>
				</form>
			</div>
			<div class="ms-3 flex items-center">
				<div class="surface-theme-switch flex items-center gap-1 rounded-full p-1">
					<button
						type="button"
						aria-label="Use light theme"
						class="surface-theme-option {themeMode === 'light' ? 'is-active' : ''}"
						onclick={() => handleThemeModeChange('light')}
					>
						<span class="icon-[prime--sun]" style="width: 20px; height: 20px;"></span>
					</button>
					<button
						type="button"
						aria-label="Follow system theme"
						class="surface-theme-option {themeMode === 'system' ? 'is-active' : ''}"
						onclick={() => handleThemeModeChange('system')}
					>
						<span class="icon-[solar--monitor-bold]" style="width: 20px; height: 20px;"></span>
					</button>
					<button
						type="button"
						aria-label="Use dark theme"
						class="surface-theme-option {themeMode === 'dark' ? 'is-active' : ''}"
						onclick={() => handleThemeModeChange('dark')}
					>
						<span class="icon-[solar--moon-bold-duotone]" style="width: 20px; height: 20px;"></span>
					</button>
				</div>
			</div>
		</div>
	</div>
</nav>

{#if isAsideVisible}
	<div
		class="fixed inset-0 z-30 bg-black/50 transition-opacity sm:hidden"
		onclick={() => {
			isAsideVisible = !isAsideVisible;
		}}
	></div>
{/if}

<aside
	class="fixed left-0 top-0 z-40 h-screen {isAsideVisible
		? 'translate-x-0'
		: '-translate-x-full'} surface-sidebar pt-20 transition-transform sm:w-48 sm:translate-x-0"
	aria-label="Sidebar"
>
	<div class="h-full overflow-y-auto px-3 pb-4">
		<ul class="menu space-y-1">
			<li>
				<a
					href="#"
					class="surface-menu-item group flex cursor-pointer items-center {selectedFolder.join('%') === '' ? 'is-active' : ''}"
					onclick={() => handleFolderClick('')}
				>
					<span class="icon-[clarity--folder-open-line]" style="width: 20px; height: 20px;"></span>
					<span>All Item</span>
				</a>
			</li>
			{#each formatedData as item}
				{#if item.type === 'folder'}
					<li>
						<a
							href="#"
							class="surface-menu-item group flex cursor-pointer items-center {selectedFolder.join('%') === item.title ? 'is-active' : ''}"
							onclick={() => handleFolderClick(item.title)}
						>
							<span class="icon-[clarity--folder-open-solid]" style="width: 20px; height: 20px;"></span>
							<span>{item.title}</span>
						</a>
					</li>
				{/if}
			{/each}
		</ul>
	</div>
</aside>

<div class="p-4 sm:ml-48">
	<div class="mt-14 rounded-lg p-4">
		<div class="breadcrumbs text-sm text-secondary">
			<ul>
				<li>
					<a href="#" class="cursor-pointer" onclick={() => handleFolderClick('')}> Root </a>
				</li>

				{#each selectedFolder as item, i}
					<li>
						<a href="#" class="cursor-pointer" onclick={() => handleFolderClick(selectedFolder.slice(0, i + 1).join('%'))}>
							{item}
						</a>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-8 md:gap-4">
			{#if searchResults.length > 0}
				{#each searchResults as result (result.item.id)}
					<div class="bookmark-card col-span-2">
						<a class="group flex cursor-pointer items-center gap-2" href={result.item.url} target="_blank">
							<img
								src={getFaviconSrc(result.item)}
								alt="favicon"
								class="h-8 w-8 rounded-full transition-transform duration-500 group-hover:rotate-[360deg]"
								loading="lazy"
								decoding="async"
								onerror={() => setResolvedFavicon(result.item.id, result.item.faviconSources[result.item.faviconSources.length - 1])}
							/>
							<div class="min-w-0 flex-1">
								<h2 class="text-md overflow-hidden truncate whitespace-nowrap">
									{@html result.matches?.find((m) => m.key === 'title')
										? highlightText(result.item.title, result.matches.find((m) => m.key === 'title').indices)
										: result.item.title}
								</h2>
								<p class="overflow-hidden truncate whitespace-nowrap text-sm text-secondary">
									{result.item.url}
								</p>
							</div>
						</a>
						<p class="mt-2 line-clamp-3 text-justify text-sm text-secondary">
							{@html result.matches?.find((m) => m.key === 'description')
								? highlightText(result.item.description, result.matches.find((m) => m.key === 'description').indices)
								: result.item.description}
						</p>
					</div>
				{/each}
			{:else}
				{#each filteredResults as item (item.id)}
					{#if item.type === 'folder'}
						<a
							class="group col-span-1 flex cursor-pointer flex-col items-center justify-center"
							href="#"
							onclick={() => handleFolderClick(item.path + '%' + item.title)}
						>
							<span class="icon-[ph--folder-open-fill] transition-transform duration-300 group-hover:scale-110" style="width: 100px; height: 100px;"></span>
							<p class="w-full overflow-hidden truncate whitespace-nowrap text-center text-sm text-secondary">{item.title}</p>
						</a>
					{:else}
						<div class="bookmark-card col-span-2">
							<a class="group flex cursor-pointer items-center gap-2" href={item.url} target="_blank">
								<img
									src={getFaviconSrc(item)}
									alt="favicon"
									class="h-8 w-8 rounded-full transition-transform duration-500 group-hover:rotate-[360deg]"
									loading="lazy"
									decoding="async"
									onerror={() => setResolvedFavicon(item.id, item.faviconSources[item.faviconSources.length - 1])}
								/>
								<div class="min-w-0 flex-1">
									<h2 class="text-md overflow-hidden truncate whitespace-nowrap">{item.title}</h2>
									<p class="overflow-hidden truncate whitespace-nowrap text-sm text-secondary">{item.url}</p>
								</div>
							</a>
							<p class="mt-2 line-clamp-3 text-justify text-sm text-secondary">{item.description}</p>
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</div>

	<BackTop />

	<div class="mt-4 rounded-lg">
		<div class="text-center text-sm text-secondary">© 2026 CallmeLins. All rights reserved.</div>
	</div>
</div>
