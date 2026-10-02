// One prose setting for every assistant answer, chat and agent alike: 16px
// body on a 26px line, headings one step up at semibold rather than display
// sizes, and list items that breathe. The measure is set by the column.
export const chatProseClasses = [
  'chat-ink prose max-w-none leading-relaxed',
  'prose-p:my-3 prose-p:leading-relaxed',
  'prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1',
  // text-[1rem], not text-base: this project's --color-base makes text-base a colour.
  'prose-h1:text-xl prose-h2:text-lg prose-h3:text-[1rem] prose-h4:text-[1rem]',
  'prose-ul:my-3 prose-ol:my-3 prose-li:my-0.5 prose-li:leading-relaxed',
  // A loose list wraps each item in a paragraph; the paragraph margin would
  // then stack on the item's own and pull the list apart.
  '[&_li>p]:my-0.5 [&_li>p:first-child]:mt-0 [&_li>p:last-child]:mb-0',
  'prose-strong:font-semibold prose-pre:my-0 prose-table:my-0',
  '[&>.markdown>*:first-child]:mt-0 [&>.markdown>*:last-child]:mb-0',
].join(' ')
