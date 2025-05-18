<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { themeChange } from 'theme-change';

	onMount(() => {
		themeChange(false);
		// 👆 false parameter is required for svelte
	});

	let { children } = $props();
</script>

{@render children()}
