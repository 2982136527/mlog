import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import type { Root } from 'mdast'
import type { TocItem } from '@/types/content'
import { slugify } from '@/lib/utils'

function extractToc(tree: Root): TocItem[] {
  const toc: TocItem[] = []

  visit(tree, 'heading', node => {
    if (node.depth > 3) {
      return
    }

    const text = toString(node).trim()
    if (!text) {
      return
    }

    toc.push({
      id: slugify(text),
      text,
      depth: node.depth
    })
  })

  return toc
}

export async function renderMarkdown(markdown: string): Promise<{ html: string; toc: TocItem[] }> {
  const markdownAst = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root
  const toc = extractToc(markdownAst)

  const html = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(markdown)

  return {
    html: String(html),
    toc
  }
}
