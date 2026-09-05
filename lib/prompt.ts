export const THEMES = [
	"Magic",
	"Adventure",
	"Fantasy",
	"Mystery",
	"Horror",
	"Science Fiction",
	"Historical",
	"Romance",
	"Technology",
	"Animals",
	"Nature",
	"Space",
	"Time Travel",
	"Mythology",
	"Folklore",
];

const formatThemes = (themes: string[]): string => {
	if (themes.length === 1) return `"${themes[0]}"`;
	if (themes.length === 2) return `"${themes[0]}" and "${themes[1]}"`;
	const allButLast = themes
		.slice(0, -1)
		.map((t) => `"${t}"`)
		.join(", ");
	return `${allButLast}, and "${themes[themes.length - 1]}"`;
};

export const SYSTEM_PROMPT = (themes: string[]) => `
You are a storytime generating bot.

You will initiate the story by providing the introduction (one or two sentences),
and the user will submit the remaining pieces of the story. Be creative with the
introduction, and make it interesting and engaging.

The themes of the story are ${formatThemes(themes)}.

After 2 to 3 iterations, the story should be complete and you will take the pieces
of the story and polish it up
to have a cohesive conclusion and report the final story to the user.

After each iteration, you should provide an encouragement to the user to continue
the story (don't include instructions, just inquire about the story contents).

When the story is about to be complete, you should provide a final encouragement
to the user to finish the story.

The story
should be in the style of a children's book, with a simple vocabulary and a
clear and concise writing style. It should be short enough to be read aloud by
a child, and fit in a 3 panel comic strip.

Be sure to keep consistency with the characters. Do not change their names or descriptions
between iterations.

You don't need to provide the intermediate story contents, just the initial introduction
and the final story in the "story" field (do not include information about the panel numbers).
When the story is complete, say a light hearted comment about the story in the "encouragement" field.`;

// Convert a small integer to its English word form (e.g. 6 -> "six").
// Used to reinforce the panel count in the image-generation prompt, since
// image models often respond better to spelled-out numbers.
const NUMBER_WORDS = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
];
const numberToWord = (n: number): string =>
	NUMBER_WORDS[n] ?? String(n);

export const IMAGE_GEN_PROMPT = (
	finalStory: string,
	style = "",
	panels: number | null = null,
) => {
	const panelDescription =
		panels == null
			? "4 to 5 (four to five) panels"
			: `exactly ${panels} (${numberToWord(panels)}) panels`;

	return `Generate an image of a children's storybook panel consisting of
${panelDescription} with the following story${style ? ` in the style of ${style}` : ""}.

Include text in the panels to tell the story.
Please ensure that all panels are visible, and not being cut off.
Please ensure that the text is correct, legible, and using the correct names.

Story:
${finalStory}`;
};

export const VIDEO_GEN_PROMPT = (finalStory: string) => `
Create a short animated children's storybook video of the following story.
Condense the key events into a clear visual beginning, middle, and ending.
Keep the characters' appearance consistent throughout, with expressive movement,
colorful illustrations, and smooth transitions between scenes.
Tell the story through animation rather than static comic panels or on-screen text.

Story:
${finalStory}`;
