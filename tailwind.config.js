const { addDynamicIconSelectors } = require('@iconify/tailwind');

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	daisyui: {
		themes: [
			{
				light: {
					...require('daisyui/src/theming/themes')['corporate']
				}
			},
			{
				dark: {
					...require('daisyui/src/theming/themes')['business']
				}
			}
		]
	},
	theme: {
		extend: {}
	},
	plugins: [require('daisyui'), addDynamicIconSelectors()]
};
