<script>
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let isShow = $state(false);
	let element;

	onMount(() => {
		if (browser) {
			element = document.querySelector('html');
			document.addEventListener('scroll', () => {
				element.scrollTop >= 300 ? (isShow = true) : (isShow = false);
			});
		}
	});

	const scrollToTop = () => {
		element.scrollTo({ top: 0, behavior: 'smooth' });
	};
</script>

<button
    aria-label="Scroll to top"
	class="btn btn-circle fixed z-50 transition-opacity {isShow ? '' : 'hidden'} bottom-5 right-5 bg-base-100/80 hover:bg-base-200"
	onclick={scrollToTop}
>
	<span class="icon-[akar-icons--align-to-top]" style="width: 26px; height: 26px;"></span>
</button>
